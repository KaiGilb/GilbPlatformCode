import type { StakeholderListDoorsHost } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";
import { HELD_RECORD_FRESH_MS, heldRecordOf, useRecordsBeingDeleted } from "../inline";

/**
 * The host of `stakeholder-list-doors`. `requestsSent` is `() => 0`: GilbApp counted requests by wrapping the page's global `fetch`
 * (lib/base/requestMeter.ts:25-39), which a library does not do, so the reader's per-screen request budget starts from 0 (the unit README:
 * "0 when nothing counts them"). The other three are the inline copies of `recordHooks.ts` (see `../inline`).
 */
export function createStakeholderListDoorsHost(): StakeholderListDoorsHost {
  return {
    requestsSent: () => 0,
    heldRecordFreshMs: HELD_RECORD_FRESH_MS,
    heldRecordOf,
    useRecordsBeingDeleted,
  };
}
