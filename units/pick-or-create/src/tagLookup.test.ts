// The tag write rule and the picker: a create never blocks on the rule record, a tag the rule would refuse is refused before any look-up,
// and a stored tag the rule would refuse is still picked. The pattern lives on the fixture record, not in src/.
import { describe, expect, it } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import {
  CreateRefusedError,
  pickByTag,
  pickOrCreate,
  readPickerVocabulary,
  type PickOrCreateInput,
  type Picker,
} from "./pickOrCreate";
import { a, CONTEXT, fixtureMaster, ID, RIG, t, type FixtureMaster } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { fixturePlatform, type FixturePlatform } from "../test/fixturePlatform";

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

const VAULT = "https://ann.example.test/vault";
const HOLDER = "https://ann.example.test/vault/e/ann-self-card";
const AGENT = "https://ann.example.test/vault/e/app-ourapp";

async function pickerOn(m: FixtureMaster): Promise<{ picker: Picker; p: FixturePlatform }> {
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readPickerVocabulary(source, await resolveFieldSets(source));
  const p = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT);
  return { picker: { platform: { origin: p.origin, fetch: p.fetch }, reading }, p };
}

const ben = (over: Partial<PickOrCreateInput> = {}): PickOrCreateInput => ({
  vaultId: VAULT,
  holder: HOLDER,
  agent: AGENT,
  kind: t("Person"),
  name: "Ben Lee",
  ...over,
});

describe("the write rule and the platform's own tag", () => {
  // `createRecord` takes no tag (the platform makes it), so a bad TAG is refused by the typed client (`addTag`, in `tag-client`) and by
  // `pickOrCreate`'s look-up (below). What stays true of a create is that it never blocks on the rule record.
  it("a create does not read the tag write rule's refusals: it sends no tag at all, so a record is created whatever the rule says", async () => {
    const { picker, p } = await pickerOn(withWriteRule(withWritableFields(withTagStandard(fixtureMaster()))));
    const made = await pickOrCreate(picker, ben());
    expect(made).toMatchObject({ created: true, tag: "ben-lee" });
    expect(p.count("POST", "/base/tag/handle")).toBe(0);
  });
});

describe("the rule speaks before the grammar", () => {
  it.each([
    ["ben@ann", "A tag cannot contain @."],
    ["", "A tag cannot be empty."],
    ["   ", "A tag cannot be empty."],
  ] as const)("pickOrCreate refuses %j with the rule's sentence and does not look it up", async (tag, sentence) => {
    const { picker, p } = await pickerOn(withWriteRule(withWritableFields(withTagStandard(fixtureMaster()))));
    const err = await pickOrCreate(picker, ben({ tag })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CreateRefusedError);
    expect(err).toMatchObject({ reason: "tag-refused", message: sentence });
    expect(p.requests).toEqual([]);
  });

  it("a stored tag the rule would refuse is still picked", async () => {
    const { picker, p } = await pickerOn(withWriteRule(withWritableFields(withTagStandard(fixtureMaster()))));
    const record = p.seed(VAULT, "t:Person", { "a:name": "Ben Lee" });
    p.seedTag(VAULT, "Ben Lee", record);
    expect(await pickByTag(picker, { vaultId: VAULT, tag: "Ben Lee" })).toMatchObject({ created: false, record });
    expect(await pickOrCreate(picker, ben({ tag: "Ben Lee" }))).toMatchObject({ created: false, record });
  });
});
