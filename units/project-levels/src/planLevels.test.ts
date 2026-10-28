// The pure part of the unit: the defaults, the token and tag rules, the tree and the picker rules.
// The first three cases are the app's levelTree cases, with the same inputs and expectations; the rest pin every other export, odd cases included.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import {
  ADD_LEVEL,
  DEFAULT_LEVELS,
  NOT_A_PROJECT_LEVEL,
  defaultLevelTree,
  directChildren,
  isCauseEffectLevel,
  isDefaultLevelToken,
  levelKnown,
  levelTag,
  levelTree,
  nextPosition,
  optionLabel,
  pascalCase,
  pickerNodes,
  tagOf,
  tokenOf,
  type LevelNode,
  type LevelRecord,
} from "./index";

const P = "https://p.example.test/vault";

function level(id: string, token: string, label: string, position: number, parentId: string | null): LevelRecord {
  const served: Record<string, unknown> = {
    unitTag: `Level.${token}`,
    label,
    levelPosition: position,
  };
  const facts: Record<string, string> = {
    unitTag: `Level.${token}`,
    label,
    levelPosition: String(position),
  };
  if (parentId) {
    const uri = `${P}/e/${parentId}`;
    served.partOf = { "@id": uri };
    facts.partOf = uri;
  }
  return {
    id,
    entityUri: `${P}/e/${id}`,
    typeUri: "t:CauseEffectLevel",
    facts,
    served: { facts: served },
  };
}

const tokens = (nodes: readonly LevelNode[]) => nodes.map((n) => [n.token, n.depth]);

describe("levelTree (ported)", () => {
  it("orders a project depth-first, and a position beats the alphabet", () => {
    const rows = [
      level("sol", "Solution", "Solution", 4, null),
      level("op", "Stakeholder.Operator", "Operator", 2, "stk"),
      level("sub", "Product.Sub", "Sub", 1, "prod"),
      level("biz", "Business", "Business", 1, null),
      level("own", "Stakeholder.Owner", "Owner", 1, "stk"),
      level("prod", "Product", "Product", 3, null),
      level("stk", "Stakeholder", "Stakeholder", 2, null),
      {
        id: "note",
        entityUri: `${P}/e/note`,
        typeUri: "t:Note",
        facts: { unitTag: "Level.Note", label: "Note" },
      },
    ];
    expect(levelTree(rows).map((n) => [n.token, n.depth, n.label])).toEqual([
      ["Business", 0, "Business"],
      ["Stakeholder", 0, "Stakeholder"],
      ["Stakeholder.Owner", 1, "Owner"],
      ["Stakeholder.Operator", 1, "Operator"],
      ["Product", 0, "Product"],
      ["Product.Sub", 1, "Sub"],
      ["Solution", 0, "Solution"],
    ]);
  });

  it("walks a cycle once and does not hang", () => {
    const a = level("a", "Loop.A", "A", 1, "b");
    const b = level("b", "Loop.B", "B", 1, "a");
    const tree = levelTree([a, b]);
    expect(tree).toHaveLength(2);
    expect(new Set(tree.map((n) => n.token))).toEqual(new Set(["Loop.A", "Loop.B"]));
    const self = level("s", "Loop.Self", "Self", 1, "s");
    expect(levelTree([self]).map((n) => [n.token, n.depth])).toEqual([["Loop.Self", 0]]);
  });

  it("reads a level's bare levelPosition and partOf", () => {
    const served = (id: string, token: string, position: number, parentId: string | null): LevelRecord => {
      const facts: Record<string, unknown> = { unitTag: `Level.${token}`, label: token, levelPosition: position };
      if (parentId) facts.partOf = { "@id": `${P}/e/${parentId}` };
      return { id, entityUri: `${P}/e/${id}`, typeUri: "t:CauseEffectLevel", facts: {}, served: { facts } };
    };
    expect(levelTree([served("prod", "Product", 3, "biz"), served("biz", "Business", 1, null)]).map((n) => [n.token, n.depth])).toEqual([
      ["Business", 0],
      ["Product", 1],
    ]);
  });
});

describe("levelTree (more)", () => {
  const plain = (id: string, facts: Record<string, string>, extra: Partial<LevelRecord> = {}): LevelRecord => ({
    id,
    typeUri: "https://example.test/base/t/CauseEffectLevel",
    facts,
    ...extra,
  });

  it("is empty for no records, and the node holds the record it came from", () => {
    expect(levelTree([])).toEqual([]);
    const rec = level("biz", "Business", "Business", 1, null);
    expect(levelTree([rec])[0]!.record).toBe(rec);
  });

  it("skips a null entry and every record that is not a CauseEffectLevel", () => {
    const rec = level("biz", "Business", "Business", 1, null);
    const other = { ...level("n", "Note", "Note", 1, null), typeUri: "t:Note" };
    expect(levelTree([null as unknown as LevelRecord, other, rec]).map((n) => n.token)).toEqual(["Business"]);
  });

  it("reads the flat facts when the record has no served document", () => {
    const rows = [
      plain("b", { unitTag: "Level.B", label: "Bee", levelPosition: "2" }),
      plain("a", { unitTag: "Level.A", label: "Ay", levelPosition: "1" }),
    ];
    expect(levelTree(rows).map((n) => [n.token, n.label])).toEqual([
      ["A", "Ay"],
      ["B", "Bee"],
    ]);
  });

  it("finds a parent by bare id, by entity address and by an address that ends in /id", () => {
    const parent = plain("par", { unitTag: "Level.Par" }, { entityUri: `${P}/e/par` });
    const byId = plain("c1", { unitTag: "Level.Par.C1", partOf: "par" });
    const byUri = plain("c2", { unitTag: "Level.Par.C2", partOf: `${P}/e/par` });
    const bySuffix = plain("c3", { unitTag: "Level.Par.C3", partOf: "https://elsewhere.example.test/e/par" });
    expect(tokens(levelTree([byId, byUri, bySuffix, parent]))).toEqual([
      ["Par", 0],
      ["Par.C1", 1],
      ["Par.C2", 1],
      ["Par.C3", 1],
    ]);
  });

  it("reads a parent written as JSON text, as a list, or as an object with @id", () => {
    const parent = plain("par", { unitTag: "Level.Par" });
    const asJson = plain("c1", { unitTag: "Level.C1" }, { served: { facts: { partOf: '{"@id": "par"}' } } });
    const asList = plain("c2", { unitTag: "Level.C2" }, { served: { facts: { partOf: [{ "@id": "par" }] } } });
    const asListText = plain("c3", { unitTag: "Level.C3" }, { served: { facts: { partOf: '["par"]' } } });
    const asObject = plain("c4", { unitTag: "Level.C4" }, { served: { facts: { partOf: { "@id": " par " } } } });
    expect(tokens(levelTree([parent, asJson, asList, asListText, asObject]))).toEqual([
      ["Par", 0],
      ["C1", 1],
      ["C2", 1],
      ["C3", 1],
      ["C4", 1],
    ]);
  });

  it("makes a root of a level whose parent is empty, broken JSON, an empty list, a number or not in the list", () => {
    const rows = [
      plain("a", { unitTag: "Level.A", partOf: "" }),
      plain("b", { unitTag: "Level.B", partOf: "{broken" }),
      plain("c", { unitTag: "Level.C" }, { served: { facts: { partOf: [] } } }),
      plain("d", { unitTag: "Level.D" }, { served: { facts: { partOf: 7 } } }),
      plain("e", { unitTag: "Level.E", partOf: "missing" }),
    ];
    expect(tokens(levelTree(rows)).every(([, depth]) => depth === 0)).toBe(true);
    expect(levelTree(rows)).toHaveLength(5);
  });

  it("sorts siblings by position, then label, then token; a missing or unreadable position sorts last", () => {
    const rows = [
      plain("t2", { unitTag: "Level.T2", label: "Same", levelPosition: "1" }),
      plain("t1", { unitTag: "Level.T1", label: "Same", levelPosition: "1" }),
      plain("lb", { unitTag: "Level.Z", label: "Alpha", levelPosition: "1" }),
      plain("none", { unitTag: "Level.None", label: "Aaa" }),
      plain("nan", { unitTag: "Level.Nan", label: "Aab", levelPosition: "soon" }),
      plain("blank", { unitTag: "Level.Blank", label: "Aac", levelPosition: " " }),
      plain("first", { unitTag: "Level.First", label: "Zzz", levelPosition: "0" }),
    ];
    expect(levelTree(rows).map((n) => n.token)).toEqual(["First", "Z", "T1", "T2", "None", "Nan", "Blank"]);
  });

  it("uses the record id as the token when there is no tag, and the last part of the token as the label", () => {
    const rows = [
      plain("no-tag", {}),
      plain("deep", { unitTag: "Level.Product.Sub Thing", label: "   " }),
      plain("shown", { unitTag: "Level.Shown", label: "  Padded  " }),
    ];
    const byToken = new Map(levelTree(rows).map((n) => [n.token, n.label]));
    expect(byToken.get("no-tag")).toBe("no-tag");
    expect(byToken.get("Product.Sub Thing")).toBe("Sub Thing");
    expect(byToken.get("Shown")).toBe("Padded");
  });

  it("keeps a number position given as a number, and puts a child under the first parent that matches", () => {
    const a = plain("a", { unitTag: "Level.A" }, { served: { facts: { levelPosition: 2 } } });
    const b = plain("b", { unitTag: "Level.B" }, { served: { facts: { levelPosition: 1 } } });
    expect(levelTree([a, b]).map((n) => n.token)).toEqual(["B", "A"]);
  });

  it("walks a cycle that no root reaches from its first record (by order) at depth 0, the other under it, after the roots", () => {
    const root = level("r", "Root", "Root", 1, null);
    const a = level("a", "Loop.A", "A", 1, "b");
    const b = level("b", "Loop.B", "B", 1, "a");
    const tree = levelTree([a, root, b]);
    expect(tree.map((n) => n.token)).toEqual(["Root", "Loop.A", "Loop.B"]);
    expect(tree.map((n) => n.depth)).toEqual([0, 0, 1]);
  });
});

describe("constants", () => {
  it("are the words and the select value the chooser uses", () => {
    expect(NOT_A_PROJECT_LEVEL).toBe("not one of this project's levels");
    expect(ADD_LEVEL).toBe("__add_level__");
  });
});

describe("DEFAULT_LEVELS", () => {
  beforeEach(() => resetTermOrigin());
  afterEach(() => resetTermOrigin());

  it("are the four defaults, in order, with their positions", () => {
    expect(DEFAULT_LEVELS.map((d) => [d.token, d.label, d.position])).toEqual([
      ["Business", "Business", 1],
      ["Stakeholder", "Stakeholder", 2],
      ["Product", "Product", 3],
      ["Solution", "Solution", 4],
    ]);
  });

  it("read their ontologyTerm from the term origin when it is read, not when the module loads", () => {
    expect(() => DEFAULT_LEVELS[0]!.ontologyTerm).toThrow(/term-origin/);
    setTermOrigin("https://terms.example.test");
    expect(DEFAULT_LEVELS.map((d) => d.ontologyTerm)).toEqual([
      "https://terms.example.test/base/t/BusinessLevel",
      "https://terms.example.test/base/t/StakeholderLevel",
      "https://terms.example.test/base/t/ProductLevel",
      "https://terms.example.test/base/t/SolutionLevel",
    ]);
    setTermOrigin("http://other.example.test:8080/");
    expect(DEFAULT_LEVELS[3]!.ontologyTerm).toBe("http://other.example.test:8080/base/t/SolutionLevel");
  });

  it("read the token without the term origin", () => {
    expect(DEFAULT_LEVELS.map((d) => d.token)).toEqual(["Business", "Stakeholder", "Product", "Solution"]);
  });

  it("copy to a plain value when spread after the origin is set", () => {
    setTermOrigin("https://terms.example.test");
    const copy = { ...DEFAULT_LEVELS[2]! };
    setTermOrigin("https://later.example.test");
    expect(copy.ontologyTerm).toBe("https://terms.example.test/base/t/ProductLevel");
    expect(DEFAULT_LEVELS[2]!.ontologyTerm).toBe("https://later.example.test/base/t/ProductLevel");
  });
});

describe("tokenOf and tagOf", () => {
  it("tokenOf drops a leading Level. and trims", () => {
    expect(tokenOf("Level.Product.Sub")).toBe("Product.Sub");
    expect(tokenOf("  Level.Product  ")).toBe("Product");
    expect(tokenOf("Product")).toBe("Product");
    expect(tokenOf("Level.")).toBe("");
    expect(tokenOf("level.Product")).toBe("level.Product");
    expect(tokenOf("")).toBe("");
  });

  it("tagOf adds Level. unless it is there, trims, and is empty for nothing", () => {
    expect(tagOf("Product.Sub")).toBe("Level.Product.Sub");
    expect(tagOf("Level.Product")).toBe("Level.Product");
    expect(tagOf("  Product ")).toBe("Level.Product");
    expect(tagOf("   ")).toBe("");
    expect(tagOf("")).toBe("");
    expect(tagOf("level.Product")).toBe("Level.level.Product");
  });

  it("are inverse for a token", () => {
    expect(tokenOf(tagOf("Stakeholder.Owner"))).toBe("Stakeholder.Owner");
  });
});

describe("pascalCase", () => {
  it("joins capitalised words split on anything that is not a letter or digit", () => {
    expect(pascalCase("Sub Product")).toBe("SubProduct");
    expect(pascalCase("a-b_c d.e")).toBe("ABCDE");
    expect(pascalCase("  spaced   out  ")).toBe("SpacedOut");
    expect(pascalCase("mixedCASE word2")).toBe("MixedCASEWord2");
    expect(pascalCase("2fast")).toBe("2fast");
  });

  it("is empty for a label with no letter or digit", () => {
    expect(pascalCase("")).toBe("");
    expect(pascalCase(" - _ ")).toBe("");
  });

  it("splits on a letter outside A-Z, so an accented letter is lost", () => {
    expect(pascalCase("ünï")).toBe("N");
    expect(pascalCase("café au lait")).toBe("CafAuLait");
  });
});

describe("isDefaultLevelToken and levelKnown", () => {
  it("isDefaultLevelToken is true for the four tokens only, exactly spelled", () => {
    for (const t of ["Business", "Stakeholder", "Product", "Solution"]) expect(isDefaultLevelToken(t)).toBe(true);
    for (const t of ["business", "Level.Business", " Business", "Product.Sub", ""]) expect(isDefaultLevelToken(t)).toBe(false);
  });

  it("levelKnown: empty is unset and known; a tree member or a default is known; anything else is not", () => {
    const tree = [{ token: "Custom" }, { token: "Custom.Sub" }];
    expect(levelKnown("", tree)).toBe(true);
    expect(levelKnown("   ", tree)).toBe(true);
    expect(levelKnown("Custom.Sub", tree)).toBe(true);
    expect(levelKnown(" Custom ", tree)).toBe(true);
    expect(levelKnown("Product", tree)).toBe(true);
    expect(levelKnown("Other", tree)).toBe(false);
    expect(levelKnown("Other", [])).toBe(false);
    expect(levelKnown("Level.Custom", tree)).toBe(false);
  });
});

describe("isCauseEffectLevel", () => {
  it("is true for the type by short name or by address, false for another type or none", () => {
    expect(isCauseEffectLevel({ typeUri: "t:CauseEffectLevel" })).toBe(true);
    expect(isCauseEffectLevel({ typeUri: "https://types.example.test/base/t/CauseEffectLevel" })).toBe(true);
    expect(isCauseEffectLevel({ typeUri: "t:Note" })).toBe(false);
    expect(isCauseEffectLevel({ typeUri: "" })).toBe(false);
    expect(isCauseEffectLevel({ typeUri: null })).toBe(false);
    expect(isCauseEffectLevel({})).toBe(false);
  });
});

describe("defaultLevelTree and pickerNodes", () => {
  it("defaultLevelTree is the four defaults, each at depth 0 with no record, new each call", () => {
    const tree = defaultLevelTree();
    expect(tree).toEqual([
      { token: "Business", label: "Business", depth: 0, record: null },
      { token: "Stakeholder", label: "Stakeholder", depth: 0, record: null },
      { token: "Product", label: "Product", depth: 0, record: null },
      { token: "Solution", label: "Solution", depth: 0, record: null },
    ]);
    expect(defaultLevelTree()).not.toBe(tree);
  });

  const custom = levelTree([level("a", "Alpha", "Alpha", 1, null)]);

  it("pickerNodes puts a stored default that the custom tree lacks in front", () => {
    expect(pickerNodes(custom, "Product")).toEqual([{ token: "Product", label: "Product", depth: 0, record: null }, ...custom]);
    expect(pickerNodes(custom, "  Solution ").map((n) => n.token)).toEqual(["Solution", "Alpha"]);
  });

  it("pickerNodes offers only the tree for nothing stored, a token in the tree, or an unknown token", () => {
    expect(pickerNodes(custom, "")).toEqual(custom);
    expect(pickerNodes(custom, "   ")).toEqual(custom);
    expect(pickerNodes(custom, "Alpha")).toEqual(custom);
    expect(pickerNodes(custom, "Gone")).toEqual(custom);
    expect(pickerNodes(custom, "Product.Sub")).toEqual(custom);
  });

  it("pickerNodes returns a copy, not the tree itself", () => {
    expect(pickerNodes(custom, "")).not.toBe(custom);
    expect(pickerNodes(custom, "Product")).not.toBe(custom);
  });
});

describe("optionLabel", () => {
  const node = (token: string, label: string, depth: number): LevelNode => ({ token, label, depth, record: null });

  it("is the label, indented by two non-breaking spaces a level, with the token after a dot when it differs", () => {
    expect(optionLabel(node("Product", "Product", 0))).toBe("Product");
    expect(optionLabel(node("Product.Sub", "Sub", 1))).toBe("  Sub · Product.Sub");
    expect(optionLabel(node("A.B.C", "C", 2))).toBe("    C · A.B.C");
    expect(optionLabel(node("Same", "Same", 3))).toBe("      Same");
  });
});

describe("directChildren, nextPosition and levelTag", () => {
  const tree = levelTree([
    level("biz", "Business", "Business", 1, null),
    level("prod", "Product", "Product", 3, null),
    level("sub", "Product.Sub", "Sub", 5, "prod"),
    level("sub2", "Product.Other", "Other", 2, "prod"),
    level("deep", "Product.Sub.Deep", "Deep", 9, "sub"),
  ]);

  it("directChildren lists the nodes one level below, not deeper ones, in tree order", () => {
    expect(directChildren(tree, "Product").map((n) => n.token)).toEqual(["Product.Other", "Product.Sub"]);
    expect(directChildren(tree, "Product.Sub").map((n) => n.token)).toEqual(["Product.Sub.Deep"]);
    expect(directChildren(tree, "Business")).toEqual([]);
    expect(directChildren(tree, "Product.Sub.Deep")).toEqual([]);
  });

  it("directChildren is empty for a token that is not in the tree", () => {
    expect(directChildren(tree, "Nope")).toEqual([]);
    expect(directChildren([], "Product")).toEqual([]);
  });

  it("nextPosition is one past the highest position among the siblings", () => {
    expect(nextPosition(tree, null)).toBe(4);
    expect(nextPosition(tree, "Product")).toBe(6);
    expect(nextPosition(tree, "Product.Sub")).toBe(10);
  });

  it("nextPosition is 1 for no siblings, for a parent with no child, an unknown parent, or siblings with no position", () => {
    expect(nextPosition([], null)).toBe(1);
    expect(nextPosition(tree, "Business")).toBe(1);
    expect(nextPosition(tree, "Nope")).toBe(1);
    expect(nextPosition(defaultLevelTree(), null)).toBe(1);
  });

  it("levelTag is the record's own tag, trimmed; else the tag of the token", () => {
    const withRecord = tree.find((n) => n.token === "Product.Sub")!;
    expect(levelTag(withRecord)).toBe("Level.Product.Sub");
    const padded: LevelNode = { token: "X", label: "X", depth: 0, record: { id: "x", typeUri: "t:CauseEffectLevel", facts: { unitTag: "  Level.Keep.This  " } } };
    expect(levelTag(padded)).toBe("Level.Keep.This");
    const noTag: LevelNode = { token: "Y", label: "Y", depth: 0, record: { id: "y", typeUri: "t:CauseEffectLevel", facts: { unitTag: "  " } } };
    expect(levelTag(noTag)).toBe("Level.Y");
    expect(levelTag({ token: "Product", label: "Product", depth: 0, record: null })).toBe("Level.Product");
    expect(levelTag({ token: "", label: "", depth: 0, record: null })).toBe("");
  });
});
