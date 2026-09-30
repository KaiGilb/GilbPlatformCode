/**
 * The label to show when this viewer was not given a name.
 *
 * If `principal` parses as a URL and the hostname is non-empty, the result is
 * `Person on ` plus that hostname. The URL parser lowercases the hostname
 * first, so `WWW.` is already `www.` and the one leading `www.` is removed.
 * Only one prefix is removed: `www.www.example.test` becomes `www.example.test`.
 * The port is not included. The path is not included.
 *
 * Anything that does not parse, and a URL whose hostname is empty, returns
 * the exact string `Unnamed connection`. The raw principal is never returned.
 *
 * This does not look up a name, and it does not decide that the viewer may
 * see one. Call it only after the name read came back empty.
 */

export function friendlyUnnamedLabel(principal: string): string {
  try {
    const host = new URL(principal).hostname.replace(/^www\./, "");
    if (host) return `Person on ${host}`;
  } catch {
    // Not an address. The fallback below is the whole answer.
  }
  return "Unnamed connection";
}
