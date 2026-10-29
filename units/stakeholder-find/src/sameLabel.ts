// A copy of the app's `src/lib/base/sameLabel.ts`, pure: same-name rows are told apart one way.

/**
 * The trailing few characters of a record id — enough to tell two same-named rows apart
 * without showing a 26-character opaque token. Base ids are random, so the TAIL discriminates
 * as well as any other slice; the leading `…` marks it as a fragment rather than a whole id.
 */
export function shortIdTail(id: string): string {
  const bare = id.slice(id.lastIndexOf("/") + 1);
  return bare.length <= 6 ? bare : `…${bare.slice(-6)}`;
}

/** The labels that occur more than once. */
export function labelsSeenTwice(labels: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const label of labels) {
    if (seen.has(label)) twice.add(label);
    else seen.add(label);
  }
  return twice;
}
