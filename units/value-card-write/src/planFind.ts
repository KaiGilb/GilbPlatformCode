// The shape of a find of a record's linked records, and the reader of its rows.
// Copied from the app unchanged (see the README): the find itself, and its cache, are the host's.

import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";

export type PlanFind = {
  rows: BaseRecord[];
  total: number;
  capped: boolean;
  unread: number;
  /** The cap this find used (absent on a find built by hand: the default cap, 300). */
  cap?: number;
};

export function planFindRows(data: PlanFind | undefined): readonly BaseRecord[] {
  return data?.rows ?? [];
}
