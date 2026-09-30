/**
 * Spellings of one person id, and the name prefixes that mark a row as a
 * card field rather than the person.
 *
 * The prefixes are the ones GilbApp uses today. They are not a law about
 * every app. A name that does not start with one of them is not a card field
 * here, even if your app uses a different prefix. Pass is not an option:
 * the list is fixed in this unit. If your prefixes differ, do not import
 * `isCardHandleName`; compare the name yourself.
 */

export const CARD_HANDLE_PREFIXES = [
  "pfc:",
  "name-claim:",
  "skill-claim:",
  "audience-rung:",
  "connection-origin:",
  "contact-private-note:",
  "connection-decline:",
] as const;

/** Fact names GilbApp treats as a pointer from a card field to a person. */
export const CARD_POINTER_SLUGS = ["claimSubject", "heldParty"] as const;

/**
 * The canonical photo fact name, for a label. It is not the only spelling a
 * record may use. Reading the photo by this name alone misses the others.
 * This unit does not read a photo.
 */
export const CARD_PHOTO_SLUG = "profilePhoto" as const;

/** Fact names, besides the record id, by which a profile card names the person. */
export const CARD_HUB_IDENTITY_SLUGS = ["claimSubject", "principalUri", "directReader"] as const;

/** True when `name` starts with one of `CARD_HANDLE_PREFIXES`. Empty and missing are false. Case-sensitive. */
export function isCardHandleName(name: string | undefined): boolean {
  if (!name) return false;
  return CARD_HANDLE_PREFIXES.some((p) => name.startsWith(p));
}

export type CardFactRecord = {
  id: string;
  entityUri?: string;
  facts: Record<string, string>;
};

/**
 * True when the record is not a card-field handle.
 *
 * Looks only at `facts.name`. A missing name is not a handle, so the record
 * counts as the person. `facts.label` is not consulted.
 */
export function isHubRecord(record: CardFactRecord): boolean {
  return !isCardHandleName(record.facts.name);
}

/**
 * Other strings that refer to the same id as `raw`.
 *
 * Always includes the trimmed input, unless it is blank (then []).
 *
 * `identityOrigin` is the origin only, with no `/base` on the end, for
 * expanding a `base:` short form: `base:p/uuid` becomes
 * `<identityOrigin>/base/p/uuid`. Omit it and the short form is not expanded.
 * This unit does not name an origin of its own. The app passes the identity
 * host it was built with. A trailing slash on the origin is removed once.
 * Passing an origin that already ends in `/base` doubles that segment.
 *
 * When the input is an absolute URL (a scheme, then `://`):
 * - `host` plus the path, trailing slashes removed, is added. No scheme.
 * - a path that starts with `/base/p/` also adds `base:p/<the rest>`.
 * - a path that is `/i` or ends with `/i` also adds the input with trailing
 *   slashes removed. That ending test is broad: `/base/p/i` ends with `/i`.
 *
 * A URL that does not parse is left as the trimmed input only.
 * Order is first-seen. Duplicates are dropped.
 */
export function refKeyVariants(raw: string, identityOrigin?: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  const out = new Set<string>([s]);
  if (s.startsWith("base:") && identityOrigin) {
    const origin = identityOrigin.replace(/\/+$/, "");
    out.add(`${origin}/base/${s.slice("base:".length)}`);
  }
  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
      const u = new URL(s);
      const path = u.pathname.replace(/\/+$/, "");
      out.add(`${u.host}${path}`);
      if (path.startsWith("/base/p/")) out.add(`base:p/${path.slice("/base/p/".length)}`);
      if (path === "/i" || path.endsWith("/i")) out.add(s.replace(/\/+$/, ""));
    }
  } catch {
    /* keep the trimmed input */
  }
  return [...out];
}

/** A synthetic relation id for one card-fact pair. Not an address. Not stored. */
export function cardFactRelationUri(pair: { sourceId: string; targetId: string; slug: string }): string {
  return `fact:${pair.slug}:${pair.sourceId}:${pair.targetId}`;
}

/**
 * A short label for a `fact:` relation id from `cardFactRelationUri`.
 *
 * undefined means the id does not start with `fact:`. An empty string means
 * it did start with `fact:` and the slug was empty. Those are not the same.
 *
 * Known slugs: `claimSubject` → `about`, `heldParty` → `held-party`,
 * `profilePhoto` → `profile-photo`. Any other slug is returned as the slug,
 * not replaced. Only the first `:`-separated piece after `fact:` is read.
 */
export function cardFactEdgeLabel(relationUri: string): string | undefined {
  if (!relationUri.startsWith("fact:")) return undefined;
  const slug = relationUri.slice("fact:".length).split(":")[0] ?? "";
  if (slug === "claimSubject") return "about";
  if (slug === "heldParty") return "held-party";
  if (slug === "profilePhoto") return "profile-photo";
  return slug;
}
