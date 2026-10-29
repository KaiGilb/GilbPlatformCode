import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's export list", () => {
  it("is the grammar, the write rule and the resolver, and nothing else", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "TAG_GRAMMAR_TERMS",
        "TAG_SEGMENT_LABEL",
        "TAG_STANDARD_TERM",
        "TagGrammarUnreadableError",
        "TagRefusedError",
        "TagStringRefusedError",
        "VAULT_NAME_SEGMENT_LABEL",
        "assertTagString",
        "checkNewTagString",
        "effectiveTagMax",
        "formatFullTag",
        "formatShortTag",
        "formatTag",
        "grammarFromRecord",
        "isTagWriteRefusal",
        "lookupTagString",
        "normalizeTag",
        "parseFullTag",
        "parseTag",
        "readTagGrammar",
        "readTagWriteRule",
        "resolveTag",
        "tagRefusalSentence",
      ].sort(),
    );
  });
});
