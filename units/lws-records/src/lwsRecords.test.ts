// New. Pins the export list of the package, so an export added or dropped by a later change is a decision and not an accident.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("lws-records exports", () => {
  it("are exactly these", () => {
    expect(Object.keys(unit).sort()).toEqual([
      "NO_REASON_TAIL",
      "RecordConflictError",
      "RecordForbiddenError",
      "ServedLinkUnreadableError",
      "ServedShortFormError",
      "VAULT_CONTEXT_READ_MS",
      "VAULT_CONTEXT_RETRY_MS",
      "carriesReason",
      "createRecord",
      "factsAsServed",
      "hasSubstitutedType",
      "isFactStringFaithful",
      "loadVaultContext",
      "namesNoStoredFact",
      "omittableAssembledKeys",
      "parseServerErrorBody",
      "parseVaultContext",
      "parseVaultPrefixes",
      "patchRecord",
      "readRecord",
      "readVaultContext",
      "recordFromServed",
      "resetStoredSpellingCache",
      "resetVaultContextCache",
      "resolveStoredSpellings",
      "serverErrorText",
      "serverReasonOrNull",
      "storedSpellingFor",
      "storedSpellings",
      "vaultContextUrl",
      "writeSource",
    ]);
  });
  it("the symbols the later units need are functions or classes", () => {
    for (const name of ["readRecord", "patchRecord", "createRecord", "hasSubstitutedType", "factsAsServed", "writeSource"] as const) expect(typeof unit[name]).toBe("function");
    expect(new unit.RecordConflictError()).toBeInstanceOf(Error);
    expect(new unit.RecordForbiddenError()).toBeInstanceOf(Error);
    expect(new unit.ServedShortFormError("fvParent", "base:e/x")).toBeInstanceOf(Error);
    expect(new unit.ServedLinkUnreadableError("fvParent", "https://x.example.test/")).toBeInstanceOf(Error);
  });
});
