// New. Pins the export list of the package, so an export added or dropped by a later change is a decision and not an accident.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("vault-profile-photo exports", () => {
  it("are exactly these", () => {
    expect(Object.keys(unit).sort()).toEqual([
      "PROFILE_POINTER_ATTR",
      "announceSelfCardMade",
      "discoverVaultProfilePhoto",
      "ensureSelfCardRecord",
      "ensureVaultSelfCard",
      "loadPhotoObjectUrl",
      "onSelfCardMade",
      "peekCachedProfilePhoto",
      "vaultRootOf",
    ]);
  });
  it("the functions are functions", () => {
    for (const n of ["discoverVaultProfilePhoto", "ensureVaultSelfCard", "loadPhotoObjectUrl", "peekCachedProfilePhoto", "vaultRootOf", "announceSelfCardMade", "onSelfCardMade", "ensureSelfCardRecord"] as const) expect(typeof unit[n]).toBe("function");
  });
});
