// Pins of every export of the unit that the ported tests do not reach alone: the export list, the reading's shape and its bounds,
// the bound of a write call at create, the result of `pick`, and the two error classes.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import * as unit from "./index";
import { createRecord, CreateRefusedError, PartialCreateError, pick, readPickerVocabulary, STATED_BY_TERM, type Candidate, type Picker } from "./pickOrCreate";
import { fixtureMaster, RIG, t } from "../test/support";
import { withReferenceTerms } from "../test/fixtureReference";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { fixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const HOLDER = "https://ann.example.test/vault/e/ann-self-card";
const AGENT = "https://ann.example.test/vault/e/app-ourapp";

async function world(opts: { references?: boolean } = {}) {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  const sent: string[] = [];
  const source = masterSource({
    vedaOrigin: RIG,
    fetchImpl: ((url: string, init?: RequestInit) => (sent.push(url), m.fetch(url, init))) as never,
  });
  const fieldSets = await resolveFieldSets(source);
  const before = sent.length;
  const reading = await readPickerVocabulary(source, fieldSets, opts);
  const p = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT);
  const picker: Picker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: source };
  return { m, sent, source, fieldSets, reading, picker, p, readSent: sent.length - before };
}

describe("the unit's exports", () => {
  it("are these, and no more", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["CreateRefusedError", "PartialCreateError", "STATED_BY_TERM", "createRecord", "findCandidates", "pick", "pickByTag", "pickOrCreate", "readPickerVocabulary"].sort(),
    );
  });
  it("the stater predicate is a/statedBy", () => {
    expect(STATED_BY_TERM).toBe("a/statedBy");
  });
});

describe("readPickerVocabulary", () => {
  it("reads the grammar and the stater's spelling beside the field sets, and no reference reading unless asked", async () => {
    const w = await world();
    expect(Object.keys(w.reading).sort()).toEqual(["fieldSets", "grammar", "statedBy"]);
    expect(w.reading.fieldSets).toBe(w.fieldSets);
    expect(w.reading.statedBy.writeKey).toBe("a:statedBy");
    expect(w.reading.references).toBeUndefined();
    expect(w.reading.tagWriteRule).toBeUndefined();
  });

  it("with references: true reads the reference reading too", async () => {
    const w = await world({ references: true });
    expect(w.reading.references).toBeDefined();
    expect(w.reading.references!.fields.length).toBeGreaterThan(0);
  });

  it.each([0, -1, Number.NaN, Infinity, 2_147_483_648])("a timeoutMs or readCapMs of %s is a RangeError, with or without references, before anything is read", async (bad) => {
    const w = await world();
    for (const references of [false, true]) {
      for (const key of ["timeoutMs", "readCapMs"] as const) {
        const before = w.sent.length;
        const err = await readPickerVocabulary(w.source, w.fieldSets, { references, [key]: bad }).then(
          () => undefined,
          (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(RangeError);
        expect((err as Error).message).toContain(`${key} must be a finite number of ms above 0`);
        expect(w.sent.length).toBe(before);
      }
    }
  });

  it("2,147,483,647 ms is kept as given", async () => {
    const w = await world();
    await expect(readPickerVocabulary(w.source, w.fieldSets, { timeoutMs: 2_147_483_647 })).resolves.toMatchObject({ statedBy: { writeKey: "a:statedBy" } });
  });
});

describe("createRecord opens one write call", () => {
  it("a bad masterReadCapMs on the picker is a RangeError, with no reference field in the input, and nothing is sent to the vault", async () => {
    const w = await world();
    const picker = { ...w.picker, masterReadCapMs: 0 };
    const before = w.p.requests.length;
    const err = await createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Nora" }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RangeError);
    expect((err as Error).message).toContain("masterReadCapMs must be a finite number of ms above 0");
    expect(w.p.requests.length).toBe(before);
  });
});

describe("pick", () => {
  it("returns the candidate's record, vault and type as a pick, not a create", () => {
    const candidate: Candidate = { record: "https://ann.example.test/base/e/ben", vaultId: VAULT, type: "t:Person", label: "Ben" };
    expect(pick(candidate)).toEqual({ created: false, record: candidate.record, vaultId: VAULT, type: "t:Person" });
  });
});

describe("the error classes", () => {
  it("CreateRefusedError carries its reason and its name", () => {
    const err = new CreateRefusedError("no-name", "a record needs a name");
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ name: "CreateRefusedError", reason: "no-name", message: "a record needs a name" });
  });

  it("PartialCreateError says what was written, and the cause", () => {
    const cause = new Error("boom");
    const err = new PartialCreateError("tag could not be made", { record: "https://ann.example.test/base/e/r1", written: ["https://ann.example.test/base/e/r0", "https://ann.example.test/base/e/r1"], vaultId: VAULT, cause });
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ name: "PartialCreateError", record: "https://ann.example.test/base/e/r1", vaultId: VAULT, message: "tag could not be made" });
    expect(err.written).toEqual(["https://ann.example.test/base/e/r0", "https://ann.example.test/base/e/r1"]);
    expect(err.cause).toBe(cause);
  });
});
