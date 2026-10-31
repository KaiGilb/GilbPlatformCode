import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("names exactly what the README lists", () => {
    expect(Object.keys(unit).sort()).toEqual(["joinPhone", "noAncestry", "readCountryCallingCodes", "useHomeDial"]);
  });
  it("holds none of phone-text's symbols (one symbol, one unit): splitPhone, claim readers and callingCodesOf are imported, not exported", () => {
    for (const k of ["splitPhone", "claimLabeledHome", "claimForPhonePrefill", "callingCodesOf"]) expect(k in unit).toBe(false);
  });
});
