import { describe, expect, it } from "vitest";
import { LANGUAGE_ACTIVITIES, activityPhrase } from "./activityPhrase";

describe("activityPhrase", () => {
  it("lowers only the first letter of the last label", () => {
    expect(activityPhrase(["Speak or sign", "Write"])).toBe("Speak or sign and write");
    expect(activityPhrase(["Read", "Write", "XML"])).toBe("Read, Write and xML");
    expect(activityPhrase(["Read"])).toBe("Read");
    expect(activityPhrase([])).toBe("");
    expect(activityPhrase(["", "  ", "Write"])).toBe("Write");
  });

  it("does not trim a label it keeps", () => {
    expect(activityPhrase(["  Read  "])).toBe("  Read  ");
    expect(activityPhrase([" Read ", " Write "])).toBe(" Read  and  Write ");
  });

  it("keeps the four stored terms separate from the words", () => {
    expect(LANGUAGE_ACTIVITIES.map((row) => row.id)).toEqual([
      "t:SpeakOrSignLanguage",
      "t:UnderstandSpokenOrSignedLanguage",
      "t:ReadLanguage",
      "t:WriteLanguage",
    ]);
    expect(activityPhrase(LANGUAGE_ACTIVITIES.map((row) => row.label))).toBe(
      "Speak or sign, Understand, Read and write",
    );
  });
});
