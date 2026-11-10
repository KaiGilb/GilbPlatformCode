import type { Caller } from "./auth";
import { b64url, fromB64url, sha256Hex, stableStringify, utf8 } from "./bytes";
import { negotiate } from "./content";
import { badRequest, empty, failure, forbidden, json, LWS_CONTEXT, notFound, parseBody, schemaRefusal, type Core, type Req } from "./http";
import type { FakeRecord } from "./types";
import { reachOf, resolveVault } from "./vaults";

const TYPE_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TYPES = 100;
const SEARCH_PAGE_SIZE = 20;
const FULL_ROWS_PAGE_CAP = 200;
const VEDA_TYPE = "https://veda.gilb.com/base/t/";

// ── record state ──────────────────────────────────────────────────────────────────────────────

export const entityOf = (core: Core, r: FakeRecord): string => `https://${core.s.vaults.get(r.vaultId)!.host}/vault/e/${r.id}`;
const lwsUri = (core: Core, r: FakeRecord): string => `https://${core.s.vaults.get(r.vaultId)!.host}/lws/r/${r.id}`;
/** The strong ETag `"sha256:<hex>"` over the record's state (src/lws/crud.ts:150-156). `rev` makes a bump move it. */
export const etagOf = (r: FakeRecord): string => `"sha256:${sha256Hex(stableStringify({ t: r.type, f: r.facts, r: r.rev, e: r.endedSeq }))}"`;

export function bareType(t: string): string {
  return t.replace(/^.*[/:]/, "");
}
export function normaliseFacts(facts: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(facts)) if (v !== null) out[k.replace(/^a:/, "")] = v;
  return out;
}
export function stamp(core: Core, r: FakeRecord): void {
  r.seq = ++core.s.seq;
  r.rev += 1;
  r.updatedAt = new Date(core.o.now()).toISOString();
}
export function makeRecord(core: Core, vaultId: string, type: string | undefined | null, facts: Record<string, unknown>, id?: string): FakeRecord {
  const name = type ? bareType(type) : null;
  const r: FakeRecord = {
    id: id ?? core.nextId(),
    vaultId,
    type: name,
    typeUri: type ? (/^https?:\/\//.test(type) ? type : `${VEDA_TYPE}${name}`) : null,
    facts: normaliseFacts(facts),
    rev: 0,
    seq: 0,
    updatedAt: "",
    endedSeq: null,
    endedAt: null,
  };
  stamp(core, r);
  core.s.records.set(r.id, r);
  return r;
}
export function endRecord(core: Core, r: FakeRecord): void {
  r.endedSeq = ++core.s.seq;
  r.endedAt = new Date(core.o.now()).toISOString();
  r.rev += 1;
}

/** The document `GET /lws/r/:id` serves; an ended record is the type-only document marked ended (src/lws/resource-frame.ts:33-40). */
function documentOf(core: Core, r: FakeRecord): Record<string, unknown> {
  const doc: Record<string, unknown> = { "@context": LWS_CONTEXT, "@id": entityOf(core, r) };
  if (r.type) doc["@type"] = `t:${r.type}`;
  if (r.endedSeq !== null) {
    doc["a:entityLifecycleState"] = "ended";
    doc["a:endingActorKind"] = "holder";
    return doc;
  }
  return { ...doc, ...r.facts };
}

function refuseUndefinedTerm(core: Core, keys: string[], r?: FakeRecord): Response | null {
  for (const k of keys) {
    if (core.o.undefinedTerms.has(k.replace(/^a:/, ""))) {
      // src/write/errors.ts:663-685 (409, name UndefinedTermError); the sentence is shortened.
      return failure(409, "UndefinedTermError", `Attribute key ${k} binds no defined ontology term in this vault.`, { attribute: k, entity: r ? entityOf(core, r) : "" });
    }
  }
  return null;
}

/** The body schema of POST and PUT: `{ type?: string, facts: object, agent?: string }`, nothing else (src/lws/routes.ts:1156-1165). */
function envelope(req: Req): { type?: string; facts: Record<string, unknown> } | Response {
  const b = parseBody(req);
  if (!b.ok) return badRequest("Body is not valid JSON");
  const v = b.value;
  if (v === null || typeof v !== "object" || Array.isArray(v)) return schemaRefusal("body must be object");
  const o = v as Record<string, unknown>;
  if (!("facts" in o)) return schemaRefusal("body must have required property 'facts'");
  const extra = Object.keys(o).filter((k) => !["type", "facts", "agent"].includes(k));
  if (extra.length > 0) return schemaRefusal("body must NOT have additional properties");
  if (o.facts === null || typeof o.facts !== "object" || Array.isArray(o.facts)) return schemaRefusal("body/facts must be object");
  if ("type" in o && typeof o.type !== "string") return schemaRefusal("body/type must be string");
  if ("agent" in o && typeof o.agent !== "string") return schemaRefusal("body/agent must be string");
  return { ...(typeof o.type === "string" ? { type: o.type } : {}), facts: o.facts as Record<string, unknown> };
}

/** Whether a request addressed `host` reaches the record: the platform routes a dereference by the host the request names (src/lws/routes.ts:588,1034). */
function recordAt(core: Core, req: Req, id: string): FakeRecord | null {
  const r = core.s.records.get(id);
  if (!r) return null;
  return core.s.vaults.get(r.vaultId)!.host === req.host ? r : null;
}
const noWrite = (core: Core, caller: Caller | null, r: FakeRecord): Response =>
  forbidden(`Principal ${caller?.principal ?? "<anon>"} is not authorized to write ${entityOf(core, r)} (no current write-grant)`);

/** `If-Match`: `*` matches an existing record; else one tag of the list must be the current ETag (a `W/` in front also matches). src/lws/crud.ts:421-429. */
function ifMatchOk(header: string, r: FakeRecord): boolean {
  const v = header.trim();
  if (v === "*") return true;
  return v.split(",").map((t) => t.trim().replace(/^W\//, "")).includes(etagOf(r));
}
const stale = (): Response => failure(412, "PreconditionFailed", "If-Match does not match the current ETag (stale write).");

function written(core: Core, r: FakeRecord, status: number): Response {
  const location = lwsUri(core, r);
  return json(status, { "@id": location }, { location, etag: etagOf(r) });
}

// ── routes ────────────────────────────────────────────────────────────────────────────────────

/**
 * POST /lws/vault/:vault/c — create into the named vault.
 * Mirrors: src/lws/routes.ts:838-876 (write resolver :846, answer via sendWriteResult :349-377); schema :1156-1165; src/lws/crud.ts:264-278 (201 + ETag);
 * 403 text src/authz/vault-target.ts:320-323; 409 src/write/errors.ts:663-685.
 */
export function createRecord(core: Core, req: Req, caller: Caller | null): Response {
  const target = resolveVault(core, caller, req.params.vault!, "write");
  if (target instanceof Response) return target;
  const body = envelope(req);
  if (body instanceof Response) return body;
  const refused = refuseUndefinedTerm(core, Object.keys(body.facts));
  if (refused) return refused;
  return written(core, makeRecord(core, target.id, body.type, body.facts), 201);
}

/**
 * GET /lws/r/:id — the record's document, 404 when absent, unreadable or addressed at the wrong host.
 * Mirrors: src/lws/routes.ts:585-593 (getResource :152-215, 404 :195-198, headers :210); src/lws/resource-frame.ts:27-41 (ended = type-only, marked ended).
 */
export function readRecord(core: Core, req: Req, caller: Caller | null): Response {
  const r = recordAt(core, req, req.params.id!);
  if (!r || !reachOf(core, caller, core.s.vaults.get(r.vaultId)!).has("read")) return notFound(`https://${core.o.host}/lws/r/${req.params.id}`);
  return json(200, documentOf(core, r), { "content-type": negotiate(req.headers.get("accept")), etag: etagOf(r) });
}

/**
 * PATCH /lws/r/:id — JSON merge patch; `null` removes a fact; If-Match optional.
 * Mirrors: src/lws/routes.ts:1026-1073 (read gate 404 :1051-1058, If-Match :1063-1065); src/lws/crud.ts:459-524 (200 + ETag :519), 412 :421-429.
 * Order as the platform: read gate (404), absent (404), If-Match (412), write gate (403).
 */
export function patchRecord(core: Core, req: Req, caller: Caller | null): Response {
  const r = recordAt(core, req, req.params.id!);
  const vault = r ? core.s.vaults.get(r.vaultId)! : null;
  if (!r || !vault || !reachOf(core, caller, vault).has("read") || r.endedSeq !== null) return notFound(`https://${core.o.host}/lws/r/${req.params.id}`);
  const b = parseBody(req);
  if (!b.ok) return badRequest("Body is not valid JSON");
  if (b.value !== undefined && (b.value === null || typeof b.value !== "object" || Array.isArray(b.value))) return schemaRefusal("body must be object");
  const patch = (b.value ?? {}) as Record<string, unknown>;
  const ifMatch = req.headers.get("if-match");
  if (ifMatch !== null && ifMatch.trim() !== "" && !ifMatchOk(ifMatch, r)) return stale();
  if (!reachOf(core, caller, vault).has("write")) return noWrite(core, caller, r);
  const refused = refuseUndefinedTerm(core, Object.keys(patch), r);
  if (refused) return refused;
  for (const [k, v] of Object.entries(patch)) {
    const bare = k.replace(/^a:/, "");
    if (v === null) delete r.facts[bare];
    else r.facts[bare] = v;
  }
  stamp(core, r);
  return written(core, r, 200);
}

/**
 * PUT /lws/r/:id — full replace; If-Match REQUIRED.
 * Mirrors: src/lws/routes.ts:998-1024; src/lws/crud.ts:300-311 (428), :376-386 and :421-429 (412), :388-395 (201 changed / 200 unchanged).
 * There is no read gate on PUT; a record that does not exist is 412 (If-Match cannot match it).
 */
export function replaceRecord(core: Core, req: Req, caller: Caller | null): Response {
  const body = envelope(req);
  if (body instanceof Response) return body;
  const ifMatch = req.headers.get("if-match");
  if (ifMatch === null || ifMatch.trim() === "") return failure(428, "PreconditionRequired", "PUT requires an If-Match precondition (LWS conditional write).");
  const r = recordAt(core, req, req.params.id!);
  if (!r || r.endedSeq !== null) return failure(412, "PreconditionFailed", ifMatch.trim() === "*" ? "If-Match: * requires the resource to exist." : "If-Match does not match the current ETag (stale write).");
  if (!ifMatchOk(ifMatch, r)) return stale();
  const vault = core.s.vaults.get(r.vaultId)!;
  if (!reachOf(core, caller, vault).has("write")) return noWrite(core, caller, r);
  const refused = refuseUndefinedTerm(core, Object.keys(body.facts), r);
  if (refused) return refused;
  const next = normaliseFacts(body.facts);
  const type = body.type ? bareType(body.type) : r.type;
  const changed = stableStringify(next) !== stableStringify(r.facts) || type !== r.type;
  if (changed) {
    r.facts = next;
    if (body.type) {
      r.type = type;
      r.typeUri = /^https?:\/\//.test(body.type) ? body.type : `${VEDA_TYPE}${type}`;
    }
    stamp(core, r);
  }
  return written(core, r, changed ? 201 : 200);
}

/**
 * DELETE /lws/r/:id — end the record (it leaves the live list and enters the ended list).
 * Mirrors: src/lws/routes.ts:1075-1140 (404 absent :1111-1114); src/lws/crud.ts:632-733 (absent or already ended :643,:656; 204 :733; 412 :737).
 * Order: absent (404), write gate (403), If-Match (412).
 */
export function deleteRecord(core: Core, req: Req, caller: Caller | null): Response {
  const r = recordAt(core, req, req.params.id!);
  if (!r || r.endedSeq !== null) return notFound(`https://${core.o.host}/lws/r/${req.params.id}`);
  if (!reachOf(core, caller, core.s.vaults.get(r.vaultId)!).has("write")) return noWrite(core, caller, r);
  const ifMatch = req.headers.get("if-match");
  if (ifMatch !== null && ifMatch.trim() !== "" && !ifMatchOk(ifMatch, r)) return stale();
  endRecord(core, r);
  return empty(204);
}

// ── the list ──────────────────────────────────────────────────────────────────────────────────

interface CursorScope {
  k: "since" | "after";
  v: string;
  p: string | null;
  l?: string;
  n?: string;
  pos: number;
}
const seal = (c: CursorScope): string => "c1." + b64url(utf8(JSON.stringify(c)));
function open(text: string, want: Omit<CursorScope, "pos">): number | null {
  if (!text.startsWith("c1.")) return null;
  const bytes = fromB64url(text.slice(3));
  if (!bytes) return null;
  try {
    const c = JSON.parse(new TextDecoder().decode(bytes)) as CursorScope;
    if (c.k !== want.k || c.v !== want.v || c.p !== want.p || c.l !== want.l || c.n !== want.n || typeof c.pos !== "number") return null;
    return c.pos;
  } catch {
    return null;
  }
}
const named = (status: number, name: string, message: string, details: Record<string, unknown>): Response => failure(status, name, message, details);

/**
 * GET /lws/vault/:vault/records.
 * Mirrors: src/lws/routes.ts:712-727; src/lws/records.ts — type names :205-243, offset :246-252, include/limit/cap :261-284, lifecycle :288-294,
 * since rules :503-529, after rules :537-566, empty answer :568-595, row :941-950, body rows :968-1007, complete/total :1020-1030,
 * nextCursor :1034-1041 and nextOffset :1052-1054 (presence rules), answer :1042-1059. Error names: src/auth/errors.ts:53-215.
 * Not faked: `filter` (answers 400 fake_platform_not_faked), the 8 MiB body budget, nested vaults (scannedVaults is the one vault).
 */
export function listRecords(core: Core, req: Req, caller: Caller | null): Response {
  const target = resolveVault(core, caller, req.params.vault!, "read");
  if (target instanceof Response) return target;
  const q = req.query;
  const principal = caller?.principal ?? null;

  const lifeRaw = q.get("lifecycle");
  if (lifeRaw !== null && lifeRaw !== "" && lifeRaw !== "live" && lifeRaw !== "ended") return json(400, { error: "lifecycle must be live (default) or ended", accepted: ["live", "ended"] });
  const lifecycle: "live" | "ended" = lifeRaw === "ended" ? "ended" : "live";

  const tokens = q.getAll("include").flatMap((t) => t.split(",")).map((t) => t.trim()).filter((t) => t !== "");
  if (tokens.some((t) => t !== "body")) return json(400, { error: "include must be body, or be left out", accepted: ["body"] });
  const withBody = tokens.length > 0;
  const limRaw = q.get("limit");
  const lim = limRaw !== null && /^\s*\d+\s*$/.test(limRaw) ? Number.parseInt(limRaw, 10) : 0;
  const pageCap = withBody ? (lim > 0 ? Math.min(lim, FULL_ROWS_PAGE_CAP) : FULL_ROWS_PAGE_CAP) : SEARCH_PAGE_SIZE;

  if (q.has("filter")) return failure(400, "fake_platform_not_faked", "fake-platform part 1 does not answer filter=; the platform does (src/lws/records.ts:483-501).");

  const sinceMode = q.has("since");
  if (sinceMode && q.has("offset")) return named(400, "since_with_offset", "since is the position; offset cannot be combined with it", { accepted: "since alone, or offset alone" });
  let sincePos = 0;
  let sinceHead = false;
  if (sinceMode) {
    const s = q.get("since")!;
    if (s === "start") sincePos = 0;
    else if (s === "head") sinceHead = true;
    else {
      const pos = open(s, { k: "since", v: target.id, p: principal, l: lifecycle });
      if (pos === null || pos > core.s.seq) return named(400, "since_cursor_invalid", "since must be the nextCursor this list returned to you for this vault, or the word start, or the word head", { accepted: ["start", "head", "<nextCursor>"] });
      sincePos = pos;
    }
  }

  const rawTypes = q.getAll("type");
  const typeRequested = rawTypes.length > 0;
  const bad = rawTypes.filter((t) => !TYPE_NAME.test(t));
  if (bad.length > 0) {
    return named(400, "type_token_unresolved", `type token ${JSON.stringify(bad[0])} is not a bare local name. This route takes the bare local name (e.g. RuleSet), never a t: prefix or a type URI.`, {
      accepted: "bare local name matching /^[A-Za-z0-9_-]{1,64}$/ (the <Name> of t:<Name>)",
      rejected: bad,
    });
  }
  const names = [...new Set(rawTypes)];
  if (names.length > MAX_TYPES) return named(400, "type_filter_too_large", `this call names ${names.length} distinct type tokens; one call may name at most ${MAX_TYPES}.`, { limit: MAX_TYPES, named: names.length });

  const offRaw = q.get("offset");
  const offN = offRaw !== null && offRaw.trim() !== "" ? Number.parseInt(offRaw, 10) : 0;
  const offset = Number.isFinite(offN) && offN > 0 ? offN : 0;

  const afterMode = q.has("after");
  let afterPos: number | null = null;
  if (afterMode) {
    if (q.has("offset")) return named(400, "after_with_offset", "after is the position; offset cannot be combined with it", { accepted: "after alone, or offset alone" });
    if (sinceMode) return named(400, "after_with_since", "after and since are two different feeds; one request may carry only one", { accepted: "after alone, or since alone" });
    if (lifecycle === "ended") return named(400, "after_with_lifecycle", "after is for the live list; lifecycle=ended has no bookmark", { accepted: "after with the live list" });
    if (!typeRequested || names.length !== 1) return named(400, "after_requires_one_type", "after needs exactly one type= on the same request", { accepted: "one type=<BareName> with after" });
    afterPos = open(q.get("after")!, { k: "after", v: target.id, p: principal, n: names[0]! });
    if (afterPos === null) return named(400, "after_cursor_invalid", "after must be the nextCursor this list returned to you for this vault and this query", { accepted: "the nextCursor of a page of the same type (and filter), in the same vault, for the same caller" });
  }
  const bmEligible = !sinceMode && lifecycle === "live" && typeRequested && names.length === 1;

  const key = (r: FakeRecord): number => (lifecycle === "ended" ? r.endedSeq! : r.seq);
  const candidates = [...core.s.records.values()].filter(
    (r) => r.vaultId === target.id && (lifecycle === "ended" ? r.endedSeq !== null : r.endedSeq === null) && (!typeRequested || (r.type !== null && names.includes(r.type))),
  );

  const finish = (rows: FakeRecord[], complete: boolean, nextCursor: string | undefined, total: number): Response => {
    const records = rows.map((r) => rowOf(core, r, lifecycle, withBody));
    const counts = new Map<string, number>();
    for (const r of rows) if (r.typeUri) counts.set(r.typeUri, (counts.get(r.typeUri) ?? 0) + 1);
    const types = [...counts.entries()].map(([typeUri, count]) => ({ typeUri, count })).sort((a, b) => b.count - a.count || a.typeUri.localeCompare(b.typeUri));
    return json(200, {
      "@context": LWS_CONTEXT,
      "@id": `https://${core.o.host}/lws/vault/${encodeURIComponent(target.id)}/records`,
      total,
      totalItemsKind: complete && !afterMode ? "exact" : "atLeast",
      returnedRecords: records.length,
      complete,
      pageSize: pageCap,
      offset,
      ...(withBody && !sinceMode && !afterMode ? { nextOffset: offset + rows.length } : {}),
      ...(nextCursor !== undefined ? { nextCursor } : {}),
      records,
      types,
      vault: target.id,
      scannedVaults: [target.id],
    });
  };

  if (sinceMode) {
    const scope = { k: "since" as const, v: target.id, p: principal, l: lifecycle };
    if (sinceHead) return finish([], true, seal({ ...scope, pos: core.s.seq }), 0);
    const ahead = candidates.filter((r) => key(r) > sincePos).sort((a, b) => key(a) - key(b));
    const page = ahead.slice(0, pageCap);
    const complete = ahead.length <= pageCap;
    const next = complete || page.length === 0 ? seal({ ...scope, pos: core.s.seq }) : seal({ ...scope, pos: key(page[page.length - 1]!) });
    return finish(page, complete, next, offset + page.length);
  }
  const newest = candidates.filter((r) => afterPos === null || key(r) < afterPos).sort((a, b) => key(b) - key(a));
  const window = newest.slice(offset, offset + pageCap + 1);
  const complete = window.length <= pageCap;
  const page = window.slice(0, pageCap);
  const total = afterMode ? page.length : page.length === 0 && offset > 0 ? candidates.length : offset + page.length;
  const next = bmEligible && !complete ? seal({ k: "after", v: target.id, p: principal, n: names[0]!, pos: key(page[page.length - 1]!) }) : undefined;
  return finish(page, complete, next, total);
}

function rowOf(core: Core, r: FakeRecord, lifecycle: "live" | "ended", withBody: boolean): Record<string, unknown> {
  const label = lifecycle === "ended" ? null : ["label", "title", "name"].map((k) => r.facts[k]).find((v) => typeof v === "string" && v !== "") ?? null;
  return {
    entity: entityOf(core, r),
    typeUri: r.typeUri,
    updatedAt: lifecycle === "ended" ? r.endedAt : r.updatedAt,
    label,
    ...(lifecycle === "ended" ? { endingActorKind: "holder" } : {}),
    vault: r.vaultId,
    vaultAmbiguous: false,
    ...(withBody ? { body: documentOf(core, r), etag: etagOf(r) } : {}),
  };
}
