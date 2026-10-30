// Saves a record card's edits as one PATCH against the version it read, and keeps every cache of that record in step.
import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import {
  patchRecord,
  readRecord,
  RecordConflictError,
  writeSource,
  type BaseRecord,
  type RecordFacts,
} from "@kaigilb/gilbplatformcode-lws-records";
import {
  flattenRecordPages,
  RECORD_QUERY_HEAD,
  recordsKey,
  setList,
  setRecordReads,
  upsert,
  withCanonicalLabel,
  type RecordsPage,
} from "@kaigilb/gilbplatformcode-record-cache-kit";
import { isPlanRecordType } from "@kaigilb/gilbplatformcode-plan-kinds";
import { isAppAddressableSlug, resolveType } from "@kaigilb/gilbplatformcode-record-types";
import { partySavePatch, type PartySaveRule } from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import { TAG_CARRIER_SLUGS_IN_PRECEDENCE } from "@kaigilb/gilbplatformcode-tag-carrier";
import { rememberRecord } from "@kaigilb/gilbplatformcode-working-set-store";

/**
 * The tag-carrier / tag-qualifier attributes the generic Data-section write must never silently strip, in BOTH spellings
 * (`readRecord` strips one `a:`, so the app usually holds the bare slug, but a record written through the un-defused `attrKey`
 * double-prefix path serves back the COLON-BEARING form, which `editorFacts`' slug regex rejects).
 *
 * `a:unitTag` and `a:ruleId` ARE carriers, verified against the backend constant `TAG_CARRIER_ATTR`, never against prose.
 * `a:tagScope` is NOT a carrier: it is a co-located qualifier that travels with `a:unitTag`. It is guarded here because the
 * requirement names it, not because it is one. Losing `tagScope` loses a field; losing `unitTag` reaches the handle plane.
 */
// ONE declaration of the closed set, in `tag-carrier`, so a DISPLAY can resolve a tag over the same two carriers this write path
// preserves. Not a copy: the same constant, imported.
export const TAG_CARRIER_SLUGS = TAG_CARRIER_SLUGS_IN_PRECEDENCE;
export const TAG_QUALIFIER_SLUGS = ["tagScope"] as const;

/** Both spellings of every guarded attribute: the bare slug and the `a:` form. */
export const CARRIER_PRESERVE_SLUGS: ReadonlySet<string> = new Set(
  [...TAG_CARRIER_SLUGS, ...TAG_QUALIFIER_SLUGS].flatMap((s) => [s, `a:${s}`]),
);

/** Just the CARRIERS, both spellings: the set an in-place rename is refused on. */
export const CARRIER_ONLY_SLUGS: ReadonlySet<string> = new Set(
  TAG_CARRIER_SLUGS.flatMap((s) => [s, `a:${s}`]),
);

/**
 * A refused in-place rename of an assigned tag carrier.
 *
 * Why this REFUSES rather than silently keeping the served value: a silent keep is exactly the drift the canonical-fidelity check
 * measures against, "no silent drift between what is shown and what actually directs the work". The steward must be told.
 *
 * Why a rename and not a clear: the tag-release rule's fourth bound says the mint is not covered, so a modify-only writer that
 * renames a carrier frees the old name and fails to acquire the new one, leaving the entity silently untagged while appearing
 * tagged, with re-acquisition unreachable on a host-routed vault (a tag name is vault-wide). A CLEAR is the lawful release (op=0,
 * the name is freed, the prior binding stays readable as-of an earlier time) and stays permitted. It mirrors the freeze the
 * process panes already apply.
 */
export class CarrierRenameRefusedError extends Error {
  readonly slug: string;
  readonly served: string;
  readonly attempted: string;

  constructor(slug: string, served: string, attempted: string) {
    super(
      `a:${slug.replace(/^a:/, "")} is frozen at assignment and cannot be renamed in place ` +
        `(served "${served}", edited "${attempted}"). Clear the field to release the tag, ` +
        `then set the new one.`,
    );
    this.name = "CarrierRenameRefusedError";
    this.slug = slug;
    this.served = served;
    this.attempted = attempted;
  }
}

/**
 * Save a record's facts as one merge PATCH (optimistic; no spinner). Resolves with the new `{ etag }` on success. A stale or
 * absent-ETag CONFLICT (412 / no precondition) REJECTS with `RecordConflictError` after reconciling the cache to vault truth: the
 * caller catches it to note the reload; a genuine error rejects and the cache rolls back.
 */
export interface UpdateRecordVars {
  record: BaseRecord;
  facts: RecordFacts;
  /**
   * The record is a party record: its name is written under its one home only, a changed name retracts the legacy label in the same
   * write, `withCanonicalLabel` does not run, only changed facts are sent, and the write is conditional on the version read
   * (`If-Match`, where the door honours it). Built by the card, which knows the kind.
   */
  party?: PartySaveRule;
  /** Facts this save neither writes nor retracts, whatever value they hold. */
  keep?: readonly string[];
  /**
   * The card's 412 retry: a party save with nothing left to send (the person's only change was also saved elsewhere) sends NO
   * PATCH at all, and resolves with the ETag read.
   */
  skipEmpty?: boolean;
}

/** The sweep's own rule (see `useUpdateRecord`): which dropped facts a save may retract. */
function sweepMayRetract(k: string, opaque: ReadonlySet<string>): boolean {
  if (/^a?:?(directReader|directWriter|readerGroup|writerGroup)$/.test(k)) return false;
  if (CARRIER_PRESERVE_SLUGS.has(k)) return false;
  if (opaque.has(k)) return false;
  return isAppAddressableSlug(k);
}

/** The facts the cache holds for a record once a save lands: the party body applied, or the old wiring. */
function savedFacts(record: BaseRecord, facts: RecordFacts, party?: PartySaveRule, keep?: readonly string[]): RecordFacts {
  if (party) {
    const opaque = new Set(record.opaqueFacts ?? []);
    const body = partySavePatch(record.facts ?? {}, facts, party, {
      keep: new Set(keep ?? []),
      retractable: (k) => sweepMayRetract(k, opaque),
    });
    return factsAfterPatch(record.facts ?? {}, body);
  }
  // A Plan record's name is its Tag. A copied label would stay on screen after the Tag is cleared.
  if (isPlanRecordType(record.typeUri)) return facts;
  const nameField = resolveType(record.typeUri)?.nameField ?? "title";
  return withCanonicalLabel(facts, nameField);
}

/** The facts a record holds after a merge-patch body (bare slugs; `null` deletes). Pure. */
export function factsAfterPatch(served: RecordFacts, patch: Readonly<Record<string, string | null>>): RecordFacts {
  const out: RecordFacts = { ...served };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

/** The key every card save runs under, so another pane of the card can wait for it. */
export const RECORD_UPDATE_KEY = ["base", "record-update"] as const;

/**
 * How long a retype waits for the card's own save of the same record. A cap of 4 s brought back the false "changed elsewhere" for
 * any save that answered later (5 s measured by the tester, 12 s on a rig), so the cap is 30 s. A save still out after 30 s still
 * gets that notice (no data is lost: the PUT is refused).
 */
export const OWN_SAVE_WAIT_MS = 30_000;

/**
 * Resolves once no card save of record `id` is out (any pane, any vault scope), or after `timeoutMs` (`false`: a save is still out;
 * the caller goes on and its write stays conditional). The cache writes of a save that landed are done by then: a mutation leaves
 * "pending" only after its `onSuccess`/`onError`.
 */
export function recordSavesSettled(qc: QueryClient, id: string, timeoutMs = OWN_SAVE_WAIT_MS): Promise<boolean> {
  const out = () =>
    qc
      .getMutationCache()
      .findAll({ mutationKey: RECORD_UPDATE_KEY, status: "pending" })
      .some((m) => (m.state.variables as UpdateRecordVars | undefined)?.record?.id === id);
  if (!out()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const unsub = qc.getMutationCache().subscribe(() => {
      if (out()) return;
      clearTimeout(timer);
      unsub();
      resolve(true);
    });
    const timer = setTimeout(() => {
      unsub();
      resolve(false);
    }, timeoutMs);
  });
}

/**
 * The record as the card's panes render it now: the viewed vault's list row when it is whole, else the record read (the same choice
 * the card makes). `null` when neither holds its facts.
 */
export function latestCachedRecord(qc: QueryClient, vaultId: string, id: string): BaseRecord | null {
  const row = flattenRecordPages(qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId))).find((r) => r.id === id);
  if (row && (row as { hydrated?: boolean }).hydrated !== false) return row;
  for (const [, d] of qc.getQueriesData<BaseRecord | null>({ queryKey: [...RECORD_QUERY_HEAD, id] })) if (d) return d;
  return null;
}

export function useUpdateRecord(vaultId: string) {
  const qc = useQueryClient();
  return useMutation<
    { etag: string | null },
    Error,
    UpdateRecordVars,
    { previous: BaseRecord | undefined }
  >({
    mutationKey: RECORD_UPDATE_KEY,
    mutationFn: async ({ record, facts, party, keep, skipEmpty }) => {
      // Autosave uses JSON Merge PATCH. A note does not send If-Match: full PUT+ETag raced with our own debounce/onMutate and
      // false-412ed "changed elsewhere". A Plan record does. The create's 201 ETag is on the opened row, and the first Tag save is
      // the same patch; without If-Match that save ignored a newer version.
      // REFUSE an in-place rename of an assigned tag carrier BEFORE building the body. SET (no served value) and CLEAR (release)
      // stay lawful; only served -> different non-empty is refused, which is exactly the freeze predicate the process panes
      // already apply, now standing in this door too.
      const served = record.facts ?? {};
      for (const [k, v] of Object.entries(facts)) {
        if (!CARRIER_ONLY_SLUGS.has(k)) continue;
        const before = (served[k] ?? "").trim();
        const after = (v ?? "").trim();
        if (before !== "" && after !== "" && before !== after) {
          throw new CarrierRenameRefusedError(k, before, after);
        }
      }
      const keepSet = new Set(keep ?? []);
      if (party) {
        // A party record's save. See `partySavePatch` and `UpdateRecordVars.party`.
        const opaqueP = new Set(record.opaqueFacts ?? []);
        const body = partySavePatch(record.facts ?? {}, facts, party, {
          keep: keepSet,
          retractable: (k) => sweepMayRetract(k, opaqueP),
        });
        if (skipEmpty && Object.keys(body).length === 0) return { etag: record.etag ?? null };
        const { etag } = await patchRecord(record.id, body, record.entityUri ?? null, writeSource(record)[0], {
          ifMatch: record.etag ?? null,
        });
        await rememberRecord({ id: record.id, vaultId, typeUri: record.typeUri, updatedAt: Date.now() });
        return { etag };
      }
      // Cross-app master display name: dual-write a:label (the entity.displayName registry).
      // Not on a Plan record: its name is the Tag, and a copied label would outlive a cleared Tag.
      const nameField = resolveType(record.typeUri)?.nameField ?? "title";
      const wired = isPlanRecordType(record.typeUri) ? facts : withCanonicalLabel(facts, nameField);
      // AN OPAQUE FACT IS PRESERVED BY OMISSION UNLESS A PERSON ACTUALLY EDITED IT.
      //
      // `readRecord` marks the slugs whose served value it could not express as a string (`BaseRecord.opaqueFacts`). Their entry in
      // `record.facts` is a STAND-IN, usually `""`, sometimes a lossy `", "` join. Both roads end here: `"" -> null` retracts the
      // fact, and re-asserting the join overwrites a structure with a fragment of itself.
      //
      // The test is NOT "is it empty" but "is it UNCHANGED from the stand-in the editor was handed". Unchanged means nobody touched
      // it, so say nothing about it, and LWS read-modify-write keeps it (the same preserve-by-omission mechanism the foreign-predicate
      // arm uses in the sweep below). Changed means a person typed into that field and their intent is honoured.
      //
      // This is why the guard is here and not in `factToString`: the coercion is right for the editor and wrong only as EVIDENCE OF
      // ABSENCE, which is a claim only this door makes.
      const opaque = new Set(record.opaqueFacts ?? []);
      const servedFacts = record.facts ?? {};
      const patch: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(wired)) {
        if (keepSet.has(k)) continue;
        if (opaque.has(k) && v === (servedFacts[k] ?? "")) continue;
        patch[k] = v === "" ? null : v;
      }
      // Do NOT null authz grant attrs (directReader/directWriter/…): the framed GET may include them after a share, but the editor
      // facts map does not. Nulling would revoke the share on the next body edit. LWS RMW keeps unmentioned attrs; only editor fields
      // change.
      const AUTH_Z_SLUGS = new Set([
        "directReader",
        "directWriter",
        "readerGroup",
        "writerGroup",
        "a:directReader",
        "a:directWriter",
        "a:readerGroup",
        "a:writerGroup",
      ]);
      // And do NOT null the tag carrier / its scope qualifier. Same rationale as the authz exemption directly above: LWS RMW keeps
      // unmentioned attrs, so omitting them preserves them. This is the arm that covers the COLON-BEARING served key (`a:unitTag`
      // after one strip of a double-prefixed write), which `editorFacts`' slug regex rejects and which is therefore reachable ONLY by
      // this sweep. It does NOT fix the `attrKey` double-prefix defect; that residual is still open.
      // THE RETRACTION SWEEP RETRACTS ONLY WHAT THE EDITOR COULD HAVE SHOWN.
      //
      // The sweep's job is right and stays: a merge PATCH keeps unmentioned attributes, so a fact the editor HELD and the save DROPPED
      // has to go on the wire as an explicit null or it survives as stale vault data. What was wrong was its REACH: `k in facts`
      // cannot tell "the editor dropped it" from "the editor never admitted it", and the second set is exactly the facts ANOTHER APP
      // wrote: `isAppAddressableSlug` is the same test `editorFacts` admits on, so a key it rejects was never editable here and is not
      // this app's to retract. Preserved by OMISSION (LWS RMW), never by re-asserting a value we cannot read. (The cross-app pickup
      // rule, verb three.)
      for (const k of Object.keys(record.facts ?? {})) {
        if (k in facts) continue;
        if (keepSet.has(k)) continue;
        if (AUTH_Z_SLUGS.has(k)) continue;
        if (CARRIER_PRESERVE_SLUGS.has(k)) continue;
        // The sweep's own rule, applied to the second population that satisfies it. It retracts only what the editor COULD HAVE
        // SHOWN; an opaque fact was never shown (its stand-in is `""`, which `extraKeysFromFacts` filters out of the field list), so
        // its absence from `facts` is not a person dropping it. Same reason as the `isAppAddressableSlug` arm below: not-understood
        // is not the same as not-there.
        if (opaque.has(k)) continue;
        if (!isAppAddressableSlug(k)) continue;
        patch[k] = null;
      }
      // Hand the write WHERE THESE SLUGS CAME FROM. This is the generic editor's save, and it is the path a geometry attribute
      // reached production on: the vault serves it under its bare slug, `readRecord` strips to it, and the mint used to re-prefix it
      // into a key that names no term (a measured 409, with the true spelling a 201 in the same run). It also fixes the RETRACTION
      // sweep above: clearing such a field used to null a key that does not exist, leaving the real fact standing.
      const src = writeSource(record);
      const { etag } = isPlanRecordType(record.typeUri)
        ? await patchRecord(record.id, patch, record.entityUri ?? null, src[0], { ifMatch: record.etag ?? null })
        : await patchRecord(record.id, patch, record.entityUri ?? null, ...src);
      await rememberRecord({ id: record.id, vaultId, typeUri: record.typeUri, updatedAt: Date.now() });
      return { etag };
    },
    onMutate: ({ record, facts, party, keep }) => {
      const list = flattenRecordPages(qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId)));
      const previous = list.find((r) => r.id === record.id);
      const wired = savedFacts(record, facts, party, keep);
      // Keep the pre-save ETag on the optimistic row: do not invent null. The detail pane must not adopt a worse ETag mid-edit
      // (false 412 "changed elsewhere").
      setList(qc, vaultId, (l) => upsert(l, { ...record, facts: wired, etag: record.etag }));
      return { previous };
    },
    onSuccess: ({ etag }, { record, facts, party, keep }) => {
      const wired = savedFacts(record, facts, party, keep);
      setList(qc, vaultId, (l) =>
        l.map((r) => (r.id === record.id ? { ...r, facts: wired, etag } : r)),
      );
      // And the record read the card's other pane renders from.
      setRecordReads(qc, record.id, (r) => ({ ...r, facts: wired, etag }));
    },
    onError: async (err, { record }, ctx) => {
      if (err instanceof RecordConflictError) {
        // Someone advanced the record: pull vault truth back into the cache (reconcile).
        const fresh = await readRecord(record.id, record.entityUri ?? null);
        if (fresh) {
          setList(qc, vaultId, (l) => upsert(l, fresh));
          setRecordReads(qc, record.id, () => fresh);
        }
        return;
      }
      if (ctx?.previous) setList(qc, vaultId, (l) => upsert(l, ctx.previous!));
    },
  });
}
