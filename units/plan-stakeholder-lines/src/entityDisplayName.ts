// The name a record shows, copied from GilbApp's entityDisplayName (src/lib/base/entityDisplayName.ts), with its constants and
// displayFriendly. Read order: name, label, unitTag, tag, identity values, the type's own name field, title / processName / name,
// fileName, the shortened address, the fallback. Facts maps use bare slugs (`label`, not `a:label`).

/** Canonical wire slug for the display name (`a:label`). */
export const CANONICAL_DISPLAY_SLUG = "label" as const;

/**
 * Master-tag candidates when the label is empty: unitTag first, bare `tag` second.
 */
export const MASTER_TAG_SLUGS = ["unitTag", "tag"] as const;

/**
 * Registered identity human-id fallbacks. Order: proven/human email before opaque subject; then principal/alias/vault registration.
 */
export const IDENTITY_DISPLAY_SLUGS = [
  "anchorBoundEmail",
  "accountSubject",
  "principalUri",
  "aliasUri",
  "registeredVault",
  "vaultAddress",
] as const;

/** Registered bridge slugs (non-primary chrome). */
export const BRIDGE_SLUGS = ["title", "processName", "name"] as const;

/** A file's own name (`a:fileName`), a display fallback. Read-only. */
export const FILE_NAME_SLUG = "fileName" as const;

export type EntityDisplayOpts = {
  nameField?: string | null;
  fallback?: string;
  /** Entity @id when facts are thin (e.g. Principal with only markers). */
  entityUri?: string | null;
  /**
   * One tag rule, the platform's: the record's MAIN tag, read from the platform (`useMainTag(s)`). It is the tag fallback of the chrome read
   * order: a record that holds a label or `unitTag` / `tag` keeps it, and a record that holds none of them shows its main tag before an identity id.
   */
  mainTag?: string | null;
};

function factTrim(
  facts: Record<string, string | undefined> | null | undefined,
  slug: string,
): string {
  const v = facts?.[slug];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Prefer a short human-facing form:
 * - email left as-is
 * - https://host/base becomes the host
 * - https://host/base/p/<uuid> becomes <uuid>
 * - bare path tail otherwise
 */
export function displayFriendly(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (s.includes("@") && !s.includes("://")) return s;
  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
      const u = new URL(s);
      const path = u.pathname.replace(/\/+$/, "") || "";
      if (path === "" || path === "/base") return u.host;
      const parts = path.split("/").filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && last !== "base") return last;
      return u.host;
    }
  } catch {
    /* fall through */
  }
  const marker = s.lastIndexOf("/");
  if (marker === -1 || marker === s.length - 1) return s;
  return s.slice(marker + 1) || s;
}

/**
 * Primary name for list / card / graph / search.
 */
export function entityDisplayName(
  facts: Record<string, string | undefined> | null | undefined,
  opts?: EntityDisplayOpts,
): string {
  const fallback = opts?.fallback ?? "Untitled";
  if (!facts && !opts?.entityUri) return fallback;

  if (facts) {
    // A record's own `name` comes BEFORE its `label`. A party record created by the app holds its name under the older `label`;
    // a rename writes `name` (and retracts that label), so a label-first read kept showing the old name. Keyed on the FACT, not on
    // a list of kinds: a term document holds `label` and no `name`, so it is read as before. In GilbApp the spelling is
    // PARTY_NAME_FLOOR.name, whose value is the literal "name"; it is written here as that literal.
    const own = factTrim(facts, "name");
    if (own) return own;
    const label = factTrim(facts, CANONICAL_DISPLAY_SLUG);
    if (label) return label;

    for (const slug of MASTER_TAG_SLUGS) {
      const v = factTrim(facts, slug);
      if (v) return v;
    }

    const main = opts?.mainTag?.trim();
    if (main) return main;

    for (const slug of IDENTITY_DISPLAY_SLUGS) {
      const v = factTrim(facts, slug);
      if (v) return displayFriendly(v);
    }

    const nf = opts?.nameField;
    const reserved = new Set<string>([
      CANONICAL_DISPLAY_SLUG,
      ...MASTER_TAG_SLUGS,
      ...IDENTITY_DISPLAY_SLUGS,
    ]);
    if (nf && !reserved.has(nf)) {
      const v = factTrim(facts, nf);
      if (v) return v;
    }

    for (const slug of BRIDGE_SLUGS) {
      if (slug === nf) continue;
      const v = factTrim(facts, slug);
      if (v) return v;
    }

    const fileName = factTrim(facts, FILE_NAME_SLUG) || factTrim(facts, `a:${FILE_NAME_SLUG}`);
    if (fileName) return fileName;
  }

  const fromEntity = opts?.entityUri?.trim();
  if (fromEntity) {
    const t = displayFriendly(fromEntity);
    if (t) return t;
  }

  return fallback;
}
