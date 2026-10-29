// The words made from a rung's own name.
import { describe, expect, it } from "vitest";
import { rungWords } from "./rungs";

describe("rungWords", () => {
  it("makes words from the rung's own name", () => {
    expect(rungWords("public")).toBe("Public");
    expect(rungWords("t:SignedInGrantee")).toBe("Signed in");
    expect(rungWords("t:ProfessionalFirstDegreeGrantee")).toBe("Professional first degree");
    expect(rungWords("public-base")).toBe("Public base");
    expect(rungWords("")).toBe("");
  });
});
