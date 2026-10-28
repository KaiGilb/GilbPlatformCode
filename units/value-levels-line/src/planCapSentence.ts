// The sentence under a cut-off list, and the cap it names. Copied from the app unchanged.

/** One find shows at most this many linked records, and says so when more exist. */
export const PLAN_FIND_CAP = 300;

export function planCapSentence(total: number, word: string, cap: number = PLAN_FIND_CAP): string {
  return `Showing the first ${cap} of ${total} ${word} at this level.`;
}
