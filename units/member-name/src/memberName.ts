/**
 * What to call one group member, and which address identifies the row.
 *
 * The host label is the first piece of the hostname, including `www` and `id`.
 * The principal-row unit skips `www` and `id` and then uses the whole hostname.
 * These two do not agree. Do not "fix" this one to match that one.
 *
 * A label the roster already returned wins. This unit does not fetch a card.
 */

export interface MemberNameInput {
  label?: string | null;
  webId?: string | null;
  principal: string;
}

function nameFromWebId(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const u = new URL(uri);
    const path = u.pathname.replace(/\/$/, "") || "/";
    if (path === "/i" || path === "/card" || path === "/base" || path === "/vault") {
      const host = u.hostname.split(".")[0];
      return host || null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * The row heading.
 *
 * 1. `label` when it is not empty after trim. The returned text is trimmed.
 * 2. The host label of `webId`, then of `principal`, when the path is exactly
 *    `/i`, `/card`, `/base`, or `/vault` after one trailing slash is removed.
 *    The host label is the first dotted piece. It is not skipped when it is
 *    `www` or `id`. The URL parser lowercases the hostname, so `WWW` becomes `www`.
 *    The path is case-sensitive. `/BASE` does not match.
 * 3. The last non-empty path segment of `principal`.
 * 4. `principal` itself when that segment is missing.
 *
 * An empty principal with no label and no usable host returns `""`.
 * This can be the word `base` when the path is not one of the four roots and
 * the last segment is `base`. The four roots themselves return the host label
 * instead of the word `base`.
 */
export function memberDisplayName(member: MemberNameInput): string {
  if (member.label && member.label.trim() !== "") return member.label.trim();
  const fromAlias = nameFromWebId(member.webId) ?? nameFromWebId(member.principal);
  if (fromAlias) return fromAlias;
  const tail = member.principal.split("/").filter(Boolean).pop();
  return tail && tail.length > 0 ? tail : member.principal;
}

/**
 * The row's identity. The trimmed `webId` when it is not blank. Otherwise
 * `principal`, not trimmed.
 *
 * A webId of spaces is not an identity. The principal is used.
 * This does not turn a principal into a host label. That is
 * {@link memberDisplayName}.
 */
export function memberDirectoryId(member: Pick<MemberNameInput, "webId" | "principal">): string {
  const webId = member.webId?.trim();
  if (webId) return webId;
  return member.principal;
}
