// Cross-app entity display name — platform ontology registry.
//
// Axes (do not collapse):
//   URI  = one stable entity identity
//   Tag  = vault-unique handle(s) that resolve to the URI (e.g. unitTag) — not a label type
//   Label = human wording on the entity (master a:label + supporting altLabels)
//
// Chrome read order (listings / cards / graph):
//   0. a:name, where the record holds one (the ontology steward's D1 ruling L1/L2: "on any
//      instance record that holds a:name, a:name is its name"; the seed is `PARTY_NAME_FLOOR`)
//   1. master label  a:label
//   2. master tag    unitTag, then tag
//   3. identity human ids (BaseID) — email first, then subject, principal/alias/vault registration
//   4. type nameField / bridges title · processName · name
//   5. a file's own name  fileName (read-only; C210)
//   6. entity URI id-tail (last resort when facts are thin but @id is known)
//
// Facts maps use bare LWS @vocab slugs (`label`, not `a:label`).

import { PARTY_NAME_FLOOR } from "./partyName";

/** Canonical wire slug for entity.displayName (`a:label`). */
export const CANONICAL_DISPLAY_SLUG = "label" as const;

/**
 * Master-tag candidates for chrome when label is empty.
 * unitTag first (KaiZen ProcessStep official tag carrier); bare `tag` second.
 */
export const MASTER_TAG_SLUGS = ["unitTag", "tag"] as const;

/**
 * Registered identity human-id fallbacks (BaseID control plane).
 * Order: proven/human email before opaque subject; then principal/alias/vault registration.
 * Not master labels; dual-write into a:label on mint when possible.
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

/**
 * C210 (Kai's live test 2026-09-27) — a FILE's own name (`a:fileName`, Suggested on the master), a display
 * fallback. A file uploaded without a label showed its opaque id in the Nodes grid and "Untitled" in
 * the pane, because no slug above names a file. READ-ONLY on purpose: ⛔ not a BRIDGE slug —
 * `withCanonicalLabel` copies bridges into `a:label` on write, and a file name is not a label.
 */
export const FILE_NAME_SLUG = "fileName" as const;

export type EntityDisplayOpts = {
  nameField?: string | null;
  fallback?: string;
  /** Entity @id when facts are thin (e.g. Principal with only markers). */
  entityUri?: string | null;
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
 * - https://connect.example.test/base → connect.example.test
 * - https://id.example.test/base/p/<uuid> → <uuid>
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
 * Primary chrome name for list / card / graph / search.
 *
 * Order: see the "Chrome read order" list in this module's header (the one copy), then the `fallback`.
 */
export function entityDisplayName(
  facts: Record<string, string | undefined> | null | undefined,
  opts?: EntityDisplayOpts,
): string {
  const fallback = opts?.fallback ?? "Untitled";
  if (!facts && !opts?.entityUri) return fallback;

  if (facts) {
    // 🔴 GAPP214.30b (D1): a record's own `a:name` comes BEFORE its `a:label`. A party record written
    // by GilbApp's create path holds its name under the legacy `a:label`; a rename writes `a:name`
    // (and retracts that label), so a label-first read kept showing the old name in the list. Keyed
    // on the FACT, ⛔ not on a list of kinds: a term document holds `a:label` and no `a:name`, so
    // it is read as before (the ruling's L2 and L3). The spelling is the dated floor's.
    const own = factTrim(facts, PARTY_NAME_FLOOR.name);
    if (own) return own;
    const label = factTrim(facts, CANONICAL_DISPLAY_SLUG);
    if (label) return label;

    for (const slug of MASTER_TAG_SLUGS) {
      const v = factTrim(facts, slug);
      if (v) return v;
    }

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

/**
 * Ensure writes carry `a:label` when a display name exists.
 *
 * Sources: nameField / bridges / unitTag / identity human ids (dual content only).
 */
export function withCanonicalLabel(
  facts: Record<string, string>,
  nameField?: string | null,
): Record<string, string> {
  // When nameField is itself "label", still treat facts.label as the source.
  const sourceSlug =
    nameField && nameField !== CANONICAL_DISPLAY_SLUG ? nameField : CANONICAL_DISPLAY_SLUG;
  const fromSource = factTrim(facts, sourceSlug);

  if (fromSource) {
    let next: Record<string, string> = facts;
    if (factTrim(facts, CANONICAL_DISPLAY_SLUG) !== fromSource) {
      next = { ...next, [CANONICAL_DISPLAY_SLUG]: fromSource };
    }
    // Bridge: keep a:title aligned with master label for older note clients.
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
    const v = factTrim(facts, slug);
    if (v) return { ...facts, [CANONICAL_DISPLAY_SLUG]: v, title: factTrim(facts, "title") || v };
  }

  for (const slug of MASTER_TAG_SLUGS) {
    const v = factTrim(facts, slug);
    if (v) return { ...facts, [CANONICAL_DISPLAY_SLUG]: v };
  }

  for (const slug of IDENTITY_DISPLAY_SLUGS) {
    const v = factTrim(facts, slug);
    if (v) return { ...facts, [CANONICAL_DISPLAY_SLUG]: displayFriendly(v) };
  }

  return facts;
}
