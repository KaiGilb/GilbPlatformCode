// Tag-string write limits. The pattern lives on the fixture record, not in src/. The 54 known answers are the reference checker's
// (`test/tagWriteRule.cases.json`).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { masterSource, VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { formatFullTag, readTagGrammar } from "./tag";
import { checkNewTagString, readTagWriteRule, tagRefusalSentence, type TagWriteRule } from "./tagWriteRule";
import { a, CONTEXT, fixtureMaster, ID, RIG, type FixtureMaster } from "../test/support";
import { withTagStandard } from "../test/tagStandard";

const TEXT_PATTERN = String.raw`^[^@\p{White_Space}\p{C}\p{Default_Ignorable_Code_Point}]{1,64}$`;
const RULE_PATH = "e/tag-string-write-limits";
const RULE_IRI = `${ID}/base/${RULE_PATH}`;
const STATEMENT = "A new tag string must pass the write limits.";

const KNOWN: [string, string | null][] = JSON.parse(
  readFileSync(new URL("../test/tagWriteRule.cases.json", import.meta.url), "utf8"),
);

/** The rule record and the terms it is read through, in the shapes the master serves:
 *  attribute terms keep `a:` keys; the rule entity is framed (bare keys). */
function withWriteRule(
  m: FixtureMaster,
  over: { pattern?: string; maxCharacters?: number; singleScript?: boolean; statement?: string; framed?: boolean } = {},
): FixtureMaster {
  const pattern = over.pattern ?? TEXT_PATTERN;
  const maxCharacters = over.maxCharacters ?? 64;
  const singleScript = over.singleScript ?? true;
  const statement = over.statement ?? STATEMENT;
  const framed = over.framed ?? true;
  m.put("a/tagString", {
    "@context": CONTEXT,
    "@id": a("tagString"),
    "a:predicateAttribute": "a:tagString",
    "a:writeRule": { "@id": RULE_IRI },
  });
  for (const slug of ["writeRule", "textPattern", "maxCharacters", "singleScript", "ruleStatement"]) {
    m.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}` });
  }
  m.put(
    RULE_PATH,
    framed
      ? {
          "@context": `${ID}/base/context.jsonld`,
          "@id": RULE_IRI,
          "@type": "t:Rule",
          label: "Tag string write limits",
          textPattern: pattern,
          maxCharacters,
          singleScript,
          ruleStatement: statement,
        }
      : {
          "@context": CONTEXT,
          "@id": RULE_IRI,
          "@type": "t:Rule",
          "a:textPattern": pattern,
          "a:maxCharacters": maxCharacters,
          "a:singleScript": singleScript,
          "a:ruleStatement": statement,
        },
  );
  return m;
}

async function loaded(m: FixtureMaster = withWriteRule(withTagStandard(fixtureMaster()))): Promise<{ rule: TagWriteRule; grammar: Awaited<ReturnType<typeof readTagGrammar>> }> {
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const [rule, grammar] = await Promise.all([readTagWriteRule(source), readTagGrammar(source)]);
  return { rule, grammar };
}


describe("readTagWriteRule", () => {
  it("follows a:writeRule and compiles the record's pattern with the u flag", async () => {
    const { rule } = await loaded();
    expect(rule.iri).toBe(RULE_IRI);
    expect(rule.pattern.flags).toBe("u");
    expect(rule.pattern.source).toBe(TEXT_PATTERN);
    expect(rule.maxCharacters).toBe(64);
    expect(rule.singleScript).toBe(true);
    expect(rule.statement).toBe(STATEMENT);
    expect(rule.pattern.test("ann")).toBe(true);
    expect(rule.pattern.test("Ann Lee")).toBe(false);
  });

  it("reads an unframed record the same way", async () => {
    const { rule } = await loaded(withWriteRule(withTagStandard(fixtureMaster()), { framed: false }));
    expect(rule.pattern.source).toBe(TEXT_PATTERN);
    expect(rule.maxCharacters).toBe(64);
  });

  it("rejects with the vocabulary error when the record cannot be read", async () => {
    const m = withTagStandard(fixtureMaster());
    const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
    await expect(readTagWriteRule(source)).rejects.toBeInstanceOf(VocabularyUnavailableError);
    m.put("a/tagString", { "@context": CONTEXT, "@id": a("tagString"), "a:predicateAttribute": "a:tagString" });
    for (const slug of ["writeRule", "textPattern", "maxCharacters", "singleScript", "ruleStatement"]) {
      m.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}` });
    }
    await expect(readTagWriteRule(source)).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });
});

describe("checkNewTagString — the 54 known answers", () => {
  it("judges each labelled text as labelled", async () => {
    expect(KNOWN).toHaveLength(54);
    const { rule } = await loaded();
    const misses: string[] = [];
    for (const [raw, want] of KNOWN) {
      const got = checkNewTagString(raw, rule);
      const reason = got.ok ? null : got.reason;
      if (reason !== want) misses.push(`${JSON.stringify(raw)} want ${want} got ${reason}`);
      if (got.ok) expect(got.tag).toBe(raw.normalize("NFC").trim());
    }
    expect(misses).toEqual([]);
  });

  it("uses the record's maxCharacters, not a fixed copy", async () => {
    const short = await loaded(
      withWriteRule(withTagStandard(fixtureMaster()), {
        maxCharacters: 3,
        pattern: TEXT_PATTERN.replace("{1,64}", "{1,3}"),
      }),
    );
    expect(checkNewTagString("abcd", short.rule)).toEqual({ ok: false, reason: "too-long" });
    expect(checkNewTagString("abc", short.rule)).toEqual({ ok: true, tag: "abc" });
  });
});

describe("the record may tighten the floor, not loosen it", () => {
  it("a stricter stored pattern refuses capitals as not-allowed", async () => {
    const { rule } = await loaded(withWriteRule(withTagStandard(fixtureMaster()), { pattern: "^[a-z.]{1,64}$" }));
    expect(checkNewTagString("Ann", rule)).toEqual({ ok: false, reason: "not-allowed" });
    expect(checkNewTagString("ann", rule)).toEqual({ ok: true, tag: "ann" });
    expect(tagRefusalSentence("not-allowed")).toBe("This tag is not allowed by the tag rule.");
  });

  it("a max of 40 refuses 41 characters and the sentence says 40", async () => {
    const { rule } = await loaded(
      withWriteRule(withTagStandard(fixtureMaster()), {
        maxCharacters: 40,
        pattern: TEXT_PATTERN.replace("{1,64}", "{1,40}"),
      }),
    );
    expect(checkNewTagString("x".repeat(41), rule)).toEqual({ ok: false, reason: "too-long" });
    expect(checkNewTagString("x".repeat(40), rule)).toEqual({ ok: true, tag: "x".repeat(40) });
    expect(tagRefusalSentence("too-long", rule)).toBe("A tag can be at most 40 characters.");
    expect(tagRefusalSentence("too-long", 40)).toBe("A tag can be at most 40 characters.");
    expect(tagRefusalSentence("too-long")).toBe("A tag can be at most 64 characters.");
  });

  it("a loosened pattern that allows spaces still refuses spaces", async () => {
    const { rule } = await loaded(withWriteRule(withTagStandard(fixtureMaster()), { pattern: "^[^@]{1,64}$" }));
    expect(checkNewTagString("a b", rule)).toEqual({ ok: false, reason: "white-space" });
    expect(checkNewTagString("Ann", rule)).toEqual({ ok: true, tag: "Ann" });
  });

  it("rejects a record whose pattern upper bound differs from maxCharacters", async () => {
    const disagree = withWriteRule(withTagStandard(fixtureMaster()), { maxCharacters: 100 });
    const source = masterSource({ vedaOrigin: RIG, fetchImpl: disagree.fetch });
    await expect(readTagWriteRule(source)).rejects.toBeInstanceOf(VocabularyUnavailableError);
    const unbounded = withWriteRule(withTagStandard(fixtureMaster()), { pattern: "^[^@]+$" });
    const open = masterSource({ vedaOrigin: RIG, fetchImpl: unbounded.fetch });
    await expect(readTagWriteRule(open)).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });

  it("a record with singleScript false still refuses a mix", async () => {
    const anyScript = await loaded(withWriteRule(withTagStandard(fixtureMaster()), { singleScript: false }));
    expect(anyScript.rule.singleScript).toBe(false);
    expect(checkNewTagString("ann.гилб", anyScript.rule)).toEqual({ ok: false, reason: "mixed-script" });
  });
});

describe("tagRefusalSentence", () => {
  it("is one plain sentence for each reason", () => {
    expect(tagRefusalSentence("empty")).toBe("A tag cannot be empty.");
    expect(tagRefusalSentence("at-sign")).toBe("A tag cannot contain @.");
    expect(tagRefusalSentence("white-space")).toBe("A tag cannot contain spaces.");
    expect(tagRefusalSentence("invisible-or-control")).toBe("The tag contains an invisible or control character.");
    expect(tagRefusalSentence("too-long")).toBe("A tag can be at most 64 characters.");
    expect(tagRefusalSentence("mixed-script")).toBe(
      "A tag must use one alphabet (do not mix, for example, Latin and Cyrillic letters).",
    );
  });
});

describe("64 is a ceiling: a record may tighten, never loosen", () => {
  it("maxCharacters 100 still refuses 65, and the sentence says 64; max 40 still says 40", async () => {
    const wide = await loaded(
      withWriteRule(withTagStandard(fixtureMaster()), {
        maxCharacters: 100,
        pattern: TEXT_PATTERN.replace("{1,64}", "{1,100}"),
      }),
    );
    expect(wide.rule.maxCharacters).toBe(100);
    expect(checkNewTagString("x".repeat(64), wide.rule)).toEqual({ ok: true, tag: "x".repeat(64) });
    expect(checkNewTagString("x".repeat(65), wide.rule)).toEqual({ ok: false, reason: "too-long" });
    expect(checkNewTagString("x".repeat(100), wide.rule)).toEqual({ ok: false, reason: "too-long" });
    expect(tagRefusalSentence("too-long", wide.rule)).toBe("A tag can be at most 64 characters.");

    const tight = await loaded(
      withWriteRule(withTagStandard(fixtureMaster()), {
        maxCharacters: 40,
        pattern: TEXT_PATTERN.replace("{1,64}", "{1,40}"),
      }),
    );
    expect(checkNewTagString("x".repeat(41), tight.rule)).toEqual({ ok: false, reason: "too-long" });
    expect(checkNewTagString("x".repeat(40), tight.rule)).toEqual({ ok: true, tag: "x".repeat(40) });
    expect(tagRefusalSentence("too-long", tight.rule)).toBe("A tag can be at most 40 characters.");
  });

});

describe("a stored tag still formats", () => {
  it("formatFullTag of a stored Ann Lee still works", async () => {
    const { grammar } = await loaded();
    expect(formatFullTag({ tag: "Ann Lee", vaultName: "home" }, grammar)).toBe("@Ann Lee@home");
    expect(formatFullTag({ tag: " Ann Lee ", vaultName: "home" }, grammar)).toBe("@Ann Lee@home");
  });
});
