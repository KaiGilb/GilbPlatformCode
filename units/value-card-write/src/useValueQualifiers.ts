// A Value's Scale variables as records. A variable (e.g. [Country]) is a t:ScaleQualifier record, a:partOf the Value,
// facts a:name, a:definition, a:qualifierOptions (the option NAMES, one string each), a:defaultOption, a:lineSources, tag `<ValueTag>.Q.<Name>`.
// An option that has a definition is its own t:ScaleQualifierDefinition record, a:partOf its variable (a:name, a:definition).
// Older variables (typed t:ScaleQualifierDefinition, a part of the Value, options as objects) are read as they are; the next edit of one
// replaces it in one group (migrateChild). Every write goes through valueChildRecords.ts (createChild, patchChild, endRow, endMade).

import { useMemo, useRef } from "react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { rowServedFact } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { recordTag } from "@kaigilb/gilbplatformcode-plan-links-model";
import {
  isLegacyQualifierRow,
  isOptionDefType,
  isPartOfParent,
  isQualifierRowType,
  isQualifierType,
  OPTION_DEF_TYPE,
  optionDefCreateFacts,
  optionDefPatch,
  optionDefRowsOf,
  optionDefTag,
  qualifierCreateFacts,
  qualifierIsBlank,
  qualifierPatch,
  qualifierRowOptionNames,
  qualifierTag,
  QUALIFIER_TYPE,
  readQualifierRecords,
  type ScaleVariable,
} from "@kaigilb/gilbplatformcode-value-card-model";
import { useValueWriteHost } from "./host";
import { planFindRows, type PlanFind } from "./planFind";
import { useChildList, type ChildListHost } from "./useValueChildren";
import { createChild, endMade, endRow, findRowsOf, patchChild, type ChildEnv, type ChildKind, type ParentRef } from "./valueChildRecords";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

type OptionItem = { name: string; definition: string };

const optionKind = (qualifierTagText: string): ChildKind<OptionItem> => ({
  noun: "option definition",
  typeName: () => OPTION_DEF_TYPE,
  isType: isOptionDefType,
  tag: (o) => optionDefTag(qualifierTagText, o.name),
  createFacts: optionDefCreateFacts,
  patch: optionDefPatch,
});

/** The records that are a part of the qualifier `qual`, as the find has them (read first when the find is not here yet). */
async function definitionRows(env: ChildEnv, qual: BaseRecord, opts: { created: boolean; mayHave: boolean }): Promise<BaseRecord[]> {
  if (!opts.created && opts.mayHave && env.host.cachedPlanFind(env.planVault, "a:partOf", qual.id) === undefined) {
    await env.host.fetchPlanFind(env.planVault, "a:partOf", qual.id, qual.entityUri ?? "", { staleTime: 15_000 });
  }
  return optionDefRowsOf(qual, findRowsOf(env, qual.id));
}

/**
 * Make the option-definition records match the variable's options: one for each option that has a definition (made, or its
 * definition changed), none for an option without one or that was removed. Made and changed ones are put back if a later step fails.
 */
async function syncOptionDefinitions(env: ChildEnv, qual: BaseRecord, v: ScaleVariable, opts: { created: boolean }): Promise<void> {
  if (!qual.entityUri) throw new Error("This qualifier has no address yet, so an option definition cannot be saved.");
  const wanted: OptionItem[] = [];
  for (const o of v.options) {
    const name = o.name.trim();
    if (name && o.definition.trim() && !wanted.some((w) => w.name.toLowerCase() === name.toLowerCase())) wanted.push({ name, definition: o.definition.trim() });
  }
  const had = qualifierRowOptionNames(qual).length > 0;
  if (!wanted.length && (opts.created || !had)) return;
  const local: ChildEnv = { ...env, recs: new Map() };
  const parent: ParentRef = { id: qual.id, uri: qual.entityUri };
  const kind = optionKind(recordTag(qual.facts));
  const existing = await definitionRows(local, qual, { created: opts.created, mayHave: had || wanted.length > 0 });
  const nameOf = (r: BaseRecord) => text(rowServedFact(r, "name")).toLowerCase();
  const byName = new Map<string, BaseRecord>();
  const stray: BaseRecord[] = [];
  for (const r of existing) {
    const n = nameOf(r);
    if (n && !byName.has(n) && wanted.some((w) => w.name.toLowerCase() === n)) byName.set(n, r);
    else stray.push(r);
  }
  const made: BaseRecord[] = [];
  const changed: { row: BaseRecord; prev: OptionItem }[] = [];
  try {
    for (const w of wanted) {
      const row = byName.get(w.name.toLowerCase());
      if (!row) {
        made.push(await createChild(local, kind, parent, `opt:${w.name.toLowerCase()}`, w));
        continue;
      }
      const prev: OptionItem = { name: text(rowServedFact(row, "name")), definition: text(rowServedFact(row, "definition")) };
      if (Object.keys(optionDefPatch(row, w)).length === 0 && recordTag(row.facts) === kind.tag(w)) continue;
      await patchChild(local, kind, parent, row.id, w, { retag: true });
      changed.push({ row, prev });
    }
  } catch (e) {
    for (const c of changed.slice().reverse()) await patchChild(local, kind, parent, c.row.id, c.prev, { retag: true }).catch(() => {});
    for (const m of made.slice().reverse()) await endMade(local, qual.id, m);
    throw e;
  }
  for (const s of stray) await endRow(local, qual.id, s);
}

export function useValueQualifiers(args: {
  enabled: boolean;
  record: BaseRecord;
  vaultId: string;
  planVault: string;
  rows: readonly BaseRecord[];
  onNotice: (notice: string | null) => void;
  onTouched?: () => void;
}): ChildListHost<ScaleVariable> {
  const { enabled, record, planVault } = args;
  const host = useValueWriteHost();
  // A variable that has options may have option-definition records: each is found by a:partOf the variable (one find per such variable).
  const withOptions = useMemo(
    () => (enabled ? args.rows.filter((r) => isQualifierType(r.typeUri) && !!r.entityUri && isPartOfParent(r, record.entityUri) && qualifierRowOptionNames(r).length > 0) : []),
    [enabled, args.rows, record.entityUri],
  );
  const finds = host.usePlanFinds(
    planVault,
    "a:partOf",
    withOptions.map((q) => ({ id: q.id, entityUri: q.entityUri, enabled: !!planVault })),
  );
  const datas = finds.map((q) => q.data);
  const seen = useRef<{ rows: readonly BaseRecord[]; datas: unknown[]; merged: readonly BaseRecord[] } | null>(null);
  let merged: readonly BaseRecord[];
  const prev = seen.current;
  if (prev && prev.rows === args.rows && prev.datas.length === datas.length && prev.datas.every((d, i) => d === datas[i])) merged = prev.merged;
  else {
    const extra = datas.flatMap((d) => planFindRows(d as PlanFind | undefined));
    merged = extra.length ? [...args.rows, ...extra] : args.rows;
    seen.current = { rows: args.rows, datas, merged };
  }

  const kind: ChildKind<ScaleVariable> = {
    noun: "qualifier",
    typeName: () => QUALIFIER_TYPE,
    isType: isQualifierRowType,
    tag: (v) => qualifierTag(recordTag(args.record.facts), v),
    createFacts: qualifierCreateFacts,
    patch: qualifierPatch,
    after: (env, row, item, _parent, o) => syncOptionDefinitions(env, row, item, o),
    beforeEnd: async (env, row, o) => {
      if (!isQualifierType(row.typeUri) || !row.entityUri) return;
      const defs = await definitionRows(env, row, { created: !!o?.fresh, mayHave: qualifierRowOptionNames(row).length > 0 });
      for (const d of defs) await endRow({ ...env, recs: new Map() }, row.id, d);
    },
    isOld: (row, valueUri) => isLegacyQualifierRow(row, valueUri),
    twin: (rows, item, old, valueUri) => {
      const names = new Set([item.name, text(rowServedFact(old, "name"))].map((n) => n.trim().toLowerCase()).filter(Boolean));
      return rows.find((r) => isQualifierType(r.typeUri) && r.id !== old.id && isPartOfParent(r, valueUri) && names.has(text(rowServedFact(r, "name")).toLowerCase()));
    },
  };
  return useChildList<ScaleVariable>({ ...args, rows: merged, read: readQualifierRecords, kind, isBlank: qualifierIsBlank });
}
