import { describe, expect, it } from "vitest";
import { displayName, holderAdmittedField } from "./admittedName";

describe("holderAdmittedField", () => {
  it("blocks only the exact true flag", () => {
    expect(holderAdmittedField({ unadmitted: true })).toBe(false);
    expect(holderAdmittedField({})).toBe(true);
    expect(holderAdmittedField({ unadmitted: false as unknown as true })).toBe(true);
  });
});

describe("displayName", () => {
  it("joins the first admitted given name and family name", () => {
    expect(
      displayName([
        { type: "family-name", value: "Gilb" },
        { type: "given-name", value: " Kai " },
        { type: "email", value: "kai@example.test" },
      ]),
    ).toBe("Kai Gilb");
  });

  it("does not fill a blank from a later admitted field, and skips an unadmitted one", () => {
    expect(
      displayName([
        { type: "given-name", value: "   " },
        { type: "given-name", value: "Later" },
        { type: "family-name", value: "Secret", unadmitted: true },
        { type: "family-name", value: "Shown" },
      ]),
    ).toBe("Shown");
    expect(displayName([])).toBe("");
    expect(
      displayName([
        { type: "given-name", value: "Hidden", unadmitted: true },
        { type: "family-name", value: "Hidden", unadmitted: true },
      ]),
    ).toBe("");
  });
});
