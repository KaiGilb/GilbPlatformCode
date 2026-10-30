import type { UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { usePickerQuery } from "../inline";

/** The value of `record-picker`'s `PickerQueryContext` (read by `org-hierarchy`): a query hook that passes `retry: false`, as the source's own call did (OrgRecordPicker.tsx:144-150). */
export function createPickerQuery(): UsePickerQuery {
  return usePickerQuery;
}
