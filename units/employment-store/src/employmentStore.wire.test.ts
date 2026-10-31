// New. What the store writes, read off the wire: a null only for a value the person removed (NN1, NN2), a role that never said current leaves
// ongoing alone, a stored place is carried through every write, no entity is ever deleted, and a place that cannot be made an address reads as none.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmploymentEntity, employmentFromDoc, resolveEmployments, updateEmploymentEntity, type EmploymentFacts } from "./index";
import { VAULT, patchesTo, requests, seed, storedA, uriOf, writes, wireNulls } from "../test/vault";
import { GEO, OSLO, linkVocab, vocab } from "../test/vocab";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  tearDown();
});

const BERGEN = `${GEO}/base/e/osm-r-7`;
const edit = (id: string, facts: Omit<EmploymentFacts, "key">, link = false) =>
  updateEmploymentEntity(id, { key: "", ...facts }, vocab, VAULT, uriOf(id), link ? linkVocab : undefined);
const role = (over: Partial<{ start: string; end: string; current: boolean | null; placeId: string }> = {}) => ({ start: "2019-03", end: "", current: null as boolean | null, placeId: OSLO, ...over });

describe("NN1: a:jobTitle is nulled only when a stored title is gone", () => {
  it("emptying the last stored title: exactly one null, a:jobTitle", async () => {
    const id = seed("t:Employment", { "a:org": "Acme", "a:jobTitle": "CEO" });
    await edit(id, { company: "Acme", titles: [], titlesStored: ["CEO"] });
    expect(patchesTo(id)).toEqual([{ "a:org": "Acme", "a:jobTitle": null }]);
    expect(wireNulls()).toEqual(["a:jobTitle"]);
  });
  it("a company edit on an employment that read with no title names no title key", async () => {
    const id = seed("t:Employment", { "a:org": "Acme" });
    await edit(id, { company: "Acme AS", titles: [""], titlesStored: [] });
    expect(patchesTo(id)).toEqual([{ "a:org": "Acme AS" }]);
    expect(wireNulls()).toEqual([]);
  });
  it("a title another writer left in a form this reader cannot read is not deleted by a company edit", async () => {
    const id = seed("t:Employment", { "a:org": "Acme", "a:jobTitle": { "@id": "https://x.example.test/base/e/role1" } });
    const got = await resolveEmployments({ employment: { "@id": uriOf(id) } }, vocab, VAULT);
    expect(got.resolved[0]!.titles).toEqual([]);
    await edit(id, { company: "Acme AS", titles: got.resolved[0]!.titles, titlesStored: got.resolved[0]!.titles });
    expect(storedA(id)["a:jobTitle"]).toEqual({ "@id": "https://x.example.test/base/e/role1" });
    expect(wireNulls()).toEqual([]);
  });
  it("a caller that does not know the stored titles nulls nothing", async () => {
    const id = seed("t:Employment", { "a:org": "Acme", "a:jobTitle": "CEO" });
    await edit(id, { company: "Acme", titles: [] });
    expect(storedA(id)["a:jobTitle"]).toBe("CEO");
    expect(wireNulls()).toEqual([]);
  });
  it("blank stored titles are not titles: nothing to null", async () => {
    const id = seed("t:Employment", { "a:org": "Acme" });
    await edit(id, { company: "Acme", titles: [], titlesStored: [" ", ""] });
    expect(wireNulls()).toEqual([]);
  });
});

describe("NN2: a role edit names only what it changed", () => {
  it("picking only a start month: the patch is the company and a:startDate", async () => {
    const id = seed("t:Employment", { "a:org": "Acme", "a:workLocation": { "@id": OSLO } });
    await edit(id, { company: "Acme", titles: [], role: role({ start: "2020-01" }), roleBefore: role({ start: "" }) });
    expect(patchesTo(id)).toEqual([{ "a:org": "Acme", "a:startDate": "2020-01" }]);
    expect(storedA(id)["a:workLocation"]).toEqual({ "@id": OSLO });
  });
  it("a role never said current leaves ongoing untouched on a place edit: no a:ongoing key at all", async () => {
    const id = seed("t:Employment", { "a:org": "Acme", "a:startDate": "2019-03", "a:workLocation": { "@id": OSLO } });
    await edit(id, { company: "Acme", titles: [], role: role({ placeId: BERGEN }), roleBefore: role() });
    expect(patchesTo(id)).toEqual([{ "a:org": "Acme", "a:workLocation": { "@id": BERGEN } }]);
    expect(JSON.stringify(patchesTo(id))).not.toContain("ongoing");
  });
  it("a start that did not read (a full date) and a place that is not an address survive picking an end month", async () => {
    const id = seed("t:Employment", { "a:org": "Acme", "a:startDate": "2019-03-01", "a:workLocation": "Oslo" });
    const got = await resolveEmployments({ employment: { "@id": uriOf(id) } }, vocab, VAULT);
    const before = got.resolved[0]!.role!;
    expect(before).toEqual({ start: "", end: "", current: null, placeId: "" });
    await edit(id, { company: "Acme", titles: [], role: { ...before, end: "2023-06" }, roleBefore: before });
    expect(patchesTo(id)).toEqual([{ "a:org": "Acme", "a:endDate": "2023-06", "a:ongoing": null }]);
    expect(storedA(id)["a:startDate"]).toBe("2019-03-01");
    expect(storedA(id)["a:workLocation"]).toBe("Oslo");
  });
  it("Present on with a stored end: a:ongoing true and a:endDate null, the person's own clearing", async () => {
    const id = seed("t:Employment", { "a:org": "Acme", "a:startDate": "2019-03", "a:endDate": "2023-06" });
    await edit(id, { company: "Acme", titles: [], role: role({ placeId: "", current: true }), roleBefore: role({ placeId: "", end: "2023-06", current: false }) });
    expect(patchesTo(id)).toEqual([{ "a:org": "Acme", "a:ongoing": true, "a:endDate": null }]);
    expect(wireNulls()).toEqual(["a:endDate"]);
  });
  it("clearing the place is a null for the place only", async () => {
    const id = seed("t:Employment", { "a:org": "Acme", "a:startDate": "2019-03", "a:workLocation": { "@id": OSLO } });
    await edit(id, { company: "Acme", titles: [], role: role({ placeId: "" }), roleBefore: role() });
    expect(patchesTo(id)).toEqual([{ "a:org": "Acme", "a:workLocation": null }]);
    expect(wireNulls()).toEqual(["a:workLocation"]);
  });
  it("an edit of the company or a title names no role key at all", async () => {
    const id = seed("t:Employment", { "a:org": "Acme", "a:startDate": "2019-03", "a:ongoing": true, "a:workLocation": { "@id": OSLO } });
    await edit(id, { company: "Acme AS", titles: ["CEO"], titlesStored: [] });
    expect(patchesTo(id)).toEqual([{ "a:org": "Acme AS", "a:jobTitle": "CEO" }]);
    expect(storedA(id)).toMatchObject({ "a:startDate": "2019-03", "a:ongoing": true, "a:workLocation": { "@id": OSLO } });
  });
  it("a role edit with the vocabulary's role terms unresolved refuses", async () => {
    const id = seed("t:Employment", { "a:org": "Acme" });
    const half = { ...vocab, startDate: "" } as typeof vocab;
    await expect(updateEmploymentEntity(id, { key: "", company: "Acme", titles: [], role: role() }, half, VAULT, uriOf(id))).rejects.toThrow(/served attribute names/);
    expect(writes()).toHaveLength(0);
  });
});

describe("the unlink pair is a null, and only for the person's own act", () => {
  it("retyping the company as plain text nulls exactly a:employer and a:employee", async () => {
    const id = seed("t:Employment", { "a:org": "Butikk AS", "a:employer": { "@id": `${VAULT}/e/o` }, "a:employee": { "@id": `${VAULT}/e/p` } });
    await edit(id, { company: "Gamma", titles: [], unlink: true }, true);
    expect(wireNulls()).toEqual(["a:employee", "a:employer"]);
    expect(patchesTo(id)).toEqual([{ "a:org": "Gamma", "a:employer": null, "a:employee": null }]);
  });
  it("an edit that is not an unlink never names the links", async () => {
    const id = seed("t:Employment", { "a:org": "Butikk AS", "a:employer": { "@id": `${VAULT}/e/o` }, "a:employee": { "@id": `${VAULT}/e/p` } });
    await edit(id, { company: "Butikk AS", titles: ["CEO"] }, true);
    expect(JSON.stringify(patchesTo(id))).not.toContain("employ");
    expect(wireNulls()).toEqual([]);
  });
});

describe("the stored place is carried unchanged through every write", () => {
  it("title, company and role-date edits leave a:workLocation exactly as stored", async () => {
    const id = seed("t:Employment", { "a:org": "Acme", "a:startDate": "2019-03", "a:workLocation": { "@id": OSLO } });
    await edit(id, { company: "Acme", titles: ["CEO"], titlesStored: [] });
    await edit(id, { company: "Acme AS", titles: ["CEO"], titlesStored: ["CEO"] });
    await edit(id, { company: "Acme AS", titles: ["CEO"], role: role({ end: "2024-01", current: false }), roleBefore: role() });
    expect(storedA(id)["a:workLocation"]).toEqual({ "@id": OSLO });
    expect(patchesTo(id).some((b) => "a:workLocation" in b)).toBe(false);
  });
});

describe("create", () => {
  it("writes no null, and a role writes only its set values", async () => {
    const made = await createEmploymentEntity(VAULT, { company: "Acme", titles: [], role: { start: "", end: "", current: null, placeId: "" } }, vocab);
    expect(writes().every((w) => w.method === "POST")).toBe(true);
    expect(wireNulls()).toEqual([]);
    expect(storedA(made.id)).toMatchObject({ "a:org": expect.any(String) });
    expect(JSON.stringify(requests.find((r) => r.method === "POST")!.body)).not.toContain("null");
  });
  it("never writes a positional handle as the identity", async () => {
    const id = seed("t:Employment", { "a:org": "Acme", "a:claimSlotKey": "empx-k1" });
    await edit(id, { company: "Acme AS", titles: [] });
    await updateEmploymentEntity(id, { key: "emp1", company: "Acme AS", titles: [] }, vocab, VAULT, uriOf(id));
    expect(storedA(id)["a:claimSlotKey"]).toBe("empx-k1");
    const made = await createEmploymentEntity(VAULT, { company: "B", titles: [] }, vocab);
    expect(made.key).toMatch(/^empx-/);
  });
  it("a refused create throws and nothing is claimed", async () => {
    const { hooks } = await import("../test/vault");
    hooks.failCreate = true;
    await expect(createEmploymentEntity(VAULT, { company: "Acme", titles: [] }, vocab)).rejects.toThrow();
  });
});

describe("no entity is ever deleted", () => {
  it("create, update and read make no DELETE", async () => {
    const made = await createEmploymentEntity(VAULT, { company: "Acme", titles: ["CEO"] }, vocab);
    await edit(made.id, { company: "Acme AS", titles: [], titlesStored: ["CEO"] });
    await resolveEmployments({ employment: [{ "@id": made.uri }, { "@id": uriOf("06gkgone") }] }, vocab, VAULT);
    expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(0);
  });
});

describe("the place on read", () => {
  const doc = (place: unknown) => ({ org: "Acme", startDate: "2019-03", workLocation: place });
  it("with the catalogue origin a compact place becomes its address", () => {
    expect(employmentFromDoc("u", doc("base:e/osm-r-2775550"), vocab, undefined, GEO).role!.placeId).toBe(OSLO);
  });
  it("with none, a compact place reads as no place and a full address as it is", () => {
    expect(employmentFromDoc("u", doc("base:e/osm-r-2775550"), vocab).role!.placeId).toBe("");
    expect(employmentFromDoc("u", doc({ "@id": OSLO }), vocab).role!.placeId).toBe(OSLO);
    expect(employmentFromDoc("u", doc(OSLO), vocab).role!.placeId).toBe(OSLO);
  });
  it("a bare name is never a place", () => {
    expect(employmentFromDoc("u", doc("Oslo"), vocab, undefined, GEO).role!.placeId).toBe("");
  });
  it("a name reads as the company text, never an address", () => {
    const e = employmentFromDoc(uriOf("x"), { org: "Acme", jobTitle: ["CEO", ""] }, vocab);
    expect(e.company).toBe("Acme");
    expect(e.titles).toEqual(["CEO"]);
    expect(e.key).toBe("");
  });
});
