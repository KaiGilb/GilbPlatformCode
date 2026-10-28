import { describe, expect, it } from "vitest";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { applyPatch } from "./applyPatch";
import { planFindRows } from "./planFind";
import { writeSource } from "./writeSource";

const row = (over: Partial<GridRecord> = {}): GridRecord => ({
  id: "rec1",
  entityUri: "https://h.example.test/base/e/rec1",
  typeUri: "t:Level",
  facts: { unitTag: "Speed.Goal", scaleNumber: "5" },
  opaqueFacts: [],
  etag: '"v1"',
  updatedAt: 7,
  servedKeys: ["unitTag", "scaleNumber"],
  served: { facts: { unitTag: "Speed.Goal", scaleNumber: "5" }, context: undefined, etag: '"v1"' },
  ...over,
});

describe("applyPatch", () => {
  it("sets the served fact and its text, takes the new version, and adds a new key to servedKeys", () => {
    const out = applyPatch(row(), { scaleNumber: "9", levelWhen: "2027-06-30" }, '"v2"');
    expect(out.facts).toEqual({ unitTag: "Speed.Goal", scaleNumber: "9", levelWhen: "2027-06-30" });
    expect(out.served?.facts).toEqual({ unitTag: "Speed.Goal", scaleNumber: "9", levelWhen: "2027-06-30" });
    expect(out.etag).toBe('"v2"');
    expect(out.served?.etag).toBe('"v2"');
    expect(out.servedKeys).toEqual(["unitTag", "scaleNumber", "levelWhen"]);
    expect(out.updatedAt).toBe(7);
  });

  it("does not change the row it was given", () => {
    const before = row();
    const copy = JSON.stringify(before);
    applyPatch(before, { scaleNumber: "9" }, '"v2"');
    expect(JSON.stringify(before)).toBe(copy);
  });

  it("a null deletes the fact, its served value and its key", () => {
    const out = applyPatch(row(), { scaleNumber: null }, null);
    expect(out.facts).toEqual({ unitTag: "Speed.Goal" });
    expect(out.served?.facts).toEqual({ unitTag: "Speed.Goal" });
    expect(out.servedKeys).toEqual(["unitTag"]);
    expect(out.etag).toBeNull();
  });

  it("shows a link as its address, a list as its members joined, and keeps a value the text cannot carry as opaque", () => {
    const out = applyPatch(
      row(),
      { partOf: { "@id": "https://h.example.test/base/e/v" }, tags: ["a", "b"], nested: { x: 1 }, count: 3, flag: true },
      '"v2"',
    );
    expect(out.facts.partOf).toBe("https://h.example.test/base/e/v");
    expect(out.facts.tags).toBe("a, b");
    expect(out.facts.count).toBe("3");
    expect(out.facts.flag).toBe("true");
    expect(out.facts.nested).toBe("");
    expect(out.opaqueFacts).toEqual(["nested"]);
    expect(out.served?.facts.nested).toEqual({ x: 1 });
  });

  it("a fact that can be shown again is taken out of opaque; keepOpaque leaves the list alone", () => {
    const held = row({ opaqueFacts: ["note"] });
    expect(applyPatch(held, { note: "plain" }, '"v2"').opaqueFacts).toEqual([]);
    expect(applyPatch(held, { note: "plain" }, '"v2"', { keepOpaque: true }).opaqueFacts).toEqual(["note"]);
    expect(applyPatch(held, { note: null }, '"v2"').opaqueFacts).toEqual([]);
    expect(applyPatch(held, { note: null }, '"v2"', { keepOpaque: true }).opaqueFacts).toEqual(["note"]);
  });

  it("keeps the served context and the prefixed keys, and a row with no served document gets one", () => {
    const withPrefixed = row({ served: { facts: { unitTag: "x" }, context: { a: 1 }, etag: '"v1"', prefixedKeys: ["a:unitTag"] } });
    const out = applyPatch(withPrefixed, { unitTag: "y" }, '"v2"');
    expect(out.served?.context).toEqual({ a: 1 });
    expect(out.served?.prefixedKeys).toEqual(["a:unitTag"]);
    const bare = applyPatch({ ...row(), served: undefined, servedKeys: undefined }, { unitTag: "z" }, '"v2"');
    expect(bare.served).toEqual({ facts: { unitTag: "z" }, context: undefined, etag: '"v2"' });
    expect(bare.servedKeys).toEqual(["unitTag"]);
  });
});

describe("writeSource", () => {
  it("is empty for a record that carries no served keys", () => {
    expect(writeSource({})).toEqual([]);
    expect(writeSource({ entityUri: "https://h.example.test/base/e/rec1", servedKeys: [] })).toEqual([]);
  });
  it("names the record's own address and its served keys", () => {
    expect(writeSource({ entityUri: "https://h.example.test/base/e/rec1", servedKeys: ["unitTag"] })).toEqual([
      { at: "https://h.example.test/base/e/rec1", servedKeys: ["unitTag"] },
    ]);
    expect(writeSource({ servedKeys: ["unitTag"] })).toEqual([{ at: null, servedKeys: ["unitTag"] }]);
  });
});

describe("planFindRows", () => {
  it("is the rows of a find, and none for no find", () => {
    expect(planFindRows(undefined)).toEqual([]);
    const r = row();
    expect(planFindRows({ rows: [r], total: 1, capped: false, unread: 0 })).toEqual([r]);
  });
});
