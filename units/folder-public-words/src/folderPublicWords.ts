/**
 * The words appended when a link into a public folder landed, and something
 * in that folder did not become public.
 *
 * Empty, missing, or a zero-length list → "". The caller appends this onto
 * its own "added" sentence, so the empty string must stay empty. Do not
 * return a different "all public" sentence.
 *
 * The sentence always starts with a space, so it can be glued on the end.
 *
 * One failure says "1 thing". Any other count says "N things".
 * Only the first failure string is quoted. The rest are counted and then
 * dropped. Do not join them. Do not quote failures[1]. A coder who "fixes"
 * this to list every failure changes the sentence every screen already shows.
 */
export function notMadePublicSentence(notMadePublic: readonly string[] | undefined): string {
  if (!notMadePublic || notMadePublic.length === 0) return "";
  const n = notMadePublic.length;
  // A hole in the list is the word "undefined", which is what a template does
  // with a missing element. Do not turn that hole into an empty quote.
  const first = notMadePublic[0];
  const quoted = first === undefined ? "undefined" : first;
  return ` The folder is public, but ${n === 1 ? "1 thing" : `${n} things`} in it could not be made public: ${quoted}`;
}
