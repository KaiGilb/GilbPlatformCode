// The README example, run: a host supplies the record reader and the check "is this tag used in my vault".
import { describe, expect, it } from "vitest";
import {
  duplicateTagSentence,
  linkAddress,
  partOfExcludedIds,
  readPartOfFact,
  recordTag,
  solutionOfFunctions,
  tagMatches,
  wouldLoop,
  withLinkFact,
} from "./index";

const e = (id: string) => `https://vault.example.test/base/e/${id}`;

describe("README example", () => {
  it("offers Part of candidates, checks a chosen parent for a loop with the host's reader, and writes the link", async () => {
    const records: { id: string; entityUri: string; facts: Record<string, string> }[] = [
      { id: "a", entityUri: e("a"), facts: { unitTag: "F.1" } },
      { id: "b", entityUri: e("b"), facts: { unitTag: "F.1.1", fvParent: e("a") } },
      { id: "c", entityUri: e("c"), facts: { unitTag: "F.2" } },
    ];
    const self = records[0]!;
    const blocked = partOfExcludedIds(self, records);
    const offered = records.filter((r) => !blocked.has(r.id) && tagMatches(recordTag(r.facts), "f.2"));
    expect(offered.map((r) => r.id)).toEqual(["c"]);

    const read = async (id: string) => records.find((r) => r.id === id) ?? null;
    expect(await wouldLoop(self, e("b"), read)).toBe(true);
    expect(await wouldLoop(self, e("c"), read)).toBe(false);

    const next = withLinkFact(self.facts, undefined, "fvParent", e("c"));
    expect(linkAddress({ facts: next.facts, served: { facts: next.servedFacts } }, "fvParent")).toBe(e("c"));
  });

  it("the host checks a tag in its own vault, and uses the unit's sentence", () => {
    const tagsInMyVault = new Set(["F.1", "F.2"]);
    const tagUsed = (tag: string) => tagsInMyVault.has(tag);
    expect(tagUsed("F.1") ? duplicateTagSentence("F.1") : "").toBe('The tag "F.1" is already used in this vault. Pick another.');
  });

  it("reads Solution of and Part of System from the platform's rows and facts", () => {
    const rows = [{ relation: e("r1"), role: "role:source", type: "t:SolutionOf", members: [{ member: e("fn"), role: "role:target" }] }];
    expect(solutionOfFunctions(rows)).toEqual([{ relation: e("r1"), uri: e("fn") }]);
    expect(readPartOfFact({ facts: {}, served: { facts: { partOf: { "@id": e("sys") } } } })).toEqual({ kind: "link", uri: e("sys") });
  });
});
