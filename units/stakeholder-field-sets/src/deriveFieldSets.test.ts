// New tests: `deriveFieldSets` (the pure step) and `readPartyName`, pinned over hand-made input, one behaviour each; and `resolveFieldSets`'
// ceiling, notes and options over the fixture master.
import { describe, it, expect } from "vitest";
import { masterSource, type PredicateSpelling } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { deriveFieldSets, readPartyName, resolveFieldSets, type DeriveInput } from "./fieldSets";
import { fixtureMaster, RIG, t } from "../test/support";

const H = "https://master.example.test/base";
const ty = (n: string) => `${H}/t/${n}`;
const spelling = (slug: string): PredicateSpelling => ({ term: `${H}/a/${slug}`, readKeys: [`a:${slug}`, slug], writeKey: `a:${slug}`, writeKeyProblem: null });
const predicates = { fieldOf: spelling("fieldOf"), label: spelling("label"), fieldRecordType: spelling("fieldRecordType") };
const kind = (name: string, ancestors: string[], label: string | null = null) => ({ term: ty(name), name, label, ancestors: ancestors.map(ty) });
const decl = (name: string, over: Record<string, unknown>) => ({
  "@id": ty(name),
  "a:predicateAttribute": `a:${name.toLowerCase()}`,
  "a:label": name,
  "a:fieldOf": { "@id": ty("Person") },
  ...over,
});
const derive = (over: Partial<DeriveInput>) =>
  deriveFieldSets({ kinds: [kind("Person", ["Person", "Animal"], "Person")], declarations: [], predicates, ...over });

describe("deriveFieldSets", () => {
  it("gives a kind the fields declared on it or on a type above it, sorted by term, with where each was declared", () => {
    const out = derive({
      kinds: [kind("Person", ["Person", "Animal"], "Person"), kind("Robot", ["Robot", "Thing"], null)],
      declarations: [
        decl("Zeta", { "a:fieldOf": [{ "@id": ty("Animal") }, { "@id": ty("Person") }, { "@id": ty("Elsewhere") }] }),
        decl("Alpha", { "a:fieldOf": { "@id": ty("Person") } }),
        decl("Gamma", { "a:fieldOf": { "@id": ty("Thing") } }),
      ],
    });
    expect(out.byKind[ty("Person")]!.fields.map((f) => [f.term, f.declaredOn])).toEqual([
      [ty("Alpha"), [ty("Person")]],
      [ty("Zeta"), [ty("Animal"), ty("Person")]],
    ]);
    expect(out.byKind[ty("Robot")]!.fields.map((f) => f.term)).toEqual([ty("Gamma")]);
    expect(out.byKind[ty("Person")]).toMatchObject({ kind: ty("Person"), name: "Person", label: "Person", ancestors: [ty("Person"), ty("Animal")] });
    expect(out.byKind[ty("Robot")]!.label).toBeNull();
    expect(out.unreadable).toEqual([]);
  });

  it("a kind with no declarations has an empty set, and no declarations at all gives each kind an empty set", () => {
    const out = derive({ kinds: [kind("A", ["A"]), kind("B", ["B"])] });
    expect(Object.keys(out.byKind)).toEqual([ty("A"), ty("B")]);
    expect(out.byKind[ty("A")]!.fields).toEqual([]);
  });

  it("labels a field from the term's own label keys, takes its spellings, encoding and cardinality from the term, and reads 'multi' only", () => {
    const out = derive({
      declarations: [
        decl("Email", { "a:encoding": "inline-literal:text", "a:cardinality": "multi" }),
        decl("Nick", { "a:predicateAttribute": "a:nick|a:nickOld", "a:deprecatedNotation": "a:nickOld", "a:cardinality": "single", label: undefined }),
        decl("Odd", { "a:cardinality": "Multi", "a:label": undefined }),
      ],
    });
    const by = Object.fromEntries(out.byKind[ty("Person")]!.fields.map((f) => [f.term, f]));
    expect(by[ty("Email")]).toMatchObject({ label: "Email", readKeys: ["a:email", "email"], writeKey: "a:email", writeKeyProblem: null, encoding: "inline-literal:text", many: true, record: null });
    expect(by[ty("Nick")]).toMatchObject({ label: "Nick", writeKey: "a:nick", encoding: null, many: false });
    expect(by[ty("Nick")]!.readKeys.sort()).toEqual(["a:nick", "a:nickOld", "nick", "nickOld"]);
    expect(by[ty("Odd")]).toMatchObject({ label: null, many: false });
  });

  it("a declaration is taken once however often it is listed, the first listing winning", () => {
    const out = derive({ declarations: [decl("Email", { "a:label": "First" }), decl("Email", { "a:label": "Second" })] });
    expect(out.byKind[ty("Person")]!.fields.map((f) => f.label)).toEqual(["First"]);
  });

  it("a document without a:fieldOf is ignored", () => {
    const { "a:fieldOf": _drop, ...bare } = decl("Email", {});
    void _drop;
    const out = derive({ declarations: [bare] });
    expect(out.byKind[ty("Person")]!.fields).toEqual([]);
    expect(out.unreadable).toEqual([]);
  });

  it("a declaration of a kind without an @id is stated; one that names none of the kinds' types is not ours to judge", () => {
    const { "@id": _id, ...noId } = decl("Email", {});
    void _id;
    const stranger = { ...noId, "a:fieldOf": { "@id": ty("Elsewhere") } };
    const out = derive({ declarations: [noId, stranger] });
    expect(out.unreadable).toEqual([{ term: "(no @id)", reason: "a:fieldOf carrier served without an @id" }]);
    expect(out.byKind[ty("Person")]!.fields).toEqual([]);
  });

  it("a declaration whose own term names no spelling is stated when it is ours, and skipped when it is not", () => {
    const mine = decl("Bad", { "a:predicateAttribute": undefined });
    const theirs = decl("Worse", { "a:predicateAttribute": undefined, "a:fieldOf": { "@id": ty("Elsewhere") } });
    const out = derive({ declarations: [mine, theirs] });
    expect(out.unreadable).toHaveLength(1);
    expect(out.unreadable[0]!.term).toBe(ty("Bad"));
    expect(out.unreadable[0]!.reason).toMatch(/carries no a:predicateAttribute/);
    expect(out.byKind[ty("Person")]!.fields).toEqual([]);
  });

  it("a field that holds a record of its own: the record's type, its type name, whether it may hold several, and its own fields sorted by term", () => {
    const out = derive({
      declarations: [
        decl("Job", { "a:cardinality": "multi", "a:fieldRecordType": { "@id": ty("Employment") } }),
        decl("Title", { "a:fieldOf": { "@id": ty("Employment") } }),
        decl("Org", { "a:fieldOf": { "@id": ty("Document") } }),
        decl("Note", { "a:fieldOf": { "@id": ty("Unrelated") } }),
      ],
      recordTypes: [{ type: ty("Employment"), typeName: "t:Employment", ancestors: [ty("Employment"), ty("Document")] }],
    });
    const job = out.byKind[ty("Person")]!.fields.find((f) => f.term === ty("Job"))!;
    expect(job.record).toEqual({
      type: ty("Employment"),
      typeName: "t:Employment",
      many: true,
      fields: [
        { term: ty("Org"), label: "Org", readKeys: ["a:org", "org"], writeKey: "a:org", writeKeyProblem: null, encoding: null, many: false },
        { term: ty("Title"), label: "Title", readKeys: ["a:title", "title"], writeKey: "a:title", writeKeyProblem: null, encoding: null, many: false },
      ],
    });
    expect(out.byKind[ty("Person")]!.fields.map((f) => f.term)).toEqual([ty("Job")]);
  });

  it("a record type nobody read gives a record with no type name, and only the fields declared on the type itself", () => {
    const out = derive({
      declarations: [decl("Job", { "a:fieldRecordType": { "@id": ty("Employment") } }), decl("Title", { "a:fieldOf": { "@id": ty("Employment") } })],
    });
    const job = out.byKind[ty("Person")]!.fields[0]!;
    expect(job.record!.typeName).toBeNull();
    expect(job.record!.fields.map((f) => f.term)).toEqual([ty("Title")]);
  });

  it("two record types on one field are stated once, and give the field no record", () => {
    const out = derive({
      kinds: [kind("Person", ["Person"]), kind("Org", ["Person", "Org"])],
      declarations: [decl("Job", { "a:fieldRecordType": [{ "@id": ty("A") }, { "@id": ty("B") }] })],
    });
    expect(out.byKind[ty("Person")]!.fields[0]!.record).toBeNull();
    expect(out.byKind[ty("Org")]!.fields[0]!.record).toBeNull();
    expect(out.unreadable).toEqual([{ term: ty("Job"), reason: "names 2 record types; one was expected" }]);
  });

  it("without the fieldRecordType predicate no field holds a record", () => {
    const out = derive({
      predicates: { fieldOf: predicates.fieldOf, label: predicates.label },
      declarations: [decl("Job", { "a:fieldRecordType": { "@id": ty("Employment") } })],
    });
    expect(out.byKind[ty("Person")]!.fields[0]!.record).toBeNull();
  });
});

describe("readPartyName", () => {
  const names = { name: spelling("name"), label: spelling("label") };
  it("reads the name under any of its keys, trimmed, and prefers it to the label", () => {
    expect(readPartyName({ "a:name": "  Ann  ", "a:label": "Old" }, names)).toBe("Ann");
    expect(readPartyName({ name: "Ann", label: "Old" }, names)).toBe("Ann");
  });
  it("falls back to the label when the name is absent, blank or not text", () => {
    expect(readPartyName({ "a:label": "Old" }, names)).toBe("Old");
    expect(readPartyName({ "a:name": "   ", "a:label": "Old" }, names)).toBe("Old");
    expect(readPartyName({ "a:name": 5, label: "Old" }, names)).toBe("Old");
  });
  it("is null when neither is present", () => {
    expect(readPartyName({}, names)).toBeNull();
    expect(readPartyName({ "a:name": "", "a:label": " " }, names)).toBeNull();
  });
});

describe("resolveFieldSets — ceiling, notes and options", () => {
  const src = (m: ReturnType<typeof fixtureMaster>) => masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  it("a ceiling on the upward walk is reported for each kind it stops, and the sets are a floor", async () => {
    const sets = await resolveFieldSets(src(fixtureMaster()), { maxDepth: 0 });
    expect(sets.complete).toBe(false);
    expect(sets.incompleteAt.some((s) => s === `is-a walk from ${t("Person")} stopped at depth 0`)).toBe(true);
    expect(sets.byKind[t("Person")]!.ancestors).toEqual([t("Person")]);
  });
  it("with the default ceiling the same master is whole", async () => {
    const sets = await resolveFieldSets(src(fixtureMaster()));
    expect(sets.complete).toBe(true);
    expect(sets.incompleteAt).toEqual([]);
    expect(sets.unreadable).toEqual([]);
  });
  it("a children listing that was not whole is named, one note per listing", async () => {
    const m = fixtureMaster();
    m.children("SoftwareSystem", [{ name: "AiAgent" }], false);
    const sets = await resolveFieldSets(src(m));
    expect(sets.complete).toBe(false);
    expect(sets.incompleteAt).toContain(`children of ${t("SoftwareSystem")}`);
  });
  it("hands back the kinds it used, and its sets are plain data (they survive JSON)", async () => {
    const sets = await resolveFieldSets(src(fixtureMaster()));
    expect(sets.kinds.types).toHaveLength(10);
    expect(JSON.parse(JSON.stringify(sets))).toEqual(sets);
  });
  it("a kind that the listing carries no label for takes the label of its own term, found on the walk up", async () => {
    const sets = await resolveFieldSets(src(fixtureMaster()));
    expect(sets.byKind[t("Person")]!.label).toBe("Person");
    expect(sets.byKind[t("AiAgent")]!.label).toBe("AI Agent");
  });
  it("a type reached by two parents in the same level is one ancestor, once (a diamond)", async () => {
    const m = fixtureMaster();
    const ctx = (m.docs.get(`${RIG}/base/t/Person`) as Record<string, unknown>)["@context"];
    m.put("t/Person", { "@context": ctx, "@id": t("Person"), "a:label": "Person", "a:subTypeOf": [{ "@id": t("Animal") }, { "@id": t("Agent") }] });
    m.put("t/Agent", { "@context": ctx, "@id": t("Agent"), "a:label": "Agent", "a:subTypeOf": { "@id": t("Organism") } });
    const sets = await resolveFieldSets(src(m));
    const ancestors = sets.byKind[t("Person")]!.ancestors;
    expect(ancestors).toEqual([t("Person"), t("Animal"), t("Agent"), t("Organism"), t("Substance")]);
    expect(new Set(ancestors).size).toBe(ancestors.length);
  });
  it("a cycle in the served is-a chain ends, each type once", async () => {
    const m = fixtureMaster();
    const ctx = (m.docs.get(`${RIG}/base/t/Person`) as Record<string, unknown>)["@context"];
    m.put("t/Substance", { "@context": ctx, "@id": t("Substance"), "a:label": "Substance", "a:subTypeOf": { "@id": t("Person") } });
    const sets = await resolveFieldSets(src(m));
    expect(sets.byKind[t("Person")]!.ancestors).toEqual([t("Person"), t("Animal"), t("Organism"), t("Substance")]);
  });
  it("a member that is also listed as a child of another member is still read upward from its own term", async () => {
    const base = await resolveFieldSets(src(fixtureMaster()));
    const m = fixtureMaster();
    m.children("Person", [{ name: "Passenger", label: "Passenger" }, { name: "Organization", label: "Organization" }]);
    m.children("Passenger", []);
    const sets = await resolveFieldSets(src(m));
    expect(sets.kinds.types.find((k) => k.name === "Organization")!.parents).toEqual([t("Person")]);
    expect(sets.byKind[t("Organization")]!.ancestors).toEqual(base.byKind[t("Organization")]!.ancestors);
    expect(sets.byKind[t("Organization")]!.ancestors).not.toContain(t("Person"));
  });
});
