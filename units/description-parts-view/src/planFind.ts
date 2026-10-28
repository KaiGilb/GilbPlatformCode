// The part-list find: its type, the rows of one, and the two sentences about a cut or unread level. Pure.
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";

/** One find shows at most this many linked records, and says so when more exist. */
export const PLAN_FIND_CAP = 300;

/** A Value's children (levels, qualifiers, meters) are found by `a:partOf`; that find pages to this many. Other finds keep {@link PLAN_FIND_CAP}. */
export const PLAN_FIND_CAP_PART_OF = 2000;

/** The cap for the `a:partOf` find of a record: a Value's children are paged to {@link PLAN_FIND_CAP_PART_OF}. */
export function planFindCapFor(isValue: boolean): number {
  return isValue ? PLAN_FIND_CAP_PART_OF : PLAN_FIND_CAP;
}

export type PlanFind = {
  rows: BaseRecord[];
  total: number;
  capped: boolean;
  unread: number;
  /** The cap this find used (absent on a find built by hand: {@link PLAN_FIND_CAP}). */
  cap?: number;
};

export function planFindRows(data: PlanFind | undefined): readonly BaseRecord[] {
  return data?.rows ?? [];
}

export function planCapSentence(total: number, word: string, cap: number = PLAN_FIND_CAP): string {
  return `Showing the first ${cap} of ${total} ${word} at this level.`;
}

export function planUnreadSentence(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural} could not be read. Try again`;
}
