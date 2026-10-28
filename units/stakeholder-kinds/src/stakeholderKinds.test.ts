import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's export list", () => {
  it("is exactly the symbols the Plan card reaches, and the reset of the shared readers", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "CREATE_SHORTCUT_TERM",
        "KIND_SET_CHECK_DELAY_MS",
        "KIND_SET_MAX_AGE_MS",
        "KIND_TYPE_MAX_LENGTH",
        "PREDICATE_TERMS",
        "STAKEHOLDER_ROLE_TERM",
        "createStakeholderKindReader",
        "expandDownIsA",
        "forgetStakeholderKindReaders",
        "kindDescendants",
        "kindLabelOf",
        "readShortcutSpelling",
        "resolvePredicate",
        "settleShortcuts",
        "stakeholderKindReader",
      ].sort(),
    );
  });
  it("the cache constants: a kept set is used 10 minutes without a check, a background check starts 3 seconds after the first answer", () => {
    expect(unit.KIND_SET_MAX_AGE_MS).toBe(600_000);
    expect(unit.KIND_SET_CHECK_DELAY_MS).toBe(3000);
    expect(unit.KIND_TYPE_MAX_LENGTH).toBe(2048);
  });
  it("forgetStakeholderKindReaders empties the one-reader-per-origin-and-role register", () => {
    const origin = "https://ontology.platform.example.test";
    const a = unit.stakeholderKindReader({ vedaOrigin: origin, store: null });
    expect(unit.stakeholderKindReader({ vedaOrigin: origin, store: null })).toBe(a);
    expect(unit.stakeholderKindReader({ vedaOrigin: origin, roleTerm: "t/Other", store: null })).not.toBe(a);
    unit.forgetStakeholderKindReaders();
    expect(unit.stakeholderKindReader({ vedaOrigin: origin, store: null })).not.toBe(a);
    unit.forgetStakeholderKindReaders();
  });
});
