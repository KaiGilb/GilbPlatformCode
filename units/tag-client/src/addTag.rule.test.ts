// `addTag` with the write rule and the grammar the way an app holds them: read from the master by `tag-grammar`.
// A bad tag is refused locally, with the rule's reason and sentence, and no request is sent; the platform's own 400 and 409 are mapped.
// The rule record lives on the fixture master, not in src/.
import { describe, expect, it } from "vitest";
import { masterSource, VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { PlatformError, type PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { readTagGrammar, readTagWriteRule, TagStringRefusedError, type TagGrammar, type TagWriteRefusal, type TagWriteRule } from "@kaigilb/gilbplatformcode-tag-grammar";
import { addTag, TagTakenError } from "./tagClient";
import { a, CONTEXT, fixtureMaster, ID, RIG, type FixtureMaster } from "../test/support";
import { withTagStandard } from "../test/tagStandard";
import { fixturePlatform, type FixturePlatform } from "../test/platformFixture";

const TEXT_PATTERN = String.raw`^[^@\p{White_Space}\p{C}\p{Default_Ignorable_Code_Point}]{1,64}$`;
const RULE_PATH = "e/tag-string-write-limits";
const RULE_IRI = `${ID}/base/${RULE_PATH}`;
const STATEMENT = "A new tag string must pass the write limits.";

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

const VAULT = "https://home.example.test/vault";
const AGENT = "https://home.example.test/vault/e/app-example";

/** What an app holds to add a tag: the platform client, the grammar and the write rule read from the master (the rule is absent when its record cannot be read). */
interface Picker {
  platform: PlatformClient;
  reading: { grammar: TagGrammar; tagWriteRule?: TagWriteRule };
}

async function pickerOn(m: FixtureMaster): Promise<{ picker: Picker; p: FixturePlatform }> {
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const grammar = await readTagGrammar(source);
  const tagWriteRule = await readTagWriteRule(source).catch((e: unknown) => {
    if (e instanceof VocabularyUnavailableError) return undefined;
    throw e;
  });
  const p = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT);
  return { picker: { platform: { origin: p.origin, fetch: p.fetch }, reading: { grammar, tagWriteRule } }, p };
}

/** `addTag` given the picker's reading: its client check and its mapping of the platform's 400 are the typed client's. */
const addAlt = (picker: Picker, record: string, tag: string) =>
  addTag(picker.platform, record, tag, AGENT, { rule: picker.reading.tagWriteRule, grammar: picker.reading.grammar });

describe("addTag", () => {
  it("refuses a bad tag locally and sends no request", async () => {
    const { picker, p } = await pickerOn(withWriteRule(withTagStandard(fixtureMaster())));
    const record = p.seed(VAULT, "t:Person", { "a:name": "Seeded" });
    const err = await addAlt(picker, record, "Ann Lee").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TagStringRefusedError);
    expect(err).toMatchObject({ reason: "white-space", rule: RULE_IRI, message: "A tag cannot contain spaces." });
    expect(p.requests).toEqual([]);
  });

  it("maps a platform 400 maxCharacters onto the refusal, ahead of the number this client read", async () => {
    const { picker, p } = await pickerOn(withWriteRule(withTagStandard(fixtureMaster())));
    expect(picker.reading.tagWriteRule?.maxCharacters).toBe(64);
    const record = p.seed(VAULT, "t:Person", { "a:name": "Seeded" });
    p.failNext("POST", "/base/tag/handle", 400, {
      error: "tag-string-refused",
      reason: "too-long",
      rule: RULE_IRI,
      maxCharacters: 10,
    });
    const err = await addAlt(picker, record, "ann").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TagStringRefusedError);
    expect(err).toMatchObject({
      reason: "too-long",
      rule: RULE_IRI,
      maxCharacters: 10,
      message: "A tag can be at most 10 characters.",
    });
  });

  it("maps 400 tag-string-refused onto TagStringRefusedError with that reason", async () => {
    const { picker, p } = await pickerOn(withTagStandard(fixtureMaster()));
    const record = p.seed(VAULT, "t:Person", { "a:name": "Seeded" });
    p.failNext("POST", "/base/tag/handle", 400, {
      error: "tag-string-refused",
      reason: "mixed-script",
      rule: RULE_IRI,
    });
    const err = await addAlt(picker, record, "ann").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TagStringRefusedError);
    expect(err).toMatchObject({ reason: "mixed-script", rule: RULE_IRI });
    expect(p.count("POST", "/base/tag/handle")).toBe(1);
  });

  it("maps a collision to TagTakenError, by error not by message; any other 409 is a PlatformError (an alt is never a second master)", async () => {
    const { picker, p } = await pickerOn(withTagStandard(fixtureMaster()));
    const record = p.seed(VAULT, "t:Person", { "a:name": "Seeded" });
    p.failNext("POST", "/base/tag/handle", 409, {
      error: "TagStringCollisionError",
      message: `tagString 'ada' is already bound to ${record} in vault ${VAULT} (attempted attach to ${record}) — [[3P.C.Tag.VaultScopedUniqueness.Base]] fails loud rather than silently create a second TagHandle or overwrite the existing binding.`,
    });
    const taken = await addAlt(picker, record, "ada").catch((e: unknown) => e);
    expect(taken).toBeInstanceOf(TagTakenError);
    expect(taken).toMatchObject({ tag: "ada" });
    // An ALT is never a master, so a 409 entity-has-master is not a thing addTag maps.
    p.failNext("POST", "/base/tag/handle", 409, { error: "entity-has-master", message: "already has a current master TagHandle", tagString: "kept" });
    expect(await addAlt(picker, record, "ann").catch((e: unknown) => e)).toBeInstanceOf(PlatformError);
  });

  it("maps 400 tag-string-refused reason not-allowed onto TagStringRefusedError", async () => {
    const { picker, p } = await pickerOn(withTagStandard(fixtureMaster()));
    const record = p.seed(VAULT, "t:Person", { "a:name": "Seeded" });
    p.failNext("POST", "/base/tag/handle", 400, {
      error: "tag-string-refused",
      reason: "not-allowed",
      rule: RULE_IRI,
    });
    const err = await addAlt(picker, record, "ann").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TagStringRefusedError);
    expect(err).toMatchObject({
      reason: "not-allowed",
      rule: RULE_IRI,
      message: "This tag is not allowed by the tag rule.",
    });
  });
});

describe("addTag when the rule record cannot be read", () => {
  it("addTag does not block the write when the rule record cannot be read: the grammar is the only client check", async () => {
    const m = withTagStandard(fixtureMaster());
    const { picker, p } = await pickerOn(m);
    expect(picker.reading.tagWriteRule).toBeUndefined();
    const record = p.seed(VAULT, "t:Person", { "a:name": "Seeded" });
    expect(await addAlt(picker, record, "ann")).toMatchObject({ tag: "ann" });
    expect(p.count("POST", "/base/tag/handle")).toBe(1);
  });
});

describe("the rule speaks before the grammar", () => {
  const cases: [string, TagWriteRefusal, string][] = [
    ["ann@home", "at-sign", "A tag cannot contain @."],
    ["", "empty", "A tag cannot be empty."],
    ["   ", "empty", "A tag cannot be empty."],
    ["x".repeat(65), "too-long", "A tag can be at most 64 characters."],
    ["ann lee", "white-space", "A tag cannot contain spaces."],
  ];

  it.each(cases)("addTag refuses %j as %s and sends no request", async (tag, reason, sentence) => {
    const { picker, p } = await pickerOn(withWriteRule(withTagStandard(fixtureMaster())));
    const record = p.seed(VAULT, "t:Person", { "a:name": "Seeded" });
    const err = await addAlt(picker, record, tag).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TagStringRefusedError);
    expect(err).toMatchObject({ reason, rule: RULE_IRI, message: sentence });
    if (reason === "too-long") expect(err).toMatchObject({ maxCharacters: 64 });
    expect(p.requests).toEqual([]);
  });
});

describe("64 is a ceiling: a record may tighten, never loosen", () => {
  it("addTag of 65 under a max of 100 says 64 and sends nothing", async () => {
    const { picker, p } = await pickerOn(
      withWriteRule(withTagStandard(fixtureMaster()), {
        maxCharacters: 100,
        pattern: TEXT_PATTERN.replace("{1,64}", "{1,100}"),
      }),
    );
    const record = p.seed(VAULT, "t:Person", { "a:name": "Seeded" });
    const err = await addAlt(picker, record, "x".repeat(65)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TagStringRefusedError);
    expect(err).toMatchObject({
      reason: "too-long",
      rule: RULE_IRI,
      maxCharacters: 64,
      message: "A tag can be at most 64 characters.",
    });
    expect(p.requests).toEqual([]);
  });
});

describe("a platform 400 too-long", () => {
  const P40 = String.raw`^[^@\p{White_Space}\p{C}\p{Default_Ignorable_Code_Point}]{1,40}$`;
  it("carries the read rule's number in the message", async () => {
    const m = withWriteRule(withTagStandard(fixtureMaster()), { maxCharacters: 40, pattern: P40 });
    const { picker, p } = await pickerOn(m);
    expect(picker.reading.tagWriteRule?.maxCharacters).toBe(40);
    const record = p.seed(VAULT, "t:Person", { "a:name": "Seeded" });
    p.failNext("POST", "/base/tag/handle", 400, { error: "tag-string-refused", reason: "too-long", rule: RULE_IRI });
    const err = await addAlt(picker, record, "ann").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TagStringRefusedError);
    expect((err as Error).message).toBe("A tag can be at most 40 characters.");
  });
});
