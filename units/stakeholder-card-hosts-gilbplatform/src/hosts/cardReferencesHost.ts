import type { CardReferencesHost } from "@kaigilb/gilbplatformcode-card-references";
import { changeRecordFactItems } from "@kaigilb/gilbplatformcode-record-fact-items";

/**
 * The host of `card-references` (passed as the first argument of its two remove functions, not a context): the one-key writer of a record's fact
 * is `changeRecordFactItems` of `record-fact-items` (GilbApp `lib/base/recordFactItems.ts:55`), with its own queue per record and its own error class.
 */
export function createCardReferencesHost(): CardReferencesHost {
  return { changeRecordFactItems };
}
