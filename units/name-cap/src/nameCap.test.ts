import { describe, expect, it } from "vitest";
import { formatFieldValue } from "./nameCap";

describe("formatFieldValue", () => {
  it("capitalises only the two name types, and only the first code unit", () => {
    expect(formatFieldValue("given-name", "lars")).toBe("Lars");
    expect(formatFieldValue("family-name", "mcLars")).toBe("McLars");
    expect(formatFieldValue("given-name", "école")).toBe("École");
    expect(formatFieldValue("given-name", "")).toBe("");
    expect(formatFieldValue("email", "lars")).toBe("lars");
    expect(formatFieldValue("Given-name", "lars")).toBe("lars");
    expect(formatFieldValue(" given-name", "lars")).toBe("lars");
    expect(formatFieldValue("org", "acme")).toBe("acme");
    const emoji = "\uD83D\uDE00abc";
    expect(formatFieldValue("given-name", emoji)).toBe(emoji);
  });
});
