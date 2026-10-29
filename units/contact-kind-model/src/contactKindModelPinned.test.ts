// The unit's exports pinned. The ported tests are in the other test files.
import { describe, expect, it } from "vitest";
import { catalogFromGraph } from "@kaigilb/gilbplatformcode-lws-relations";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import fixture from "../test/relationsMaster.json";
import * as unit from "./index";
import { chipText, offeredFor, orderEntries, type CatalogueEntry, type ContactChip, type KindEntry, type KindPredicate } from "./contactKindModel";
import { placementChip } from "./placementChips";
import { moreTypeOptions, orderByShortcuts, shortcutDisplay, shortcutOfType, startShortcuts, type StartShortcut } from "./stakeholderStart";
import { DEFAULT_PARTY_TIE_CURIE, canonicalEntity, edgesToVault, headerRelations, isDefaultPartyTie, sameEntity, vaultKindCurie } from "./headerRelations";

type Doc = Record<string, unknown>;
const CATALOG = catalogFromGraph(fixture.vocab["@graph"] as Doc[], "user");
const REC = "https://ann.example.test/base/e/rec";
const VAULT = "https://ann.example.test/base/e/vault";
const row = (type: string | undefined, src: string, tgt: string, members = true): RecordRelation =>
  ({
    relation: "https://ann.example.test/base/r/1",
    role: "role:source",
    ...(type ? { type } : {}),
    ...(members ? { members: [{ member: src, role: "role:source" }, { member: tgt, role: "role:target" }] } : {}),
  }) as RecordRelation;

describe("the export list", () => {
  it("is the source's names plus the constant the tie code needs", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "DEFAULT_PARTY_TIE_CURIE", "canonicalEntity", "chipText", "edgesToVault", "headerRelations", "isDefaultPartyTie", "moreTypeOptions",
        "notYetChosen", "offeredFor", "orderByShortcuts", "orderEntries", "placementChip", "sameEntity", "shortcutDisplay", "shortcutOfType",
        "startShortcuts", "toneOfCircleLabel", "vaultKindCurie",
      ].sort(),
    );
  });
});

describe("KindEntry", () => {
  it("is a catalogue entry with the relation fields on top, and stays an entry for orderEntries and offeredFor", () => {
    const predicate: KindPredicate = { curie: "t:FriendOf" };
    const entry: KindEntry = { id: "e", label: "Friend", order: 1, playableBy: [], axis: "relationshipKind", own: false, kindPredicate: predicate, kindForVault: ["x"], defaultTie: false };
    const plain: CatalogueEntry = entry;
    expect(orderEntries([entry])).toEqual([plain]);
    expect(offeredFor([entry], new Set())).toEqual([entry]);
    const unread: KindEntry = { ...entry, kindPredicate: null };
    expect(unread.kindPredicate).toBeNull();
  });
});

describe("chipText, orderEntries", () => {
  it("chipText drops the middle dot only once, with its two spaces", () => {
    expect(chipText("Professional · Inner Circle")).toBe("Professional Inner Circle");
    expect(chipText("A · B · C")).toBe("A B · C");
    expect(chipText("Friend")).toBe("Friend");
  });
  it("orderEntries: two entries with the same order are by name; a number beats none", () => {
    const e = (id: string, label: string, order: number | null): CatalogueEntry => ({ id, label, order, playableBy: [], axis: "relationshipKind", own: false });
    expect(orderEntries([e("b", "B", 1), e("a", "A", 1), e("n", "N", null), e("z", "Z", 0)]).map((x) => x.id)).toEqual(["z", "a", "b", "n"]);
  });
});

describe("placementChip", () => {
  it("keys and names a placement by its context and depth, with the words of person-connections; the tone follows the context", () => {
    const personal = placementChip({ context: "personal", depth: "inner" } as never);
    expect(personal).toMatchObject({ key: "personal:inner", axis: "circleLabel", entryId: "personal:inner", tone: "personal" });
    expect(personal.label).toMatch(/\S/);
    expect(placementChip({ context: "professional", depth: "connection" } as never)).toMatchObject({ key: "professional:connection", tone: "professional" });
    const chip: ContactChip = personal;
    expect(chip.claimId).toBeUndefined();
  });
});

describe("stakeholderStart", () => {
  it("shortcutDisplay: the typed word for Software System, else the master's label, else the name", () => {
    expect(shortcutDisplay("SoftwareSystem", "Software System")).toBe("System");
    expect(shortcutDisplay("SoftwareSystem", null)).toBe("System");
    expect(shortcutDisplay("Person", "Human")).toBe("Human");
    expect(shortcutDisplay("Person", null)).toBe("Person");
  });
  it("startShortcuts: nothing without a reading, without the term, or when the dialog can create none of them", () => {
    expect(startShortcuts(undefined, [{ typeName: "Person" }])).toEqual([]);
    expect(startShortcuts({}, [{ typeName: "Person" }])).toEqual([]);
    expect(startShortcuts({ createShortcuts: [{ term: "t", name: "Person", label: null }] }, [])).toEqual([]);
  });
  it("startShortcuts: a step is kept only when it can be created, labelled by its own name when the master gave no label", () => {
    const r = startShortcuts(
      { createShortcuts: [{ term: "t/P", name: "Person", label: "Person" }], shortcutSteps: { Person: [{ name: "A", label: null, depth: 1 }, { name: "B", label: "B", depth: 2 }] } },
      [{ typeName: "Person" }, { typeName: "A" }],
    );
    expect(r).toEqual([{ name: "Person", term: "t/P", display: "Person", masterLabel: "Person", steps: [{ name: "A", label: "A", depth: 1 }] }]);
  });
  it("shortcutOfType prefers the shortcut's own type to a step of another; orderByShortcuts and moreTypeOptions keep every option once", () => {
    const sc: StartShortcut[] = [
      { name: "X", term: "x", display: "X", masterLabel: null, steps: [{ name: "Y", label: "Y", depth: 1 }] },
      { name: "Y", term: "y", display: "Y", masterLabel: null, steps: [] },
    ];
    expect(shortcutOfType(sc, "Y")?.name).toBe("Y");
    expect(shortcutOfType(sc, "Z")).toBeNull();
    const opts = [{ typeName: "Z" }, { typeName: "Y" }, { typeName: "X" }, { typeName: "W" }];
    expect(orderByShortcuts(opts, sc).map((o) => o.typeName)).toEqual(["X", "Y", "Z", "W"]);
    expect(orderByShortcuts(opts, []).map((o) => o.typeName)).toEqual(["Z", "Y", "X", "W"]);
    expect(moreTypeOptions(opts, sc).map((o) => o.typeName)).toEqual(["Z", "W"]);
    expect(orderByShortcuts([{ typeName: "Z" }], sc).map((o) => o.typeName)).toEqual(["Z"]);
  });
});

describe("entity addresses and the default tie", () => {
  it("canonicalEntity: scheme, lower-cased host and path, no trailing slash, no query or fragment; an unparsable text loses only its trailing slashes", () => {
    expect(canonicalEntity("HTTPS://Ann.Example.test/base/e/X/?q=1#f")).toBe("https://ann.example.test/base/e/X");
    expect(canonicalEntity("https://ann.example.test:8443/a//")).toBe("https://ann.example.test:8443/a");
    expect(canonicalEntity("not a url//")).toBe("not a url");
    expect(canonicalEntity("")).toBe("");
    expect(canonicalEntity(null)).toBe("");
    expect(canonicalEntity(undefined)).toBe("");
  });
  it("sameEntity: false when either is missing", () => {
    expect(sameEntity("https://A.example.test/x/", "https://a.example.test/x")).toBe(true);
    expect(sameEntity("https://a.example.test/x", "https://a.example.test/y")).toBe(false);
    expect(sameEntity("", "")).toBe(false);
    expect(sameEntity(null, "https://a.example.test/x")).toBe(false);
  });
  it("the default tie is t:AssociatedWith, in any spelling of its name", () => {
    expect(DEFAULT_PARTY_TIE_CURIE).toBe("t:AssociatedWith");
    expect(isDefaultPartyTie("t:AssociatedWith")).toBe(true);
    expect(isDefaultPartyTie("https://ontology.example.test/base/t/AssociatedWith")).toBe(true);
    expect(isDefaultPartyTie("t:FriendOf")).toBe(false);
    expect(isDefaultPartyTie(null)).toBe(false);
    expect(isDefaultPartyTie(undefined)).toBe(false);
    expect(isDefaultPartyTie("")).toBe(false);
  });
});

describe("vaultKindCurie, edgesToVault", () => {
  it("a row without type or members, an empty member list, or a missing end, entity or catalog is not a tie", () => {
    expect(vaultKindCurie(row(undefined, REC, VAULT), REC, VAULT, CATALOG)).toBeNull();
    expect(vaultKindCurie(row("t:CustomerOf", REC, VAULT, false), REC, VAULT, CATALOG)).toBeNull();
    expect(vaultKindCurie({ ...row("t:CustomerOf", REC, VAULT), members: [] }, REC, VAULT, CATALOG)).toBeNull();
    expect(vaultKindCurie(row("t:CustomerOf", REC, VAULT), null, VAULT, CATALOG)).toBeNull();
    expect(vaultKindCurie(row("t:CustomerOf", REC, VAULT), REC, undefined, CATALOG)).toBeNull();
    expect(vaultKindCurie(row("t:CustomerOf", REC, VAULT), REC, VAULT, null)).toBeNull();
    expect(vaultKindCurie(row("t:NotAUserTerm", REC, VAULT), REC, VAULT, CATALOG)).toBeNull();
  });
  it("forward is a tie; backward only for a symmetric term; a type in another spelling reaches the same term", () => {
    expect(vaultKindCurie(row("t:CustomerOf", REC, VAULT), REC, VAULT, CATALOG)).toBe("t:CustomerOf");
    expect(vaultKindCurie(row("t:CustomerOf", VAULT, REC), REC, VAULT, CATALOG)).toBeNull();
    expect(vaultKindCurie(row("t:FriendOf", VAULT, REC), REC, VAULT, CATALOG)).toBe("t:FriendOf");
    expect(vaultKindCurie(row("https://ontology.example.test/base/t/CustomerOf", REC, VAULT), REC, VAULT, CATALOG)).toBe("t:CustomerOf");
  });
  it("edgesToVault: each CURIE once in the order found; nothing for missing input", () => {
    const rows = [row("t:FriendOf", REC, VAULT), row("t:CustomerOf", REC, VAULT), row("t:FriendOf", VAULT, REC)];
    expect(edgesToVault(rows, REC, VAULT, CATALOG)).toEqual(["t:FriendOf", "t:CustomerOf"]);
    expect(edgesToVault(null, REC, VAULT, CATALOG)).toEqual([]);
    expect(edgesToVault(undefined, REC, VAULT, CATALOG)).toEqual([]);
    expect(edgesToVault(rows, null, VAULT, CATALOG)).toEqual([]);
    expect(edgesToVault(rows, REC, null, CATALOG)).toEqual([]);
    expect(edgesToVault(rows, REC, VAULT, null)).toEqual([]);
  });
});

describe("headerRelations", () => {
  const base = { kindChips: null, entryPredicates: new Map(), predicateCuries: new Map(), catalogFailed: false, edges: [] as string[], contactName: "Ben Lund", holderName: "Ann Berg" };
  it("with no chips and no edges: nothing, whether or not the catalog has read", () => {
    expect(headerRelations({ ...base, catalog: CATALOG })).toEqual([]);
    expect(headerRelations({ ...base, catalog: null })).toEqual([]);
  });
  it("an edge is named by the term's label; the same edge twice is one chip; its hover names both people and the term", () => {
    const r = headerRelations({ ...base, catalog: CATALOG, edges: ["t:CustomerOf", "t:CustomerOf"] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ key: "t:CustomerOf", text: "customer-of", kind: "predicate", curie: "t:CustomerOf" });
    expect(r[0]!.title).toBe("Ben Lund customer-of Ann Berg · GilbVeda t:CustomerOf · private, grants nothing");
  });
  it("an edge whose term is not in the catalog is named by its CURIE; the hover says why, differently when the read failed", () => {
    const missing = headerRelations({ ...base, catalog: CATALOG, edges: ["t:Nope"] })[0]!;
    expect(missing).toMatchObject({ text: "t:Nope", kind: "term-name" });
    expect(missing.title).toBe("t:Nope is not in GilbVeda's user relations; its own name is shown");
    const failed = headerRelations({ ...base, catalog: null, catalogFailed: true, edges: ["t:Nope"] })[0]!;
    expect(failed.title).toBe("The GilbVeda vocabulary could not be read; its own name is shown");
  });
  it("a kind chip waiting for its words (the pending dot), or on another axis, is not drawn", () => {
    const chip = (over: Partial<ContactChip>): ContactChip => ({ key: "k", axis: "relationshipKind", entryId: "e1", label: "Customer", tone: "neutral", ...over });
    const common = { ...base, catalog: CATALOG, entryPredicates: new Map([["e1", null]]) };
    expect(headerRelations({ ...common, kindChips: [chip({ label: "…" })] })).toEqual([]);
    expect(headerRelations({ ...common, kindChips: [chip({ axis: "circleLabel" })] })).toEqual([]);
    expect(headerRelations({ ...common, kindChips: [chip({})] })).toHaveLength(1);
  });
  it("a kind that names a predicate waits for the catalog (not failed) before it is drawn; it is drawn once the catalog failed", () => {
    const chip: ContactChip = { key: "k", axis: "relationshipKind", entryId: "e1", label: "Customer", tone: "neutral" };
    const input = { ...base, kindChips: [chip], entryPredicates: new Map([["e1", "ref"]]), predicateCuries: new Map([["ref", "t:CustomerOf"]]) };
    expect(headerRelations({ ...input, catalog: null })).toEqual([]);
    expect(headerRelations({ ...input, catalog: null, catalogFailed: true }).map((c) => c.text)).toEqual(["t:CustomerOf"]);
    expect(headerRelations({ ...input, catalog: CATALOG }).map((c) => c.text)).toEqual(["customer-of"]);
  });
  it("two kinds of one holder's own with the same entry are one chip; an own chip has no CURIE and a title that grants nothing", () => {
    const own: ContactChip = { key: "k", axis: "relationshipKind", entryId: "own1", label: "Book club", tone: "neutral" };
    const r = headerRelations({ ...base, catalog: CATALOG, kindChips: [own, { ...own, key: "k2" }], entryPredicates: new Map([["own1", null]]) });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ key: "own:own1", kind: "own", curie: null, text: "Book club" });
    expect(r[0]!.title).toBe("Book club: your own label for Ben Lund. Not a GilbVeda relation; private; grants nothing.");
  });
});
