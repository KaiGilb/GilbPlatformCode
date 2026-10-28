// Pinning tests for planLinks: every export has at least one, and the odd cases are pinned as the code does them.
import { afterEach, describe, expect, it } from "vitest";
import { isTypeName as typeKeyIsTypeName, resetTypeKey, setTypeKey } from "@kaigilb/gilbplatformcode-type-key";
import {
  alreadyMeasuresSentence,
  duplicateTagSentence,
  isTypeName,
  linkAddress,
  partOfExcludedIds,
  pointsAt,
  recordTag,
  tagMatches,
  taggedChildren,
  withLinkFact,
  type PlanLinkFacts,
} from "./index";

const HOST = "https://vault.example.test";
const e = (id: string) => `${HOST}/base/e/${id}`;

afterEach(() => resetTypeKey());

describe("recordTag", () => {
  it("is the unitTag, else the tag, trimmed", () => {
    expect(recordTag({ unitTag: "F.1", tag: "other" })).toBe("F.1");
    expect(recordTag({ tag: "  other  " })).toBe("other");
    expect(recordTag({ unitTag: "   ", tag: "t" })).toBe("t");
  });
  it("is empty when there is neither, or no facts; other keys are not a tag", () => {
    expect(recordTag({})).toBe("");
    expect(recordTag({ label: "Walk", name: "Walk", "a:unitTag": "x" })).toBe("");
    expect(recordTag(null)).toBe("");
    expect(recordTag(undefined)).toBe("");
  });
  it("falls back to the main tag only when the record holds no unitTag or tag", () => {
    expect(recordTag({ unitTag: "PT-1" }, "somethingelse")).toBe("PT-1");
    expect(recordTag({ tag: "t" }, "somethingelse")).toBe("t");
    expect(recordTag({}, "alpha")).toBe("alpha");
    expect(recordTag({})).toBe("");
  });
  it("trims the main tag and treats a blank one as none", () => {
    expect(recordTag(null, " beta ")).toBe("beta");
    expect(recordTag({ tag: " " }, null)).toBe("");
    expect(recordTag({ tag: " " }, "   ")).toBe("");
  });
});

describe("isTypeName", () => {
  it("is the type-key unit's function itself (the export list is unchanged)", () => {
    expect(isTypeName).toBe(typeKeyIsTypeName);
  });
  it("compares under the default key: case and spelling do not matter", () => {
    expect(isTypeName("t:Function", "Function")).toBe(true);
    expect(isTypeName(`${HOST}/base/t/Function`, "function")).toBe(true);
    expect(isTypeName("t:Solution", "Function")).toBe(false);
  });
  it("follows a key the host set once with setTypeKey", () => {
    expect(isTypeName("t:Note", "t:NoteDocument")).toBe(false);
    setTypeKey((t) => (t.replace(/^t:/, "") === "NoteDocument" ? "note" : t.replace(/^t:/, "").toLowerCase()));
    expect(isTypeName("t:Note", "t:NoteDocument")).toBe(true);
  });
});

describe("linkAddress", () => {
  const rec = (facts: Record<string, string>, served?: Record<string, unknown>): PlanLinkFacts => ({
    facts,
    ...(served ? { served: { facts: served } } : {}),
  });

  it("reads a served {\"@id\"} and rebuilds the canonical address", () => {
    expect(linkAddress(rec({}, { fvParent: { "@id": e("p") } }), "fvParent")).toBe(e("p"));
    expect(linkAddress(rec({}, { fvParent: { "@id": `${e("p")}?x=1#h` } }), "fvParent")).toBe(e("p"));
  });
  it("keeps a served @id that is not an entity address, trimmed", () => {
    expect(linkAddress(rec({}, { fvParent: { "@id": "  urn:thing:1 " } }), "fvParent")).toBe("urn:thing:1");
  });
  it("the served value wins over the flat fact", () => {
    expect(linkAddress(rec({ fvParent: e("flat") }, { fvParent: { "@id": e("served") } }), "fvParent")).toBe(e("served"));
  });
  it("reads a served list of links: the first usable one", () => {
    expect(linkAddress(rec({}, { fvParent: [{ "@id": "" }, "bare", { "@id": e("second") }, { "@id": e("third") }] }), "fvParent")).toBe(e("second"));
    expect(linkAddress(rec({}, { fvParent: [] }), "fvParent")).toBeNull();
  });
  it("finds the served link under a: or a full-IRI spelling of the slug", () => {
    expect(linkAddress(rec({}, { "a:measures": [{ "@id": e("v") }] }), "measures")).toBe(e("v"));
    expect(linkAddress(rec({}, { "https://x.example.test/a/measures": { "@id": e("v") } }), "measures")).toBe(e("v"));
  });
  it("a bare string in the served facts is not a served link, so the flat fact is read", () => {
    expect(linkAddress(rec({ fvParent: e("flat") }, { fvParent: e("served-string") }), "fvParent")).toBe(e("flat"));
    expect(linkAddress(rec({}, { fvParent: e("served-string") }), "fvParent")).toBeNull();
  });
  it("reads a flattened address, canonical", () => {
    expect(linkAddress(rec({ fvParent: ` ${e("p")}/ ` }), "fvParent")).toBe(e("p"));
    expect(linkAddress(rec({ fvParent: `${HOST}/vault/e/p?q` }), "fvParent")).toBe(`${HOST}/vault/e/p`);
  });
  it("reads a flat a:-spelled key", () => {
    expect(linkAddress(rec({ "a:fvParent": e("p") }), "fvParent")).toBe(e("p"));
  });
  it("reads a flat JSON string holding {\"@id\"}; broken JSON and a JSON list are nothing", () => {
    expect(linkAddress(rec({ fvParent: JSON.stringify({ "@id": e("p") }) }), "fvParent")).toBe(e("p"));
    expect(linkAddress(rec({ fvParent: '{"@id": ' }), "fvParent")).toBeNull();
    expect(linkAddress(rec({ fvParent: JSON.stringify([{ "@id": e("p") }]) }), "fvParent")).toBeNull();
  });
  it("a flat fact that is not an entity address, or is blank, is nothing", () => {
    expect(linkAddress(rec({ fvParent: "walk faster" }), "fvParent")).toBeNull();
    expect(linkAddress(rec({ fvParent: "   " }), "fvParent")).toBeNull();
    expect(linkAddress(rec({ fvParent: `${HOST}/base/t/Function` }), "fvParent")).toBeNull();
    expect(linkAddress(rec({}), "fvParent")).toBeNull();
  });
  it("a record with no facts object is nothing", () => {
    expect(linkAddress({} as unknown as PlanLinkFacts, "fvParent")).toBeNull();
  });
  it("an {\"@id\"} that is not a string is nothing", () => {
    expect(linkAddress(rec({}, { fvParent: { "@id": 5 } }), "fvParent")).toBeNull();
    expect(linkAddress(rec({}, { fvParent: null }), "fvParent")).toBeNull();
  });
});

describe("pointsAt", () => {
  const row = (parent: string): PlanLinkFacts => ({ facts: { fvParent: parent } });

  it("is true when the link names the target by address or by id form", () => {
    expect(pointsAt(row(e("walk")), "fvParent", { id: "walk" })).toBe(true);
    expect(pointsAt(row(e("walk")), "fvParent", { id: "x", entityUri: e("walk") })).toBe(true);
  });
  it("is true when only the id matches, whatever host or base/vault segment the address has", () => {
    expect(pointsAt(row(e("walk")), "fvParent", { id: "x", entityUri: `${HOST}/vault/e/walk` })).toBe(true);
    expect(pointsAt(row(e("walk")), "fvParent", { id: "x", entityUri: "https://other.example.test/base/e/walk" })).toBe(true);
  });
  it("is false for another record, for no link, and for a link on another slug", () => {
    expect(pointsAt(row(e("walk")), "fvParent", { id: "run", entityUri: e("run") })).toBe(false);
    expect(pointsAt({ facts: {} }, "fvParent", { id: "walk" })).toBe(false);
    expect(pointsAt(row(e("walk")), "partOf", { id: "walk" })).toBe(false);
  });
  it("a served link that is not an entity address matches only the target's id or address, exactly", () => {
    const served = (id: string): PlanLinkFacts => ({ facts: {}, served: { facts: { fvParent: { "@id": id } } } });
    expect(pointsAt(served("urn:thing:1"), "fvParent", { id: "urn:thing:1" })).toBe(true);
    expect(pointsAt(served("urn:thing:1"), "fvParent", { id: "x", entityUri: "urn:thing:1" })).toBe(true);
    expect(pointsAt(served("urn:thing:1"), "fvParent", { id: "x" })).toBe(false);
  });
  it("a flat fact that is not an entity address is no link at all, so it points at nothing", () => {
    expect(pointsAt(row("urn:thing:1"), "fvParent", { id: "urn:thing:1" })).toBe(false);
  });
  it("reads a served link", () => {
    expect(pointsAt({ facts: {}, served: { facts: { partOf: [{ "@id": e("walk") }] } } }, "partOf", { id: "walk", entityUri: e("walk") })).toBe(true);
  });
});

describe("partOfExcludedIds", () => {
  const r = (id: string, parent?: string) => ({
    id,
    entityUri: e(id),
    facts: (parent ? { fvParent: parent } : {}) as Record<string, string>,
  });

  it("holds the record's own id and addresses when nothing points up to it", () => {
    const out = partOfExcludedIds({ id: "a", entityUri: e("a") }, [r("b"), r("c", e("b"))]);
    expect([...out].sort()).toEqual(["a", e("a")].sort());
  });
  it("holds a record with no entity address by its id alone", () => {
    expect([...partOfExcludedIds({ id: "a" }, [])]).toEqual(["a"]);
  });
  it("blocks every record that reaches it through fvParent, however far, whatever the pool order", () => {
    const pool = [r("d", e("c")), r("c", e("b")), r("b", e("a")), r("x", e("y")), r("y")];
    const out = partOfExcludedIds({ id: "a", entityUri: e("a") }, pool);
    for (const id of ["a", "b", "c", "d"]) {
      expect(out.has(id)).toBe(true);
      expect(out.has(e(id))).toBe(true);
    }
    for (const id of ["x", "y"]) {
      expect(out.has(id)).toBe(false);
      expect(out.has(e(id))).toBe(false);
    }
  });
  it("matches a parent link by id spelling too, and reads a served link", () => {
    const pool = [
      { id: "b", entityUri: e("b"), facts: {}, served: { facts: { fvParent: { "@id": `${HOST}/vault/e/a` } } } },
    ];
    expect(partOfExcludedIds({ id: "a", entityUri: e("a") }, pool).has("b")).toBe(true);
  });
  it("blocks the other spelling of an address it holds", () => {
    const out = partOfExcludedIds({ id: "a", entityUri: `${HOST}/vault/e/a?x=1` }, []);
    expect(out.has(`${HOST}/vault/e/a?x=1`)).toBe(true);
    expect(out.has(`${HOST}/vault/e/a`)).toBe(true);
    expect(out.has("a")).toBe(true);
  });
  it("does not stop on a cycle among other records", () => {
    const pool = [r("x", e("y")), r("y", e("x")), r("b", e("a"))];
    const out = partOfExcludedIds({ id: "a", entityUri: e("a") }, pool);
    expect(out.has("b")).toBe(true);
    expect(out.has("x")).toBe(false);
  });
  it("a record that is the record itself in the pool is not a second entry", () => {
    const out = partOfExcludedIds({ id: "a", entityUri: e("a") }, [r("a", e("a"))]);
    expect([...out].sort()).toEqual(["a", e("a")].sort());
  });
});

describe("tagMatches", () => {
  it("an empty or blank needle matches every tag, even an empty one", () => {
    expect(tagMatches("F.1", "")).toBe(true);
    expect(tagMatches("F.1", "   ")).toBe(true);
    expect(tagMatches("", "")).toBe(true);
  });
  it("is a case-insensitive contains, on the trimmed needle", () => {
    expect(tagMatches("Walk.Faster", "walk")).toBe(true);
    expect(tagMatches("Walk.Faster", " FASTER ")).toBe(true);
    expect(tagMatches("Walk.Faster", "k.f")).toBe(true);
    expect(tagMatches("Walk.Faster", "run")).toBe(false);
    expect(tagMatches("", "x")).toBe(false);
  });
});

describe("sentences", () => {
  it("alreadyMeasuresSentence", () => {
    expect(alreadyMeasuresSentence("V.1", "V.2")).toBe('"V.1" already measures "V.2".');
  });
  it("duplicateTagSentence", () => {
    expect(duplicateTagSentence("F.1")).toBe('The tag "F.1" is already used in this vault. Pick another.');
  });
});

describe("withLinkFact", () => {
  it("sets the flat fact to the address and the served fact to {\"@id\"}, leaving the rest", () => {
    const facts = { unitTag: "F", other: "o" };
    const served = { unitTag: "F", other: "o" };
    const out = withLinkFact(facts, served, "fvParent", e("p"));
    expect(out.facts).toEqual({ unitTag: "F", other: "o", fvParent: e("p") });
    expect(out.servedFacts).toEqual({ unitTag: "F", other: "o", fvParent: { "@id": e("p") } });
    expect(facts).toEqual({ unitTag: "F", other: "o" });
    expect(served).toEqual({ unitTag: "F", other: "o" });
  });
  it("replaces a link already there", () => {
    const out = withLinkFact({ fvParent: e("old") }, { fvParent: { "@id": e("old") } }, "fvParent", e("new"));
    expect(out.facts.fvParent).toBe(e("new"));
    expect(out.servedFacts.fvParent).toEqual({ "@id": e("new") });
  });
  it("null retracts both", () => {
    const out = withLinkFact({ fvParent: e("p"), k: "v" }, { fvParent: { "@id": e("p") }, k: "v" }, "fvParent", null);
    expect(out.facts).toEqual({ k: "v" });
    expect(out.servedFacts).toEqual({ k: "v" });
    expect("fvParent" in out.facts).toBe(false);
  });
  it("with no served facts, makes a served bag holding the link alone", () => {
    expect(withLinkFact({}, undefined, "partOf", e("s"))).toEqual({ facts: { partOf: e("s") }, servedFacts: { partOf: { "@id": e("s") } } });
    expect(withLinkFact({}, undefined, "partOf", null)).toEqual({ facts: {}, servedFacts: {} });
  });
  it("an empty string is a set, not a retract", () => {
    expect(withLinkFact({}, undefined, "partOf", "")).toEqual({ facts: { partOf: "" }, servedFacts: { partOf: { "@id": "" } } });
  });
  it("the result links read back through linkAddress", () => {
    const out = withLinkFact({}, undefined, "fvParent", e("p"));
    expect(linkAddress({ facts: out.facts, served: { facts: out.servedFacts } }, "fvParent")).toBe(e("p"));
  });
});

describe("taggedChildren", () => {
  const parent = { id: "p", entityUri: e("p") };
  const child = (id: string, tag: string, facts: Record<string, string> = {}, typeUri = "t:Function", served?: Record<string, unknown>) => ({
    id,
    entityUri: e(id),
    typeUri,
    facts: { unitTag: tag, ...facts },
    ...(served ? { served: { facts: served } } : {}),
  });

  it("is the records of the type whose slug points at the record, sorted by tag then id", () => {
    const pool = [
      child("c3", "F.2", { fvParent: e("p") }),
      child("c1", "F.1", { fvParent: e("p") }),
      child("c2", "F.1", { fvParent: e("p") }),
      child("other", "F.0", { fvParent: e("elsewhere") }),
      child("sol", "S.1", { fvParent: e("p") }, "t:Solution"),
    ];
    expect(taggedChildren(parent, pool, "fvParent", "Function").map((r) => r.id)).toEqual(["c1", "c2", "c3"]);
  });
  it("returns the pool's own row objects", () => {
    const c = child("c1", "F.1", { fvParent: e("p") });
    expect(taggedChildren(parent, [c], "fvParent", "Function")[0]).toBe(c);
  });
  it("checks the type under the type-key (case and spelling)", () => {
    const pool = [child("c1", "F.1", { fvParent: e("p") }, `${HOST}/base/t/Function`)];
    expect(taggedChildren(parent, pool, "fvParent", "function")).toHaveLength(1);
  });
  it("a record that points at the record by a later slug is found: only the first pointer is reported by childrenPointingAt", () => {
    const pool = [child("c1", "F.1", { aaa: e("p"), fvParent: e("p") })];
    expect(taggedChildren(parent, pool, "fvParent", "Function").map((r) => r.id)).toEqual(["c1"]);
    expect(taggedChildren(parent, pool, "aaa", "Function").map((r) => r.id)).toEqual(["c1"]);
    expect(taggedChildren(parent, pool, "zzz", "Function")).toEqual([]);
  });
  it("finds a child whose link is only in the served facts", () => {
    const pool = [{ id: "c1", typeUri: "t:Function", facts: { unitTag: "F.1" }, served: { facts: { fvParent: [{ "@id": e("p") }] } } }];
    expect(taggedChildren(parent, pool, "fvParent", "Function")).toHaveLength(1);
  });
  it("a record that names itself is returned: pointsAt has no self check", () => {
    expect(taggedChildren(parent, [child("p", "F", { fvParent: e("p") })], "fvParent", "Function")).toHaveLength(1);
  });
  it("is empty for an empty pool or another type", () => {
    expect(taggedChildren(parent, [], "fvParent", "Function")).toEqual([]);
    expect(taggedChildren(parent, [child("c1", "F", { fvParent: e("p") })], "fvParent", "Solution")).toEqual([]);
  });
  it("a record whose first pointer slug is one of the skipped identity slugs is still found by its fvParent", () => {
    // heldParty points at the parent too, and comes first; the skip set makes childrenPointingAt report fvParent.
    const pool = [child("c1", "F.1", { heldParty: e("p"), fvParent: e("p") })];
    expect(taggedChildren(parent, pool, "fvParent", "Function").map((r) => r.id)).toEqual(["c1"]);
    expect(taggedChildren(parent, pool, "heldParty", "Function").map((r) => r.id)).toEqual(["c1"]);
  });
  it("the skip set is felt only where the flat fact and the served fact disagree: a skipped slug is not taken from the flat map", () => {
    // flat heldParty names the parent, the served heldParty names another record.
    const served = { heldParty: { "@id": e("someone-else") } };
    const skipped = child("c1", "F.1", { heldParty: e("p") }, "t:Function", served);
    expect(taggedChildren(parent, [skipped], "heldParty", "Function")).toEqual([]);
    // the same disagreement on a slug that is not skipped counts the flat fact.
    const kept = child("c2", "F.2", { fvParent: e("p") }, "t:Function", { fvParent: { "@id": e("someone-else") } });
    expect(taggedChildren(parent, [kept], "fvParent", "Function").map((r) => r.id)).toEqual(["c2"]);
  });
  it("each of the eleven skipped slugs is skipped the same way", () => {
    const slugs = ["claimSubject", "heldParty", "profilePhoto", "principalUri", "directReader", "directWriter", "aliasUri", "accountSubject", "registeredVault", "vaultAddress", "anchorBoundEmail"];
    for (const slug of slugs) {
      const c = child("c1", "F.1", { [slug]: e("p") }, "t:Function", { [slug]: { "@id": e("someone-else") } });
      expect(taggedChildren(parent, [c], slug, "Function"), slug).toEqual([]);
    }
    expect(slugs).toHaveLength(11);
  });
});
