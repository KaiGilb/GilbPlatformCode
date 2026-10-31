// Ported from GilbApp `employmentStore.s8org.test.ts` (nine cases): the store carries `a:employer` and `a:employee` together with `a:org` when an
// organization record was chosen, reads which organization an employment names, and retracts both links only on the holder's own act.
// Re-based on the real peers over the in-memory vault. Changed: the read-back through `readEmploymentEntity` (not taken) reads the stored document
// directly; the update with titles hands nothing else.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmploymentEntity, employerOf, employmentFactsToWire, resolveEmployments, updateEmploymentEntity } from "./index";
import { VAULT, factsOf, seed, storedA, uriOf } from "../test/vault";
import { linkVocab, vocab } from "../test/vocab";
import { setUp, tearDown } from "../test/support";

beforeEach(() => setUp());
afterEach(() => tearDown());

const ORG = `${VAULT}/e/org1`;
const PERSON = `${VAULT}/e/person1`;

describe("the wire shape", () => {
  it("writes a:employer and a:employee beside a:org and the titles", () => {
    const wire = employmentFactsToWire({ key: "empx-1", company: "Butikk AS", titles: ["CEO"], links: { employer: ORG, employee: PERSON } }, vocab, linkVocab);
    expect(wire).toMatchObject({ "a:org": "Butikk AS", "a:jobTitle": "CEO", "a:employer": { "@id": ORG }, "a:employee": { "@id": PERSON } });
  });
  it("a name-only employment writes neither", () => {
    expect(Object.keys(employmentFactsToWire({ key: "empx-1", company: "B", titles: [] }, vocab, linkVocab))).not.toEqual(expect.arrayContaining(["a:employer"]));
  });
  it("refuses links without the master's spellings (no guessed key)", () => {
    expect(() => employmentFactsToWire({ key: "x", company: "B", titles: [], links: { employer: ORG, employee: PERSON } }, vocab)).toThrow(/spelling/);
  });
  it("refuses an employer that is not an entity address, and one that is the person", () => {
    expect(() => employmentFactsToWire({ key: "x", company: "B", titles: [], links: { employer: "Butikk", employee: PERSON } }, vocab, linkVocab)).toThrow();
    expect(() => employmentFactsToWire({ key: "x", company: "B", titles: [], links: { employer: PERSON, employee: PERSON } }, vocab, linkVocab)).toThrow(/same/);
  });
});

describe("the store", () => {
  it("creates an employment with the links and reads the employer back", async () => {
    const made = await createEmploymentEntity(VAULT, { company: "Butikk AS", titles: ["CEO"], links: { employer: ORG, employee: PERSON } }, vocab, linkVocab);
    expect(storedA(made.id)).toMatchObject({ "a:employer": { "@id": ORG }, "a:employee": { "@id": PERSON } });
    expect(made.employer).toBe(ORG);
    const read = await resolveEmployments({ employment: { "@id": made.uri } }, vocab, VAULT);
    expect(read.resolved[0]!.employer).toBeUndefined(); // not asked (no link vocabulary handed): nothing is claimed about it
    expect(employerOf(factsOf(made.id), linkVocab)).toBe(ORG);
  });
  it("resolveEmployments reads the employer of each employment when the link vocabulary is handed", async () => {
    const a = seed("t:Employment", { "a:org": "A", "a:employer": { "@id": ORG } });
    const b = seed("t:Employment", { "a:org": "B" });
    const doc = { employment: [{ "@id": uriOf(a) }, { "@id": uriOf(b) }] };
    const got = await resolveEmployments(doc, vocab, VAULT, linkVocab);
    expect(got.resolved.map((e) => e.employer)).toEqual([ORG, null]);
  });
  it("an edit that names no links leaves the stored links alone (a merge patch of the named keys only)", async () => {
    const made = await createEmploymentEntity(VAULT, { company: "Butikk AS", titles: ["CEO"], links: { employer: ORG, employee: PERSON } }, vocab, linkVocab);
    await updateEmploymentEntity(made.id, { key: "", company: "Butikk AS", titles: ["Chair"] }, vocab, VAULT, made.uri);
    expect(storedA(made.id)).toMatchObject({ "a:jobTitle": "Chair", "a:employer": { "@id": ORG }, "a:employee": { "@id": PERSON } });
  });
  it("'unlink' (the holder typed a plain company) retracts both links, and only then", async () => {
    const made = await createEmploymentEntity(VAULT, { company: "Butikk AS", titles: [], links: { employer: ORG, employee: PERSON } }, vocab, linkVocab);
    await updateEmploymentEntity(made.id, { key: "", company: "Gamma", titles: [], unlink: true }, vocab, VAULT, made.uri, linkVocab);
    expect(Object.keys(storedA(made.id))).not.toContain("a:employer");
    expect(Object.keys(storedA(made.id))).not.toContain("a:employee");
    expect(storedA(made.id)["a:org"]).toBe("Gamma");
  });
  it("'unlink' without the master's spellings refuses (it cannot retract a key it was not told)", async () => {
    const made = await createEmploymentEntity(VAULT, { company: "B", titles: [] }, vocab);
    await expect(updateEmploymentEntity(made.id, { key: "", company: "B", titles: [], unlink: true }, vocab, VAULT, made.uri)).rejects.toThrow(/spelling/);
  });
});
