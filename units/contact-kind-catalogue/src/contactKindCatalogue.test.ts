// The catalogues are READ from the master, ⛔ never listed in the app. The served documents in
// test/contactCatalogue.master.json are the master's own, read live 2026-10-16T02:45Z (the ontology host, anonymous GET).
import { beforeEach, describe, expect, it } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import fixture from "../test/contactCatalogue.master.json";
import { masterFetch } from "../test/masterFetch";
import { __resetCatalogueCache, readMasterCatalogue, typeAncestry } from "./contactKindCatalogue";

const M = "https://ontology.example.test/base";
const searches = fixture.search as Record<string, { q: string; body: unknown }>;

const master = masterFetch;

beforeEach(() => {
  __resetCatalogueCache();
  resetTermOrigin();
  setTermOrigin("https://ontology.example.test");
});

describe("the circle-label catalogue", () => {
  it("is the master's four entries, in the master's labelOrder, with no type named in the app", async () => {
    const m = master();
    const cat = await readMasterCatalogue("circleLabel", { fetchImpl: m.fetchImpl });
    expect(cat.complete).toBe(true);
    expect(cat.entries.map((e) => e.label)).toEqual(["Personal · 1st Connection", "Personal · Inner Circle", "Professional · 1st Connection", "Professional · Inner Circle"]);
    expect(cat.entries.map((e) => e.order)).toEqual([1, 2, 3, 4]);
    expect(cat.entries.every((e) => e.axis === "circleLabel" && !e.own && e.playableBy.length === 0)).toBe(true);
    expect(cat.entries[0]!.id).toBe(`${M}/e/circle-label-personal-first-degree`);
  });

  it("asks the master by the catalogue type, with a word of the type's OWN label as the query (nothing typed here)", async () => {
    const m = master();
    await readMasterCatalogue("circleLabel", { fetchImpl: m.fetchImpl });
    const search = m.log.find((u) => u.includes("/base/search?"))!;
    const q = new URL(search).searchParams;
    expect(q.get("type")).toBe("CircleLabel");
    expect(q.get("q")).toBe("circle");
    // The search word comes from the type's NAME, so the type's own document is not read (one request saved per list).
    expect(m.log).not.toContain(`${M}/t/CircleLabel`);
  });
});

describe("the relationship-kind catalogue", () => {
  it("is the master's twelve kinds in labelOrder", async () => {
    const cat = await readMasterCatalogue("relationshipKind", { fetchImpl: master().fetchImpl });
    expect(cat.entries.map((e) => e.label)).toEqual([
      "Customer", "Prospect", "Supplier", "Partner", "Friend", "Family", "Colleague", "Advisor", "Competitor", "Investor", "Public authority", "Non-profit",
    ]);
  });

  it("carries each kind's applicability as TYPE addresses (the master serves them as entity ids; they are resolved to types)", async () => {
    const cat = await readMasterCatalogue("relationshipKind", { fetchImpl: master().fetchImpl });
    const by = Object.fromEntries(cat.entries.map((e) => [e.label, e.playableBy]));
    expect(by["Friend"]).toEqual([`${M}/t/Person`]);
    expect(by["Competitor"]).toEqual([`${M}/t/Organization`]);
    expect([...by["Customer"]!].sort()).toEqual([`${M}/t/Organization`, `${M}/t/Person`]);
  });

  it("says so when the master did not list every entry: a floor, never presented as the whole", async () => {
    const body = { ...(searches["RelationshipKind"]!.body as object), complete: false, next: null };
    const cat = await readMasterCatalogue("relationshipKind", { fetchImpl: master({ search: { RelationshipKind: body } }).fetchImpl });
    expect(cat.complete).toBe(false);
    expect(cat.entries.length).toBe(12);
  });

  it("an entry that did not read is left out AND the catalogue says it is not whole", async () => {
    const cat = await readMasterCatalogue("relationshipKind", { fetchImpl: master({ fail: new Set([`${M}/e/relationship-kind-friend`]) }).fetchImpl });
    expect(cat.complete).toBe(false);
    expect(cat.entries.map((e) => e.label)).not.toContain("Friend");
    expect(cat.entries.length).toBe(11);
  });

  it("a master that cannot be asked is an error the caller shows, never an empty list", async () => {
    const m = master({ fail: new Set([`${M}/search?${new URLSearchParams({ type: "RelationshipKind", q: "relationship", vault: M }).toString()}`]) });
    await expect(readMasterCatalogue("relationshipKind", { fetchImpl: m.fetchImpl })).rejects.toThrow(/relationship/i);
  });

  it("is read once per session: the second read asks the master nothing", async () => {
    const m = master();
    await readMasterCatalogue("relationshipKind", { fetchImpl: m.fetchImpl });
    const n = m.log.length;
    await readMasterCatalogue("relationshipKind", { fetchImpl: m.fetchImpl });
    expect(m.log.length).toBe(n);
  });
});

describe("typeAncestry — a kind for Person is offered on any type below Person", () => {
  const chain = {
    [`${M}/t/Person`]: { "a:subTypeOf": { "@id": `${M}/t/Animal` } },
    [`${M}/t/Animal`]: { "a:subTypeOf": { "@id": `${M}/t/Organism` } },
    [`${M}/t/Organism`]: {},
    [`${M}/t/Passenger`]: { "a:subTypeOf": { "@id": `${M}/t/Person` } },
  };
  it("is the type and every type above it", async () => {
    const m = master({ extra: chain });
    expect([...(await typeAncestry(`${M}/t/Passenger`, { fetchImpl: m.fetchImpl }))].sort()).toEqual(
      [`${M}/t/Animal`, `${M}/t/Organism`, `${M}/t/Passenger`, `${M}/t/Person`].sort(),
    );
  });
  it("stops on a cycle", async () => {
    const m = master({ extra: { [`${M}/t/A`]: { "a:subTypeOf": { "@id": `${M}/t/B` } }, [`${M}/t/B`]: { "a:subTypeOf": { "@id": `${M}/t/A` } } } });
    expect([...(await typeAncestry(`${M}/t/A`, { fetchImpl: m.fetchImpl }))].sort()).toEqual([`${M}/t/A`, `${M}/t/B`]);
  });
  it("a type that did not answer is itself only (never a guess of what is above it)", async () => {
    const m = master({ fail: new Set([`${M}/t/Passenger`]) });
    expect([...(await typeAncestry(`${M}/t/Passenger`, { fetchImpl: m.fetchImpl }))]).toEqual([`${M}/t/Passenger`]);
  });
});
