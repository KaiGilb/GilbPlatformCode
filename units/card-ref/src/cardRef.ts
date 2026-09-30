/**
 * Card-field rows versus the person row, and the spellings that name one person.
 *
 * This does not draw pairs and it does not read a photo. Pairing a photo
 * file to a card stays in the app, because that read uses the photo package.
 */

/** Name prefixes that mark a card field, not the person. Exact, including the colon. */
export const CARD_HANDLE_PREFIXES = [
  "pfc:",
  "name-claim:",
  "skill-claim:",
  "audience-rung:",
  "connection-origin:",
  "contact-private-note:",
  "connection-decline:",
] as const;

/** Facts on a person row that also name that person, besides the row id. */
export const CARD_HUB_IDENTITY_SLUGS = ["claimSubject", "principalUri", "directReader"] as const;

export interface CardRefRecord {
  id: string;
  entityUri?: string;
  facts: Record<string, string>;
}

/**
 * True when `name` starts with one of the handle prefixes.
 * Undefined, null, and "" are not handles. The name is not trimmed,
 * so a leading space does not match. Case is kept.
 */
export function isCardHandleName(name: string | null | undefined): boolean {
  if (!name) return false;
  return CARD_HANDLE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * True when this row is the person, not a card field.
 * A missing name is a hub. Only a handle prefix makes a row not a hub.
 */
export function isHubRecord(record: { facts: { name?: string } }): boolean {
  return !isCardHandleName(record.facts.name);
}

/**
 * Spellings of one reference, so a short form can meet the absolute form.
 *
 * `identityOrigin` is the host the app uses when it expands `base:`.
 * This unit does not know that host. Pass it. It is not trimmed and a
 * trailing slash is not removed, so a slash you pass is part of the spelling.
 *
 * What is added, in this order, with duplicates dropped inside this one call:
 * - the trimmed text, when it is not empty (empty in, empty out)
 * - if it starts with `base:`, `identityOrigin + "/base/" + the rest`
 * - if it is an absolute address (`scheme://`):
 *   - `host + path`, with trailing slashes removed from the path
 *   - if the path starts with `/base/p/`, `base:p/` plus the rest of that path
 *   - if the path is `/i` or ends with `/i`, the original text with trailing slashes removed
 *
 * A space in the middle is not an address. The set keeps the trimmed text only.
 * The address parser lowercases the host. This function does not lowercase anything else.
 */
export function refKeyVariants(raw: string, identityOrigin: string): string[] {
  const text = raw.trim();
  if (!text) return [];
  const out = new Set<string>([text]);
  if (text.startsWith("base:")) {
    out.add(`${identityOrigin}/base/${text.slice("base:".length)}`);
  }
  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) {
      const url = new URL(text);
      const path = url.pathname.replace(/\/+$/, "");
      out.add(`${url.host}${path}`);
      if (path.startsWith("/base/p/")) out.add(`base:p/${path.slice("/base/p/".length)}`);
      if (path === "/i" || path.endsWith("/i")) out.add(text.replace(/\/+$/, ""));
    }
  } catch {
    /* keep the trimmed text */
  }
  return [...out];
}

/**
 * Every spelling this hub row uses for itself.
 *
 * The entity address (when present), then the row id, then claimSubject,
 * principalUri, and directReader when those facts are non-empty.
 * The same spelling contributed by two of those sources is listed twice.
 * This function does not dedupe across sources.
 */
export function hubIdentityKeys(record: CardRefRecord, identityOrigin: string): string[] {
  const keys: string[] = [];
  if (record.entityUri) keys.push(...refKeyVariants(record.entityUri, identityOrigin));
  keys.push(...refKeyVariants(record.id, identityOrigin));
  for (const slug of CARD_HUB_IDENTITY_SLUGS) {
    const value = record.facts[slug];
    if (value) keys.push(...refKeyVariants(value, identityOrigin));
  }
  return keys;
}
