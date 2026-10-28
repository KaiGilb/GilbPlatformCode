// A Value's levels as records. Each level is a child record of the Value (see useValueChildren.ts):
// `a:partOf {"@id": value}`, `a:elementOrder`, `a:lineSources`, the tag in `a:unitTag`; typed by its kind.
// ⚠ Level term names are in LEVEL_TERMS (the value-card-model unit); all level terms are live ontology terms.

import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { recordTag } from "@kaigilb/gilbplatformcode-plan-links-model";
import {
  isLevelType,
  levelCreateFacts,
  levelPatch,
  levelTag,
  levelTypeName,
  readLevelRecords,
  type ValueLevel,
} from "@kaigilb/gilbplatformcode-value-card-model";
import { useChildList, type ChildListHost } from "./useValueChildren";
import type { ChildKind } from "./valueChildRecords";

export type ValueLevelsHost = ChildListHost<ValueLevel>;

export function useValueLevels(args: {
  enabled: boolean;
  record: BaseRecord;
  vaultId: string;
  planVault: string;
  /** The Value's `a:partOf` find rows (all part types; level records are picked out here). */
  rows: readonly BaseRecord[];
  /** Scale qualifier names in order (the order of choices in a tag). */
  variableOrder: readonly string[];
  onNotice: (notice: string | null) => void;
  onTouched?: () => void;
}): ValueLevelsHost {
  const kind: ChildKind<ValueLevel> = {
    noun: "level",
    typeName: (l) => levelTypeName(l.kind, args.record.typeUri),
    isType: isLevelType,
    tag: (l) => levelTag(recordTag(args.record.facts), l, args.variableOrder),
    createFacts: (l, tag, parentUri, order) => levelCreateFacts(l, tag, parentUri, order, args.record.typeUri),
    patch: (row, l) => levelPatch(row, l, args.record.typeUri),
  };
  return useChildList<ValueLevel>({ ...args, read: readLevelRecords, kind });
}
