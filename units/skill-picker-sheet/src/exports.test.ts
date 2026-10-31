import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("names exactly what the README lists", () => {
    expect(Object.keys(unit).sort()).toEqual([
      "SKILL_SEARCH_DEBOUNCE_MS",
      "SKILL_SEARCH_LIST_CHARS",
      "SKILL_SEARCH_MIN_CHARS",
      "SKILL_SEARCH_RESULT_CAP",
      "SkillDepthNote",
      "SkillPickerSheet",
      "SkillSearchError",
      "searchSkillsRemote",
      "vedaVaultId",
    ]);
  });
  it("holds none of contact-rows' symbols (one symbol, one unit): ThinSkill and skillReferentUri are imported, not exported", () => {
    expect("skillReferentUri" in unit).toBe(false);
    expect("ThinSkill" in unit).toBe(false);
  });
});
