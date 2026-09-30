/**
 * A short label from an email or an address.
 *
 * - Blank stays blank.
 * - A string that contains `@` and does not contain `://` is returned as trimmed.
 *   That covers an email. It also covers any other `@` text that is not a URL.
 * - A URL whose path is empty, or whose only segment is in `hostPaths`, returns
 *   the host (with a port if there is one).
 * - Otherwise the last path segment is returned, unless that segment is itself
 *   in `hostPaths`, in which case the host is returned.
 * - Anything else: the text after the last slash. A trailing slash returns the
 *   whole string. No slash returns the whole string.
 *
 * `hostPaths` defaults to `["base"]` only. A path of `/vault` is NOT treated as
 * a host. It returns the word `vault`. Pass `["base", "vault"]` if a vault root
 * of either shape should show the host. The default matches the app today.
 * Do not change the default and expect every screen to stay the same.
 */
export function displayFriendly(raw: string, hostPaths: readonly string[] = ["base"]): string {
  const s = raw.trim();
  if (!s) return s;
  if (s.includes("@") && !s.includes("://")) return s;
  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
      const url = new URL(s);
      const path = url.pathname.replace(/\/+$/, "") || "";
      const parts = path.split("/").filter(Boolean);
      const only = parts.length === 1 ? parts[0] : undefined;
      if (path === "" || (only !== undefined && hostPaths.includes(only))) return url.host;
      const last = parts.length > 0 ? parts[parts.length - 1] : undefined;
      if (last !== undefined && !hostPaths.includes(last)) return last;
      return url.host;
    }
  } catch {
    // Not a URL. Fall through to the last slash.
  }
  const marker = s.lastIndexOf("/");
  if (marker === -1 || marker === s.length - 1) return s;
  return s.slice(marker + 1) || s;
}
