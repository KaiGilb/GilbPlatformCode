/**
 * A heading for a predicate this screen has no dedicated group for.
 *
 * This is a presentation transform. It does not decide whether the field
 * is shown. The server already decided that. It names no predicate: the
 * spelling itself is split.
 *
 * The local part is everything after the first colon. `a:streetLine` gives
 * `streetLine`. A value with no colon is used whole. A full address is the
 * wrong input: `https://host/base/t/Foo` is cut at the first colon, so the
 * heading is made from `//host/base/t/Foo`, not from `Foo`. Use
 * `skill-uri-label` for a full address.
 *
 * Then `_` and `-` runs become a space, a lower-or-digit followed by an
 * upper letter is split, the ends are trimmed, and the rest is lowered
 * with `toLowerCase()` (not a locale). The first character is then upper
 * case. Later words stay lower: `streetLine` becomes `Street line`, not
 * `Street Line`.
 *
 * `URLValue` has no lower-then-upper pair, so it becomes `Urlvalue`.
 * Do not special-case initials.
 *
 * If nothing remains after the trim, the original predicate is returned
 * unchanged, including its spaces. `a:` returns `a:`. A string of spaces
 * returns that string of spaces.
 */
export function labelForPredicate(predicate: string): string {
  const local = predicate.includes(":") ? predicate.slice(predicate.indexOf(":") + 1) : predicate;
  const words = local
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  if (!words) return predicate;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
