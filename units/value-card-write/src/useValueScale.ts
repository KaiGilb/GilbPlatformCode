// A Value's Scale as a record. The Scale is ONE t:Scale record, a:partOf the Value, tag `<ValueTag>.Scale`, with
// a:description (the Scale sentence), a:unit, a:rate, a:scaleContext and a:scaleDirection. The Value points at it: a:hasScale = {"@id": record}.
// It is made, found and rolled back the way the levels, qualifiers and meters are (valueChildRecords.ts). An older Scale (inline a:hasScale,
// or a:valueScale) is read as it is; its next edit is ONE group: the Scale record is made, then the Value is patched to point at it;
// if the Value patch fails, the new record is ended again.

import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { rowServedFact } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { isResourceType } from "@kaigilb/gilbplatformcode-plan-kinds";
import { recordTag } from "@kaigilb/gilbplatformcode-plan-links-model";
import {
  isPartOfParent,
  isScaleType,
  readScaleRecord,
  readValueCard,
  scaleCreateFacts,
  scaleFacts,
  scalePatch,
  scaleRefOf,
  scaleRowOf,
  scaleTag,
  SCALE_TYPE,
  VALUE_SLUG_LIST,
  type ValueScale,
} from "@kaigilb/gilbplatformcode-value-card-model";
import { useValueWriteHost } from "./host";
import { planFindRows } from "./planFind";
import { createChild, endMade, endRow, httpStatus, patchChild, rowLabel, type ChildEnv, type ChildKind } from "./valueChildRecords";

const updatedOf = (r: BaseRecord) => (r as { updatedAt?: number }).updatedAt ?? 0;

const scaleKind = (valueTag: string, resource: boolean): ChildKind<ValueScale> => ({
  noun: "Scale",
  typeName: () => SCALE_TYPE,
  isType: isScaleType,
  tag: () => scaleTag(valueTag),
  createFacts: (s, tag, parentUri, order) => scaleCreateFacts(s, tag, parentUri, order, resource),
  patch: (row, s) => scalePatch(row, s, resource),
});

/** The Value's members the card reads, as served. */
function valueFactsOf(row: BaseRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const slug of VALUE_SLUG_LIST) out[slug] = rowServedFact(row, slug);
  return out;
}

export interface ValueScaleHost {
  /**
   * Save the Scale. Resolves when written; throws a sentence when it could not be (the caller shows it and puts the card back).
   * `linkValue(uri)` patches the Value (a:hasScale -> {"@id": uri}, or null to clear) and says whether it landed.
   */
  save: (scale: ValueScale, linkValue: (uri: string | null) => Promise<boolean>, sentenceOf?: (e: unknown) => string | null) => Promise<void>;
}

export function useValueScale(args: {
  enabled: boolean;
  record: BaseRecord;
  vaultId: string;
  planVault: string;
  onNotice: (notice: string | null) => void;
  onTouched?: () => void;
}): ValueScaleHost {
  const { record, vaultId, planVault } = args;
  const host = useValueWriteHost();
  const del = host.useDeleteRecord(vaultId);

  async function save(scale: ValueScale, linkValue: (uri: string | null) => Promise<boolean>, sentenceOf?: (e: unknown) => string | null): Promise<void> {
    const env: ChildEnv = { host, planVault, del, recs: new Map(), touched: () => args.onTouched?.(), notice: (t) => args.onNotice(t) };
    const uri = record.entityUri;
    if (!uri) throw new Error("This Value has no address yet, so its Scale cannot be saved.");
    const parent = { id: record.id, uri };
    const rows = planFindRows(host.cachedPlanFind(planVault, "a:partOf", record.id));
    const resource = isResourceType(record.typeUri);
    const kind = scaleKind(recordTag(record.facts), resource);
    const existing = scaleRowOf(valueFactsOf(record), rows, uri);
    if (existing) {
      await patchChild(env, kind, parent, existing.id, scale);
      return;
    }
    // A reference with no record among the rows. Read it: a Scale record of this Value that the find did not show (a capped or
    // stale find) is the Scale; a record that is gone (404), or is not a Scale of this Value, is a dangling reference, which this
    // edit repairs (a new Scale record, relinked in the same group). A read that fails says so and writes nothing.
    const ref = scaleRefOf(valueFactsOf(record));
    if (ref) {
      let there: BaseRecord | null;
      try {
        there = await host.readRecord(ref.split(/[/?#]/).filter(Boolean).pop() ?? ref, ref);
      } catch {
        throw new Error("The Scale could not be read, so your change was not saved. Reload and try again.");
      }
      if (there && isScaleType(there.typeUri) && isPartOfParent(there, uri)) {
        env.recs.set(there.id, there);
        await patchChild(env, kind, parent, there.id, scale);
        return;
      }
    }
    // Nothing changed in an older Scale (it was only re-typed to the same words): nothing to write.
    const was = readValueCard(valueFactsOf(record), null, resource).scale;
    if (JSON.stringify(scaleFacts(scale, resource)) === JSON.stringify(scaleFacts(was, resource))) return;
    if (!scaleFacts(scale, resource)) {
      // Cleared: the older Scale is dropped from the Value; there is no record to make.
      if (!(await linkValue(null))) throw new Error("Couldn't save the Scale. Nothing was changed.");
      return;
    }
    // Scale records of this Value that the Value does not point at (a rollback that could not remove its record). The newest is
    // adopted (changed to this Scale, then linked); the others are ended in the same group. No second record is made.
    const orphans = rows
      .filter((r) => isScaleType(r.typeUri) && isPartOfParent(r, uri) && !!r.entityUri)
      .slice()
      .sort((a, b) => updatedOf(b) - updatedOf(a) || b.id.localeCompare(a.id));
    if (orphans.length) {
      const [keep, ...extra] = orphans as [BaseRecord, ...BaseRecord[]];
      const prev = readScaleRecord(keep);
      env.recs.set(keep.id, keep);
      await patchChild(env, kind, parent, keep.id, scale);
      let landed = false;
      let why = "Couldn't save the Scale.";
      try {
        landed = await linkValue(keep.entityUri!);
      } catch (e) {
        why = sentenceOf?.(e) ?? (e instanceof Error && e.message ? e.message : why);
      }
      if (!landed) {
        const back = await patchChild(env, kind, parent, keep.id, prev).then(() => true, () => false);
        throw new Error(back ? `${why} Nothing was changed; the Scale is back as it was.` : `${why} The Scale record ${rowLabel(keep)} was changed and could not be put back.`);
      }
      const stuck: string[] = [];
      for (const x of extra) await endRow(env, record.id, x).catch(() => stuck.push(rowLabel(x)));
      if (stuck.length) env.notice?.(`The Scale was saved. These older Scale records could not be removed: ${stuck.join(", ")}. Remove them by hand.`);
      return;
    }
    const made = await createChild(env, kind, parent, "scale:new", scale);
    const back = async (why: string): Promise<never> => {
      const gone = await endMade(env, record.id, made);
      throw new Error(
        gone
          ? `${why} Nothing was changed; the Scale is back as it was.`
          : `${why} The new Scale record ${rowLabel(made)} could not be removed; the Value still has its old Scale. Remove ${rowLabel(made)} by hand.`,
      );
    };
    if (!made.entityUri) return back("Couldn't save the Scale: its record has no address.");
    let landed = false;
    let why = "Couldn't save the Scale.";
    let lost = false;
    try {
      landed = await linkValue(made.entityUri);
    } catch (e) {
      why = sentenceOf?.(e) ?? (e instanceof Error && e.message ? e.message : why);
      // An answer with no status (the network dropped, a timeout) does not say whether the Value was patched.
      lost = httpStatus(e) === undefined && !host.isConflict(e) && !host.isForbidden(e);
    }
    if (landed) return;
    if (lost) {
      // Read the Value again. If a:hasScale already points at the new record, keep it: the save landed.
      let now: BaseRecord | null | "unread" = "unread";
      try {
        now = await host.reconcileAfterConflict(planVault, record);
      } catch {
        now = "unread";
      }
      if (now && now !== "unread") {
        const pointed = scaleRefOf(valueFactsOf(now));
        const tail = (u: string) => u.split(/[/?#]/).filter(Boolean).pop() ?? "";
        if (pointed && (pointed === made.entityUri || tail(pointed) === made.id)) return;
        // Not linked: the new record is ended, as for any failed link.
      } else {
        // The Value could not be read, so it is not known whether it points at the record: the record is kept.
        throw new Error(`${why} It could not be checked whether the Scale was saved; reload to see. The Scale record ${rowLabel(made)} was kept.`);
      }
    }
    await back(why);
  }

  return { save };
}
