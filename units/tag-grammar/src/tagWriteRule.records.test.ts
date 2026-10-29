// Twenty-seven rule records under the one-class grammar, then nine more and eight more.
// Readable only when the pattern is
// `^[<one character class>]{m,n}$` (`{1,n}` included), it compiles with `u`, and
// maxCharacters is that upper bound, a whole number ≥ 1.
// A single `{"@value": x}`, a one-element array, and a typed `{"@value": x, "@type": t}` are that
// value x (when x fits the field). Two textPattern, maxCharacters or singleScript
// values are unreadable — never the first. `a:ruleStatement` may be absent or empty.
// The same rows, in this order, are the platform's table.
import { describe, expect, it } from "vitest";
import { masterSource, VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { readTagWriteRule } from "./tagWriteRule";
import { a, CONTEXT, fixtureMaster, ID, RIG, type FixtureMaster } from "../test/support";

const P = (q: string) => String.raw`^[^@\p{White_Space}\p{C}\p{Default_Ignorable_Code_Point}]` + q + "$";
const LIVE = P("{1,64}");
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";
const XSD_INTEGER = "http://www.w3.org/2001/XMLSchema#integer";

/** name, pattern, maxCharacters, singleScript, readable, and how `ruleStatement` is stored.
 *  The sixth column omitted means `"s"`. `null` means the key is absent. */
const RECORDS: [string, unknown, unknown, unknown, boolean, (string | null)?][] = [
  ["V01 live", LIVE, 64, true, true],
  ["V02 singleScript false", LIVE, 64, false, true],
  ["V03 loosened ^[^@]{1,64}$", "^[^@]{1,64}$", 64, true, true],
  ["V04 loosened no bound ^[^@]+$", "^[^@]+$", 64, true, false],
  ["V05 stricter ^[a-z0-9.]{1,64}$", "^[a-z0-9.]{1,64}$", 64, true, true],
  ["V06 bigger max 100 consistent", P("{1,100}"), 100, true, true],
  ["V07 smaller max 10 consistent", P("{1,10}"), 10, true, true],
  ["V08 inconsistent {1,64} max 100", LIVE, 100, true, false],
  ["V09 inconsistent {1,64} max 10", LIVE, 10, true, false],
  ["V10 no anchors", LIVE.slice(1, -1), 64, true, false],
  ["V11 only ^ anchor", LIVE.slice(0, -1), 64, true, false],
  ["V12 lookahead stricter (no ..)", String.raw`^(?!.*\.\.)[^@\p{White_Space}\p{C}\p{Default_Ignorable_Code_Point}]{1,64}$`, 64, true, false],
  ["V13 exact {64}", "^[^@]{64}$", 64, true, false],
  ["V14 {0,64}", "^[^@]{0,64}$", 64, true, true],
  ["V15 max 0 {0,0}", "^[^@]{0,0}$", 0, true, false],
  ["V16 max 64.5", LIVE, 64.5, true, false],
  ["V17 max string '64'", LIVE, "64", true, false],
  ["V18 singleScript 'true' string", LIVE, 64, "true", false],
  ["V19 invalid regex", "^[", 64, true, false],
  ["V20 stricter [\\w.\\-]", String.raw`^[\w.\-]{1,64}$`, 64, true, true],
  ["V21 loosened dot ^.{1,64}$", "^.{1,64}$", 64, true, false],
  ["V22 escape atom ^\\S{1,64}$", String.raw`^\S{1,64}$`, 64, true, false],
  ["V23 stricter letters/digits props", String.raw`^[\p{L}\p{N}._-]{1,64}$`, 64, true, true],
  ["V24 class with leading ] ", "^[]a-z.]{1,64}$", 64, true, false],
  ["V25 astral literal atom", "^\u{1F600}{1,64}$", 64, true, false],
  ["V26 {1,} open bound", "^[^@]{1,}$", 64, true, false],
  ["V27 {1,64}? lazy", "^[^@]{1,64}?$", 64, true, false],
  // The next nine. Verdicts: statement optional; one {"@value": x} unwrapped; two values unreadable.
  ["N01 no ruleStatement", LIVE, 64, true, true, null],
  ["N02 empty ruleStatement", LIVE, 64, true, true, ""],
  ["N03 textPattern two values [stricter, live]", ["^[a-z0-9.]{1,64}$", LIVE], 64, true, false],
  ["N04 textPattern two values [live, stricter]", [LIVE, "^[a-z0-9.]{1,64}$"], 64, true, false],
  ["N05 maxCharacters two values [64, 10]", LIVE, [64, 10], true, false],
  ["N06 maxCharacters {@value:64}", LIVE, { "@value": 64 }, true, true],
  ["N07 textPattern {@value:live}", { "@value": LIVE }, 64, true, true],
  ["N08 singleScript {@value:true}", LIVE, 64, { "@value": true }, true],
  ["N16 textPattern {@value, @language}", { "@value": LIVE, "@language": "en" }, 64, true, true],
  // The next eight. One value in an array is that value; a typed literal is its @value when
  // that fits the field; a language tag on a number is unreadable; the bare key beside the `a:` key reaches this client as one array of two.
  ["R4-07 maxCharacters [64] one-element array", LIVE, [64], true, true],
  ["R4-08 textPattern [LIVE] one-element array", [LIVE], 64, true, true],
  ["R4-16 maxCharacters [{@value:64}] array of one wrapped", LIVE, [{ "@value": 64 }], true, true],
  ["R4-15 textPattern {@value, @type xsd:string}", { "@value": LIVE, "@type": XSD_STRING }, 64, true, true],
  ["R4-10 maxCharacters {@value:64, @language:en} (language on a number)", LIVE, { "@value": 64, "@language": "en" }, true, false],
  ["N09 textPattern [live, stricter] (bare key beside a:textPattern)", [LIVE, "^[a-z0-9.]{1,64}$"], 64, true, false],
  ["N09b textPattern [stricter, live] (bare key beside a:textPattern)", ["^[a-z0-9.]{1,64}$", LIVE], 64, true, false],
  ["N09c maxCharacters [64, 10] (bare key beside a:maxCharacters)", LIVE, [64, 10], true, false],
  // The last seven. A value object carries only @value, @language, @type; a @type must be
  // the field's own XSD type. Every one is unreadable, as on the platform.
  ["R5-01 maxCharacters {@value:64, @type xsd:string}", LIVE, { "@value": 64, "@type": XSD_STRING }, true, false],
  ["R5-02 textPattern {@value, @type xsd:integer}", { "@value": LIVE, "@type": XSD_INTEGER }, 64, true, false],
  ["R5-03 singleScript {@value:true, @type xsd:string}", LIVE, 64, { "@value": true, "@type": XSD_STRING }, false],
  ["R5-07 maxCharacters {@value:64, @type xsd:int}", LIVE, { "@value": 64, "@type": "http://www.w3.org/2001/XMLSchema#int" }, true, false],
  ["R5-19 maxCharacters {@value:10, @type xsd:string} with pattern {1,10}", P("{1,10}"), { "@value": 10, "@type": XSD_STRING }, true, false],
  ["R5-09 maxCharacters {@value:64, @index}", LIVE, { "@value": 64, "@index": "x" }, true, false],
  ["R5-15 maxCharacters {@value:64, @direction}", LIVE, { "@value": 64, "@direction": "ltr" }, true, false],
];

const RULE_PATH = "e/tag-string-write-limits";
const RULE_IRI = `${ID}/base/${RULE_PATH}`;

/** One stored value, after taking the one element of a one-element array and unwrapping a single `{"@value": x}`. */
function unwrapped(value: unknown): unknown {
  if (Array.isArray(value) && value.length === 1) return unwrapped(value[0]);
  if (value && typeof value === "object" && !Array.isArray(value) && "@value" in value) {
    return (value as { "@value": unknown })["@value"];
  }
  return value;
}

function withRecord(
  pattern: unknown,
  maxCharacters: unknown,
  singleScript: unknown,
  statement: string | null = "s",
): FixtureMaster {
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
  const record: Record<string, unknown> = {
    "@context": `${ID}/base/context.jsonld`,
    "@id": RULE_IRI,
    "@type": "t:Rule",
    textPattern: pattern,
    maxCharacters,
    singleScript,
  };
  if (statement !== null) record.ruleStatement = statement;
  m.put(RULE_PATH, record);
  return m;
}

describe("one pattern grammar: the 27 records, then nine, eight and seven more", () => {
  it.each(RECORDS)("%s", async (name, pattern, maxCharacters, singleScript, readable, statement) => {
    const source = masterSource({
      vedaOrigin: RIG,
      fetchImpl: withRecord(pattern, maxCharacters, singleScript, statement).fetch,
    });
    if (!readable) {
      await expect(readTagWriteRule(source), name).rejects.toBeInstanceOf(VocabularyUnavailableError);
      return;
    }
    const rule = await readTagWriteRule(source);
    expect(rule.pattern.flags, name).toBe("u");
    expect(rule.pattern.source, name).toBe(unwrapped(pattern));
    expect(rule.maxCharacters, name).toBe(unwrapped(maxCharacters));
    expect(rule.singleScript, name).toBe(unwrapped(singleScript));
    expect(rule.statement, name).toBe(statement === null || statement === "" ? "" : (statement ?? "s"));
  });
});
