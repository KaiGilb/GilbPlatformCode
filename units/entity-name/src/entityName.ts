/**
 * Three different questions about a record's name. Do not answer one with
 * another.
 *
 * entityDisplayName — the words on a row.
 * openTypeNameSlug — which fact the name box is bound to.
 * withCanonicalLabel — what a write copies onto label and title.
 *
 * The row can show a tag while the box is bound to an empty title. The write
 * helper can copy a bridge onto label before it looks at a tag. Those
 * disagreements are the behaviour. Do not make the three lists match.
 *
 * displayFriendly is copied here and not exported. It must stay in agreement
 * with units/display-friendly when hostPaths is left at the default ["base"].
 */

/** The fact the row reads first. Wire slug `label`, not `a:label`. */
export const CANONICAL_DISPLAY_SLUG = "label" as const;

/** Row fallback after label. `unitTag` first, then `tag`. Order matters. */
export const MASTER_TAG_SLUGS = ["unitTag", "tag"] as const;

/**
 * Identity values, after the tags, before a type's own name field.
 * Each one is shortened with displayFriendly. Order matters.
 */
export const IDENTITY_DISPLAY_SLUGS = [
  "anchorBoundEmail",
  "accountSubject",
  "principalUri",
  "aliasUri",
  "registeredVault",
  "vaultAddress",
] as const;

/** Bridges. On the row they come after the name field. On the write they come before the tags. */
export const BRIDGE_SLUGS = ["title", "processName", "name"] as const;

/**
 * Spellings a label is compared with to see if it is a copy of a tag.
 * Membership only. Order does not matter. This is not a fallback chain and
 * it is not the row's tag list. `ruleId` is here and is not a row fallback.
 */
export const TAG_CARRIER_SPELLINGS = [
  "unitTag",
  "unit-tag",
  "ruleId",
  "rule-id",
  "tag",
] as const;

export interface EntityDisplayOpts {
  nameField?: string | null;
  /** Used as given, including `""`. Omit it for `Untitled`. */
  fallback?: string;
  entityUri?: string | null;
}

function factTrim(
  facts: Record<string, string | undefined> | null | undefined,
  slug: string,
): string {
  const value = facts?.[slug];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Private copy of display-friendly's default. Do not change one without the other.
 * A `/vault` path returns the word `vault`. Only a sole `base` segment returns the host.
 */
function displayFriendly(raw: string, hostPaths: readonly string[] = ["base"]): string {
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

/**
 * Words for a row, a card, or a search hit.
 *
 * Order, and only this order:
 * 1. `label`, trimmed. A URL in the label is not shortened.
 * 2. `unitTag`, then `tag`.
 * 3. identity slugs, each passed through displayFriendly.
 * 4. `nameField`, when it is set and it is not already in 1–3.
 * 5. bridges `title`, `processName`, `name`, skipping `nameField` if it is one of them.
 * 6. `entityUri`, shortened.
 * 7. `fallback`, or `Untitled` when fallback was omitted.
 *
 * `ruleId` is not in this list. A record whose only name fact is `ruleId`
 * shows the fallback, unless you pass `nameField: "ruleId"`.
 *
 * Blank after trim is skipped. The input is not changed.
 */
export function entityDisplayName(
  facts: Record<string, string | undefined> | null | undefined,
  opts?: EntityDisplayOpts,
): string {
  const fallback = opts?.fallback ?? "Untitled";
  if (!facts && !opts?.entityUri) return fallback;

  if (facts) {
    const label = factTrim(facts, CANONICAL_DISPLAY_SLUG);
    if (label) return label;

    for (const slug of MASTER_TAG_SLUGS) {
      const value = factTrim(facts, slug);
      if (value) return value;
    }

    for (const slug of IDENTITY_DISPLAY_SLUGS) {
      const value = factTrim(facts, slug);
      if (value) return displayFriendly(value);
    }

    const nameField = opts?.nameField;
    const reserved = new Set<string>([
      CANONICAL_DISPLAY_SLUG,
      ...MASTER_TAG_SLUGS,
      ...IDENTITY_DISPLAY_SLUGS,
    ]);
    if (nameField && !reserved.has(nameField)) {
      const value = factTrim(facts, nameField);
      if (value) return value;
    }

    for (const slug of BRIDGE_SLUGS) {
      if (slug === nameField) continue;
      const value = factTrim(facts, slug);
      if (value) return value;
    }
  }

  const fromEntity = opts?.entityUri?.trim();
  if (fromEntity) {
    const shortened = displayFriendly(fromEntity);
    if (shortened) return shortened;
  }

  return fallback;
}

/**
 * The slug an editor binds its name box to when the type has no field spec.
 *
 * - Any non-blank `title` → `"title"`. The box keeps that fact. This wins
 *   even when `label` is also set, and even when the two differ.
 * - No title, and no label → `"label"`. A new name is written to the canonical fact.
 * - No title, and the label equals any tag spelling in {@link TAG_CARRIER_SPELLINGS}
 *   after trim → `"title"`. The box binds to a missing title, so it is empty.
 *   It does not show the tag. Equality is exact. A label that only resembles
 *   a tag is still a label.
 * - Otherwise → `"label"`.
 *
 * The row can still show that label. This function does not choose the row.
 * A cleared tag is a hole: the label can still be the old tag text, and with
 * no carrier left to compare, this returns `"label"` and the box shows the
 * stale tag. That hole is open on purpose.
 */
export function openTypeNameSlug(
  facts: Record<string, string | undefined> | null | undefined,
): string {
  if (factTrim(facts, "title")) return "title";
  const label = factTrim(facts, CANONICAL_DISPLAY_SLUG);
  if (!label) return CANONICAL_DISPLAY_SLUG;
  for (const slug of TAG_CARRIER_SPELLINGS) {
    if (factTrim(facts, slug) === label) return "title";
  }
  return CANONICAL_DISPLAY_SLUG;
}

/**
 * Copy a name onto `label`, and sometimes onto `title`, for a write.
 *
 * Do not run this on a record you just read in order to fill the name box.
 * That seeding was tried. It put a second name fact on the record and broke
 * the carrier tests. The box uses {@link openTypeNameSlug}. The row uses
 * {@link entityDisplayName}. This function is the write.
 *
 * When the chosen source has text, that text is copied to `label` and to
 * `title` if either differs. The source is `nameField` when you pass one
 * that is not `label`. Otherwise the source is `label`. `""` and omitted
 * are not a name field. The function then returns. Tags are not consulted.
 *
 * When the source is empty and `label` has text, `title` is set to that
 * label if it differs. This happens even when the label is a copy of a tag.
 * This function does not know the tag-copy rule.
 *
 * When both are empty, the first non-blank bridge (`title`, `processName`,
 * `name`) is copied to `label` and to `title`. A bridge beats a tag here.
 * On the row, the tag beats the bridge. Do not swap them.
 *
 * Else the first master tag is copied to `label` only. `title` is not set.
 *
 * Else the first identity value is shortened and copied to `label` only.
 *
 * Otherwise the same object is returned.
 *
 * When nothing changes, the same object reference is returned.
 */
export function withCanonicalLabel(
  facts: Record<string, string>,
  nameField?: string | null,
): Record<string, string> {
  const sourceSlug =
    nameField && nameField !== CANONICAL_DISPLAY_SLUG ? nameField : CANONICAL_DISPLAY_SLUG;
  const fromSource = factTrim(facts, sourceSlug);

  if (fromSource) {
    let next: Record<string, string> = facts;
    if (factTrim(facts, CANONICAL_DISPLAY_SLUG) !== fromSource) {
      next = { ...next, [CANONICAL_DISPLAY_SLUG]: fromSource };
    }
    if (factTrim(next, "title") !== fromSource) {
      next = { ...next, title: fromSource };
    }
    return next;
  }

  if (factTrim(facts, CANONICAL_DISPLAY_SLUG)) {
    const lab = factTrim(facts, CANONICAL_DISPLAY_SLUG);
    if (factTrim(facts, "title") !== lab) return { ...facts, title: lab };
    return facts;
  }

  for (const slug of BRIDGE_SLUGS) {
    const value = factTrim(facts, slug);
    if (value) return { ...facts, [CANONICAL_DISPLAY_SLUG]: value, title: factTrim(facts, "title") || value };
  }

  for (const slug of MASTER_TAG_SLUGS) {
    const value = factTrim(facts, slug);
    if (value) return { ...facts, [CANONICAL_DISPLAY_SLUG]: value };
  }

  for (const slug of IDENTITY_DISPLAY_SLUGS) {
    const value = factTrim(facts, slug);
    if (value) return { ...facts, [CANONICAL_DISPLAY_SLUG]: displayFriendly(value) };
  }

  return facts;
}
