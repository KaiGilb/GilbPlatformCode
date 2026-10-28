// Entity-level share — POST /base/authz/grant-direct | grant-write-direct.
// Owner-gated at Base. Recipient authorizes via a:directReader / a:directWriter.
// Cycle056: reachable-vaults includes host vaults of entity grants (Base D3).
//
// ── Multi-vault / apex FIX (2026-07-27) ─────────────────────────────────────────────
// Entity URI MUST be the real vault-stamped URI (`https://home.example.test/base/e/<id>`),
// never `https://platform.example.test/base/e/<id>` from baseOrigin. Wrong host → resolveEntityVaultId
// falls back to the default/kaizen vault → 403 "does not own the target vault" for the true
// creator. Facts MUST be a:-prefixed on the wire for full-state ingest.

import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { NotSignedInError, bearerHeaderFor, dpopWriteAuth, invalidateDpop, tokenManager } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import {
  RecordForbiddenError,
  factsAsServed,
  patchRecord,
  readRecord,
  storedSpellings,
  writeSource,
  type BaseRecord,
  type MergePatchValue,
  type RecordFactValue,
  type WriteSource,
} from "@kaigilb/gilbplatformcode-lws-records";
import { listVaultRecordsPage } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { parseGrantPrincipals, type DirectShareEntry } from "@kaigilb/gilbplatformcode-direct-shares";
import { shareRefusalMessage } from "@kaigilb/gilbplatformcode-share-refusal";
import { publicGrantee } from "./publicAccess";

export type ShareMode = "read" | "write";

// ── C209 — "the share list changed" signal ─────────────────────────────────────────────────────
// The Share panel and the Access panel are siblings; before this a share (or a Make public) left the
// Access panel's "Shared with" list stale until a reload, so a public switch would have looked like
// it did nothing. One tiny in-module signal, keyed by record id — ⛔ no global store, no event bus.
type ShareListener = (recordId: string) => void;
const shareListeners = new Set<ShareListener>();

/** Subscribe to share-list changes; returns the unsubscribe function. */
export function onEntityShareChanged(listener: ShareListener): () => void {
  shareListeners.add(listener);
  return () => shareListeners.delete(listener);
}

function emitEntityShareChanged(recordId: string): void {
  for (const l of shareListeners) l(recordId);
}

/**
 * 🔴 Cycle161 `F7` — THE GRANT IS ASKED OF THE VAULT THAT HOLDS THE ITEM, ⛔ a fixed apex.
 *
 * These two were module-level constants — `${baseOrigin}/base/authz/grant-direct` and its
 * write twin — and on production `baseOrigin` is the APEX, which the tunnel routes to ONE
 * process bound to ONE store:
 *
 *     cloudflared names the system hosts  -> :8787 -> db `base`
 *     …then an INVERTED CATCH-ALL sends every other vault host -> :8789 -> db `base_vaults`
 *
 * (the C3 store-topology measurement of 2026-09-04, cited verbatim in
 * `crossVaultSearchNodeRouting.c161c3.test.tsx`; `F7` re-derived only that the apex IS the home
 * node — `GET https://platform.example.test/base/e/<id>` answers `No resource at https://id.example.test/base/e/<id>`.)
 *
 * MEASURED AT THE WIRE 2026-09-05, a person's single "Share for read" click, Base's Response body
 * verbatim:
 *
 *   Principal https://pelleparafintest.example.test/base does not own the target vault
 *   https://id.example.test/base — grant-direct requires vault ownership (Cycle052 VDS-4; …)
 *
 * ⚠ Read the `<vault>`: it is `defaultVaultId(ownerHost)` — the deployment's HOME vault — ⛔ NOT the
 * vault the `entity` in the very same request names (`https://a-vault.example.test/base/e/…`).
 * Base's `resolveEntityVaultId` (`authz/vault.ts:123–134`) is LENIENT: an entity with no current
 * datoms IN THE STORE IT ASKED folds onto the home vault. Asked in `base` about an entity whose
 * datoms live in `base_vaults`, it missed — and the owner gate then refused a vault nobody named.
 *
 * ⛔ The 403 was therefore NOT the Control-vs-ownership refusal
 * (an earlier diagnosis
 * §3, retracted there): that gate was never asked about `a-vault` at all.
 *
 * ⚠ The SUBJECT read moved to the vault door in `8f20a1d` (the `door` parameter) and `revokeEntityShare`
 * already patches at the vault door — the grant ACT was the ONE member of the share family still
 * pinned to the apex, which is exactly why the commit subject *"ask the VAULT, not the apex:
 * file download + per-item share/revoke"* read as done while this half was not.
 *
 * The door is derived from the `entity` the request itself names, so the two can never drift:
 * a grant is asked of the vault whose URI it is writing into. `vaultOriginOf` returns `baseOrigin`
 * verbatim for a same-host or id-only entity, so single-host dev is byte-unchanged.
 *
 * @param entityUri the vault-stamped entity URI the grant names ({@link entityUriForShare})
 * @param mode read → `grant-direct`; write → `grant-write-direct`
 * @returns that entity's own vault origin + the authz path
 */
export function grantDirectUrl(entityUri: string | null | undefined, mode: ShareMode): string {
  const path = mode === "write" ? "/base/authz/grant-write-direct" : "/base/authz/grant-direct";
  return `${vaultOriginOf(entityUri)}${path}`;
}

/**
 * Canonical entity URI for authz grant-direct.
 * Prefer framed @id; else compose from the viewed vault namespace + opaque id.
 */
export function entityUriForShare(
  rec: BaseRecord,
  vaultNamespace?: string | null,
): string {
  if (rec.entityUri?.startsWith("http")) return rec.entityUri;
  if (rec.id.startsWith("http://") || rec.id.startsWith("https://")) return rec.id;
  if (vaultNamespace) {
    const base = vaultNamespace.replace(/\/$/, "");
    // namespace is https://home.example.test/base → entity https://home.example.test/base/e/<id>
    return `${base}/e/${rec.id}`;
  }
  // Last resort (dev single-host only) — wrong under apex multi-vault.
  return `${baseOrigin()}/base/e/${rec.id}`;
}

/**
 * Bare editor facts → wire facts for full-state ingest (skip blanks).
 *
 * 🔴 Cycle161 `S33` — THIS IS A THIRD SHIPPED WRITE PATH and it re-minted like the other two.
 * `grantDirect` re-asserts a record's WHOLE fact set alongside the grant, off a fresh
 * {@link readRecord}, so a vault fact served as `c_geometry` left here as `a:c_geometry` — the
 * same manufacture the records and ontology planes made, on a path neither enumeration covered.
 * It now asks the vault's own `@context` and the ontology master, exactly as they do.
 *
 * ⚠ The `startsWith("a:")` idempotence guard is KEPT and is not redundant with the inversion:
 * a served key that survived a historic double-prefix reaches here already carrying its `a:`,
 * and {@link storedSpellingFor}'s CURIE arm would pass it verbatim anyway. Belt and braces on a
 * full-state write that can retract.
 */
async function toWireFacts(
  facts: Record<string, RecordFactValue>,
  source?: WriteSource,
  /** GAPP214.42 (N1) — slugs whose served `""` is carried, ⛔ not dropped as unset. */
  keepEmpty?: ReadonlySet<string>,
): Promise<Record<string, RecordFactValue>> {
  const spell = await storedSpellings(Object.keys(facts), source);
  const out: Record<string, RecordFactValue> = {};
  for (const [slug, value] of Object.entries(facts)) {
    if (value == null) continue;
    if (value === "" && !keepEmpty?.has(slug)) continue;
    // 🔴 C161 `D` — `null` ⇒ the VAULT declared this a bucket it ASSEMBLES at read time and its own
    // log holds nothing under it; it names no stored fact, so it is OMITTED. ⚠ Load-bearing on
    // THIS path in particular: `grantDirect` re-asserts a record's WHOLE fact set alongside the
    // grant, so one refused key would take the GRANT down with it.
    //
    // ⚠ THE `a:` GUARD RUNS FIRST, AND `D` r4 PUT IT BACK THERE AFTER MOVING IT ON A FALSE
    // PREMISE. `r3` reordered this to call `spell` first, on a QA finding that a double-prefixed
    // bucket could short-circuit the omission. Re-measured at the next round: `readRecord` strips
    // exactly one `a:`, so the slug reaching here is `a:functions`, `spell` returns NON-null for
    // it (the `@context` declares `functions`, ⛔ not the mint), and the CURIE arm passes it
    // verbatim either way. The two orders produce a BYTE-IDENTICAL wire body and reverting the
    // hunk leaves the whole suite green. ⇒ the reorder fixed nothing and is excised rather than
    // left standing as a change nobody can justify
    // ([[Rule_Write_prose-edit-convergence#RuleProsedExciseNotReweld]]).
    const key = slug.startsWith("a:") ? slug : spell(slug);
    if (key === null) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Share one record with a principal (read and/or write via direct grants).
 * @param vaultNamespace viewed vault's vaultId namespace — required for correct multi-vault entity URI
 */
export async function shareEntity(
  recordId: string,
  granteePrincipal: string,
  mode: ShareMode,
  vaultNamespace: string | null | undefined,
  /**
   * 🔴 C161 — THE DOOR, and it is REQUIRED. Use `recordDoor(entityUri, vaultId)`.
   *
   * This parameter existed from C144 as `entityUriHint?`, and being OPTIONAL is precisely why
   * it was dead: `git grep entityUriHint` at `6c6e9dd` returned exactly two lines — its own
   * declaration and its own use — so ⛔ ZERO callers ever supplied it, and every per-item share
   * in the shipped app read the subject at `vaultOriginOf(null)` = `baseOrigin` = the apex.
   * Since Base `326160b` the server answers only about the vault a request NAMES
   * (`3P.C.EveryEntityInNamedVault.Base`, VKT-AbsentHostHeaderDisposition WINNER A2), so the apex
   * returns the non-disclosure 404 and `readRecord` maps it to `null` — surfacing as
   * "Record not found or not readable."
   *
   * Making it required moves the guarantee from a comment to `tsc`: a caller must now either
   * supply the address or write `null` where a reader can grep it.
   * ⛔ Do NOT restore a server-side cross-host scan — that would overturn the owner's constraint.
   */
  door: string | null,
  /** C210 — a caller that has JUST read this record passes it, so it is not read twice. */
  opts?: { rec?: BaseRecord | null },
): Promise<{ granted: boolean; mode: ShareMode }> {
  const rec = opts?.rec ?? (await readRecord(recordId, door));
  if (!rec) throw new Error("Record not found or not readable.");
  // Write: single grant-write-direct (server plants a:directReader + a:directWriter).
  // Do NOT grant-direct then grant-write — second full-state PUT was retracting directReader.
  if (mode === "write") {
    await grantDirect(rec, granteePrincipal, "write", vaultNamespace);
  } else {
    await grantDirect(rec, granteePrincipal, "read", vaultNamespace);
  }
  emitEntityShareChanged(recordId);
  return { granted: true, mode };
}

/**
 * Direct shares visible on THIS entity frame — not the full vault/group resolver.
 * Safe to list: these are datoms the owner already put on the record.
 */
export function listDirectShares(facts: Record<string, string> | undefined | null): DirectShareEntry[] {
  if (!facts) return [];
  const readers = new Set(
    parseGrantPrincipals(facts.directReader ?? facts["a:directReader"]),
  );
  const writers = new Set(
    parseGrantPrincipals(facts.directWriter ?? facts["a:directWriter"]),
  );
  const all = new Set<string>([...readers, ...writers]);
  const out: DirectShareEntry[] = [];
  for (const principal of all) {
    const modes: Array<"read" | "write"> = [];
    // Write share plants both attrs; show Write (and Read is implied for UI copy).
    if (writers.has(principal)) {
      modes.push("read", "write");
    } else if (readers.has(principal)) {
      modes.push("read");
    }
    if (modes.length) out.push({ principal, modes });
  }
  // Stable order by principal string
  out.sort((a, b) => a.principal.localeCompare(b.principal));
  return out;
}

function samePrincipal(a: string, b: string): boolean {
  const na = a.trim().toLowerCase().replace(/\/$/, "");
  const nb = b.trim().toLowerCase().replace(/\/$/, "");
  return na === nb;
}

/** Bare type name for F-LIVE `?type=` — never `t:` and never a URI. */
function typeBareOf(typeUri: string): string {
  const fromPath = typeUri.match(/\/base\/t\/([^/#?]+)/i);
  if (fromPath?.[1]) return decodeURIComponent(fromPath[1]);
  return typeUri.replace(/^t:/, "").trim();
}

/** Named vault for F-LIVE: the viewed vault namespace, else the framed `@id` host. */
function namedVaultOf(
  vaultNamespace: string | null | undefined,
  entityUri: string | null | undefined,
): string | null {
  if (vaultNamespace && vaultNamespace.trim()) return vaultNamespace.replace(/\/$/, "");
  if (entityUri) {
    const m = entityUri.match(/^(https?:\/\/[^/]+\/base)\/e\//i);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** W-FIELD value for a grant predicate: retract, one edge, or remaining edges.
 *
 * 🔴 Cycle161 `D-F3d` SERVE BLOCKER — THE SHAPE HERE IS AN AGREEMENT WITH BASE, ⛔ NOT A
 * PREFERENCE. Until Base `e8dfada` this function emitted `{"@id": p}` (and an ARRAY of those
 * for 2+), and Base's grantee decider matches that shape NOWHERE. It was harmless only
 * because it was UNREACHABLE: at Base `28f8995c` `a:directReader` was single-valued, so a
 * revoke always took the `length === 0` retraction arm. `e8dfada` makes a 2+ reader set
 * reachable, which makes these two arms reachable — and MEASURED on my own rig at `e8dfada`
 * through the shipped `PATCH /lws/r/:id`, the old shape made revoking ONE reader remove
 * EVERY reader (including the item's own holder), answering `200` with a success body and
 * passing this module's own read-back check — because {@link parseGrantPrincipals} reads
 * `{"@id"}` back perfectly well. Only BASE cannot. That is why no client-side test could
 * ever have seen it.
 *
 * 🔴 THE SHAPE BASE ACTUALLY MATCHES, from `src/authz/direct-grantee.ts::encodeDirectGrantees`
 * at Base `e8dfada`: ONE grantee is a BARE PRINCIPAL STRING (⛔ never a one-member array —
 * that keeps the value hash byte-identical to every grant written before the repair, which is
 * what makes it need no migration), two or more is a JSON ARRAY OF BARE STRINGS.
 * `directGranteeMatches` tests exactly those two:
 * `jsonb_typeof(dv.value) = 'string' AND dv.value #>> '{}' = <requester>`, OR
 * `jsonb_typeof(dv.value) = 'array' AND jsonb_exists(dv.value, <requester>)`. An object
 * member satisfies neither, and `decodeDirectGrantees` drops a non-string member on the
 * floor — deliberately, so a merge cannot preserve a principal the predicate cannot admit.
 *
 * ⚠ The read-back needed NO change: `records.ts::factToString` joins an array with `", "` and
 * {@link parseGrantPrincipals} splits on the same separator, so a bare string and an array of
 * bare strings both round-trip here exactly as the old shape did.
 */
function grantFieldValue(principals: string[]): MergePatchValue {
  if (principals.length === 0) return null;
  if (principals.length === 1) return principals[0];
  return [...principals];
}

/**
 * Revoke a principal's direct entity grants (read and/or write).
 * W-FIELD on `a:directReader` / `a:directWriter` — one predicate per PATCH.
 * ⛔ Not whole-record replace from a rendered read
 * ([[Rule_Code_base-record-io#RuleBaseioNoReadReplaceRoundTrip]]).
 * ⛔ Not B-REV — that ends a vault-to-vault edge, not these grant facts
 * ([[Lookup_Code_gilb-value-io-write#W-FIELD]] winner binding; the 403 fallback to revoke-direct is not yet a Lookup row — [[FINDING-2026-09-26-GrantRevokeFallbackIsNotALookupRow-GilbApp]]).
 * Pair: F-OPEN grant re-read of the same id, then F-LIVE of the type on the named vault.
 */
export async function revokeEntityShare(
  recordId: string,
  principal: string,
  vaultNamespace: string | null | undefined,
  /** 🔴 C161 — required door. This read was HARD-CODED `null` (`R(e,null)` in the shipped
   *  bundle), so revoke — right 3 of the owner's rights checklist — was already broken by the
   *  same omission as the share, and would have failed with the identical
   *  "Record not found or not readable." the first time it was walked. */
  door: string | null,
  /** C210 — `rec`: the record the caller just read (not read again).
   *  `skipListRefresh`: a BULK caller (a folder tree) skips the per-item vault-list read that pairs
   *  a single revoke; the verifying re-read of THIS record still runs. */
  opts?: { rec?: BaseRecord | null; skipListRefresh?: boolean },
): Promise<void> {
  const rec = opts?.rec ?? (await readRecord(recordId, door));
  if (!rec) throw new Error("Record not found or not readable.");
  const target = principal.trim();
  if (!target) throw new Error("No principal to revoke.");

  const readersBefore = parseGrantPrincipals(
    rec.facts.directReader ?? rec.facts["a:directReader"],
  );
  const writersBefore = parseGrantPrincipals(
    rec.facts.directWriter ?? rec.facts["a:directWriter"],
  );
  const readers = readersBefore.filter((p) => !samePrincipal(p, target));
  const writers = writersBefore.filter((p) => !samePrincipal(p, target));
  const readerChanged = readers.length !== readersBefore.length;
  const writerChanged = writers.length !== writersBefore.length;

  const at = rec.entityUri ?? null;

  // One key per PATCH. Writers first so a write-share (both attrs) is two
  // W-FIELD acts, ⛔ not a two-key merge-patch and ⛔ not a full PUT.
  //
  // 🔴 C209  — W-FIELD needs a DATA write-grant on the item. A vault holder
  // who is not a deployment owner, and every Control holder, can PLACE a share (the per-item share
  // route admits them) but that PATCH refuses them 403 — so what they made public they could not make private.
  // W-FIELD stays the act (the Cycle165 ruling this file cites); ONLY on that refusal is the grant
  // taken back through `revoke-direct`, which GilbPlatform gates exactly as it gates the share.
  // ⚠ The Lookup row for this act names W-FIELD alone — the fallback is flagged for the standard's
  // owner rather than written into it from here.
  try {
    if (writerChanged) {
      await patchRecord(recordId, { directWriter: grantFieldValue(writers) }, at);
    }
    if (readerChanged) {
      await patchRecord(recordId, { directReader: grantFieldValue(readers) }, at);
    }
  } catch (e) {
    if (!(e instanceof RecordForbiddenError)) throw e;
    await revokeDirect(entityUriForShare(rec, vaultNamespace), target);
  }

  const again = await readRecord(recordId, at);
  const still = listDirectShares(again?.facts);
  if (still.some((e) => samePrincipal(e.principal, target))) {
    throw new Error(`grant W-FIELD did not revoke ${target}`);
  }
  emitEntityShareChanged(recordId);
  if (opts?.skipListRefresh) return;
  const vaultId = namedVaultOf(vaultNamespace, rec.entityUri ?? again?.entityUri ?? null);
  const typeBare = typeBareOf(rec.typeUri);
  if (vaultId && typeBare) {
    await listVaultRecordsPage(vaultId, [typeBare], 0);
  }
}

/** GilbPlatform `POST /base/authz/revoke-direct` — asked of the vault that holds the item (the same
 *  door rule as {@link grantDirectUrl}). */
export function revokeDirectUrl(entityUri: string | null | undefined): string {
  return `${vaultOriginOf(entityUri)}/base/authz/revoke-direct`;
}

/**
 * C210 — PUBLIC read on ONE folder LINK: a `t:PartOf` relation entity, addressed by its OWN
 * vault-issued URI (as the vault served it in `/relations` — never recomposed from a tail).
 *
 * Why a link needs its own grant: GilbPlatform checks every id on its own grants, a relation included
 * (measured M1 2026-09-26: a public folder, 0 of 5 links readable anonymously, so nobody could follow
 * one). `facts: {}` is deliberate — since GilbPlatform `6fddfb8` a grant on a relation writes the
 * relation's STORED type and facts for every authority, so the body can neither drop nor repoint
 * the link's ends. Against a platform older than that, this body would erase the link: the app
 * must not ship ahead of the platform (Cycle210 promotion order).
 */
export async function grantPublicOnRelation(relationUri: string): Promise<void> {
  await postAuthzAct(grantDirectUrl(relationUri, "read"), {
    entity: relationUri,
    principal: publicGrantee(),
    type: "t:PartOf",
    facts: {},
  });
}

/** C210 — take PUBLIC off ONE folder link (the stored-facts revoke; see {@link grantPublicOnRelation}). */
export async function revokePublicOnRelation(relationUri: string): Promise<void> {
  await revokeDirect(relationUri, publicGrantee());
}

/** C209 — take ONE principal off ONE item's direct read + write grants, holder-or-Control gated. */
async function revokeDirect(entity: string, principal: string): Promise<void> {
  await postAuthzAct(revokeDirectUrl(entity), { entity, principal }, "refused this change");
}

/**
 * The ONE authenticated POST to a per-item authz route: DPoP, falling back to the
 * Bearer; a 401 drops both credentials and signs the person out; any other refusal shows
 * GilbPlatform's own sentence ({@link shareRefusalMessage}).
 */
async function postAuthzAct(url: string, body: unknown, refusedVerb = "refused this share"): Promise<void> {
  let headers: Record<string, string>;
  try {
    headers = {
      ...(await dpopWriteAuth("POST", url)),
      "content-type": "application/json",
      accept: "application/json",
    };
  } catch {
    headers = {
      ...(await bearerHeaderFor(url, "POST")),
      "content-type": "application/json",
      accept: "application/json",
    };
  }
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (res.status === 401) {
    invalidateDpop();
    tokenManager.invalidate();
    throw new NotSignedInError();
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(shareRefusalMessage(res.status, detail).replace("refused this share", refusedVerb));
  }
}

async function grantDirect(
  rec: BaseRecord,
  principal: string,
  mode: ShareMode,
  vaultNamespace?: string | null,
): Promise<void> {
  const entity = entityUriForShare(rec, vaultNamespace);
  // 🔴 C161 `F7` — the door comes from the ENTITY this very request names. See {@link grantDirectUrl}.
  const url = grantDirectUrl(entity, mode);
  // 🔴 GAPP214.42 (N1, QA's "Share this item" sibling) — the grant act writes these facts as
  // the item's whole state for a holder, so they go back AS SERVED (`factsAsServed`): from
  // `rec.facts` a link was stored as text and a fact with no string form was dropped. A record with
  // served document read at its current ETag (a fixture, a cache row saved since) sends its facts as before.
  const served = rec.served && rec.served.etag === rec.etag ? await factsAsServed(rec.served, rec.entityUri ?? null) : null;
  const facts = served
    ? await toWireFacts(served.facts, writeSource(rec)[0], served.keepEmpty)
    : await toWireFacts(rec.facts, ...writeSource(rec));
  const body = {
    entity,
    principal: principal.trim(),
    type: rec.typeUri,
    facts,
    agent:
      (await tokenManager.getSession().catch(() => null))?.principal ??
      `${baseOrigin()}/base/e/agent-baseapp-share`,
  };
  await postAuthzAct(url, body);
}
