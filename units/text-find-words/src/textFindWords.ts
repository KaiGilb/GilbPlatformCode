/**
 * The two sentences under an inside-text find.
 *
 * The number phrasing is a private copy of units/result-total (`provesEmpty` and
 * `formatResultTotal`). Keep them in agreement. This unit does not read a response body.
 */

/** Printed in the reach sentence. Not an argument. */
export const SEARCH_PAGE_SIZE_DISCLOSED = 20;

/** Printed in the reach sentence. Not an argument. */
export const TEXT_FIND_MIN_QUERY = 2;

/** The nouns and the attribute name the sentences actually read. */
export interface TextFindNouns {
  /** Singular, already lower case, as in "rule". */
  unitLabelLower: string;
  /** Plural, as in "rules". */
  unitPlural: string;
  /**
   * Plural with the capital the no-total sentence will lower, and the truncation
   * sentence will keep. As in "Rules".
   */
  unitPluralCapitalised: string;
  /** The attribute the reach sentence names, without the `a:` prefix. As in "ruleStatement". */
  bodyAttr: string;
}

export type TextFindTotalKind = "exact" | "atLeast" | "approximate";

/**
 * A disclosed total. Read `kind` before `value`.
 * `exact` 0 is the only total that licenses "found nothing".
 */
export interface TextFindTotal {
  kind: TextFindTotalKind;
  value: number;
}

function provesEmpty(total: TextFindTotal | null | undefined): boolean {
  return total != null && total.kind === "exact" && total.value === 0;
}

function formatResultTotal(total: TextFindTotal | null | undefined): string | null {
  if (total == null) return null;
  const n = total.value.toLocaleString();
  switch (total.kind) {
    case "exact":
      return n;
    case "atLeast":
      return `more than ${n}`;
    case "approximate":
      return `about ${n}`;
  }
}

/**
 * The inside-text half of the reach statement.
 * The page size and the minimum letters are the constants above. They are not parameters.
 */
export function textFindReachClause(family: TextFindNouns): string {
  return (
    `It also asks this vault to find your words INSIDE ${family.unitLabelLower} text ` +
    `(a:${family.bodyAttr}) and lists the matching ${family.unitPlural} below, each named by ` +
    `its own tag. That half searches only the vault on screen — not the sub-vaults the list ` +
    `above reaches — matches from the START of a word, so “qualit” finds “qualities” (⛔ but ` +
    `no word ENDS your letters: “ities” will not find “qualities”), and ` +
    `shows the ${family.unitPlural} inside the one page of ${SEARCH_PAGE_SIZE_DISCLOSED} ` +
    `top-ranked matches the vault returns for records of every kind. It asks once you have ` +
    `typed ${TEXT_FIND_MIN_QUERY} letters and stopped for a moment.`
  );
}

/**
 * The sentence under the hits.
 * Never says a record of this family does not exist.
 * `query` is inserted as given. This function does not trim it.
 */
export function textFindResultSentence({
  family,
  hits,
  totalMatches,
  returned,
  query,
}: {
  family: TextFindNouns;
  hits: number;
  totalMatches: TextFindTotal | null | undefined;
  returned: number;
  query: string;
}): string {
  const one = family.unitLabelLower;
  const totalPhrase = formatResultTotal(totalMatches);
  const rankedNothing = provesEmpty(totalMatches) || (totalPhrase === null && returned === 0);
  if (rankedNothing) {
    return (
      `The vault found nothing matching “${query}” in the vault on screen. That means nothing ` +
      `matched what was searched — it does not mean no such ${one} exists: a ${one} in a ` +
      `sub-vault, in a vault you are not reading, or spelled differently would not be found here.`
    );
  }
  if (totalPhrase === null || totalMatches == null) {
    return hits === 0
      ? `The vault returned the top ${returned} matches for “${query}” across records of every ` +
        `kind and did not report a total; none of those ${returned} is a ${one}. A ${one} that ` +
        `ranked below them would not appear here — this is not a claim that no ${one} matches.`
      : `Showing ${hits} ${hits === 1 ? one : family.unitPlural} from the top ${returned} matches ` +
        `the vault ranked for “${query}” across records of every kind. The vault did not report a ` +
        `total, so ${family.unitPluralCapitalised.toLowerCase()} ranked below the top ${returned} ` +
        `may exist and are not shown.`;
  }
  const isCensus = totalMatches.kind === "exact";
  if (hits === 0) {
    return (
      `The vault ranked ${totalPhrase} match${isCensus && totalMatches.value === 1 ? "" : "es"} for “${query}” ` +
      `across records of every kind and returned the top ${returned}; none of those ${returned} ` +
      `is a ${one}. A ${one} that ranked below them would not appear here — this is not a claim ` +
      `that no ${one} matches.`
    );
  }
  const shown = `Showing ${hits} ${hits === 1 ? one : family.unitPlural}`;
  const moreBelow = !isCensus || totalMatches.value > returned;
  return moreBelow
    ? `${shown} from the top ${returned} of ${totalPhrase} matches the vault ranked for “${query}” across records of every kind. ${family.unitPluralCapitalised} ranked below the top ${returned} are not shown.`
    : `${shown} from the ${totalPhrase} match${totalMatches.value === 1 ? "" : "es"} the vault ranked for “${query}” across records of every kind.`;
}
