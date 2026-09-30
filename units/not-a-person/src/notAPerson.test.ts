import { describe, expect, it } from "vitest";
import { NOT_A_PERSON_CODE, isNotAPersonError } from "./notAPerson";

describe("isNotAPersonError", () => {
  it("accepts only the public-card name plus the exact code", () => {
    expect(NOT_A_PERSON_CODE).toBe("not_a_person");
    expect(isNotAPersonError({ name: "PublicCardError", code: "not_a_person" })).toBe(true);
    expect(isNotAPersonError({ name: "PublicCardError", code: "not-a-person" })).toBe(false);
    expect(isNotAPersonError({ name: "Error", code: "not_a_person" })).toBe(false);
    expect(isNotAPersonError(new Error("missing"))).toBe(false);
    expect(isNotAPersonError(null)).toBe(false);
    expect(isNotAPersonError(undefined)).toBe(false);
  });
});
