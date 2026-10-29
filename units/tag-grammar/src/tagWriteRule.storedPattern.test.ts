// A stricter stored pattern is applied on top of the floor. Removing the pattern check lets "Ann" through.
import { describe, expect, it } from "vitest";
import { checkNewTagString, type TagWriteRule } from "./index";

const base: TagWriteRule = {
  iri: "https://ontology.platform.example.test/base/e/tag-string-write-limits",
  pattern: new RegExp(String.raw`^[^@\p{White_Space}\p{C}\p{Default_Ignorable_Code_Point}]{1,64}$`, "u"),
  maxCharacters: 64,
  singleScript: true,
  statement: "s",
};

describe("the stored pattern is used", () => {
  it("a stricter stored pattern (lower case only) refuses Ann", () => {
    const strict = { ...base, pattern: /^[a-z.]{1,64}$/u };
    expect(checkNewTagString("Ann", strict).ok).toBe(false);
    expect(checkNewTagString("ann", strict).ok).toBe(true);
  });
});
