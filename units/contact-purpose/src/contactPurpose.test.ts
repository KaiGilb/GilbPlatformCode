import { describe, expect, it } from "vitest";
import { purposeFromSlot, vcardPurposeType } from "./contactPurpose";

describe("purposeFromSlot", () => {
  it("maps the four email slots and nothing else", () => {
    expect(purposeFromSlot("email")).toBe("Work");
    expect(purposeFromSlot("hasEmail")).toBe("Work");
    expect(purposeFromSlot(" email ")).toBe("Work");
    expect(purposeFromSlot("emailPrivate")).toBe("Private");
    expect(purposeFromSlot("hasEmailPrivate")).toBe("Private");
    expect(purposeFromSlot("Email")).toBeNull();
    expect(purposeFromSlot("phone")).toBeNull();
    expect(purposeFromSlot("tel")).toBeNull();
    expect(purposeFromSlot("")).toBeNull();
    expect(purposeFromSlot("   ")).toBeNull();
    expect(purposeFromSlot(null)).toBeNull();
    expect(purposeFromSlot(undefined)).toBeNull();
  });
});

describe("vcardPurposeType", () => {
  it("uses HOME for Private and never invents a token", () => {
    expect(vcardPurposeType("Work")).toBe("WORK");
    expect(vcardPurposeType("Private")).toBe("HOME");
    expect(vcardPurposeType(null)).toBeNull();
  });
});
