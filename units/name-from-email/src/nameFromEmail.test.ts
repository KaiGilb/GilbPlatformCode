import { describe, expect, it } from "vitest";
import { capitalizeFirst, nameFromEmail } from "./nameFromEmail";

describe("nameFromEmail", () => {
  it("splits a clean pair on dot, underscore, or hyphen", () => {
    expect(nameFromEmail("lars.larson@example.test")).toEqual({ firstName: "Lars", lastName: "Larson" });
    expect(nameFromEmail("lars_larson@example.test")).toEqual({ firstName: "Lars", lastName: "Larson" });
    expect(nameFromEmail("LARS-LARSON@example.test")).toEqual({ firstName: "Lars", lastName: "Larson" });
  });

  it("returns a first name only for one word, and does not invent a last name", () => {
    const named = nameFromEmail("lars@example.test");
    expect(named).toEqual({ firstName: "Lars" });
    expect(named).not.toHaveProperty("lastName");
  });

  it("refuses three pieces, a digit, and a missing address", () => {
    expect(nameFromEmail("lars.b.larson@example.test")).toEqual({});
    expect(nameFromEmail("lars2.larson@example.test")).toEqual({});
    expect(nameFromEmail(undefined)).toEqual({});
    expect(nameFromEmail("@example.test")).toEqual({});
  });
});

describe("capitalizeFirst", () => {
  it("touches only the first character", () => {
    expect(capitalizeFirst("mcLars")).toBe("McLars");
    expect(capitalizeFirst("")).toBe("");
  });
});
