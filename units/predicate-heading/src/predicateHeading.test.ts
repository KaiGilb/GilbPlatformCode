import { describe, expect, it } from "vitest";
import { labelForPredicate } from "./predicateHeading";

describe("labelForPredicate", () => {
  it("sentence-cases the local name and does not title-case every word", () => {
    expect(labelForPredicate("a:streetLine")).toBe("Street line");
    expect(labelForPredicate("a:given_name")).toBe("Given name");
    expect(labelForPredicate("street-line")).toBe("Street line");
    expect(labelForPredicate("a:b:c")).toBe("B:c");
    expect(labelForPredicate("URLValue")).toBe("Urlvalue");
    expect(labelForPredicate("a:")).toBe("a:");
    expect(labelForPredicate("   ")).toBe("   ");
    expect(labelForPredicate("I")).toBe("I");
  });
});
