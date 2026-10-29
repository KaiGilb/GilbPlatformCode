// The one-element-array reading and the typed-literal reading each have a test that goes red when the reading is removed.
// One value in an array is that value. A typed `{"@value": x, "@type": t}` is x when x fits the
// field (a whole number for maxCharacters, a boolean for singleScript, a string for textPattern),
// otherwise unreadable. Two or more values, or none, are unreadable.
import { describe, expect, it } from "vitest";
import { masterSource, VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { readTagWriteRule } from "./tagWriteRule";
import { a, CONTEXT, fixtureMaster, ID, RIG, type FixtureMaster } from "../test/support";

const RULE_PATH = "e/tag-string-write-limits";
const RULE_IRI = `${ID}/base/${RULE_PATH}`;
const LIVE = String.raw`^[^@\p{White_Space}\p{C}\p{Default_Ignorable_Code_Point}]{1,64}$`;
const XSD = "http://www.w3.org/2001/XMLSchema#";

function withRecord(pattern: unknown, maxCharacters: unknown, singleScript: unknown): FixtureMaster {
  const m = fixtureMaster();
  m.put("a/tagString", {
    "@context": CONTEXT,
    "@id": a("tagString"),
    "a:predicateAttribute": "a:tagString",
    "a:writeRule": { "@id": RULE_IRI },
  });
  for (const slug of ["writeRule", "textPattern", "maxCharacters", "singleScript", "ruleStatement"]) {
    m.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}` });
  }
  m.put(RULE_PATH, {
    "@context": `${ID}/base/context.jsonld`,
    "@id": RULE_IRI,
    "@type": "t:Rule",
    textPattern: pattern,
    maxCharacters,
    singleScript,
    ruleStatement: "s",
  });
  return m;
}

const read = (pattern: unknown, max: unknown, single: unknown) =>
  readTagWriteRule(masterSource({ vedaOrigin: RIG, fetchImpl: withRecord(pattern, max, single).fetch }));

describe("a one-element array is that one value", () => {
  it("maxCharacters [64] reads as 64", async () => {
    expect((await read(LIVE, [64], true)).maxCharacters).toBe(64);
  });
  it("textPattern [live] reads as the live pattern", async () => {
    expect((await read([LIVE], 64, true)).pattern.source).toBe(LIVE);
  });
  it("singleScript [false] reads as false", async () => {
    expect((await read(LIVE, 64, [false])).singleScript).toBe(false);
  });
  it("maxCharacters [{@value:64}] reads as 64", async () => {
    expect((await read(LIVE, [{ "@value": 64 }], true)).maxCharacters).toBe(64);
  });
  it("an empty array is unreadable", async () => {
    await expect(read(LIVE, [], true)).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });
  it("two values in an array are unreadable, equal or not", async () => {
    await expect(read(LIVE, [64, 64], true)).rejects.toBeInstanceOf(VocabularyUnavailableError);
    await expect(read([LIVE, LIVE], 64, true)).rejects.toBeInstanceOf(VocabularyUnavailableError);
    await expect(read(LIVE, 64, [true, true])).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });
  it("an array inside an array is unreadable", async () => {
    await expect(read(LIVE, [[64]], true)).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });
});

describe("a typed literal is its value when it fits the field, otherwise unreadable", () => {
  it("fits: integer maxCharacters, boolean singleScript, string textPattern", async () => {
    const rule = await read(
      { "@value": LIVE, "@type": `${XSD}string` },
      { "@value": 64, "@type": `${XSD}integer` },
      { "@value": false, "@type": `${XSD}boolean` },
    );
    expect(rule.pattern.source).toBe(LIVE);
    expect(rule.maxCharacters).toBe(64);
    expect(rule.singleScript).toBe(false);
  });
  it("does not fit: a string for maxCharacters or singleScript, a number for textPattern", async () => {
    await expect(read(LIVE, { "@value": "64", "@type": `${XSD}integer` }, true)).rejects.toBeInstanceOf(
      VocabularyUnavailableError,
    );
    await expect(read(LIVE, 64, { "@value": "true", "@type": `${XSD}boolean` })).rejects.toBeInstanceOf(
      VocabularyUnavailableError,
    );
    await expect(read({ "@value": 64, "@type": `${XSD}string` }, 64, true)).rejects.toBeInstanceOf(
      VocabularyUnavailableError,
    );
  });
  it("a typed literal inside a one-element array reads the same", async () => {
    expect((await read(LIVE, [{ "@value": 64, "@type": `${XSD}integer` }], true)).maxCharacters).toBe(64);
  });
});

describe("a non-string @type is unreadable", () => {
  it("an array @type on maxCharacters, textPattern, or singleScript is unreadable (R6-08)", async () => {
    await expect(read(LIVE, { "@value": 64, "@type": [`${XSD}integer`] }, true)).rejects.toBeInstanceOf(
      VocabularyUnavailableError,
    );
    await expect(read(LIVE, { "@value": 64, "@type": ["xsd:integer"] }, true)).rejects.toBeInstanceOf(
      VocabularyUnavailableError,
    );
    await expect(read({ "@value": LIVE, "@type": [`${XSD}string`] }, 64, true)).rejects.toBeInstanceOf(
      VocabularyUnavailableError,
    );
    await expect(read(LIVE, 64, { "@value": true, "@type": [`${XSD}boolean`] })).rejects.toBeInstanceOf(
      VocabularyUnavailableError,
    );
  });

  it("a @type that is a number or an object is unreadable", async () => {
    await expect(read(LIVE, { "@value": 64, "@type": 64 }, true)).rejects.toBeInstanceOf(VocabularyUnavailableError);
    await expect(read(LIVE, { "@value": 64, "@type": { "@id": `${XSD}integer` } }, true)).rejects.toBeInstanceOf(
      VocabularyUnavailableError,
    );
  });

  it("the same array @type inside a one-element array is unreadable", async () => {
    await expect(read(LIVE, [{ "@value": 64, "@type": [`${XSD}integer`] }], true)).rejects.toBeInstanceOf(
      VocabularyUnavailableError,
    );
  });
});

describe("a language tag belongs to a string only", () => {
  it("on a number or a boolean the record is unreadable, bare or inside a one-element array", async () => {
    await expect(read(LIVE, { "@value": 64, "@language": "en" }, true)).rejects.toBeInstanceOf(VocabularyUnavailableError);
    await expect(read(LIVE, 64, { "@value": true, "@language": "en" })).rejects.toBeInstanceOf(VocabularyUnavailableError);
    await expect(read(LIVE, [{ "@value": 64, "@language": "en" }], true)).rejects.toBeInstanceOf(
      VocabularyUnavailableError,
    );
  });
  it("on the string textPattern it is allowed", async () => {
    expect((await read({ "@value": LIVE, "@language": "en" }, 64, true)).pattern.source).toBe(LIVE);
  });
});
