// The typed clients of the platform's tag routes.
//
// ONE RULE FOR A RECORD'S TAG: THE PLATFORM'S. Every record gets its own master tag from the platform at create, on every door.
// This package does not work a tag out of a name and register it; it READS the tag the platform made, asks the platform to make one
// when a record has none (`ensure`), and gives an app thin typed calls over the other routes so no app hand-rolls a fetch.
//
// The routes (EXACT shapes, binding; each is requested on the platform client's origin with the record's own path discipline of `platform.ts`):
//   GET  /base/tag/master?targetEntity=<IRI>  -> { tagKnown: true, tagHandle, tagString } | { tagKnown: false, tagUnknownReason: "none" | "anomaly" | "hidden" }
//                                                ⛔ not `?entity=`, and no `none` / `anomaly` / `count` / `hidden` flags
//   POST /base/tag/ensure   { targetEntity, agent }            -> { tagHandle, tagString, tagRole, changed }
//   GET  /base/tag/list?targetEntity=<IRI>     -> { tagHandles: [{ tagHandle, tagString, tagRole: master|alt|hidden, tagOrigin: assigned|registered }] }
//   POST /base/tag/handle   { tagString, tagRole: "alt", targetEntity, agent }                       (add an alt)
//   POST /base/tag/reassign-master { targetEntity, tagString, agent }                                (Make main; 409 TagRoleDerived when the master is assigned)
//   POST /base/tag/remove   { targetEntity, tagString, agent } -> { changed, tagString }             (refuses the master and assigned tags)
//   POST /base/tag/masters  { vault, targetEntities: [≤ 50] } -> { masterTags: [{ targetEntity, tagString|null, tagKnown, tagUnknownReason? }] }
//
// ⛔ A platform that has not shipped the routes answers Fastify's own 404 (`Route … not found`). That is a hard `NoTagRoutesError` (a `PlatformError`,
//   "This platform does not make tags yet"), never a silent fall back to an older derivation: there is one rule.
// The write-rule check for a NEW tag string (`checkNewTagString`, a client hint) runs before `addTag` sends anything; the platform is the gate.
import { expectStatus, PlatformError, request, routeUrl, type PlatformAnswer, type PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { assertTagString, checkNewTagString, effectiveTagMax, isTagWriteRefusal, TagStringRefusedError, type TagGrammar, type TagWriteRule } from "@kaigilb/gilbplatformcode-tag-grammar";

/** The words of a platform that does not have the tag routes. */
export const NO_TAG_ROUTES_SENTENCE = "This platform does not make tags yet";
/** The platform's cap on one batch master read. */
export const MASTERS_BATCH_MAX = 50;

/** The platform has none of the tag routes this package needs (Fastify's own 404 for an unregistered route). */
export class NoTagRoutesError extends PlatformError {
  /** Set by `createRecord` when the record WAS created and the platform then turned out to have no tag routes: what exists. */
  created?: { record: string; written: string[]; vaultId: string };
  constructor(answer: { url: string; status: number; text: string }) {
    super(NO_TAG_ROUTES_SENTENCE, answer.status, answer.url, answer.text);
    this.name = "NoTagRoutesError";
  }
}

/** The tag string is already a tag of another record in this vault (409 `TagStringCollisionError`). */
export class TagTakenError extends Error {
  readonly tag: string;
  constructor(tag: string) {
    super(`the tag ${JSON.stringify(tag)} is already used in this vault`);
    this.name = "TagTakenError";
    this.tag = tag;
  }
}

/** Make main on a record whose master is assigned (409 `TagRoleDerived`): the tag follows a field of the record, not the person's choice. */
export class TagRoleDerivedError extends Error {
  constructor(message = "the main tag follows a field of this record and cannot be changed here") {
    super(message);
    this.name = "TagRoleDerivedError";
  }
}

export type TagRole = "master" | "alt" | "hidden";
export type TagOrigin = "assigned" | "registered";

/** One tag handle of a record, as the list answers it. */
export interface RecordTag {
  tagHandle: string;
  tagString: string;
  tagRole: TagRole;
  tagOrigin: TagOrigin;
}

/** What the master read said. `unknown` carries the platform's own reason; none of these is "the record has no tag" except `none`. */
export type MasterRead =
  | { status: "master"; tag: string; tagHandle: string }
  | { status: "unknown"; reason: "none" | "anomaly" | "hidden" }
  /** The record is not readable to this caller (the platform's non-disclosing 404), or the answer was not one of the two shapes. */
  | { status: "unreadable" };

/** Fastify's own 404 for a route that is not registered, as against an entity 404 (`NotFound` / "No resource at"). */
export function isRouteMissing(answer: Pick<PlatformAnswer, "status" | "json" | "text">): boolean {
  if (answer.status !== 404) return false;
  const message = answer.json && typeof answer.json.message === "string" ? answer.json.message : answer.text;
  return /^Route\s+\S+\s+not found/.test(message.trim());
}

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** GET /base/tag/master?targetEntity= */
export async function readMasterTag(platform: PlatformClient, record: string): Promise<MasterRead> {
  const url = `${routeUrl(platform, "base/tag/master")}?targetEntity=${encodeURIComponent(record)}`;
  const answer = await request(platform, "GET", url, undefined, undefined, "no-store");
  if (isRouteMissing(answer)) throw new NoTagRoutesError(answer);
  if (answer.status === 404) return { status: "unreadable" };
  expectStatus(answer, "GET", [200]);
  const body = answer.json;
  if (body?.tagKnown === true && typeof body.tagString === "string" && body.tagString !== "" && typeof body.tagHandle === "string" && body.tagHandle !== "")
    return { status: "master", tag: body.tagString, tagHandle: body.tagHandle };
  if (body?.tagKnown === false) {
    const reason = body.tagUnknownReason;
    if (reason === "none" || reason === "anomaly" || reason === "hidden") return { status: "unknown", reason };
  }
  return { status: "unreadable" };
}

/** POST /base/tag/ensure: the platform gives the record its tag when it has none (a no-op when it has one). A 403 is the caller's: it may not write. */
export async function ensureMasterTag(
  platform: PlatformClient,
  record: string,
  agent: string,
): Promise<{ tagHandle: string; tagString: string; tagRole: string; changed: boolean }> {
  const url = routeUrl(platform, "base/tag/ensure");
  const answer = await request(platform, "POST", url, { targetEntity: record, agent });
  if (isRouteMissing(answer)) throw new NoTagRoutesError(answer);
  expectStatus(answer, "POST", [200, 201]);
  const b = asObject(answer.json);
  if (typeof b.tagHandle !== "string" || typeof b.tagString !== "string")
    throw new PlatformError(`POST ${url} named no tag`, answer.status, url, answer.text);
  return { tagHandle: b.tagHandle, tagString: b.tagString, tagRole: typeof b.tagRole === "string" ? b.tagRole : "master", changed: b.changed === true };
}

/** GET /base/tag/list?targetEntity= : every tag handle of the record the caller may read. */
export async function readTags(platform: PlatformClient, record: string): Promise<RecordTag[]> {
  const url = `${routeUrl(platform, "base/tag/list")}?targetEntity=${encodeURIComponent(record)}`;
  const answer = await request(platform, "GET", url, undefined, undefined, "no-store");
  if (isRouteMissing(answer)) throw new NoTagRoutesError(answer);
  expectStatus(answer, "GET", [200]);
  const rows = answer.json?.tagHandles;
  if (!Array.isArray(rows)) throw new PlatformError(`GET ${url} served no tag list`, answer.status, url, answer.text);
  const out: RecordTag[] = [];
  for (const r of rows) {
    const o = asObject(r);
    if (typeof o.tagHandle !== "string" || typeof o.tagString !== "string") continue;
    if (o.tagRole !== "master" && o.tagRole !== "alt" && o.tagRole !== "hidden") continue;
    out.push({ tagHandle: o.tagHandle, tagString: o.tagString, tagRole: o.tagRole, tagOrigin: o.tagOrigin === "assigned" ? "assigned" : "registered" });
  }
  return out;
}

/** A NEW tag string. When a rule is present it is checked first (`TagStringRefusedError` with the rule's reason and sentence); the grammar after it, and alone without a rule. */
function newTagString(raw: unknown, grammar?: TagGrammar, rule?: TagWriteRule): string {
  if (rule && typeof raw === "string") {
    const verdict = checkNewTagString(raw, rule);
    if (!verdict.ok) throw new TagStringRefusedError(verdict.reason, rule.iri, effectiveTagMax(rule.maxCharacters));
    if (!grammar) return verdict.tag;
  }
  if (grammar) return assertTagString(raw, grammar);
  if (typeof raw !== "string" || raw.trim() === "") throw new TypeError("a tag is text");
  return raw.normalize("NFC").trim();
}

/**
 * POST /base/tag/handle: add an ALT tag (role alt; the master is the platform's, changed only by {@link makeMainTag}). The write rule and the grammar are
 * checked first when given (no request is sent for a string they refuse). The platform's 400 `tag-string-refused` is a `TagStringRefusedError` carrying the
 * number the platform applied; a 409 `TagStringCollisionError` is {@link TagTakenError}.
 */
export async function addTag(
  platform: PlatformClient,
  record: string,
  tagString: string,
  agent: string,
  check: { rule?: TagWriteRule; grammar?: TagGrammar } = {},
): Promise<{ tag: string; changed: boolean }> {
  const tag = newTagString(tagString, check.grammar, check.rule);
  const url = routeUrl(platform, "base/tag/handle");
  const answer = await request(platform, "POST", url, { tagString: tag, tagRole: "alt", targetEntity: record, agent });
  if (answer.status === 400 && answer.json?.error === "tag-string-refused") {
    const reason = answer.json.reason;
    const ruleIri = answer.json.rule;
    if (isTagWriteRefusal(reason) && typeof ruleIri === "string" && ruleIri !== "") {
      const stated = answer.json.maxCharacters;
      const fromPlatform = typeof stated === "number" && Number.isInteger(stated) && stated >= 0 ? stated : undefined;
      throw new TagStringRefusedError(reason, ruleIri, fromPlatform ?? (check.rule ? effectiveTagMax(check.rule.maxCharacters) : undefined));
    }
  }
  if (answer.status === 409 && answer.json?.error === "TagStringCollisionError") throw new TagTakenError(tag);
  expectStatus(answer, "POST", [200, 201]);
  return { tag, changed: answer.status === 201 || answer.json?.changed === true };
}

/** POST /base/tag/reassign-master: Make main. A 409 `TagRoleDerived` (the master is assigned) is {@link TagRoleDerivedError}. */
export async function makeMainTag(platform: PlatformClient, record: string, tagString: string, agent: string): Promise<{ changed: boolean }> {
  const url = routeUrl(platform, "base/tag/reassign-master");
  const answer = await request(platform, "POST", url, { targetEntity: record, tagString, agent });
  if (answer.status === 409 && /TagRoleDerived/i.test(String(answer.json?.error ?? ""))) throw new TagRoleDerivedError();
  expectStatus(answer, "POST", [200, 201]);
  return { changed: answer.json?.changed === true };
}

/** POST /base/tag/remove: retract a tag. The platform refuses the master ("make another tag main first") and assigned tags. */
export async function removeTag(platform: PlatformClient, record: string, tagString: string, agent: string): Promise<{ changed: boolean; tagString: string }> {
  const url = routeUrl(platform, "base/tag/remove");
  const answer = expectStatus(await request(platform, "POST", url, { targetEntity: record, tagString, agent }), "POST", [200, 201]);
  const b = asObject(answer.json);
  return { changed: b.changed === true, tagString: typeof b.tagString === "string" ? b.tagString : tagString };
}

/** One record's main tag as the batch read answers it. */
export type MainTagRead = { tag: string; known: true } | { tag: null; known: boolean; reason?: string };

/**
 * POST /base/tag/masters, in chunks of {@link MASTERS_BATCH_MAX}: the main tags of many records of ONE vault. 120 records are 3 calls.
 * @param vault the vault the records live in (its `vaultId`)
 */
export async function readMainTags(platform: PlatformClient, vault: string, records: readonly string[]): Promise<Map<string, MainTagRead>> {
  const out = new Map<string, MainTagRead>();
  const url = routeUrl(platform, "base/tag/masters");
  for (let i = 0; i < records.length; i += MASTERS_BATCH_MAX) {
    const chunk = records.slice(i, i + MASTERS_BATCH_MAX);
    const answer = await request(platform, "POST", url, { vault, targetEntities: chunk });
    if (isRouteMissing(answer)) throw new NoTagRoutesError(answer);
    expectStatus(answer, "POST", [200]);
    const rows = answer.json?.masterTags;
    if (!Array.isArray(rows)) throw new PlatformError(`POST ${url} served no masterTags`, answer.status, url, answer.text);
    for (const r of rows) {
      const o = asObject(r);
      if (typeof o.targetEntity !== "string") continue;
      const known = o.tagKnown === true;
      out.set(
        o.targetEntity,
        known && typeof o.tagString === "string" && o.tagString !== ""
          ? { tag: o.tagString, known: true }
          : { tag: null, known, ...(typeof o.tagUnknownReason === "string" ? { reason: o.tagUnknownReason } : {}) },
      );
    }
  }
  return out;
}
