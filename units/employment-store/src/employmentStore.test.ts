// Ported from GilbApp `employmentStore.c214e7.test.ts`: the cases about the entity (lines 92-171, seven of them). Re-based: the source mocked
// the record client; here the REAL `lws-records` and `vault-resources` run against the in-memory vault of test/vault.ts. Changed: the update case
// that clears titles hands `titlesStored` (the titles as last read); the scalar-edge case no longer calls `readEmploymentEntity` (not taken).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmploymentEntity, employmentFactsToWire, resolveEmployments, updateEmploymentEntity } from "./index";
import { VAULT, requests, seed, store, storedA, uriOf } from "../test/vault";
import { GEO, OSLO, vocab } from "../test/vocab";
import { setUp, tearDown } from "../test/support";

beforeEach(() => setUp());
afterEach(() => tearDown());

const seedMyNetEmployment = (facts: Record<string, unknown>) => seed("t:Employment", facts);

describe("WRITE: the t:Employment shape", () => {
  it("one title is a scalar, several an array; the handle is minted; no audience rung is ever written", () => {
    expect(employmentFactsToWire({ key: "empx-abc", company: "Acme", titles: ["CEO"] }, vocab)).toEqual({
      "a:org": "Acme",
      "a:claimSlotKey": "empx-abc",
      "a:jobTitle": "CEO",
    });
    expect(employmentFactsToWire({ key: "emp1", company: "", titles: [" CTO ", "", "Founder"] }, vocab)).toEqual({
      "a:org": "",
      "a:jobTitle": ["CTO", "Founder"],
    });
  });

  it("createEmploymentEntity mints one t:Employment in the named vault", async () => {
    const created = await createEmploymentEntity(
      VAULT,
      { company: "Acme", titles: ["CEO"], role: { start: "2019-03", end: "", current: true, placeId: OSLO } },
      vocab,
    );
    expect(created.uri).toBe(uriOf(created.id));
    expect(created.key).toMatch(/^empx-/);
    const e = store.get(created.id)!;
    expect(e.type).toBe("t:Employment");
    expect(storedA(created.id)).toEqual({
      "a:org": "Acme",
      "a:claimSlotKey": created.key,
      "a:jobTitle": "CEO",
      "a:startDate": "2019-03",
      "a:ongoing": true,
      "a:workLocation": { "@id": OSLO },
    });
    expect(storedA(created.id)).not.toHaveProperty("a:visibilityTier");
  });

  it("refuses to mint with no vault named", async () => {
    await expect(createEmploymentEntity("", { company: "Acme", titles: [] }, vocab)).rejects.toThrow(/no vault partition/);
    expect(requests.filter((r) => r.method === "POST")).toHaveLength(0);
  });

  it("updateEmploymentEntity patches company and titles in place, clears titles when none remain, and leaves a stored rung", async () => {
    const id = seedMyNetEmployment({ "a:org": "Acme", "a:jobTitle": "CEO", "a:claimSlotKey": "empx-k1", "a:visibilityTier": "private" });
    await updateEmploymentEntity(id, { key: "", company: "Acme AS", titles: [], titlesStored: ["CEO"] }, vocab, VAULT, uriOf(id));
    expect(storedA(id)).toEqual({ "a:org": "Acme AS", "a:claimSlotKey": "empx-k1", "a:visibilityTier": "private" });
  });

  it("a role edit writes the role only when the edit is about the role; an end month clears ongoing", async () => {
    const id = seedMyNetEmployment({ "a:org": "Acme", "a:startDate": "2019-03", "a:ongoing": true });
    await updateEmploymentEntity(id, { key: "", company: "Acme", titles: ["CEO"] }, vocab, VAULT, uriOf(id));
    expect(storedA(id)).toMatchObject({ "a:startDate": "2019-03", "a:ongoing": true });
    await updateEmploymentEntity(
      id,
      { key: "", company: "Acme", titles: ["CEO"], role: { start: "2019-03", end: "2023-06", current: true, placeId: "" } },
      vocab,
      VAULT,
      uriOf(id),
    );
    expect(storedA(id)).toEqual({ "a:org": "Acme", "a:jobTitle": "CEO", "a:startDate": "2019-03", "a:endDate": "2023-06" });
  });
});

describe("READ: employments written by other apps, through the record's edges", () => {
  it("reads each edge's entity in the record's order; an edge that does not read is unresolved, never absent", async () => {
    const a = seedMyNetEmployment({ "a:org": "Beta", "a:jobTitle": ["CTO", "Founder"], "a:claimSlotKey": "empx-b", "a:visibilityTier": "private" });
    const b = seedMyNetEmployment({ "a:org": "Acme", "a:jobTitle": "CEO", "a:name": "emp1", "a:startDate": "2019-03", "a:ongoing": true, "a:workLocation": "base:e/osm-r-2775550" });
    const doc = { employment: [{ "@id": uriOf(b) }, { "@id": uriOf("06gkgone") }, { "@id": uriOf(a) }] };
    const got = await resolveEmployments(doc, vocab, VAULT, undefined, GEO);
    expect(got.complete).toBe(false);
    expect(got.unresolved).toEqual([uriOf("06gkgone")]);
    expect(got.resolved.map((e) => [e.company, e.titles, e.key])).toEqual([
      ["Acme", ["CEO"], "emp1"],
      ["Beta", ["CTO", "Founder"], "empx-b"],
    ]);
    expect(got.resolved[0]!.role).toEqual({ start: "2019-03", end: "", current: true, placeId: OSLO });
    expect(got.resolved[0]).not.toHaveProperty("tier");
  });

  it("a scalar edge (one employment) reads as one", async () => {
    const a = seedMyNetEmployment({ "a:org": "Acme" });
    const got = await resolveEmployments({ employment: { "@id": uriOf(a) } }, vocab, VAULT);
    expect(got.resolved.map((e) => e.company)).toEqual(["Acme"]);
  });
});
