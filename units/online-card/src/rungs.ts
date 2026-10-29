// The words for the rung a field of the online card travelled with.
//
// The rung is the server's (`public`, `t:SignedInGrantee`, `t:ProfessionalFirstDegreeGrantee` ...). It is shown so the holder
// sees WHY a field is on the card at their level. `rungChipWords` is what a person sees: the chip words, one entry per rung the
// platform can serve. `rungWords` makes words from the rung's own name and is kept for callers that still use it.

import { ATOMIC_PLACEMENTS, CONTEXT_WORDS, DEPTH_WORDS, atomicRungTerm, placementLabel, type AudienceDepth } from "@kaigilb/gilbplatformcode-person-connections";

/** "t:ProfessionalFirstDegreeGrantee" -> "Professional first degree"; "public" -> "Public"; "t:SignedInGrantee" -> "Signed in". */
export function rungWords(rung: string): string {
  const r = (rung ?? "").trim();
  if (!r) return "";
  const bare = r.replace(/^t:/, "").replace(/Grantee$/, "");
  const spaced = bare
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The words a person sees for the rung a field of the online card travelled with: the chip words used everywhere else
 * ("Personal Inner Circle", "Professional 1st Connection"), not the platform's rung name. The online-card frame of an app ("Shown
 * to you as", and its tooltip) reads this; no app keeps a word list.
 *
 * Every value the platform's `a:visibilityTier` may carry has words (the platform's rung vocabulary, AUDIENCE_TIER_VALUES:
 * ten values for nine rungs). The four stored placements are the chip's own words (`placementLabel`, middle dot dropped as on
 * the chip); the two either-context rungs use the placement words for them ("Pers & Pro"). Matched by exact equality,
 * never by prefix: `public-base` is not `public`.
 *
 * @param rung the rung exactly as served
 * @returns the chip words; an unknown rung is returned unchanged, so it is never blank
 */
export function rungChipWords(rung: string): string {
  return CHIP_WORDS_BY_RUNG.get(rung) ?? rung;
}

const chip = (context: keyof typeof CONTEXT_WORDS, depth: AudienceDepth): string => `${CONTEXT_WORDS[context]} ${DEPTH_WORDS[depth]}`;

const CHIP_WORDS_BY_RUNG: ReadonlyMap<string, string> = new Map<string, string>([
  ...ATOMIC_PLACEMENTS.map((p): [string, string] => [atomicRungTerm(p), placementLabel(p).replace(" · ", " ")]),
  ["t:EitherContextCloseCircleGrantee", chip("either", "close-circle")],
  ["t:EitherContextFirstDegreeGrantee", chip("either", "first-degree")],
  ["t:SignedInGrantee", "Signed in"],
  ["public", "Public"],
  ["private", "Private"],
  // The legacy list of people the holder named (an older feature). It is no rung of the nine and has no context.
  ["inner-circle", DEPTH_WORDS["close-circle"]],
]);
