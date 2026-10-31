import { createHash } from "node:crypto";
// A platform, as the routes this package calls answered on a scratch rig, behind a fake fetch.
//
// The shapes are GilbPlatform's own, read on 2026-09-30T07:27Z–07:30Z from a scratch rig running
// origin/main `67b4d6c` (in-process Fastify, scratch database `base_c214gapp25_test`):
//
//   POST /lws/vault/<vaultId>/c          201, `Location: https://<host>/lws/r/<id>`, body {"@id": <same>}
//                                        403 {"error":"Forbidden", "... holds no write reach on vault ..."}
//                                        400 {"error":"InvalidDatomError"} for a type with no `t:`
//   GET  /lws/r/<id>                     200 framed: bare keys, "@id" = https://<host>/base/e/<id>,
//                                        references as {"@id": …}; 404 {"error":"NotFound"} when unreadable
//   GET  /base/e/<id>                    200, the same document
//   GET  /lws/vault/<vaultId>/records    200 {total, returnedRecords, complete, pageSize: 20, offset,
//                                        records:[{entity, typeUri:"t:<Type>", updatedAt, label,
//                                        vault, vaultAmbiguous}], vault, scannedVaults}
//                                        GAPP214.25e: the rows as GilbPlatform GAPP214.25c serves
//                                        them (branch `d5438436`, read in `src/lws/records.ts`
//                                        `rowVault()` and on that unit's rig): the list of V scans V
//                                        and every vault nested in V the caller reaches; each row
//                                        names the vault holding its record, or `null` with
//                                        `vaultAmbiguous: true` when it is held in more than one of
//                                        the scanned vaults. `rowVault: false` serves the rows as a
//                                        platform before .25c does: no `vault` key at all.
//                                        403 "... holds no read reach on vault ..."
//   GET  /base/tag/resolve               200 {"status":"miss"} | {"status":"resolved", targetEntity, tagHandle}
//                                        403 for a vault the caller cannot read
//   POST /base/tag/handle                201 {entity, changed:true, txn_id} · 200 {entity, changed:false}
//                                        409 {"error":"TagStringCollisionError"} · 403 {"error":"WriteForbiddenError"}
//                                        409 {"error":"entity-has-master", tagString} for a second master
//                                        400 {"error":"tag-string-refused", reason, rule} for a NEW tag string that breaks the floor (see the tag section)
//
// Cycle214 K1 (the platform makes every record's tag; GilbPlatform branch `kaizen/c214-auto-tag`, shapes as the batch gives them):
//   a create (`POST /lws/vault/<id>/c`) mints the record's MASTER tag handle (`tags: "auto"`, the default), derived from its name; `tags: "ensure-only"`
//   mints none (the routes exist; a record has no tag until `ensure`); `tags: "off"` is a platform without the routes (Fastify's own 404).
//   GET  /base/tag/master?targetEntity=  200 {tagKnown:true, tagHandle, tagString} | {tagKnown:false, tagUnknownReason:"none"|"anomaly"|"hidden"}; 404 one body
//   POST /base/tag/ensure                200/201 {tagHandle, tagString, tagRole, changed}; 403 for a vault the caller cannot write
//   GET  /base/tag/list?targetEntity=    200 {tagHandles:[{tagHandle, tagString, tagRole, tagOrigin}]}
//   POST /base/tag/reassign-master       200 {changed, ...}; 409 {"error":"TagRoleDerivedError", message} when the master or the new main is assigned
//   POST /base/tag/remove                200 {changed, tagString}; 409 {"error":"TagIsMasterError","message":"Make another tag main first."} for the master;
//                                        409 {"error":"TagRoleDerivedError", message} for an assigned tag; 404 {"error":"NotFound","message":"No resource at <targetEntity>"}
//                                        for a record that is missing or unreadable AND for a string that is not a tag of the record
//   POST /base/tag/masters               200 {masterTags:[{targetEntity, tagString|null, tagKnown, tagUnknownReason?}]}; an unreadable, missing or other-vault row is
//                                        {targetEntity, tagString:null, tagKnown:false, tagUnknownReason:"none"}; 400 {"error":"BadRequest", message} for an empty list or above 50
//
// ── THE TAG SECTION MIRRORS GilbPlatform commit 6bfcc4dc (PR #552, `src/routes/tag-handle.ts`, `src/write/tag-handle-remove.ts`, `src/write/errors.ts`,
//    `src/server/app.ts`, `src/tag-handle-vocab.ts`): status, `error` and `message` of every refusal are the real ones, byte for byte. A change here is a
//    change of what the platform answers; read the platform source first. The fixture has no read-only caller (`reach` is read and write), so the real 403
//    of a reader who may not write is not reachable from it; `p.failNext` forces one.
//
// ⚠ What is ILLUSTRATIVE here, ⛔ not measured: the 400 for an unknown body key on the tag route
//   (the route's schema has `additionalProperties: false`; the exact body text is Fastify's), and
//   the record list's `label` rank (read in `src/lws/records.ts`, not exercised on the rig).
//
// Entity IRIs are minted on an IDENTITY host and the fixture is FETCHED from a rig origin that
// differs from it, so code that fetched an IRI verbatim would miss every document.
export const VAULT_HOST = "https://c214holder.gilb.test";
export const PLATFORM_RIG = "http://platform-rig.test:5302";

const PAGE_SIZE = 20;
const REQUEST_BUDGET = 400;

interface StoredEntity {
  id: string;
  vault: string;
  /** Other vaults that hold open facts of this record (a split record; GAPP214.25e). */
  alsoIn?: string[];
  type: string;
  facts: Record<string, unknown>;
  seq: number;
  /** Bumped on every change of its facts: the stand-in for GilbPlatform's `state_hash` (GAPP214.25f). */
  rev?: number;
}

export interface FixtureRequest {
  method: string;
  url: string;
  path: string;
  body: Record<string, unknown> | null;
  /** The request's headers, lower-cased (GAPP214.25b). */
  headers: Record<string, string>;
}

export interface FixturePlatform {
  origin: string;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  requests: FixtureRequest[];
  entities: Map<string, StoredEntity>;
  /** Vaults the caller may read and write. Anything else answers 403. */
  reach: Set<string>;
  /** Make the next request whose path starts with `prefix` answer `status`. */
  failNext(method: string, prefix: string, status: number, body?: unknown): void;
  /** Seed an entity directly (as another app would have written it). Returns its IRI. `id` sets
   *  the IRI (GAPP214.25e: to separate the placement from the IRI); such an entity is listed, and
   *  is not served by `GET /lws/r/<id>`. */
  seed(vault: string, type: string, facts: Record<string, unknown>, opts?: { id?: string }): string;
  /** Nest `child` in `parent`: the parent's typed list then scans the child too, when the caller
   *  reaches it (GAPP214.25e; GilbPlatform `resolveVaultTarget`). */
  nest(parent: string, child: string): void;
  /** Place open facts of `record` in `vault` as well: a split record (GAPP214.25e). */
  split(record: string, vault: string): void;
  /** Seed a TagHandle directly. */
  seedTag(vault: string, tagString: string, target: string, role?: string): string;
  /** A write made elsewhere (another app, another tab): merge `facts` into the record (a `null`
   *  removes a field) and move its ETag, as a committed write moves `state_hash` (GAPP214.25f). */
  edit(record: string, facts: Record<string, unknown>): void;
  /** The ETag the platform serves for the record now. */
  etagOf(record: string): string;
  /** Force a write made elsewhere into a named point of a sequence (GAPP214.25f). */
  interleave(i: Interleave): void;
  handlesOf(target: string): StoredEntity[];
  count(method: string, prefix: string): number;
}

const normalize = (raw: string): string => raw.normalize("NFC").trim();

export interface FixtureOptions {
  /** The origin the fixture serves at (default `PLATFORM_RIG`). GAPP214.25b fix loop 2: the
   *  package's writers require the origin's host to be the named vault's host, so a test of them
   *  serves the fixture at the vault's own origin. */
  origin?: string;
  /** False: the typed list's rows carry no `vault` / `vaultAmbiguous`, as a platform before
   *  GilbPlatform GAPP214.25c serves them (default true, the `d5438436` shape). */
  rowVault?: boolean;
  /** True: model a browser fetch's HTTP cache for the record GETs (default false). */
  httpCache?: boolean;
  /** False: `PATCH /lws/r/<id>` ignores `If-Match`, as a platform before GilbPlatform GAPP214.25d
   *  does (default true, the `25a09f2d` shape: a stale If-Match is 412 with nothing written). */
  ifMatch?: boolean;
  /** `auto` (default): a create mints the record's master tag. `ensure-only`: the tag routes exist but a create mints nothing. `off`: no tag routes at all
   *  (a platform before the release: Fastify's own 404 `Route … not found`). */
  tags?: "auto" | "ensure-only" | "off";
}

/** Runs just before the fixture serves a matching request: a write made elsewhere, forced into a
 *  named point of the package's sequence (GAPP214.25f). Not timed: it runs on the Nth match. */
export interface Interleave {
  method: string;
  prefix: string;
  /** Run on this match of method + prefix (1 = the first). */
  nth: number;
  run: () => void;
}

export function fixturePlatform(options: FixtureOptions = {}): FixturePlatform {
  const ORIGIN = (options.origin ?? PLATFORM_RIG).replace(/\/+$/, "");
  const entities = new Map<string, StoredEntity>();
  const requests: FixtureRequest[] = [];
  const reach = new Set<string>();
  const failures: { method: string; prefix: string; status: number; body: unknown }[] = [];
  const children = new Map<string, string[]>();
  const rowVault = options.rowVault ?? true;
  const ifMatch = options.ifMatch ?? true;
  const tagMode = options.tags ?? "auto";
  const interleaves: (Interleave & { seen: number })[] = [];
  /** A browser's HTTP cache, when `httpCache` is set: a GET of a record served `public, max-age=60`
   *  is answered from here unless the request's cache mode is `no-store` (GAPP214.25f). */
  const httpCache = options.httpCache ? new Map<string, { status: number; text: string; headers: Record<string, string> }>() : null;
  let seq = 0;
  /** The vaults the list of `vault` scans: itself first, then each nested vault the caller reaches. */
  const scopeOf = (vault: string): string[] => {
    const out = [vault];
    for (let i = 0; i < out.length; i++) for (const c of children.get(out[i]!) ?? []) if (reach.has(c) && !out.includes(c)) out.push(c);
    return out;
  };

  const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

  const mint = (vault: string, type: string, facts: Record<string, unknown>): StoredEntity => {
    seq += 1;
    const id = `${VAULT_HOST}/base/e/x${String(seq).padStart(4, "0")}`;
    const e: StoredEntity = { id, vault, type, facts: { ...facts }, seq };
    entities.set(id, e);
    return e;
  };

  // A framed read compacts `a:` keys to bare ones, as the rig's GET /lws/r/<id> did.
  const framed = (e: StoredEntity): Record<string, unknown> => {
    const doc: Record<string, unknown> = { "@context": "https://www.w3.org/ns/lws/v1", "@id": e.id, "@type": e.type };
    for (const [k, v] of Object.entries(e.facts)) doc[k.replace(/^a:/, "")] = v;
    return doc;
  };

  const labelOf = (e: StoredEntity): string | null => {
    for (const k of ["a:label", "a:title", "a:name"]) if (typeof e.facts[k] === "string") return e.facts[k] as string;
    return null;
  };

  const TAG_DOOR_DENIED = "not allowed to write through the tag door";
  /** The rule record's IRI the fixture names in a refusal (the real one is the corpus record's own IRI). */
  const TAG_RULE_IRI = `${VAULT_HOST}/base/e/tag-string-write-limits`;
  const notFound = (uri: string): Response => json(404, { error: "NotFound", message: `No resource at ${uri}` });
  /** `checkNewTagString` of the platform, its floor and Kai's ceiling of 64: empty, at-sign, white-space, invisible-or-control, too-long. The stored pattern and
   *  the one-script check are the corpus rule's and are not modelled. The body is exactly `{error, reason, rule}` (`too-long` adds `maxCharacters`). */
  const refuseNewTagString = (raw: string): Response | null => {
    const s = raw.normalize("NFC");
    const refuse = (reason: string, extra: Record<string, unknown> = {}) => json(400, { error: "tag-string-refused", reason, rule: TAG_RULE_IRI, ...extra });
    if (s.trim() === "" && !/[\p{C}\p{Default_Ignorable_Code_Point}]/u.test(s)) return refuse("empty");
    if (s.includes("@")) return refuse("at-sign");
    if (/\p{White_Space}/u.test(s)) return refuse("white-space");
    if (/[\p{C}\p{Default_Ignorable_Code_Point}]/u.test(s)) return refuse("invisible-or-control");
    if ([...s].length > 64) return refuse("too-long", { maxCharacters: 64 });
    return null;
  };
  const tagHolder = (vault: string, tag: string): StoredEntity | undefined =>
    [...entities.values()].find((e) => e.type === "t:TagHandle" && e.vault === vault && e.facts["a:tagString"] === tag);

  const handlesOfTarget = (target: string): StoredEntity[] =>
    [...entities.values()].filter((e) => e.type === "t:TagHandle" && (e.facts["a:tagHandleOfEntity"] as { "@id"?: string } | undefined)?.["@id"] === target);
  const mastersOf = (target: string) => handlesOfTarget(target).filter((h) => h.facts["a:tagRole"] === "master");
  /** The platform's derivation, in the fixture's own simple form: the name in lower case, words joined by `-`; else the kind and a number; a taken tag gets the next free number. */
  const deriveTag = (e: StoredEntity): string => {
    const label = labelOf(e) ?? "";
    const slug = normalize(label).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean).join("-");
    const kind = e.type.replace(/^t:/, "").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    for (let n = slug === "" ? 1 : 0; n < 1000; n++) {
      const cand = slug === "" ? `${kind}-${n}` : n === 0 ? slug : `${slug}-${n + 1}`;
      if (!tagHolder(e.vault, cand)) return cand;
    }
    throw new Error("fixture: no free tag");
  };
  let tagSeq = 0;
  /** The platform's master handle for a record. It takes an id of its own (`tag0001`…) and leaves the record counter alone, so the ids tests read (`x0001`…) are the records'. */
  const mintMaster = (e: StoredEntity): StoredEntity => {
    const before = seq;
    const h = mint(e.vault, "t:TagHandle", { "a:tagString": deriveTag(e), "a:tagRole": "master", "a:tagOrigin": "registered", "a:tagHandleOfEntity": { "@id": e.id } });
    entities.delete(h.id);
    tagSeq += 1;
    h.id = `${VAULT_HOST}/base/e/tag${String(tagSeq).padStart(4, "0")}`;
    entities.set(h.id, h);
    seq = before;
    return h;
  };
  const handleRow = (h: StoredEntity) => ({
    tagHandle: h.id,
    tagString: h.facts["a:tagString"],
    tagRole: h.facts["a:tagRole"],
    tagOrigin: h.facts["a:tagOrigin"],
  });

  /** GilbPlatform serves `"sha256:<state_hash hex>"`; here the hash is a sha256 of the record's
   *  seq and rev, so the tag has the platform's own shape (64 hex; GAPP214.25f fix loop 1). */
  const etagFor = (e: StoredEntity): string => `"sha256:${createHash("sha256").update(`${e.seq}-${e.rev ?? 1}`).digest("hex")}"`;

  const p: FixturePlatform = {
    origin: ORIGIN,
    requests,
    entities,
    reach,
    failNext(method, prefix, status, body = { error: "Injected" }) {
      failures.push({ method, prefix, status, body });
    },
    seed(vault, type, facts, opts = {}) {
      const e = mint(vault, type, facts);
      if (opts.id) {
        entities.delete(e.id);
        e.id = opts.id;
        entities.set(e.id, e);
      }
      return e.id;
    },
    nest(parent, child) {
      children.set(parent, [...(children.get(parent) ?? []), child]);
    },
    split(record, vault) {
      const e = entities.get(record);
      if (!e) throw new Error(`no seeded entity ${record}`);
      e.alsoIn = [...(e.alsoIn ?? []), vault];
    },
    seedTag(vault, tagString, target, role = "master") {
      return mint(vault, "t:TagHandle", {
        "a:tagString": normalize(tagString),
        "a:tagRole": role,
        "a:tagOrigin": "registered",
        "a:tagHandleOfEntity": { "@id": target },
      }).id;
    },
    edit(record, facts) {
      const e = entities.get(record);
      if (!e) throw new Error(`no seeded entity ${record}`);
      for (const [k, v] of Object.entries(facts)) {
        if (v === null) delete e.facts[k];
        else e.facts[k] = v;
      }
      e.rev = (e.rev ?? 1) + 1;
    },
    etagOf(record) {
      const e = entities.get(record);
      if (!e) throw new Error(`no seeded entity ${record}`);
      return etagFor(e);
    },
    interleave(i) {
      interleaves.push({ ...i, seen: 0 });
    },
    handlesOf(target) {
      return [...entities.values()].filter(
        (e) => e.type === "t:TagHandle" && (e.facts["a:tagHandleOfEntity"] as { "@id"?: string } | undefined)?.["@id"] === target,
      );
    },
    count(method, prefix) {
      return requests.filter((r) => r.method === method && r.path.startsWith(prefix)).length;
    },
    fetch: async (url, init = {}) => {
      const method = (init.method ?? "GET").toUpperCase();
      if (!url.startsWith(`${ORIGIN}/`)) throw new TypeError(`fetch failed: ${url} is not on the platform rig origin`);
      const u = new URL(url);
      // A host whose vault addresses its data at `/vault` (a reach entry `https://<host>/vault`):
      // the platform rewrites `/vault/…` to its `/base/…` routes and refuses the `/base` spelling of
      // the RELATION path with 404 (GilbPlatform `src/uri/vault-segment.ts`, D7). ⚠ Modelled for
      // `/base/r/` only: the fixture's records keep their `/base/e/` IRIs on VAULT_HOST.
      const sentPath = u.pathname;
      const vaultSegmentHost = reach.has(`https://${u.host}/vault`);
      if (vaultSegmentHost && /^\/base\/r\//.test(sentPath)) {
        requests.push({ method, url, path: sentPath, body: null, headers: {} });
        return json(404, { error: "NotFound", message: `No resource at ${sentPath}` });
      }
      const path = vaultSegmentHost && sentPath.startsWith("/vault/") ? `/base/${sentPath.slice("/vault/".length)}` : sentPath;
      const body = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
      requests.push({ method, url, path: sentPath, body, headers });
      if (requests.length > REQUEST_BUDGET) throw new Error(`fixture request budget of ${REQUEST_BUDGET} exceeded: a walk is not ending`);
      for (const i of interleaves) if (i.method === method && path.startsWith(i.prefix) && ++i.seen === i.nth) i.run();

      const at = failures.findIndex((f) => f.method === method && path.startsWith(f.prefix));
      if (at >= 0) {
        const f = failures.splice(at, 1)[0]!;
        return json(f.status, f.body);
      }

      // ── POST /lws/vault/<vaultId>/c ─────────────────────────────────────────────────────
      let m = /^\/lws\/vault\/([^/]+)\/c$/.exec(path);
      if (m && method === "POST") {
        const vault = decodeURIComponent(m[1]!);
        if (!reach.has(vault))
          return json(403, { error: "Forbidden", message: `vault target denied: the principal holds no write reach on vault ${vault}` });
        const type = body?.type;
        if (typeof type !== "string" || !/^t:/.test(type))
          return json(400, { error: "InvalidDatomError", message: `Type '${String(type)}' is not a legal type notation` });
        const e = mint(vault, type, (body?.facts ?? {}) as Record<string, unknown>);
        e.facts["a:lwsSelf"] = { "@id": e.id };
        // The platform makes the record's master tag at create, on this door (K1). A TagHandle itself is never tagged.
        if (tagMode === "auto" && type !== "t:TagHandle") mintMaster(e);
        const loc = e.id.replace("/base/e/", "/lws/r/");
        return json(201, { "@id": loc }, { location: loc });
      }

      // ── GET /lws/vault/<vaultId>/records ────────────────────────────────────────────────
      m = /^\/lws\/vault\/([^/]+)\/records$/.exec(path);
      if (m && method === "GET") {
        const vault = decodeURIComponent(m[1]!);
        if (!reach.has(vault))
          return json(403, { error: "Forbidden", message: `vault target denied: the principal holds no read reach on vault ${vault}` });
        const types = u.searchParams.getAll("type");
        if (types.some((t) => /[:/]/.test(t))) return json(400, { error: "type_token_unresolved" });
        const offset = Number(u.searchParams.get("offset") ?? "0");
        const scope = scopeOf(vault);
        const heldIn = (e: StoredEntity) => [e.vault, ...(e.alsoIn ?? [])].filter((v, i, all) => scope.includes(v) && all.indexOf(v) === i);
        const all = [...entities.values()]
          .filter((e) => heldIn(e).length > 0 && (types.length === 0 || types.includes(e.type.replace(/^t:/, ""))))
          .sort((a, b) => b.seq - a.seq);
        // The pair as `rowVault()` builds it: more than one scanned vault → null + true.
        const pair = (e: StoredEntity) => {
          const held = heldIn(e);
          return held.length > 1 ? { vault: null, vaultAmbiguous: true } : { vault: held[0], vaultAmbiguous: false };
        };
        const page = all.slice(offset, offset + PAGE_SIZE);
        // `complete` is "nothing after this page"; `total` is offset + returned, a floor while
        // more remain (GilbPlatform `src/lws/records.ts`, read at `67b4d6c`).
        const complete = offset + page.length >= all.length;
        return json(200, {
          "@context": "https://www.w3.org/ns/lws/v1",
          total: offset + page.length,
          totalItemsKind: complete ? "exact" : "atLeast",
          returnedRecords: page.length,
          complete,
          pageSize: PAGE_SIZE,
          offset,
          records: page.map((e) => ({ entity: e.id, typeUri: e.type, updatedAt: "2026-09-30T07:29:49.125Z", label: labelOf(e), ...(rowVault ? pair(e) : {}) })),
          vault,
          scannedVaults: scope,
        });
      }

      // ── GET /lws/r/<id> and GET /base/e/<id> ────────────────────────────────────────────
      // Each carries the record's ETag (GilbPlatform `etagFor(state_hash)`, `src/lws/routes.ts:194`,
      // `src/routes/read.ts:346`); the native read is served `public, max-age=60`.
      m = /^\/(?:lws\/r|base\/e)\/([^/]+)$/.exec(path);
      if (m && method === "GET") {
        if (httpCache && init.cache !== "no-store") {
          const hit = httpCache.get(url);
          if (hit) return new Response(hit.text, { status: hit.status, headers: hit.headers });
        }
        const e = entities.get(`${VAULT_HOST}/base/e/${m[1]}`);
        if (!e || !reach.has(e.vault)) return json(404, { error: "NotFound", message: `No LWS resource at ${url}` });
        const native = path.startsWith("/base/e/");
        const res = json(200, framed(e), { etag: etagFor(e), ...(native ? { "cache-control": "public, max-age=60" } : {}) });
        if (httpCache && native && init.cache !== "no-store") httpCache.set(url, { status: 200, text: JSON.stringify(framed(e)), headers: { "content-type": "application/json; charset=utf-8", etag: etagFor(e), "cache-control": "public, max-age=60" } });
        return res;
      }

      // ── PUT /base/r/<id> (GAPP214.25b) ─────────────────────────────────────────────────────
      // The relation route: `{type, vault, agent, facts}`; 201 `{entity, changed}`. As read in
      // GilbPlatform `src/routes/relation.ts` at `46eaea58` (the rig reading is in the receipt).
      m = /^\/base\/r\/([^/]+)$/.exec(path);
      if (m && method === "PUT") {
        const vault = String(body?.vault ?? "");
        if (!reach.has(vault))
          return json(403, { error: "Forbidden", message: `vault target denied: the principal holds no write reach on vault ${vault}` });
        const type = body?.type;
        if (typeof type !== "string" || !/^t:/.test(type))
          return json(400, { error: "InvalidDatomError", message: `Type '${String(type)}' is not a legal type notation` });
        seq += 1;
        // Minted at the create-scope vault's own address (`relationUriInVault`), whichever host
        // the PUT arrived on (GilbPlatform `src/routes/relation.ts`, read at 46eaea58).
        const id = `${vault.replace(/\/+$/, "")}/r/${decodeURIComponent(m[1]!)}`;
        if (entities.has(id)) return json(200, { entity: id, changed: false });
        entities.set(id, { id, vault, type, facts: { ...((body?.facts ?? {}) as Record<string, unknown>), "a:lwsSelf": { "@id": id } }, seq });
        return json(201, { entity: id, changed: true, txn_id: `txn-${seq}` });
      }
      if (m && method === "GET") {
        // As the rig served it (2026-10-02, GilbPlatform 46eaea58): a remote @context and every
        // reference on the vault host compacted to a `base:` CURIE.
        const e = [...entities.values()].find((x) => x.id.endsWith(`/r/${m![1]}`) && new URL(x.id).host === u.host);
        if (!e || !reach.has(e.vault)) return json(404, { error: "NotFound" });
        const compact = (v: unknown): unknown =>
          Array.isArray(v) ? v.map(compact)
          : v && typeof v === "object" && typeof (v as { "@id"?: unknown })["@id"] === "string"
            ? { "@id": ((v as { "@id": string })["@id"]).replace(`${VAULT_HOST}/base/`, "base:") }
            : v;
        const doc: Record<string, unknown> = { "@context": `${VAULT_HOST}/base/context.jsonld`, "@id": e.id, "@type": e.type };
        for (const [k, v] of Object.entries(e.facts)) doc[k] = compact(v);
        return json(200, doc);
      }
      if (path === "/base/context.jsonld" && method === "GET") {
        return json(200, { "@context": { base: `${VAULT_HOST}/base/`, role: `${VAULT_HOST}/base/role/` } });
      }

      // ── PATCH /lws/r/<id> (merge patch; GAPP214.25b) ──────────────────────────────────────
      // Served at /lws/r/<id> only: `PATCH /base/e/<id>` has no route (rig, 2026-10-02). A `null`
      // member removes the field (RFC 7386).
      m = /^\/lws\/r\/([^/]+)$/.exec(path);
      if (m && method === "PATCH") {
        const e = entities.get(`${VAULT_HOST}/base/e/${m[1]}`);
        if (!e || !reach.has(e.vault)) return json(404, { error: "NotFound" });
        // GAPP214.25d (`25a09f2d`, `src/lws/crud.ts` `ifMatchRefusal`): If-Match is optional; when
        // sent it is compared with the record's ETag as it stands, and a mismatch is 412 with
        // nothing written. `*` matches an existing record. Off (`ifMatch: false`) the header is
        // ignored, as on a platform before .25d.
        const sent = headers["if-match"];
        if (ifMatch && sent !== undefined && sent.trim() !== "" && sent.trim() !== "*" && sent.trim() !== etagFor(e))
          return json(412, { error: "PreconditionFailed", message: "If-Match does not match the current ETag (stale write)." });
        for (const [k, v] of Object.entries(body ?? {})) {
          if (v === null) delete e.facts[k];
          else e.facts[k] = v;
        }
        e.rev = (e.rev ?? 1) + 1;
        return json(200, { entity: e.id, changed: true }, { etag: etagFor(e) });
      }

      // ── GET /base/tag/resolve ───────────────────────────────────────────────────────────
      if (path === "/base/tag/resolve" && method === "GET") {
        const tag = u.searchParams.get("tagString");
        const vault = u.searchParams.get("vault");
        if (!tag || tag.trim() === "") return json(400, { error: "BadRequest", message: "declare a non-empty `tagString` query parameter" });
        if (!vault) return json(400, { error: "BadRequest", message: "vault target required" });
        if (!reach.has(vault))
          return json(403, { error: "Forbidden", message: `vault target denied: the principal holds no read reach on vault ${vault}` });
        const h = tagHolder(vault, normalize(tag));
        if (!h) return json(200, { status: "miss" });
        return json(200, { status: "resolved", targetEntity: (h.facts["a:tagHandleOfEntity"] as { "@id": string })["@id"], tagHandle: h.id });
      }

      // ── POST /base/tag/handle ───────────────────────────────────────────────────────────
      if (path === "/base/tag/handle" && method === "POST") {
        const allowed = ["tagString", "tagRole", "targetEntity", "agent", "tagAspect", "tagSchemeRef"];
        const keys = Object.keys(body ?? {});
        const extra = keys.filter((k) => !allowed.includes(k));
        const missing = ["tagString", "tagRole", "targetEntity", "agent"].filter((k) => !keys.includes(k));
        if (extra.length > 0 || missing.length > 0)
          return json(400, { error: "Bad Request", message: `body must NOT have additional properties / must have required properties (${[...extra, ...missing].join(", ")})` });
        const target = entities.get(String(body!.targetEntity));
        if (!target) return json(400, { error: "BadRequest", message: `targetEntity ${String(body!.targetEntity)} has no current facts (does not exist)` });
        if (!reach.has(target.vault))
          return json(403, { error: "WriteForbiddenError", message: TAG_DOOR_DENIED });
        const tag = normalize(String(body!.tagString));
        if (body!.tagRole === "master") {
          const have = mastersOf(target.id)[0];
          if (have) return json(409, { error: "entity-has-master", tagString: have.facts["a:tagString"] });
        }
        const held = tagHolder(target.vault, tag);
        if (held) {
          const to = (held.facts["a:tagHandleOfEntity"] as { "@id": string })["@id"];
          if (to === target.id) return json(200, { entity: held.id, changed: false });
          return json(409, { error: "TagStringCollisionError", message: `tagString '${tag}' is already bound to ${to} in vault ${target.vault}` });
        }
        // A NEW string is checked as it arrived: NFC only, never trimmed (the platform's `checkNewTagString`). A stored string above is not.
        const refusedNew = refuseNewTagString(String(body!.tagString));
        if (refusedNew) return refusedNew;
        const facts: Record<string, unknown> = {
          "a:tagString": tag,
          "a:tagRole": body!.tagRole,
          "a:tagOrigin": "registered",
          "a:tagHandleOfEntity": { "@id": target.id },
        };
        if (body!.tagSchemeRef !== undefined) {
          // The route decodes after it commits whenever a scheme is declared, and a bare tag
          // string does not decode against the full-tag grammar: the handle is stamped "failed".
          facts["a:tagSchemeRef"] = { "@id": body!.tagSchemeRef };
          facts["a:tagDecodeStatus"] = "failed";
        }
        const h = mint(target.vault, "t:TagHandle", facts);
        return json(201, { entity: h.id, changed: true, txn_id: `txn-${h.seq}` });
      }

      // ── the platform's tag routes (K1), as GilbPlatform 6bfcc4dc answers them ──────────────────────────────────────────────────────
      if (/^\/base\/tag\/(master|ensure|list|reassign-master|remove|masters)$/.test(path)) {
        if (tagMode === "off") return json(404, { message: `Route ${method}:${path} not found`, error: "Not Found", statusCode: 404 });
        const name = path.slice("/base/tag/".length);
        const target = entities.get(String(u.searchParams.get("targetEntity") ?? body?.targetEntity ?? ""));
        const required = (keys: string[]) => keys.filter((k) => body?.[k] === undefined);
        const exact = (keys: string[]) => Object.keys(body ?? {}).filter((k) => !keys.includes(k));
        const bad = (keys: string[]) => {
          const x = [...exact(keys), ...required(keys)];
          return x.length > 0 ? json(400, { error: "Bad Request", message: `body must have exactly ${keys.join(", ")} (${x.join(", ")})` }) : null;
        };
        if (name === "master" && method === "GET") {
          if (u.searchParams.get("targetEntity") === null) return json(400, { error: "BadRequest", message: "declare a `targetEntity` query parameter" });
          if (!target || !reach.has(target.vault)) return notFound(String(u.searchParams.get("targetEntity")));
          const ms = mastersOf(target.id);
          if (ms.length === 0) return json(200, { tagKnown: false, tagUnknownReason: "none" });
          if (ms.length > 1) return json(200, { tagKnown: false, tagUnknownReason: "anomaly" });
          return json(200, { tagKnown: true, tagHandle: ms[0]!.id, tagString: ms[0]!.facts["a:tagString"] });
        }
        if (name === "list" && method === "GET") {
          if (u.searchParams.get("targetEntity") === null) return json(400, { error: "BadRequest", message: "declare a `targetEntity` query parameter" });
          if (!target || !reach.has(target.vault)) return notFound(String(u.searchParams.get("targetEntity")));
          return json(200, { tagHandles: handlesOfTarget(target.id).map(handleRow) });
        }
        if (name === "ensure" && method === "POST") {
          const refused = bad(["targetEntity", "agent"]);
          if (refused) return refused;
          if (!target || !reach.has(target.vault)) return json(403, { error: "WriteForbiddenError", message: TAG_DOOR_DENIED });
          const have = mastersOf(target.id)[0];
          if (have) return json(200, { ...handleRow(have), changed: false });
          const made = mintMaster(target);
          return json(201, { ...handleRow(made), changed: true });
        }
        if (name === "reassign-master" && method === "POST") {
          const refused = bad(["targetEntity", "tagString", "agent"]);
          if (refused) return refused;
          if (!target || !reach.has(target.vault)) return json(403, { error: "WriteForbiddenError", message: TAG_DOOR_DENIED });
          const hs = handlesOfTarget(target.id);
          const asked = normalize(String(body!.tagString));
          const wanted = hs.find((h) => h.facts["a:tagString"] === asked);
          if (!wanted)
            return json(400, {
              error: "InvalidDatomError",
              message: `tagString '${asked}' is not a registered TagHandle for ${target.id} in vault ${target.vault} — attach it first (e.g. with tagRole 'alt') before re-assigning master; reassignMaster never implicitly creates a TagHandle.`,
            });
          if (wanted.facts["a:tagOrigin"] === "assigned")
            return json(409, {
              error: "TagRoleDerivedError",
              message: `tagString '${asked}' is an ASSIGNED TagHandle for ${target.id} — its a:tagRole is DERIVED from the entity's carrier attributes and is settable by nobody. Change the carrier fact on the entity instead; the handle follows it.`,
            });
          const current = hs.filter((h) => h.facts["a:tagRole"] === "master" && h !== wanted);
          const derivedDemotion = current.find((h) => h.facts["a:tagOrigin"] === "assigned");
          if (derivedDemotion)
            return json(409, {
              error: "TagRoleDerivedError",
              message: `${target.id}'s current master '${String(derivedDemotion.facts["a:tagString"])}' is an ASSIGNED TagHandle — its a:tagRole is DERIVED from the entity's carrier attributes and may not be demoted by a re-assignment. It would be re-projected back on the entity's next carrier write, silently undoing this call. Change the carrier fact instead.`,
            });
          const changed = wanted.facts["a:tagRole"] !== "master" || current.length > 0;
          for (const h of current) h.facts["a:tagRole"] = "alt";
          wanted.facts["a:tagRole"] = "master";
          return json(200, { changed });
        }
        if (name === "remove" && method === "POST") {
          const refused = bad(["targetEntity", "tagString", "agent"]);
          if (refused) return refused;
          // READ first: a record that is missing or unreadable, and a string that is not a tag of the record, are ONE 404 (no oracle). Only a reader then learns 403.
          if (!target || !reach.has(target.vault)) return notFound(String(body!.targetEntity));
          const tag = normalize(String(body!.tagString));
          const h = handlesOfTarget(target.id).find((x) => x.facts["a:tagString"] === tag);
          if (!h) return notFound(target.id);
          // The assigned check runs BEFORE the master check, as the platform's does: an assigned master is TagRoleDerivedError.
          if (h.facts["a:tagOrigin"] === "assigned")
            return json(409, {
              error: "TagRoleDerivedError",
              message: `tagString '${tag}' is an ASSIGNED TagHandle for ${target.id} - it follows the entity's carrier attribute and is removed by nobody. Change the carrier fact instead.`,
            });
          if (h.facts["a:tagRole"] === "master") return json(409, { error: "TagIsMasterError", message: "Make another tag main first." });
          entities.delete(h.id);
          return json(200, { changed: true, tagString: tag });
        }
        if (name === "masters" && method === "POST") {
          // The platform's own checks, in its order (no schema: the body is read as it comes).
          const vault = body?.vault;
          const uris = body?.targetEntities;
          if (typeof vault !== "string" || vault.trim() === "") return json(400, { error: "BadRequest", message: "declare a `vault` (the address of the vault the records live in)" });
          if (!Array.isArray(uris) || uris.length === 0) return json(400, { error: "BadRequest", message: "declare `targetEntities`: a list of 1 to 50 record addresses" });
          if (uris.length > 50) return json(400, { error: "BadRequest", message: "ask for at most 50 records in one call" });
          if (!uris.every((x) => typeof x === "string" && x !== "" && x.length <= 2048))
            return json(400, { error: "BadRequest", message: "every entry of `targetEntities` must be a record address of at most 2048 characters" });
          // One answer for a record that is missing, one the caller cannot read and one of another vault (also a vault the caller does not reach).
          return json(200, {
            masterTags: uris.map((t) => {
              const e = entities.get(String(t));
              if (!e || e.vault !== vault || !reach.has(vault)) return { targetEntity: t, tagString: null, tagKnown: false, tagUnknownReason: "none" };
              const ms = mastersOf(e.id);
              if (ms.length === 0) return { targetEntity: t, tagString: null, tagKnown: false, tagUnknownReason: "none" };
              if (ms.length > 1) return { targetEntity: t, tagString: null, tagKnown: false, tagUnknownReason: "anomaly" };
              return { targetEntity: t, tagString: ms[0]!.facts["a:tagString"], tagKnown: true };
            }),
          });
        }
      }

      return json(404, { error: "NotFound", message: `no fixture route for ${method} ${path}` });
    },
  };
  return p;
}
