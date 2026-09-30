import { describe, expect, it } from "vitest";
import {
  READY_VAULT_PURPOSE_PICKS,
  isChoosableVaultPurposeType,
  isSignInSeatType,
} from "./vaultPurpose";

describe("vault purpose", () => {
  it("offers four shortcuts, and Group is not stored as Group", () => {
    expect(READY_VAULT_PURPOSE_PICKS).toEqual([
      { pickName: "Organization", typeName: "Organization" },
      { pickName: "Group", typeName: "CollectiveAgent" },
      { pickName: "Building", typeName: "Building" },
      { pickName: "Project", typeName: "Project" },
    ]);
  });

  it("recognises the seat by the folded name or by the letters inside the id", () => {
    expect(isSignInSeatType({ typeName: " SignInPod ", id: "" })).toBe(true);
    expect(isSignInSeatType({ typeName: "a:SignInPod", id: "" })).toBe(true);
    expect(isSignInSeatType({ typeName: "a:a:SignInPod", id: "other" })).toBe(false);
    expect(isSignInSeatType({ typeName: "t:SignInPod", id: "other" })).toBe(false);
    expect(
      isSignInSeatType({
        typeName: "Organization",
        id: "https://example.test/base/t/SignInPod",
      }),
    ).toBe(true);
    expect(isSignInSeatType({ typeName: "sign-in-pod", id: "sign-in-pod" })).toBe(false);
  });

  it("keeps only kind type, and never the seat", () => {
    expect(
      isChoosableVaultPurposeType({ typeName: "Organization", id: "org", kind: "type" }),
    ).toBe(true);
    expect(
      isChoosableVaultPurposeType({ typeName: "Organization", id: "org", kind: "Type" }),
    ).toBe(false);
    expect(
      isChoosableVaultPurposeType({ typeName: "SignInPod", id: "x", kind: "type" }),
    ).toBe(false);
  });
});
