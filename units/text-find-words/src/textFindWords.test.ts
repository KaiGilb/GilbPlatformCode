import { describe, expect, it } from "vitest";
import {
  SEARCH_PAGE_SIZE_DISCLOSED,
  TEXT_FIND_MIN_QUERY,
  textFindReachClause,
  textFindResultSentence,
  type TextFindNouns,
} from "./textFindWords";

const rule: TextFindNouns = {
  unitLabelLower: "rule",
  unitPlural: "rules",
  unitPluralCapitalised: "Rules",
  bodyAttr: "ruleStatement",
};

describe("textFindReachClause", () => {
  it("names the attribute, the page, and the minimum letters", () => {
    const sentence = textFindReachClause(rule);
    expect(sentence).toBe(
      "It also asks this vault to find your words INSIDE rule text " +
        "(a:ruleStatement) and lists the matching rules below, each named by " +
        "its own tag. That half searches only the vault on screen — not the sub-vaults the list " +
        "above reaches — matches from the START of a word, so “qualit” finds “qualities” (⛔ but " +
        "no word ENDS your letters: “ities” will not find “qualities”), and " +
        "shows the rules inside the one page of 20 " +
        "top-ranked matches the vault returns for records of every kind. It asks once you have " +
        "typed 2 letters and stopped for a moment.",
    );
    expect(sentence).toContain(String(SEARCH_PAGE_SIZE_DISCLOSED));
    expect(sentence).toContain(String(TEXT_FIND_MIN_QUERY));
    expect(sentence).not.toContain("300");
    expect(sentence).not.toContain("does not exist");
  });
});

describe("textFindResultSentence", () => {
  it("uses the absence sentence only for an exact zero, or for no total and zero returned", () => {
    const absence = textFindResultSentence({
      family: rule,
      hits: 4,
      totalMatches: { kind: "exact", value: 0 },
      returned: 5,
      query: "qual",
    });
    expect(absence).toBe(
      "The vault found nothing matching “qual” in the vault on screen. That means nothing " +
        "matched what was searched — it does not mean no such rule exists: a rule in a " +
        "sub-vault, in a vault you are not reading, or spelled differently would not be found here.",
    );
    expect(
      textFindResultSentence({
        family: rule,
        hits: 0,
        totalMatches: null,
        returned: 0,
        query: "qual",
      }),
    ).toBe(absence);
    expect(
      textFindResultSentence({
        family: rule,
        hits: 0,
        totalMatches: undefined,
        returned: 0,
        query: "qual",
      }),
    ).toBe(absence);
  });

  it("does not treat a bound or an estimate of zero as absence", () => {
    const bound = textFindResultSentence({
      family: rule,
      hits: 0,
      totalMatches: { kind: "atLeast", value: 0 },
      returned: 0,
      query: "qual",
    });
    expect(bound.startsWith("The vault found nothing")).toBe(false);
    expect(bound).toContain("more than 0 matches");
    const estimate = textFindResultSentence({
      family: rule,
      hits: 0,
      totalMatches: { kind: "approximate", value: 0 },
      returned: 0,
      query: "qual",
    });
    expect(estimate).toContain("about 0 matches");
  });

  it("says none of the page is this family when a total is missing and something was returned", () => {
    expect(
      textFindResultSentence({
        family: rule,
        hits: 0,
        totalMatches: null,
        returned: 3,
        query: "qual",
      }),
    ).toBe(
      "The vault returned the top 3 matches for “qual” across records of every " +
        "kind and did not report a total; none of those 3 is a rule. A rule that " +
        "ranked below them would not appear here — this is not a claim that no rule matches.",
    );
  });

  it("lowers the capitalised plural only on the no-total sentence that has hits", () => {
    expect(
      textFindResultSentence({
        family: rule,
        hits: 1,
        totalMatches: null,
        returned: 3,
        query: "qual",
      }),
    ).toContain("Showing 1 rule from the top 3 matches");
    expect(
      textFindResultSentence({
        family: { ...rule, unitPluralCapitalised: "RULES" },
        hits: 2,
        totalMatches: null,
        returned: 3,
        query: "qual",
      }),
    ).toContain("so rules ranked below the top 3 may exist");
  });

  it("uses a singular match only for an exact one, and always says matches when more is hidden", () => {
    expect(
      textFindResultSentence({
        family: rule,
        hits: 0,
        totalMatches: { kind: "exact", value: 1 },
        returned: 1,
        query: "qual",
      }),
    ).toContain("ranked 1 match for");
    expect(
      textFindResultSentence({
        family: rule,
        hits: 0,
        totalMatches: { kind: "atLeast", value: 1 },
        returned: 1,
        query: "qual",
      }),
    ).toContain("ranked more than 1 matches for");
    expect(
      textFindResultSentence({
        family: rule,
        hits: 2,
        totalMatches: { kind: "exact", value: 5 },
        returned: 5,
        query: "qual",
      }),
    ).toBe(
      "Showing 2 rules from the 5 matches the vault ranked for “qual” across records of every kind.",
    );
    expect(
      textFindResultSentence({
        family: rule,
        hits: 1,
        totalMatches: { kind: "exact", value: 1 },
        returned: 1,
        query: "qual",
      }),
    ).toBe(
      "Showing 1 rule from the 1 match the vault ranked for “qual” across records of every kind.",
    );
    const truncated = textFindResultSentence({
      family: rule,
      hits: 2,
      totalMatches: { kind: "exact", value: 5 },
      returned: 3,
      query: "qual",
    });
    expect(truncated).toContain("of 5 matches the vault ranked");
    expect(truncated).toContain("Rules ranked below the top 3 are not shown.");
    const boundFullPage = textFindResultSentence({
      family: rule,
      hits: 2,
      totalMatches: { kind: "atLeast", value: 5 },
      returned: 5,
      query: "qual",
    });
    expect(boundFullPage).toContain("of more than 5 matches");
    expect(boundFullPage).toContain("Rules ranked below");
  });

  it("does not warn when an exact total is not larger than the page, even if it is smaller", () => {
    expect(
      textFindResultSentence({
        family: rule,
        hits: 2,
        totalMatches: { kind: "exact", value: 4 },
        returned: 5,
        query: "qual",
      }),
    ).toBe(
      "Showing 2 rules from the 4 matches the vault ranked for “qual” across records of every kind.",
    );
  });

  it("inserts the query as given, including a curly quote", () => {
    expect(
      textFindResultSentence({
        family: rule,
        hits: 0,
        totalMatches: { kind: "exact", value: 0 },
        returned: 0,
        query: "qu“al",
      }),
    ).toContain("“qu“al”");
  });
});
