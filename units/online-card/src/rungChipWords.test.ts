// "Shown to you as" uses the chip words. Every value the platform's `a:visibilityTier` may carry has words here; anything else is shown
// as its term, unchanged, never blank.
import { describe, expect, it } from "vitest";
import { ATOMIC_PLACEMENTS, atomicRungTerm, placementLabel } from "@kaigilb/gilbplatformcode-person-connections";
import { rungChipWords } from "./rungs";

describe("rungChipWords", () => {
  it("gives the chip words for every rung the platform can serve", () => {
    expect(rungChipWords("t:PersonalCloseCircleGrantee")).toBe("Personal Inner Circle");
    expect(rungChipWords("t:ProfessionalCloseCircleGrantee")).toBe("Professional Inner Circle");
    expect(rungChipWords("t:PersonalFirstDegreeGrantee")).toBe("Personal 1st Connection");
    expect(rungChipWords("t:ProfessionalFirstDegreeGrantee")).toBe("Professional 1st Connection");
    expect(rungChipWords("t:EitherContextCloseCircleGrantee")).toBe("Pers & Pro Inner Circle");
    expect(rungChipWords("t:EitherContextFirstDegreeGrantee")).toBe("Pers & Pro 1st Connection");
    expect(rungChipWords("t:SignedInGrantee")).toBe("Signed in");
    expect(rungChipWords("public")).toBe("Public");
    expect(rungChipWords("private")).toBe("Private");
    expect(rungChipWords("inner-circle")).toBe("Inner Circle");
  });

  it("is the placement chip's own words for the four stored placements (one mapping, not a second list)", () => {
    for (const p of ATOMIC_PLACEMENTS) {
      expect(rungChipWords(atomicRungTerm(p))).toBe(placementLabel(p).replace(" · ", " "));
    }
  });

  it("shows an unknown rung as its term, unchanged and never blank", () => {
    expect(rungChipWords("t:SomeFutureGrantee")).toBe("t:SomeFutureGrantee");
    expect(rungChipWords("public-base")).toBe("public-base");
    expect(rungChipWords("Public")).toBe("Public");
    expect(rungChipWords(" t:PersonalCloseCircleGrantee")).toBe(" t:PersonalCloseCircleGrantee");
  });

  it("matches by exact equality, never by prefix (public-base is not public)", () => {
    expect(rungChipWords("public-base")).not.toBe("Public");
    expect(rungChipWords("t:SignedInGranteeX")).toBe("t:SignedInGranteeX");
  });
});
