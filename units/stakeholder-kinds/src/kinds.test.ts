// New tests: predicates.ts and kinds.ts, pinned over a hand-made source.
import { describe, expect, it } from "vitest";
import type { ChildrenPage, VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { PREDICATE_TERMS, resolvePredicate } from "./predicates";
import {
  CREATE_SHORTCUT_TERM,
  STAKEHOLDER_ROLE_TERM,
  expandDownIsA,
  kindDescendants,
  readShortcutSpelling,
  settleShortcuts,
  type StakeholderKindType,
} from "./kinds";

const O = "https://ontology.platform.example.test";
const t = (n: string) => `${O}/base/t/${n}`;

function source(opts: { children?: Record<string, ChildrenPage>; terms?: Record<string, unknown>; failChildren?: string[] } = {}): VocabularySource & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    termIri: (p) => `${O}/base/${p.replace(/^\/+/, "")}`,
    term: async (iri) => {
      const d = opts.terms?.[iri];
      if (!d) throw new VocabularyUnavailableError(`${iri} answered 404`);
      return d as Record<string, unknown>;
    },
    children: async (iri) => {
      asked.push(iri);
      if (opts.failChildren?.includes(iri)) throw new VocabularyUnavailableError(`${iri} answered 500`);
      return opts.children?.[iri] ?? { children: [], complete: true };
    },
    carriersOf: async () => ({ terms: [], complete: true, incompleteAt: [] }),
  };
}

describe("the address constants", () => {
  it("name the role, the shortcut term and the six predicates by their paths under /base/", () => {
    expect(STAKEHOLDER_ROLE_TERM).toBe("t/Stakeholder");
    expect(CREATE_SHORTCUT_TERM).toBe("a/createShortcut");
    expect(PREDICATE_TERMS).toEqual({
      playableBy: "a/playableBy",
      fieldOf: "a/fieldOf",
      subTypeOf: "a/subTypeOf",
      label: "a/label",
      name: "a/name",
      fieldRecordType: "a/fieldRecordType",
    });
  });
});

describe("resolvePredicate", () => {
  it("dereferences the predicate's own term and derives its spellings from it", async () => {
    const s = source({ terms: { [`${O}/base/a/label`]: { "@id": `${O}/base/a/label`, "a:predicateAttribute": "a:label|label" } } });
    const sp = await resolvePredicate(s, "label");
    expect(sp.term).toBe(`${O}/base/a/label`);
    expect(new Set(sp.readKeys)).toEqual(new Set(["a:label", "label"]));
  });
  it("a term that cannot be read, or names no spelling, throws and is never an empty read", async () => {
    await expect(resolvePredicate(source(), "name")).rejects.toThrow(VocabularyUnavailableError);
    const s = source({ terms: { [`${O}/base/a/name`]: { "@id": `${O}/base/a/name` } } });
    await expect(resolvePredicate(s, "name")).rejects.toThrow(/carries no a:predicateAttribute/);
  });
});

describe("expandDownIsA", () => {
  it("lists the members first, then each level of children breadth first, each type once", async () => {
    const s = source({
      children: {
        [t("A")]: { children: [{ term: t("A1"), label: "One" }, { term: t("A2") }], complete: true },
        [t("B")]: { children: [{ term: t("A2"), label: "Two" }, { term: t("B1") }], complete: true },
        [t("A1")]: { children: [{ term: t("A11") }], complete: true },
      },
    });
    const { types, incompleteAt } = await expandDownIsA(s, [t("A"), t("B")]);
    expect(types.map((k) => k.name)).toEqual(["A", "B", "A1", "A2", "B1", "A11"]);
    expect(incompleteAt).toEqual([]);
    const by = Object.fromEntries(types.map((k) => [k.name, k]));
    expect(by.A).toEqual({ term: t("A"), name: "A", label: null, isMember: true, parents: [], members: [t("A")] });
    expect(by.A1!.label).toBe("One");
    expect(by.A1!.isMember).toBe(false);
    // a diamond: A2 is under both members, its label comes from whichever listing carried one
    expect(by.A2!.parents).toEqual([t("A"), t("B")]);
    expect(by.A2!.members).toEqual([t("A"), t("B")]);
    expect(by.A2!.label).toBe("Two");
    expect(by.A11!.members).toEqual([t("A")]);
  });
  it("a type is expanded once however many paths reach it, so a cycle cannot loop", async () => {
    const s = source({ children: { [t("A")]: { children: [{ term: t("B") }], complete: true }, [t("B")]: { children: [{ term: t("A") }], complete: true } } });
    const { types } = await expandDownIsA(s, [t("A")]);
    expect(types.map((k) => k.name)).toEqual(["A", "B"]);
    expect(s.asked).toEqual([t("A"), t("B")]);
    expect(types[0]!.parents).toEqual([t("B")]);
  });
  it("a blank label is no label; a listing that is not complete is named in incompleteAt", async () => {
    const s = source({ children: { [t("A")]: { children: [{ term: t("A1"), label: "  " }], complete: false } } });
    const { types, incompleteAt } = await expandDownIsA(s, [t("A")]);
    expect(types[1]!.label).toBeNull();
    expect(incompleteAt).toEqual([t("A")]);
  });
  it("a children listing that cannot be read rejects the whole expansion", async () => {
    await expect(expandDownIsA(source({ failChildren: [t("A")] }), [t("A")])).rejects.toThrow(/answered 500/);
  });
});

describe("readShortcutSpelling", () => {
  it("answers the shortcut term's read keys", async () => {
    const s = source({ terms: { [`${O}/base/a/createShortcut`]: { "@id": `${O}/base/a/createShortcut`, "a:predicateAttribute": "a:createShortcut" } } });
    expect(new Set((await readShortcutSpelling(s))!)).toEqual(new Set(["a:createShortcut", "createShortcut"]));
  });
  it("answers null, never throws, when the term is not minted or names no spelling", async () => {
    expect(await readShortcutSpelling(source())).toBeNull();
    expect(await readShortcutSpelling(source({ terms: { [`${O}/base/a/createShortcut`]: {} } }))).toBeNull();
  });
});

describe("settleShortcuts", () => {
  const named = [{ term: t("A"), name: "A", label: "Ay" }, { term: t("Z"), name: "Z", label: null }];
  it("unreadable stays unreadable with no shortcuts", () => {
    expect(settleShortcuts({ state: "unreadable", named: [] }, new Set([t("A")]))).toEqual({ createShortcuts: [], shortcuts: "unreadable" });
  });
  it("keeps only the shortcuts that are players of the role, in the master's order, and says declared", () => {
    expect(settleShortcuts({ state: "named", named }, new Set([t("A"), t("Q")]))).toEqual({ createShortcuts: [named[0]], shortcuts: "declared" });
  });
  it("none-declared, or all dropped as non-players, is none-declared", () => {
    expect(settleShortcuts({ state: "none-declared", named: [] }, new Set([t("A")]))).toEqual({ createShortcuts: [], shortcuts: "none-declared" });
    expect(settleShortcuts({ state: "named", named }, new Set([t("Q")]))).toEqual({ createShortcuts: [], shortcuts: "none-declared" });
  });
});

describe("kindDescendants", () => {
  const k = (name: string, parents: string[]): StakeholderKindType => ({ term: t(name), name, label: `L${name}`, isMember: parents.length === 0, parents: parents.map(t), members: [] });
  const types = [k("Root", []), k("B", ["Root"]), k("A", ["Root"]), k("A1", ["A"]), k("Both", ["A", "B"]), k("Other", [])];
  it("lists the direct children first and each one's own children right after it, with the depth", () => {
    const d = kindDescendants({ types }, t("Root"));
    expect(d.map((x) => `${x.name}:${x.depth}`)).toEqual(["B:1", "Both:2", "A:1", "A1:2"]);
    expect(d[0]).toEqual({ type: types[1], term: t("B"), name: "B", label: "LB", depth: 1 });
  });
  it("a type under two parents is listed once (a diamond), and the root is never listed", () => {
    const names = kindDescendants({ types }, t("Root")).map((x) => x.name);
    expect(names.filter((n) => n === "Both")).toHaveLength(1);
    expect(names).not.toContain("Root");
  });
  it("a term with nothing below it, or not in the set, has no descendants", () => {
    expect(kindDescendants({ types }, t("Other"))).toEqual([]);
    expect(kindDescendants({ types }, t("Nope"))).toEqual([]);
  });
  it("a cycle cannot loop", () => {
    const cyc = [k("X", ["Y"]), k("Y", ["X"])];
    expect(kindDescendants({ types: cyc }, t("X")).map((x) => x.name)).toEqual(["Y"]);
  });
});
