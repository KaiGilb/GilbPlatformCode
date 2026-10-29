// Pins for the exports the ported tests do not reach: the constants, `grammarFromRecord`, the refusal vocabulary, the maximum, the errors, and the
// text that is not text. Over a fake source and a hand-made record, no network.
import { describe, expect, it } from "vitest";
import { masterSource, VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import {
  assertTagString,
  checkNewTagString,
  effectiveTagMax,
  formatFullTag,
  formatTag,
  grammarFromRecord,
  isTagWriteRefusal,
  parseFullTag,
  parseTag,
  readTagGrammar,
  TAG_GRAMMAR_TERMS,
  TAG_SEGMENT_LABEL,
  TAG_STANDARD_TERM,
  TagGrammarUnreadableError,
  TagRefusedError,
  TagStringRefusedError,
  tagRefusalSentence,
  VAULT_NAME_SEGMENT_LABEL,
  type TagGrammar,
  type TagWriteRule,
} from "./index";
import { fixtureMaster, RIG } from "../test/support";
import { servedTagStandard, withTagStandard } from "../test/tagStandard";

const SPELLINGS = { segments: ["segments"], separator: ["separator"] } as const;
const grammar = (): TagGrammar => grammarFromRecord(servedTagStandard(), SPELLINGS, "https://fallback.example.test/e/x");

describe("the constants", () => {
  it("name the record, its two facts and the two segment labels", () => {
    expect(TAG_STANDARD_TERM).toBe("e/tag-standard-full-tag-at-vault");
    expect(TAG_GRAMMAR_TERMS).toEqual({ segments: "a/segments", separator: "a/separator" });
    expect(TAG_SEGMENT_LABEL).toBe("tag");
    expect(VAULT_NAME_SEGMENT_LABEL).toBe("vault-name");
  });
});

describe("grammarFromRecord", () => {
  it("builds the grammar from a served record and the spellings of its two facts", () => {
    const g = grammar();
    expect(g.separator).toBe("@");
    expect(g.segments.map((s) => s.label)).toEqual(["lead", "tag", "vault-name"]);
    expect(g.tag).toBe(g.segments[1]);
    expect(g.vaultName).toBe(g.segments[2]);
  });

  it("sorts the segments by position", () => {
    const served = servedTagStandard();
    const g = grammarFromRecord({ ...served, segments: [...served.segments].reverse() }, SPELLINGS, "x");
    expect(g.segments.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it("uses the record's own @id, and the fallback only when the record has none", () => {
    expect(grammar().standard).toBe(servedTagStandard()["@id"]);
    const { "@id": _id, ...noId } = servedTagStandard();
    expect(grammarFromRecord(noId, SPELLINGS, "https://fallback.example.test/e/x").standard).toBe("https://fallback.example.test/e/x");
  });

  it("reads the first spelling present, not both", () => {
    const served = servedTagStandard();
    const g = grammarFromRecord(
      { "@id": served["@id"], "a:segments": served.segments, "a:separator": served.separator },
      { segments: ["segments", "a:segments"], separator: ["separator", "a:separator"] },
      "x",
    );
    expect(g.segments).toHaveLength(3);
  });

  it("refuses a record whose separator is not one non-empty text", () => {
    const served = servedTagStandard();
    expect(() => grammarFromRecord({ ...served, separator: ["@", "#"] }, SPELLINGS, "x")).toThrow(TagGrammarUnreadableError);
    expect(() => grammarFromRecord({ ...served, separator: 7 }, SPELLINGS, "x")).toThrow(TagGrammarUnreadableError);
  });

  it("refuses a segment that is not an object, has no whole-number position, no label or a pattern that is not text", () => {
    const served = servedTagStandard();
    const withSegment = (s: unknown) => () => grammarFromRecord({ ...served, segments: [s, served.segments[1], served.segments[2]] }, SPELLINGS, "x");
    expect(withSegment(null)).toThrow(/not an object/);
    expect(withSegment({ label: "lead", position: 0.5 })).toThrow(/whole-number position/);
    expect(withSegment({ label: "lead", position: -1 })).toThrow(/whole-number position/);
    expect(withSegment({ position: 0 })).toThrow(/no label/);
    expect(withSegment({ label: "lead", position: 0, cardinality: "?", pattern: 5 })).toThrow(/not text/);
  });

  it("a segment with an empty pattern or none has no pattern", () => {
    const served = servedTagStandard();
    const g = grammarFromRecord(
      { ...served, segments: [{ ...served.segments[0], pattern: "" }, { label: "tag", position: 1 }, served.segments[2]] },
      SPELLINGS,
      "x",
    );
    expect(g.segments[0]!.pattern).toBeNull();
    expect(g.tag.pattern).toBeNull();
  });

  it("the unreadable error is a vocabulary error, so a caller that waits on 'not known yet' catches it", () => {
    const err = new TagGrammarUnreadableError("m");
    expect(err).toBeInstanceOf(VocabularyUnavailableError);
    expect(err.name).toBe("TagGrammarUnreadableError");
  });
});

describe("readTagGrammar", () => {
  it("reads the record at a term the caller names", async () => {
    const m = withTagStandard(fixtureMaster());
    m.put("e/other-standard", servedTagStandard());
    const g = await readTagGrammar(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }), { standardTerm: "e/other-standard" });
    expect(g.segments).toHaveLength(3);
    expect(m.requested).toContain(`${RIG}/base/e/other-standard`);
    expect(m.requested).not.toContain(`${RIG}/base/e/tag-standard-full-tag-at-vault`);
  });
});

describe("formatFullTag does not emit text that parses back to something else", () => {
  it("a multi-character separator that a tag can half-hold is refused, not emitted", () => {
    const served = servedTagStandard();
    const g = grammarFromRecord(
      {
        ...served,
        separator: "##",
        segments: [
          { cardinality: "?", label: "lead", pattern: "^$", position: 0 },
          { label: "tag", pattern: ".+", position: 1 },
          { label: "vault-name", pattern: ".+", position: 2 },
        ],
      },
      SPELLINGS,
      "x",
    );
    expect(formatFullTag({ tag: "x", vaultName: "y" }, g)).toBe("##x##y");
    // "##x###y" splits as ["", "x", "#y"]: the vault name would come back as "#y".
    expect(() => formatFullTag({ tag: "x#", vaultName: "y" }, g)).toThrow(TagRefusedError);
  });
});

describe("text that is not text", () => {
  it("parseFullTag and parseTag answer not-text, and ask nothing of the grammar", () => {
    const g = grammar();
    expect(parseFullTag(7 as unknown as string, g)).toEqual({ ok: false, reason: "not-text" });
    expect(parseTag(null as unknown as string, g, { ownVaultName: "home" })).toEqual({ ok: false, reason: "not-text" });
  });

  it("TagRefusedError carries its reason and its name", () => {
    const err = (() => {
      try {
        assertTagString(5, grammar());
      } catch (e) {
        return e as TagRefusedError;
      }
      throw new Error("not thrown");
    })();
    expect(err).toBeInstanceOf(TagRefusedError);
    expect(err.reason).toBe("not-text");
    expect(err.name).toBe("TagRefusedError");
  });

  it("formatTag of the holder's own vault with no vault name known (null) is the full form", () => {
    expect(formatTag({ tag: "ann", vaultName: "home" }, grammar(), { ownVaultName: null })).toBe("@ann@home");
  });
});

describe("the write rule's vocabulary", () => {
  const rule = (maxCharacters: number): TagWriteRule => ({
    iri: "https://ontology.platform.example.test/base/e/rule",
    pattern: /^.{1,200}$/u,
    maxCharacters,
    singleScript: true,
    statement: "",
  });

  it("isTagWriteRefusal is true for the seven reasons and false for anything else", () => {
    for (const r of ["empty", "at-sign", "white-space", "invisible-or-control", "too-long", "not-allowed", "mixed-script"]) expect(isTagWriteRefusal(r), r).toBe(true);
    for (const r of ["", "Empty", "other", null, undefined, 7, {}]) expect(isTagWriteRefusal(r), String(r)).toBe(false);
  });

  it("effectiveTagMax is the smaller of 64 and the record's number", () => {
    expect(effectiveTagMax(10)).toBe(10);
    expect(effectiveTagMax(64)).toBe(64);
    expect(effectiveTagMax(65)).toBe(64);
    expect(effectiveTagMax(1000)).toBe(64);
  });

  it("checkNewTagString counts characters, not UTF-16 units, against the effective maximum", () => {
    expect(checkNewTagString("😀".repeat(3), rule(3))).toEqual({ ok: true, tag: "😀😀😀" });
    expect(checkNewTagString("😀".repeat(4), rule(3))).toEqual({ ok: false, reason: "too-long" });
  });

  it("checkNewTagString allows the Japanese and Korean script mixes and refuses a Latin and Cyrillic mix, on every call", () => {
    for (let i = 0; i < 2; i++) {
      expect(checkNewTagString("東京タワー", rule(64)).ok).toBe(true);
      expect(checkNewTagString("서울特別市", rule(64)).ok).toBe(true);
      expect(checkNewTagString("annгилб", rule(64))).toEqual({ ok: false, reason: "mixed-script" });
    }
  });

  it("checkNewTagString normalises first: NFC, then trim", () => {
    expect(checkNewTagString("  José  ", rule(64))).toEqual({ ok: true, tag: "José" });
  });

  it("a TagStringRefusedError carries the reason, the rule and the number, and its message is the sentence", () => {
    const err = new TagStringRefusedError("too-long", "https://ontology.platform.example.test/base/e/rule", 12);
    expect(err.name).toBe("TagStringRefusedError");
    expect(err.reason).toBe("too-long");
    expect(err.rule).toBe("https://ontology.platform.example.test/base/e/rule");
    expect(err.maxCharacters).toBe(12);
    expect(err.message).toBe("A tag can be at most 12 characters.");
    expect(new TagStringRefusedError("empty", "r").maxCharacters).toBeUndefined();
  });

  it("tagRefusalSentence for a rule shows min(64, the rule's number); for a bare number, the number", () => {
    expect(tagRefusalSentence("too-long", rule(100))).toBe("A tag can be at most 64 characters.");
    expect(tagRefusalSentence("too-long", rule(20))).toBe("A tag can be at most 20 characters.");
    expect(tagRefusalSentence("too-long", 100)).toBe("A tag can be at most 100 characters.");
    expect(tagRefusalSentence("not-allowed")).toBe("This tag is not allowed by the tag rule.");
  });
});
