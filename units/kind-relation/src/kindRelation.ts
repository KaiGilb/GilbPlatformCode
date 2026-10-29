/**
 * A KIND OF CONTACT IS A RELATION TO THE VAULT, and a new tie starts as associated-with.
 *
 * A kind of contact (Friend, Customer ...) is not a property of the contact: it is a predicate relation to the selected vault, and a vault
 * may stand for a person, a project or an organisation. A new tie between a contact and the vault starts as the generic `t:AssociatedWith`
 * ({@link DEFAULT_PARTY_TIE_CURIE}), the parent of every kind predicate. Picking a specific kind REPLACES it: the specific relation is written
 * first, then the default is ended. Never both. Ending the last specific kind brings the default back (the floor rule).
 *
 * Picking the chip "Friend" on a contact writes ONE relation:
 *
 *     `@type`           the kind's predicate (`t:FriendOf`, `t:CustomerOf` …), READ from the catalogue entry's `a:kindPredicate`, ⛔ none typed here
 *                       (or `t:AssociatedWith`, the default)
 *     `role:source`     { "@id": the contact's record }
 *     `role:target`     { "@id": the ENTITY OF THE VAULT the record is held in }     (the vault's own entity, ⛔ not its self card, not a principal)
 *     `a:claimSubject`  { "@id": the HOLDER (the signed-in principal) }
 *     `a:visibilityTier` "private"
 *
 * and NOTHING else (an allowlist, {@link assertKindRelationFacts}). The relation is private to the holder and 🔴 GRANTS NOTHING: no reader, no group,
 * no rung, no find key, no folder inheritance. A kind never changes the record's type. Unpicking ENDS the relation (`endRelation`, never a delete).
 *
 * 🔴 The relation's id is RANDOM ({@link mintRelationId}). A person with a read grant on the vault sees the
 * bare address of a private relation in the contact's relation list (the platform's reverse lookup); an id that was a hash of holder, contact,
 * predicate and vault entity gave the kind away in a few guesses. A random id gives nothing away, so every write first LOOKS UP the holder's own tie
 * for that contact and kind ({@link writeTie}) and reuses its id; only when there is none is a new id made.
 * A holder's OWN kind (no predicate) stays a private label claim (`heldContactLabel.ts`): it is not a tie and does not replace the default.
 */
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { attributeSpelling } from "@kaigilb/gilbplatformcode-term-slots";
import {
  boundAwait,
  endRelation,
  isBoundTimeout,
  mintRelationId,
  readRelationDoc,
  readRelations,
  uriTail,
  writePairRelation,
  type LinkPlaneCatalog,
  type RelationDoc,
} from "@kaigilb/gilbplatformcode-lws-relations";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { DEFAULT_PARTY_TIE_CURIE, offeredFor, sameEntity, type KindEntry } from "@kaigilb/gilbplatformcode-contact-kind-model";
import { expandRelationRef } from "./expandRelationRef";

export class KindRelationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KindRelationError";
  }
}

/** One step of a kind write (the lock wait, a read, the PUT). Longer than the DPoP bound, so a stuck proof is named as the proof. */
const KIND_WRITE_BOUND_MS = 12_000;
let kindWriteBoundOverride: number | null = null;

/** How long one kind-write step may sit before the dialog names the wait. */
export function kindWriteBoundMs(): number {
  return kindWriteBoundOverride ?? KIND_WRITE_BOUND_MS;
}

/** Test seam — ⛔ never called by product code. `null` restores the 12s bound. */
export function __setKindWriteBoundForTest(ms: number | null): void {
  kindWriteBoundOverride = ms;
}

function boundKindStep<T>(p: Promise<T>, what: string): Promise<T> {
  return boundAwait(p, kindWriteBoundMs(), what);
}

/** A read that fails is still "not there". A wait that never ends is named, not turned into null. */
async function boundKindRead<T>(p: Promise<T>, what: string): Promise<T | null> {
  try {
    return await boundKindStep(p, what);
  } catch (e) {
    if (isBoundTimeout(e)) throw e;
    return null;
  }
}

export class KindRelationVocabUnavailableError extends Error {
  constructor(missing: readonly string[]) {
    super(`The ontology did not name ${missing.join(", ")}, so a kind of contact cannot be kept as a relation right now.`);
    this.name = "KindRelationVocabUnavailableError";
  }
}

/** The ONE tier a kind relation is written at. */
export const KIND_RELATION_TIER = "private";

/** The vault a kind is said toward: its entity (the relation's target) and what it represents (which kinds fit it). Either may be unknown. */
export interface KindVault {
  /** The vault namespace the record is held in (where the relation is written). */
  vaultId: string;
  /** The vault's own ENTITY address (`ReachableVault.entity`): the relation's `role:target`. null = none minted, so no tie can be written. */
  entity: string | null;
  /** `a:vaultRepresents`, as the vault list reports it. null = undeclared (⛔ never read as Person). */
  represents: string | null;
}

export function kindVaultOf(v: Pick<ReachableVault, "vaultId" | "entity" | "represents"> | null | undefined): KindVault | null {
  return v ? { vaultId: v.vaultId, entity: v.entity ?? null, represents: v.represents ?? null } : null;
}

/** The master's address of the type a vault represents (`t/Person`, `…/t/Person`, `t:Person` -> `…/base/t/Person`); "" when undeclared. */
export function vaultMasterType(represents: string | null | undefined): string {
  const name = (represents ?? "").trim().replace(/\/+$/, "").split(/[/:]/).pop() ?? "";
  return name ? `${termOrigin()}/base/t/${name}` : "";
}

/** The spellings the two non-role facts are written under, ASKED of the master by term name (⛔ none typed here). */
export interface KindRelationVocab {
  claimSubject: string;
  visibilityTier: string;
}

let cachedVocab: Promise<KindRelationVocab> | null = null;

/** Test seam — ⛔ never called by product code. */
export function __resetKindRelationVocab(): void {
  cachedVocab = null;
  endedTieIds.clear();
  pendingTieIds.clear();
}

export function resolveKindRelationVocab(): Promise<KindRelationVocab> {
  cachedVocab ??= (async () => {
    const names = ["claimSubject", "visibilityTier"] as const;
    const got = await Promise.all(names.map((n) => attributeSpelling(n)));
    const missing = names.filter((_, i) => !got[i]).map((n) => `a/${n}`);
    if (missing.length > 0) throw new KindRelationVocabUnavailableError(missing);
    return { claimSubject: `a:${got[0]!}`, visibilityTier: `a:${got[1]!}` };
  })().catch((e) => {
    cachedVocab = null;
    throw e;
  });
  return cachedVocab;
}

const ROLE_SOURCE = "role:source";
const ROLE_TARGET = "role:target";

/** The facts of ONE kind relation — the ONE composer, so the neutrality rule has one home. Checked before it is returned. */
export function kindRelationFacts(vocab: KindRelationVocab, args: { source: string; target: string; holder: string }): Record<string, unknown> {
  const facts: Record<string, unknown> = {
    [ROLE_SOURCE]: { "@id": args.source },
    [ROLE_TARGET]: { "@id": args.target },
    [vocab.claimSubject]: { "@id": args.holder },
    [vocab.visibilityTier]: KIND_RELATION_TIER,
  };
  assertKindRelationFacts(facts, vocab, args);
  return facts;
}

/**
 * 🔴 The neutrality guard: the facts of a kind relation are EXACTLY the four above and nothing else. An ALLOWLIST, not a list of what is refused: a grant
 * predicate nobody has thought of is refused too. Source is the contact, target is the vault's entity, the holder is the signed-in one. Throws {@link KindRelationError}.
 */
export function assertKindRelationFacts(facts: Record<string, unknown>, vocab: KindRelationVocab, args: { source: string; target: string; holder: string }): void {
  const allowed = new Set([ROLE_SOURCE, ROLE_TARGET, vocab.claimSubject, vocab.visibilityTier]);
  for (const k of Object.keys(facts)) {
    if (!allowed.has(k)) throw new KindRelationError(`Refusing to write ${k} on a kind-of-contact relation: it grants no access and carries nothing else.`);
  }
  for (const k of allowed) if (!(k in facts)) throw new KindRelationError(`A kind-of-contact relation needs ${k}.`);
  if (facts[vocab.visibilityTier] !== KIND_RELATION_TIER) {
    throw new KindRelationError("A kind-of-contact relation is written at the private row, always: without it a first read grant on the vault would expose it.");
  }
  const ref = (k: string): string | null => {
    const v = facts[k] as { "@id"?: unknown } | undefined;
    return v && typeof v["@id"] === "string" && v["@id"] ? v["@id"] : null;
  };
  if (!args.holder || ref(vocab.claimSubject) !== args.holder) {
    throw new KindRelationError("A kind-of-contact relation is held by its holder only: a:claimSubject is the signed-in holder, never the contact or a group.");
  }
  if (!args.source || ref(ROLE_SOURCE) !== args.source) throw new KindRelationError("A kind-of-contact relation starts at the contact's record.");
  if (!args.target || ref(ROLE_TARGET) !== args.target) throw new KindRelationError("A kind-of-contact relation ends at the vault's entity.");
  if (args.source === args.target) throw new KindRelationError("A contact is not related to itself.");
}

const hex = (buf: ArrayBuffer): string => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * The id the round-1 and round-2 builds gave a tie: sha256(holder | source | predicate | target [| generation]) cut to 26 hex. ⛔ Never minted any
 * more: anyone who can read the four inputs can compute it. Kept only to RECOGNISE an old tie ({@link isLegacyKindRelationId}).
 */
export async function legacyKindRelationId(args: { holder: string; source: string; curie: string; target: string; generation?: number }): Promise<string> {
  const parts = [args.holder, args.source, args.curie, args.target];
  if (args.generation && args.generation > 0) parts.push(String(args.generation));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\n")));
  return hex(digest).slice(0, 26);
}

/** How many generations the old builds tried, so how many old ids one tie may have had. */
export const MAX_TIE_GENERATIONS = 6;

/**
 * True when `id` is an id an old build computed for this tie (any of its generations). Such a tie is read, kept while it is live and ended like any
 * other, but once ended it is ⛔ never written again under that id: a new random one is made instead, so the kind stops being guessable.
 */
export async function isLegacyKindRelationId(id: string, args: { holder: string; source: string; curie: string; target: string }): Promise<boolean> {
  if (!/^[0-9a-f]{26}$/.test(id)) return false;
  for (let generation = 0; generation < MAX_TIE_GENERATIONS; generation++) {
    if ((await legacyKindRelationId({ ...args, generation })) === id) return true;
  }
  return false;
}

const typeTail = (t: string): string => t.slice(Math.max(t.lastIndexOf("/"), t.lastIndexOf(":")) + 1);

/** Two spellings of one predicate (`t:FriendOf`, `https://…/t/FriendOf`). */
export const samePredicate = (a: string | null | undefined, b: string | null | undefined): boolean => !!a && !!b && typeTail(a) === typeTail(b);

/** True for the default tie, in any spelling. */
export const isDefaultTie = (curie: string | null | undefined): boolean => samePredicate(curie, DEFAULT_PARTY_TIE_CURIE);

/**
 * Write one tie: contact -> the vault's entity, private to the holder, nothing else. Refuses, before any request, a vault with no entity, no
 * vault named, no holder and no subject. The predicate must be a live user-plane join: the write door refuses any other (`writePairRelation`).
 */
export async function writeKindRelation(args: { vault: KindVault; subject: string; curie: string; holder: string; id: string }): Promise<{ id: string; uri: string }> {
  const { vault, subject, curie, holder, id } = args;
  if (!id) throw new KindRelationError("Refusing to write a kind of contact with no id.");
  if (!vault.vaultId) throw new KindRelationError("Refusing to write a kind of contact with no vault named.");
  if (!holder) throw new KindRelationError("Refusing to write a kind of contact with no signed-in holder.");
  if (!subject) throw new KindRelationError("Refusing to write a kind of contact about no one.");
  if (!curie) throw new KindRelationError("This kind stands for no relation, so none is written.");
  if (!vault.entity) throw new KindRelationError("This vault has no entity to relate the contact to, so no kind is written.");
  // Not bounded here. `writeTie` bounds this whole call, and it keeps the promise: a bound
  // inside this function would drop a PUT that lands after the wait, and the retry could not hear it.
  const vocab = await resolveKindRelationVocab();
  const facts = kindRelationFacts(vocab, { source: subject, target: vault.entity, holder });
  const { [ROLE_SOURCE]: _s, [ROLE_TARGET]: _t, ...extraFacts } = facts;
  void _s;
  void _t;
  const written = await writePairRelation({
    sourceId: subject,
    targetId: vault.entity,
    sourceEntityUri: subject,
    targetEntityUri: vault.entity,
    typeCurie: curie,
    relationId: id,
    vaultNamespace: vault.vaultId,
    extraFacts,
  });
  return { id, uri: written.uri ?? tieUri(vault.vaultId, id) };
}

/** Confirm a relation the store accepted is there, as the holder reads it: its predicate and both ends. null = not there. */
export async function readKindRelationBack(uri: string, vaultId: string): Promise<{ curie: string | null; source: string | null; target: string | null } | null> {
  const doc = await readRelationDoc(uri, vaultId);
  return doc ? { curie: doc.typeCurie, source: doc.sourceUri, target: doc.targetUri } : null;
}

/** True when the read-back is the tie that was meant: that predicate, from the contact, to the vault's entity. */
export function readBackIsTie(back: { curie: string | null; source: string | null; target: string | null } | null, args: { curie: string; subject: string; vaultEntity: string }): boolean {
  return !!back && samePredicate(back.curie, args.curie) && sameEntity(back.source, args.subject) && sameEntity(back.target, args.vaultEntity);
}

/** One tie the holder holds between the contact and the vault, as the lookup found it. */
export interface OwnTie {
  uri: string;
  id: string;
  curie: string;
}

/** The holder a relation document names (`a:claimSubject`, read under either spelling), as an absolute address; null when it names none. */
export function tieHolderOf(doc: RelationDoc | null, vocab: KindRelationVocab): string | null {
  if (!doc) return null;
  const bare = vocab.claimSubject.replace(/^a:/, "");
  const v = doc.extras[bare] ?? doc.extras[vocab.claimSubject];
  return v === undefined ? null : expandRelationRef(v, doc.uri);
}

export interface TieLookupDeps {
  /** The contact's relations (the reverse lookup). */
  readRows?: (id: string, at: string | null) => Promise<RecordRelation[]>;
  readDoc?: typeof readRelationDoc;
}

/**
 * The holder's OWN live ties between the contact and the vault: a relation from the contact to the vault's entity whose `a:claimSubject` is the
 * holder (read from the relation itself, one read per candidate; a contact has a handful). Sorted by id, so every tab and device that reads the
 * same ties picks the same one ({@link healTies}). A fresh read, ⛔ never a cached list: it decides whether a write is needed.
 */
export async function ownLiveTies(args: { vault: KindVault; subject: string; holder: string }, deps: TieLookupDeps = {}): Promise<OwnTie[]> {
  const readRows = deps.readRows ?? readRelations;
  const readDoc = deps.readDoc ?? readRelationDoc;
  const entity = args.vault.entity;
  if (!entity) return [];
  const rows = await readRows(uriTail(args.subject), args.subject);
  const touching = await relationsTouchingVault(rows, entity, args.vault.vaultId, { readDoc });
  const vocab = await resolveKindRelationVocab();
  const out: OwnTie[] = [];
  for (const t of touching) {
    if (!t.type || !sameEntity(t.source, args.subject) || !sameEntity(t.target, entity)) continue;
    const doc = await readDoc(t.uri, args.vault.vaultId).catch(() => null);
    if (!sameEntity(tieHolderOf(doc, vocab), args.holder)) continue;
    out.push({ uri: t.uri, id: uriTail(t.uri), curie: t.type });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The ids of ties this holder ENDED in this tab, by vault, holder, contact and predicate: the platform lists no ended relation by its member (an
 * ending closes the relation's roles, so the reverse lookup no longer names it), so this is how "written again" finds the id to revive. Memory
 * only, ⛔ never stored: in another tab or after a reload the ended tie is not found, and a new random id is made (one more ended relation, never
 * two live ones). An OLD guessable id ({@link isLegacyKindRelationId}) is never remembered, so it is never revived.
 */
const endedTieIds = new Map<string, string>();
/**
 * The id sent for a tie that has not been confirmed, same key as {@link endedTieIds}. Memory only,
 * ⛔ never stored. A retry PUTs this id. Cleared only when that write is confirmed.
 */
const pendingTieIds = new Map<string, string>();
const endedKey = (vaultId: string, holder: string, subject: string, curie: string): string => [vaultId, holder, subject, typeTail(curie)].join("\n");

function tieUri(vaultId: string, id: string): string {
  return `${vaultId.replace(/\/+$/, "")}/r/${uriTail(id)}`;
}

/** Test seam — ⛔ never called by product code. */
export function __resetEndedTies(): void {
  endedTieIds.clear();
  pendingTieIds.clear();
}

/** The lock one contact's ties are written under, shared by every tab of this app in this browser (Web Locks). */
export const tieLockName = (vaultId: string, subject: string): string => `gilbapp:kind-tie:${vaultId}:${subject}`;

type LockRunner = <T>(name: string, act: () => Promise<T>) => Promise<T>;

type LockRequest = (
  name: string,
  options: { mode: "exclusive"; signal?: AbortSignal },
  callback: () => Promise<unknown>,
) => Promise<unknown>;

/**
 * Run `act` holding the browser's lock `name` when the browser has Web Locks; without them, run it as is (the heal still holds).
 * Only the wait for the grant is bounded. The callback is not inside that timer: a hang after the grant is named by the step that is stuck.
 */
export const withBrowserLock: LockRunner = async (name, act) => {
  const locks = (globalThis.navigator as (Navigator & { locks?: { request: LockRequest } }) | undefined)?.locks;
  if (!locks || typeof locks.request !== "function") return act();
  const wait = new AbortController();
  let settled = false;
  const lockTimeout = () => new KindRelationError("waiting for the browser lock timed out");
  return await new Promise<Awaited<ReturnType<typeof act>>>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      wait.abort();
      reject(lockTimeout());
    }, kindWriteBoundMs());
    const granted = locks.request(name, { mode: "exclusive", signal: wait.signal }, async () => {
      clearTimeout(timer);
      return act();
    });
    granted.then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v as Awaited<ReturnType<typeof act>>);
      },
      (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (wait.signal.aborted) reject(lockTimeout());
        else reject(e);
      },
    );
  });
};

export interface WriteTieResult {
  id: string;
  uri: string;
  live: boolean;
  /** "live": the holder's live tie was kept; "pending": this tab's unconfirmed id was written again; "ended": an ended tie was written again; null: a new id. */
  reused: "live" | "pending" | "ended" | null;
  /** Other ties the heal ended (a duplicate of this kind, a default beside a specific kind). */
  ended: OwnTie[];
  notEnded: OwnTie[];
  endError: string | null;
}

export interface WriteTieDeps extends TieLookupDeps {
  write?: typeof writeKindRelation;
  readBack?: typeof readKindRelationBack;
  end?: (vaultId: string, uris: readonly string[]) => Promise<void>;
  newId?: () => string;
  lock?: LockRunner;
  /** Unconfirmed ids for this writer. Omitted, the module map (one tab). Two devices pass one map each. */
  pending?: Map<string, string>;
}

/**
 * Two live ties of one kind (two tabs, two devices writing at once), or the default live beside a specific kind: keep ONE and end the rest.
 * The one kept is the lowest id, so two writers that both heal keep the SAME one. A specific kind wins over the default (never both). Only the
 * holder's own ties are touched. An ending that fails is returned in `notEnded` and left for the next change (readers hide a default beside a
 * specific kind). `kept` is the tie kept for `curie`, or null when that tie was itself ended (a default written while a specific kind was live).
 */
export async function healTies(
  args: { vault: KindVault; subject: string; curie: string; holder: string },
  own: readonly OwnTie[],
  deps: { end?: WriteTieDeps["end"] } = {},
): Promise<{ kept: OwnTie | null; ended: OwnTie[]; notEnded: OwnTie[]; error: string | null }> {
  const end = deps.end ?? endKindRelations;
  const same = own.filter((t) => samePredicate(t.curie, args.curie));
  const keep = same[0] ?? null;
  const drop = same.slice(1);
  const specificLive = own.some((t) => !isDefaultTie(t.curie));
  const defaults = own.filter((t) => isDefaultTie(t.curie));
  const endDefaults = specificLive ? defaults.filter((t) => !drop.includes(t)) : [];
  const ended: OwnTie[] = [];
  const notEnded: OwnTie[] = [];
  let error: string | null = null;
  for (const t of [...drop, ...endDefaults]) {
    try {
      await end(args.vault.vaultId, [t.uri]);
      ended.push(t);
      if (endDefaults.includes(t)) await rememberEnded(args.vault, args.holder, args.subject, t);
    } catch (e) {
      // A wait that never ends must not be recorded as "could not end" and then reported as success.
      if (isBoundTimeout(e)) throw e;
      notEnded.push(t);
      error ??= e instanceof Error ? e.message : String(e);
    }
  }
  return { kept: keep && ended.includes(keep) ? null : keep, ended, notEnded, error };
}

async function rememberEnded(vault: KindVault, holder: string, subject: string, tie: { uri: string; curie: string }): Promise<void> {
  if (!vault.entity || !holder) return;
  const id = uriTail(tie.uri);
  if (await isLegacyKindRelationId(id, { holder, source: subject, curie: tie.curie, target: vault.entity })) return;
  endedTieIds.set(endedKey(vault.vaultId, holder, subject, tie.curie), tie.uri);
}

type TieBack = Awaited<ReturnType<typeof readKindRelationBack>>;

/** A timeout after the PUT was accepted: the error names the id that was sent, so the notice can say it may still land. */
function stuckAfterWrite(e: unknown, written: { id: string; uri: string }, late?: Promise<unknown>): void {
  if (!(e instanceof Error) || !isBoundTimeout(e)) return;
  const marked = e as Error & { written?: { id: string; uri: string }; late?: Promise<unknown> };
  marked.written = written;
  if (late) marked.late = late;
}

/**
 * Write one tie AND confirm the holder reads it back live. In this order, under the browser's lock for this contact (two tabs take turns):
 *   1. the holder's own LIVE tie of this kind: nothing is written, its id is kept;
 *   2. the id this tab already sent and has not confirmed ({@link pendingTieIds}): PUT that same id again;
 *   3. the holder's ENDED tie of this kind, remembered from this tab: written again under ITS id (the platform revives it);
 *   4. otherwise a NEW random id.
 * A remembered ended id the platform refuses (409/410) falls back to a new random id. A pending id that errors does not: the error stands
 * unless a read-back of that id is already this tie. After the write the ties are read again and healed ({@link healTies}). A sign-in failure
 * is not retried. The pending id stays until the write is confirmed (this return, a late landing, or that read-back).
 * `live` is false when the tie was written but ended by the heal (a default written while a specific kind was live). `notEnded` names a tie
 * the heal had to end and could not (with `endError`): the caller says so.
 */
export async function writeTie(
  args: { vault: KindVault; subject: string; curie: string; holder: string },
  deps: WriteTieDeps = {},
): Promise<WriteTieResult> {
  const write = deps.write ?? writeKindRelation;
  const readBack = deps.readBack ?? readKindRelationBack;
  const newId = deps.newId ?? mintRelationId;
  const lock = deps.lock ?? withBrowserLock;
  const pending = deps.pending ?? pendingTieIds;
  const vaultEntity = args.vault.entity ?? "";
  if (!vaultEntity) throw new KindRelationError("This vault has no entity to relate the contact to, so no kind is written.");
  const tieArgs = { curie: args.curie, subject: args.subject, vaultEntity };
  return lock(tieLockName(args.vault.vaultId, args.subject), async () => {
    const before = await boundKindStep(ownLiveTies(args, deps), "reading this contact's kind ties");
    const live = before.find((t) => samePredicate(t.curie, args.curie));
    if (live) {
      const h = await boundKindStep(healTies(args, before, deps), "ending the extra kind tie");
      const k = h.kept ?? live;
      return { id: k.id, uri: k.uri, live: !!h.kept, reused: "live", ended: h.ended.filter((t) => t.id !== k.id), notEnded: h.notEnded, endError: h.error };
    }
    const key = endedKey(args.vault.vaultId, args.holder, args.subject, args.curie);
    const pendingId = pending.get(key);
    const remembered = endedTieIds.get(key);
    // `newId` is built even when an earlier id is tried, so a refusal of that id has a fallback ready (the ended-id tests count this call).
    const tries: { id: string; reused: "pending" | "ended" | null }[] = [
      ...(pendingId ? [{ id: uriTail(pendingId), reused: "pending" as const }] : []),
      ...(remembered ? [{ id: uriTail(remembered), reused: "ended" as const }] : []),
      { id: newId(), reused: null },
    ];
    let last: unknown = null;
    for (const t of tries) {
      // Remember the id before the wait, including a throw that happens as the write is called.
      pending.set(key, t.id);
      const writeP = Promise.resolve().then(() => write({ ...args, id: t.id }));
      let written: { id: string; uri: string } | undefined;
      try {
        written = await boundKindStep(writeP, "writing the kind relation");
      } catch (e) {
        // The PUT was sent and the wait ended. Keep listening: a late resolution confirms it and drops the pending id.
        // A late rejection leaves the pending id, so the next try writes that same relation.
        if (e instanceof Error && e.message === "writing the kind relation timed out") {
          const marked = e as Error & { late?: Promise<unknown> };
          // The PUT may still land. When it does, heal under the same lock: a retry in another
          // tab can have written a second live tie while this one was unconfirmed.
          marked.late = writeP.then(
            async (w) => {
              if (pending.get(key) === t.id) pending.delete(key);
              try {
                await lock(tieLockName(args.vault.vaultId, args.subject), async () => {
                  const listed = await ownLiveTies(args, deps);
                  const mine: OwnTie = { uri: w.uri, id: w.id, curie: args.curie };
                  const own = (listed.some((o) => o.id === mine.id) ? listed : [...listed, mine])
                    .slice()
                    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
                  await healTies(args, own, deps);
                });
              } catch {
                // The tie landed. A heal that fails is the next write's job; the landing still stands.
              }
              return w;
            },
            () => null,
          );
          throw e;
        }
        if (e instanceof NotSignedInError || isBoundTimeout(e)) throw e;
        if (t.reused === "pending" || t.reused === "ended") {
          const guess = tieUri(args.vault.vaultId, t.id);
          const readP = readBack(guess, args.vault.vaultId);
          let back: TieBack = null;
          try {
            back = await boundKindRead(readP, "reading the kind relation back");
          } catch (readErr) {
            stuckAfterWrite(readErr, { id: t.id, uri: guess }, readP.then((b) => (readBackIsTie(b, tieArgs) ? { id: t.id, uri: guess } : null), () => null));
            throw readErr;
          }
          // The reused-id PUT lost (the platform answers the loser 500). If that id is already this tie, it landed.
          if (readBackIsTie(back, tieArgs)) written = { id: t.id, uri: guess };
          else if (t.reused === "pending") throw e;
        }
        if (!written) {
          // Only a refusal OF A REVIVED ended id (409 / 410) moves on to a new id. A pending id never does.
          if (t.reused === "ended" && e instanceof Error && /relation write failed: (409|410)\b/.test(e.message)) {
            last = e;
            continue;
          }
          // Any other refusal: another device may have written the same tie at the same moment. A live tie of this kind is the tie, kept.
          const now = await boundKindRead(ownLiveTies(args, deps), "reading this contact's kind ties");
          const theirs = now?.find((o) => samePredicate(o.curie, args.curie));
          if (!now || !theirs) throw e;
          if (pending.get(key) === t.id) pending.delete(key);
          endedTieIds.delete(key);
          const h = await boundKindStep(healTies(args, now, deps), "ending the extra kind tie");
          const k = h.kept ?? theirs;
          return { id: k.id, uri: k.uri, live: !!h.kept, reused: "live", ended: h.ended.filter((x) => x.id !== k.id), notEnded: h.notEnded, endError: h.error };
        }
      }
      const landed = written!;
      const readP = readBack(landed.uri, args.vault.vaultId);
      let back: TieBack = null;
      try {
        back = await boundKindRead(readP, "reading the kind relation back");
      } catch (e) {
        stuckAfterWrite(e, landed, readP.then((b) => (readBackIsTie(b, tieArgs) ? landed : null), () => null));
        throw e;
      }
      if (!readBackIsTie(back, tieArgs)) {
        last = new KindRelationError("The store accepted this but did not keep it.");
        // A pending id is the relation we already sent. A new id here would be a second live tie.
        if (t.reused === "pending") throw last;
        continue;
      }
      endedTieIds.delete(key);
      // HEAL: read the ties again (another device may have written the same kind meanwhile). The tie just written counts even if the list lags.
      const mine: OwnTie = { uri: landed.uri, id: landed.id, curie: args.curie };
      const afterP = ownLiveTies(args, deps);
      let after: OwnTie[] | null;
      try {
        after = await boundKindRead(afterP, "reading this contact's kind ties");
      } catch (e) {
        stuckAfterWrite(e, landed);
        throw e;
      }
      const own = after ? (after.some((o) => o.id === mine.id) ? after : [...after, mine]) : [mine];
      let h: Awaited<ReturnType<typeof healTies>>;
      try {
        h = await boundKindStep(healTies(args, own.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), deps), "ending the extra kind tie");
      } catch (e) {
        stuckAfterWrite(e, landed);
        throw e;
      }
      const k = h.kept ?? mine;
      if (pending.get(key) === t.id || pending.get(key) === landed.id) pending.delete(key);
      return { id: k.id, uri: k.uri, live: !!h.kept, reused: k.id === mine.id ? t.reused : "live", ended: h.ended.filter((e) => e.id !== k.id), notEnded: h.notEnded, endError: h.error };
    }
    throw last instanceof Error ? last : new KindRelationError("The store did not keep this relation.");
  });
}

/** A relation document that reads back ENDED: the platform stamps `a:relationLifecycleState "ended"` and closes every role. */
export function isEndedRelationDoc(doc: RelationDoc): boolean {
  const v = doc.extras["relationLifecycleState"] ?? doc.extras["a:relationLifecycleState"];
  if ((Array.isArray(v) ? v[0] : v) === "ended") return true;
  return !doc.sourceUri && !doc.targetUri;
}

/**
 * End ties by address. Never a delete, and nothing else is touched. Ending is idempotent: an end the vault REFUSED is
 * done when the tie reads back ended. Two tabs or devices ending the same tie at once get one 200 and one refusal for the same act (measured:
 * 500 "CAS conflict"); the loser must not say "Could not remove". A tie that still reads live, or cannot be read, keeps the refusal.
 */
export async function endKindRelations(vaultId: string, uris: readonly string[]): Promise<void> {
  if (!vaultId) throw new KindRelationError("Refusing to remove a kind of contact with no vault named.");
  for (const u of uris) {
    let res: Awaited<ReturnType<typeof endRelation>>;
    try {
      res = await endRelation(u, vaultId);
    } catch (e) {
      if (e instanceof NotSignedInError || isBoundTimeout(e)) throw e;
      const back = await readRelationDoc(u, vaultId).catch(() => null);
      if (back && isEndedRelationDoc(back)) continue;
      throw e;
    }
    if (res.verified === null && !res.changed) {
      // The vault says nothing was there to end (or hid it): that is "already gone" only when the read-back agrees.
      const still = await readRelationDoc(u, vaultId).catch(() => null);
      if (still && still.sourceUri) throw new KindRelationError("This could not be removed: the vault still holds it.");
    }
  }
}

/**
 * End the holder's ties (unpick a kind, replace the default) and remember each id, so writing the same kind again in this tab revives it
 * ({@link writeTie}). Never a delete, and nothing else is touched. An old guessable id is ended but not remembered.
 */
export async function endTies(
  vault: KindVault,
  holder: string,
  subject: string,
  ties: readonly { relationUri: string; curie: string }[],
  deps: { lock?: LockRunner } = {},
): Promise<void> {
  // Under the same browser lock as `writeTie`: two tabs removing the same kind take turns instead of racing the vault.
  const lock = deps.lock ?? withBrowserLock;
  await lock(tieLockName(vault.vaultId, subject), async () => {
    await endKindRelations(
      vault.vaultId,
      ties.map((t) => t.relationUri),
    );
    for (const t of ties) await rememberEnded(vault, holder, subject, { uri: t.relationUri, curie: t.curie });
  });
}

/** One relation of the contact that touches the vault's entity. */
export interface TouchingRelation {
  uri: string;
  type: string | null;
  source: string | null;
  target: string | null;
}

/**
 * Which of a contact's relations touch THIS vault's entity (cheap: the reverse lookup already names the co-members). A row with no members (an older
 * platform) is dereferenced, a few at a time, ⛔ never assumed to be about the vault.
 */
export async function relationsTouchingVault(
  rows: readonly RecordRelation[],
  vaultEntity: string,
  vaultId: string,
  deps: { readDoc?: typeof readRelationDoc } = {},
): Promise<TouchingRelation[]> {
  const readDoc = deps.readDoc ?? readRelationDoc;
  const out: TouchingRelation[] = [];
  const unknown: RecordRelation[] = [];
  for (const r of rows) {
    if (r.members && r.members.length > 0) {
      if (!r.members.some((m) => sameEntity(m.member, vaultEntity))) continue;
      const src = r.members.find((m) => /source$/.test(m.role));
      const tgt = r.members.find((m) => /target$/.test(m.role));
      if (r.type) {
        out.push({ uri: r.relation, type: r.type, source: src?.member ?? null, target: tgt?.member ?? null });
        continue;
      }
    }
    unknown.push(r);
  }
  const MAX_DEREF = 24;
  for (const r of unknown.slice(0, MAX_DEREF)) {
    const d = await readDoc(r.relation, vaultId).catch(() => null);
    if (d && (sameEntity(d.sourceUri, vaultEntity) || sameEntity(d.targetUri, vaultEntity))) out.push({ uri: r.relation, type: d.typeCurie, source: d.sourceUri, target: d.targetUri });
  }
  return out;
}

/** One tie between the contact and the vault that exists: which relation, which predicate, and the chip it is. */
export interface TieFound {
  relationUri: string;
  curie: string;
  /** The catalogue entry the predicate stands for, or the default's own id. */
  entryId: string;
  label: string;
  order: number | null;
  /** The default tie (associated-with). */
  isDefault: boolean;
}

/**
 * The ties among the relations touching the vault: a relation whose predicate is some entry's `a:kindPredicate`, or the default, from THIS contact to
 * THE vault's entity (a symmetric predicate is also matched the other way round, read from the user-plane catalogue). Each is mapped back to its entry.
 */
export function matchTies(
  touching: readonly TouchingRelation[],
  entries: readonly KindEntry[],
  subject: string,
  vaultEntity: string,
  args: { defaultEntry: KindEntry | null; catalog: LinkPlaneCatalog | null },
): TieFound[] {
  const out: TieFound[] = [];
  const symmetric = (curie: string): boolean => !!args.catalog?.terms.some((t) => samePredicate(t.curie, curie) && t.symmetric);
  for (const t of touching) {
    if (!t.type) continue;
    const isDefault = isDefaultTie(t.type);
    const entry = isDefault ? args.defaultEntry : entries.find((e) => !!e.kindPredicate && samePredicate(e.kindPredicate.curie, t.type));
    const curie = isDefault ? DEFAULT_PARTY_TIE_CURIE : entry?.kindPredicate?.curie;
    if (!curie) continue;
    const forward = sameEntity(t.source, subject) && sameEntity(t.target, vaultEntity);
    const backward = (isDefault || symmetric(curie)) && sameEntity(t.source, vaultEntity) && sameEntity(t.target, subject);
    if (!forward && !backward) continue;
    out.push({
      relationUri: t.uri,
      curie,
      entryId: entry?.id ?? defaultTieEntryId(),
      label: entry?.label ?? DEFAULT_PARTY_TIE_CURIE,
      order: entry?.order ?? null,
      isDefault,
    });
  }
  return out;
}

/** The default tie's entry id: the term's own address on the master (what the chip and the Kind step key it by). */
export function defaultTieEntryId(): string {
  return `${termOrigin()}/base/t/${typeTail(DEFAULT_PARTY_TIE_CURIE)}`;
}

/**
 * The default tie as an entry the chips and the Kind step can show: its words are the TERM's own label from the live user-plane catalogue
 * ("associated-with": the chip shows the term's own label). `null` when the catalogue does not list the term: then nothing is offered
 * in its place (⛔ never another predicate, never a made-up word).
 */
export function defaultTieEntry(catalog: LinkPlaneCatalog | null): KindEntry | null {
  const term = catalog?.terms.find((t) => samePredicate(t.curie, DEFAULT_PARTY_TIE_CURIE));
  if (!term) return null;
  const label = term.labelled !== false && term.label.trim() ? term.label.trim() : term.curie;
  return { id: defaultTieEntryId(), label, order: null, playableBy: [], axis: "relationshipKind", own: false, kindPredicate: { curie: DEFAULT_PARTY_TIE_CURIE }, defaultTie: true };
}

/**
 * The KINDS (the `t:RelationshipKind` entries) offered on a record held in a vault. A kind is a RELATION to the vault, so:
 *   - an entry with a predicate is offered when the record's type fits `a:playableBy` AND the vault's type (itself and every type above it by is-a, the
 *     caller expands it) is in `a:kindForVault`. With the vault's type unknown (`null`) NO relation kind is offered: a tie is ⛔ never guessed to fit;
 *   - an entry of the holder's OWN (no predicate) is a private label, offered by `a:playableBy` alone;
 *   - every other entry is ⛔ not offered: one with no predicate that is not the holder's describes what the party IS (Public authority, Non-profit), not
 *     a tie, and one whose predicate could not be read (`null`) is not turned into a label in its place.
 */
export function relationKindsOffered(entries: readonly KindEntry[], recordTypes: ReadonlySet<string>, vaultTypes: ReadonlySet<string> | null): KindEntry[] {
  return (offeredFor(entries, recordTypes) as KindEntry[]).filter((e) => {
    if (e.kindPredicate) return !!vaultTypes && (e.kindForVault ?? []).some((t) => vaultTypes.has(t));
    return e.kindPredicate === undefined && e.own;
  });
}

/** The record is a PARTY (a type some relation kind may be said of: Person, Organization, as the master's catalogue declares by `a:playableBy`). */
export function isPartyType(entries: readonly KindEntry[], recordTypes: ReadonlySet<string>): boolean {
  return entries.some((e) => !!e.kindPredicate && e.playableBy.some((t) => recordTypes.has(t)));
}

export const relationIdOf = (uri: string): string => uriTail(uri);
