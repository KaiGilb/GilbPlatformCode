// Ported from `gilb-stakeholders` `test/fieldSets.test.ts` at 0a261488: all 20 tests. The field set per kind comes from `a:fieldOf`,
// inherited down is-a, labelled from each attribute's own `a:label`; a party's name is `a:name`, never `a:label`.
//
// Expected values are literals. Kinds in the fixture get different field sets on purpose: a resolver that gave every kind the same
// fields, or ignored inheritance, or read the wrong ancestor, gives a different answer here.
import { describe, it, expect } from "vitest";
import { masterSource, VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets, readPartyName } from "./fieldSets";
import { fixtureMaster, RIG, t, a } from "../test/support";

const resolve = (m: ReturnType<typeof fixtureMaster>, opts: { maxPages?: number; carriers?: "selector" | "walk" } = {}) =>
  resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch, maxPages: opts.maxPages, carriers: opts.carriers }));
// The whole-listing walk, which an agent or a command-line run may still choose. The
// walk's own mechanics (paging, next, the page ceiling) are tested through it below; the selector's
// are in carrierSelector-22c.test.ts.
const walk = (m: ReturnType<typeof fixtureMaster>, opts: { maxPages?: number } = {}) => resolve(m, { ...opts, carriers: "walk" });

const fieldsOf = (sets: Awaited<ReturnType<typeof resolve>>, kind: string) =>
  sets.byKind[t(kind)]!.fields.map((f) => f.term);

describe("resolveFieldSets — per kind, from a:fieldOf", () => {
  it("gives each kind exactly the fields declared on it or above it", async () => {
    const sets = await resolve(fixtureMaster());
    expect(fieldsOf(sets, "Person")).toEqual([t("Email"), t("Name"), t("PlanguageLevel")]);
    expect(fieldsOf(sets, "Organization")).toEqual([t("Email"), t("Name"), t("PlanguageLevel")]);
    expect(fieldsOf(sets, "PartyGroup")).toEqual([t("Name"), t("PlanguageLevel")]);
    expect(fieldsOf(sets, "PartyMemberOf")).toEqual([t("PlanguageLevel")]);
    expect(fieldsOf(sets, "SoftwareSystemMemberOf")).toEqual([t("PlanguageLevel")]);
    expect(sets.complete).toBe(true);
    expect(sets.unreadable).toEqual([]);
  });

  it("a subtype inherits what its parent declares, and says where it came from", async () => {
    const sets = await resolve(fixtureMaster());
    expect(fieldsOf(sets, "AiAgent")).toEqual([t("Name"), t("PlanguageLevel")]);
    expect(fieldsOf(sets, "DataStore")).toEqual([t("Name"), t("PlanguageLevel")]);
    const name = sets.byKind[t("AiAgent")]!.fields.find((f) => f.term === t("Name"))!;
    expect(name.declaredOn).toEqual([t("SoftwareSystem")]);
  });

  it("a field declared on a type that is not a kind or above one reaches no kind", async () => {
    const sets = await resolve(fixtureMaster());
    const everyField = Object.values(sets.byKind).flatMap((k) => k.fields.map((f) => f.term));
    expect(everyField).not.toContain(t("JobTitle"));
    expect(everyField).not.toContain(t("Unrelated"));
  });

  it("a field declared high up reaches every kind under it, and only those", async () => {
    const m = fixtureMaster();
    m.listing([
      [
        {
          "@id": t("FixtureRemark"),
          "a:predicateAttribute": "a:fixtureRemark",
          "a:label": "Remark",
          // Declared on an ancestor ABOVE the members. Only the upward walk can find it.
          "a:fieldOf": { "@id": t("Organism") },
        },
      ],
    ]);
    const sets = await resolve(m);
    expect(fieldsOf(sets, "Person")).toEqual([t("FixtureRemark")]);
    expect(fieldsOf(sets, "Organization")).toEqual([]);
    expect(fieldsOf(sets, "PartyMemberOf")).toEqual([]);
    expect(sets.byKind[t("Person")]!.fields[0]!.declaredOn).toEqual([t("Organism")]);
    expect(sets.byKind[t("Person")]!.ancestors).toEqual([t("Person"), t("Animal"), t("Organism"), t("Substance")]);
  });

  // 🔴 THE DISCRIMINATOR. A field the master declares, that no app has heard of, is offered;
  // a declaration the master withdraws stops being offered. A field list in code fails both.
  it("picks up a field the master adds and drops one it withdraws", async () => {
    const m = fixtureMaster();
    m.listing([
      [
        {
          "@id": t("ZorbFactor"),
          "a:predicateAttribute": "a:zorbFactor",
          "a:label": "Zorb factor",
          "a:fieldOf": { "@id": t("PartyGroup") },
        },
        {
          "@id": t("Email"),
          "a:predicateAttribute": "a:email",
          "a:label": "Email address",
          "a:fieldOf": { "@id": t("Person") }, // Organization withdrawn
        },
      ],
    ]);
    const sets = await resolve(m);
    expect(fieldsOf(sets, "PartyGroup")).toEqual([t("ZorbFactor")]);
    expect(fieldsOf(sets, "Person")).toEqual([t("Email")]);
    expect(fieldsOf(sets, "Organization")).toEqual([]);
  });

  it("reads a:fieldOf under its bare spelling too", async () => {
    const m = fixtureMaster();
    m.listing([[{ "@id": t("Phone"), "a:predicateAttribute": "a:phone", fieldOf: [{ "@id": t("Organization") }] }]]);
    // Through the whole walk: the selector matches the master's stored spellings, and a bare key
    // is not one of them (see `masterSource`'s page ceiling).
    expect(fieldsOf(await walk(m), "Organization")).toEqual([t("Phone")]);
  });
});

describe("resolveFieldSets — labels and spellings come from each attribute's own term", () => {
  it("labels from a:label; null when the term has none, never the slug", async () => {
    const m = fixtureMaster();
    m.listing([
      [
        { "@id": t("Email"), "a:predicateAttribute": "a:email", "a:label": "E-mail address", "a:fieldOf": { "@id": t("Person") } },
        { "@id": t("Phone"), "a:predicateAttribute": "a:phone", "a:fieldOf": { "@id": t("Person") } },
      ],
    ]);
    const [email, phone] = (await resolve(m)).byKind[t("Person")]!.fields;
    expect(email!.label).toBe("E-mail address");
    expect(phone!.label).toBeNull();
  });

  it("reads every spelling the term binds and writes only the survivor", async () => {
    const m = fixtureMaster();
    m.listing([
      [
        {
          "@id": t("Email"),
          "a:predicateAttribute": "a:email|a:fixtureEmailAlias",
          "a:deprecatedNotation": "a:fixtureEmailAlias",
          "a:encoding": "inline-literal:text",
          "a:fieldOf": { "@id": t("Person") },
        },
        { "@id": t("Twin"), "a:predicateAttribute": "a:one|a:two", "a:fieldOf": { "@id": t("Person") } },
      ],
    ]);
    const [email, twin] = (await resolve(m)).byKind[t("Person")]!.fields;
    expect(email!.readKeys.sort()).toEqual(["a:email", "a:fixtureEmailAlias", "email", "fixtureEmailAlias"]);
    expect(email!.writeKey).toBe("a:email");
    expect(email!.encoding).toBe("inline-literal:text");
    expect(twin!.writeKey).toBeNull();
    expect(twin!.writeKeyProblem).toMatch(/2 current spellings/);
  });

  it("a declaration naming a kind but carrying no spelling is reported, not offered", async () => {
    const m = fixtureMaster();
    m.listing([[{ "@id": t("Broken"), "a:label": "Broken", "a:fieldOf": { "@id": t("Person") } }]]);
    const sets = await resolve(m);
    expect(fieldsOf(sets, "Person")).toEqual([]);
    expect(sets.unreadable.map((u) => u.term)).toEqual([t("Broken")]);
    expect(sets.complete).toBe(false);
  });
});

describe("resolveFieldSets — the declarations listing", () => {
  it("walks every page, re-rooting the server's next link on the rig origin", async () => {
    const m = fixtureMaster();
    await walk(m);
    // The declarations listing only, not the named type reads.
    const listingCalls = m.requested.filter((u) => u.includes("/base/vocab?") && !new URL(u).searchParams.has("type"));
    expect(listingCalls).toEqual([
      `${RIG}/base/vocab?status=all&limit=2000`,
      `${RIG}/base/vocab?status=all&limit=2000&cursor=c1`,
    ]);
  });

  it("a page that is not complete and names no next page makes the sets a declared floor", async () => {
    const m = fixtureMaster();
    m.listing(
      [[{ "@id": t("Email"), "a:predicateAttribute": "a:email", "a:fieldOf": { "@id": t("Person") } }], []],
      { dropNextAt: 0 },
    );
    const sets = await walk(m);
    expect(sets.complete).toBe(false);
    expect(sets.incompleteAt.join(" ")).toMatch(/complete=false and gave no next page/);
    // What was read is still offered: a floor, not nothing.
    expect(fieldsOf(sets, "Person")).toEqual([t("Email")]);
  });

  it("a relative next link is followed on the rig origin", async () => {
    const m = fixtureMaster();
    const first = `${RIG}/base/vocab?status=all&limit=2000`;
    const page = m.docs.get(first) as Record<string, unknown>;
    m.docs.set(first, { ...page, next: "/base/vocab?status=all&limit=2000&cursor=c1" });
    const sets = await walk(m);
    expect(m.requested).toContain(`${RIG}/base/vocab?status=all&limit=2000&cursor=c1`);
    expect(fieldsOf(sets, "Person")).toEqual([t("Email"), t("Name"), t("PlanguageLevel")]);
  });

  it("a next link that is not an address is refused as VocabularyUnavailableError, never a raw TypeError", async () => {
    const m = fixtureMaster();
    const first = `${RIG}/base/vocab?status=all&limit=2000`;
    const page = m.docs.get(first) as Record<string, unknown>;
    m.docs.set(first, { ...page, next: "http://[not-an-address" });
    await expect(walk(m)).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });

  it("a listing page with no @graph is an error, not an empty page", async () => {
    const m = fixtureMaster();
    const first = `${RIG}/base/vocab?status=all&limit=2000`;
    const page = m.docs.get(first) as Record<string, unknown>;
    m.docs.set(first, { ...page, "@graph": undefined });
    await expect(walk(m)).rejects.toThrow(/served no @graph/);
  });

  it("the page ceiling is reported as incompleteness, never as the end", async () => {
    const sets = await walk(fixtureMaster(), { maxPages: 1 });
    expect(sets.complete).toBe(false);
    expect(sets.incompleteAt.join(" ")).toMatch(/stopped after 1 pages/);
  });

  it("zero declarations over a complete listing is reported, not rendered as 'no fields'", async () => {
    const m = fixtureMaster();
    m.listing([[{ "@id": t("Unrelated"), "a:predicateAttribute": "a:unrelated" }]]);
    const sets = await resolve(m);
    expect(sets.complete).toBe(false);
    expect(sets.incompleteAt.join(" ")).toMatch(/held no a:fieldOf carrier/);
  });

  it("each type above the kinds is read once, however many kinds share it", async () => {
    const m = fixtureMaster();
    await resolve(m);
    // Asked on its own address or by name in a named read: once either way.
    const asked = (name: string) =>
      m.requested.filter((u) => u.endsWith(`/base/t/${name}`) || new URL(u).searchParams.getAll("type").includes(name)).length;
    expect(asked("Substance")).toBe(1);
    expect(asked("MemberOf")).toBe(1);
  });
});

describe("readPartyName — a party's name is a:name", () => {
  const p = {
    name: { term: a("name"), readKeys: ["a:name", "name"], writeKey: "a:name", writeKeyProblem: null },
    label: { term: a("label"), readKeys: ["a:label", "label"], writeKey: "a:label", writeKeyProblem: null },
  };

  it("reads a:name, even where a legacy label holds something else", () => {
    expect(readPartyName({ "a:name": "Tom Gilb", label: "tom-legacy" }, p)).toBe("Tom Gilb");
    expect(readPartyName({ label: "tom-legacy", name: "Tom Bare" }, p)).toBe("Tom Bare");
  });

  it("falls back to the legacy label only where no name is present", () => {
    expect(readPartyName({ label: "Tom Legacy" }, p)).toBe("Tom Legacy");
    expect(readPartyName({ "a:name": "   ", label: "Tom Legacy" }, p)).toBe("Tom Legacy");
    expect(readPartyName({}, p)).toBeNull();
  });

  it("uses the spellings resolved from the master, not its own", async () => {
    const m = fixtureMaster();
    m.put("a/name", { "@id": a("name"), "a:predicateAttribute": "a:fixturePartyName|a:name", "a:deprecatedNotation": "a:name" });
    const sets = await resolve(m);
    expect(readPartyName({ "a:fixturePartyName": "Renamed", label: "Legacy" }, sets.kinds.predicates)).toBe("Renamed");
    expect(sets.kinds.predicates.name.writeKey).toBe("a:fixturePartyName");
  });
});
