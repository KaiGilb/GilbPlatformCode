/**
 * The four rung placements a holder can store, their wire words, CURIEs and display labels.
 *
 * A placement is one `(context, depth)` pair: personal or professional, times close-circle (shown
 * "Inner Circle") or first-degree (shown "1st Connection"). Only these four are stored. The two
 * either-context rungs are DERIVED unions (a person qualifies in EITHER atomic context at that
 * depth); nobody is ever written into them (Rule_Code_gilb-audience-rungs, RuleAudrungDerivedNotStored).
 *
 * Pure: no request, no app import. Read-only knowledge any app may share.
 */

/** Atomic context axis. `either` is never storable. */
export type AudienceContext = "personal" | "professional";

/** Depth axis: close-circle (narrower) or first-degree (broader). Wire tokens. */
export type AudienceDepth = "close-circle" | "first-degree";

/** One of the four storable (context, depth) pairs. */
export interface AtomicPlacement {
  context: AudienceContext;
  depth: AudienceDepth;
}

/** One stored set as `GET /base/connect/audience-rung/members` returns it. */
export interface AudienceRungSetRecord {
  context: AudienceContext;
  depth: AudienceDepth;
  /** The rung CURIE, e.g. `t:PersonalCloseCircleGrantee`. */
  rungTerm: string;
  setUri: string;
  /** The principal strings the holder PUT, exactly as written (a person or a group vault). */
  members: string[];
}

/**
 * The four storable placements, in display order.
 *
 * Display order: within each context, broader rung first:
 * Personal 1st, Personal Inner Circle, Professional 1st, Professional Inner Circle.
 * Source: 3P.C.AudienceScope.SettledVocabulary.Base clause (v). Do not re-derive.
 */
export const ATOMIC_PLACEMENTS: readonly AtomicPlacement[] = Object.freeze([
  { context: "personal", depth: "first-degree" },
  { context: "personal", depth: "close-circle" },
  { context: "professional", depth: "first-degree" },
  { context: "professional", depth: "close-circle" },
] as const);

/**
 * The two DERIVED either-context unions. They still resolve as audiences on the platform;
 * nobody is ever written into them, and a placement panel no longer draws them
 * (hidden, not deleted).
 */
export const DERIVED_UNIONS: readonly {
  depth: AudienceDepth;
  label: string;
  /** The two atomic placements whose UNION confers this derived reach. */
  of: readonly AtomicPlacement[];
}[] = Object.freeze([
  {
    depth: "close-circle",
    label: "Pers & Pro · Inner Circle (derived — union)",
    of: [
      { context: "personal", depth: "close-circle" },
      { context: "professional", depth: "close-circle" },
    ],
  },
  {
    depth: "first-degree",
    label: "Pers & Pro · 1st Connection (derived — union)",
    of: [
      { context: "personal", depth: "first-degree" },
      { context: "professional", depth: "first-degree" },
    ],
  },
] as const);

/**
 * Human label for one atomic placement, e.g. "Personal · Inner Circle".
 * Display only: the depth token close-circle stays close-circle on the wire.
 *
 * @param p the placement
 * @returns "<Personal|Professional> · <Inner Circle|1st Connection>"
 */
export function placementLabel(p: AtomicPlacement): string {
  return `${CONTEXT_WORDS[p.context]} · ${DEPTH_WORDS[p.depth]}`;
}

/** The words for each context. `either` is the derived union's (the "Pers & Pro" word; it means personal OR professional). */
export const CONTEXT_WORDS: Readonly<Record<AudienceContext | "either", string>> = Object.freeze({
  personal: "Personal",
  professional: "Professional",
  either: "Pers & Pro",
});

/** The words for each depth. "Inner Circle", not "Close Circle"; capitalisation as given. */
export const DEPTH_WORDS: Readonly<Record<AudienceDepth, string>> = Object.freeze({
  "close-circle": "Inner Circle",
  "first-degree": "1st Connection",
});

/**
 * The rung CURIE of a placement. Identity on the wire is the CURIE, never the app token.
 *
 * @param p the placement
 * @returns one of the four `t:*Grantee` CURIEs
 */
export function atomicRungTerm(p: AtomicPlacement): string {
  if (p.context === "personal" && p.depth === "close-circle") {
    return "t:PersonalCloseCircleGrantee";
  }
  if (p.context === "professional" && p.depth === "close-circle") {
    return "t:ProfessionalCloseCircleGrantee";
  }
  if (p.context === "personal" && p.depth === "first-degree") {
    return "t:PersonalFirstDegreeGrantee";
  }
  return "t:ProfessionalFirstDegreeGrantee";
}

/**
 * Key for maps and sets: exact equality on both axes.
 *
 * @param p the placement
 * @returns a string unique per (context, depth)
 */
export function placementKey(p: AtomicPlacement): string {
  return `${p.context}\0${p.depth}`;
}

/**
 * True when two placements are the same (context, depth).
 *
 * @param a one placement
 * @param b the other
 */
export function placementsEqual(a: AtomicPlacement, b: AtomicPlacement): boolean {
  return a.context === b.context && a.depth === b.depth;
}

/**
 * The chips to draw for a person's placements. When both depths are stored for a context, only
 * Inner Circle is shown: Inner includes 1st on the wire (the placing app writes both), so 1st stays stored
 * for reach but is not drawn twice.
 *
 * @param placements every atomic placement the holder made for one person
 * @returns the placements to draw, personal first
 */
export function displayPlacements(placements: AtomicPlacement[]): AtomicPlacement[] {
  const contexts: AudienceContext[] = ["personal", "professional"];
  const out: AtomicPlacement[] = [];
  for (const context of contexts) {
    const inCtx = placements.filter((p) => p.context === context);
    if (inCtx.length === 0) continue;
    if (inCtx.some((p) => p.depth === "close-circle")) {
      out.push({ context, depth: "close-circle" });
    } else {
      for (const p of inCtx) out.push(p);
    }
  }
  return out;
}

/**
 * Does membership of the given atomic sets confer a derived either-context union?
 * UNION, never AND: a member qualifies if in EITHER of the same-depth atomic sets.
 *
 * @param member the principal string, compared by exact equality
 * @param sets the holder's stored sets
 * @param union one of {@link DERIVED_UNIONS}
 */
export function qualifiesForDerivedUnion(
  member: string,
  sets: AudienceRungSetRecord[],
  union: (typeof DERIVED_UNIONS)[number],
): boolean {
  for (const atom of union.of) {
    const set = sets.find((s) => s.context === atom.context && s.depth === atom.depth);
    if (set?.members.includes(member)) return true;
  }
  return false;
}
