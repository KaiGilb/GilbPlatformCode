// A trailing literal instead of `$` is unreadable.
// Two textPattern values, or two maxCharacters values, are unreadable — never the first.
import { describe, expect, it } from "vitest";
import { masterSource, VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { readTagWriteRule } from "./tagWriteRule";
import { a, CONTEXT, fixtureMaster, ID, RIG, type FixtureMaster } from "../test/support";


const RULE_PATH = "e/tag-string-write-limits";
const RULE_IRI = `${ID}/base/${RULE_PATH}`;

function withRecord(pattern: string, maxCharacters: unknown, singleScript: unknown): FixtureMaster {
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

const LIVE = String.raw`^[^@\p{White_Space}\p{C}\p{Default_Ignorable_Code_Point}]{1,64}$`;
describe("records outside the 27 are unreadable unless they are exactly ^[class]{m,n}$", () => {
  it("a pattern with a trailing literal instead of $ is unreadable", async () => {
    const source = masterSource({ vedaOrigin: RIG, fetchImpl: withRecord("^[^@]{1,64}a", 64, true).fetch });
    await expect(readTagWriteRule(source)).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });
  it("a record with two textPattern values is unreadable (the platform reads it as unreadable)", async () => {
    const source = masterSource({ vedaOrigin: RIG, fetchImpl: withRecord(["^[a-z0-9.]{1,64}$", LIVE] as unknown as string, 64, true).fetch });
    await expect(readTagWriteRule(source)).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });
  it("a record with two maxCharacters values is unreadable (the platform reads it as unreadable)", async () => {
    const source = masterSource({ vedaOrigin: RIG, fetchImpl: withRecord(LIVE, [64, 10], true).fetch });
    await expect(readTagWriteRule(source)).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });
});
