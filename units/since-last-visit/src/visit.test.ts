import { describe, expect, it } from "vitest";
import { ago, defaultWhoLabel, diffVisit, noteOwn, readVisit, recordVisit, writeVisit, type VisitItem, type VisitStore } from "./visit";

const mem = () => {
  const m = new Map<string, string>();
  const s: VisitStore & { m: Map<string, string> } = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), m };
  return s;
};
const KEY = "app:visit:ann:v1";
const ME = "https://ann.example.test/vault";
const BOB = "https://bob.example.test/vault";
const item = (id: string, updatedAt: number, extra: Partial<VisitItem> = {}): VisitItem => ({ id, updatedAt, label: `Record ${id}`, statedBy: BOB, ...extra });

describe("readVisit / writeVisit", () => {
  it("round-trips the time and the labels", () => {
    const s = mem();
    writeVisit(s, KEY, 1000, [item("a", 5), { id: "b", updatedAt: 6 }]);
    expect(readVisit(s, KEY)).toEqual({ at: 1000, labels: { a: "Record a", b: "b" } });
  });
  it("without a listing it keeps only the time", () => {
    const s = mem();
    writeVisit(s, KEY, 1000);
    expect(readVisit(s, KEY)).toEqual({ at: 1000 });
  });
  it("nothing stored, bad JSON, wrong shape, and no store all read as null", () => {
    const s = mem();
    expect(readVisit(s, KEY)).toBeNull();
    s.setItem(KEY, "{not json");
    expect(readVisit(s, KEY)).toBeNull();
    s.setItem(KEY, JSON.stringify({ at: "x" }));
    expect(readVisit(s, KEY)).toBeNull();
    s.setItem(KEY, JSON.stringify({ at: 1, labels: [] }));
    expect(readVisit(s, KEY)).toBeNull();
    expect(readVisit(null, KEY)).toBeNull();
  });
  it("a store that throws is ignored on both sides", () => {
    const bad: VisitStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    expect(() => writeVisit(bad, KEY, 1)).not.toThrow();
    expect(readVisit(bad, KEY)).toBeNull();
    expect(() => writeVisit(null, KEY, 1)).not.toThrow();
  });
});

describe("diffVisit", () => {
  const before = { at: 1000, labels: { old: "Old one", gone: "Gone one", mine: "Mine" } };

  it("the first visit shows nothing, even with new records", () => {
    expect(diffVisit(null, [item("a", 5000)], { me: ME })).toEqual([]);
  });

  it("tells added, changed and deleted, newest first", () => {
    const current = [item("old", 3000), item("new", 4000), item("quiet", 500, { label: "Quiet" })];
    const ended = [item("gone", 2000, { label: null, statedBy: null })];
    const r = diffVisit({ ...before, labels: { ...before.labels, quiet: "Quiet" } }, current, { me: ME, ended });
    expect(r).toEqual([
      { kind: "added", id: "new", label: "Record new", who: "bob", at: 4000 },
      { kind: "changed", id: "old", label: "Record old", who: "bob", at: 3000 },
      { kind: "deleted", id: "gone", label: "Gone one", who: "someone", at: 2000 },
    ]);
  });

  it("leaves out the person's own changes, by one address or any of several", () => {
    const current = [item("x", 3000, { statedBy: ME }), item("y", 3500, { statedBy: "ann" }), item("z", 4000)];
    expect(diffVisit(before, current, { me: ME }).map((c) => c.id)).toEqual(["z", "y"]);
    expect(diffVisit(before, current, { me: [ME, "ann"] }).map((c) => c.id)).toEqual(["z"]);
  });

  it("a record with no writer is shown, as someone", () => {
    const r = diffVisit(before, [item("n", 3000, { statedBy: null })], { me: ME });
    expect(r[0]).toMatchObject({ kind: "added", who: "someone" });
  });

  it("nothing at or before the last visit counts", () => {
    expect(diffVisit(before, [item("a", 1000), item("b", 999)], { me: ME })).toEqual([]);
  });

  it("a record that is still listed is not also a delete", () => {
    const r = diffVisit(before, [item("gone", 3000)], { me: ME, ended: [item("gone", 2000)] });
    expect(r.map((c) => c.kind)).toEqual(["changed"]);
  });

  it("an ended record this device never saw is not told", () => {
    expect(diffVisit(before, [], { me: ME, ended: [item("stranger", 3000)] })).toEqual([]);
  });

  it("an ended record older than the last visit is not told", () => {
    expect(diffVisit(before, [], { me: ME, ended: [item("gone", 900)] })).toEqual([]);
  });

  it("without the ended list no delete is told", () => {
    expect(diffVisit(before, [], { me: ME })).toEqual([]);
  });

  it("a snapshot written without a listing calls every newer record changed", () => {
    expect(diffVisit({ at: 1000 }, [item("a", 3000)], { me: ME })[0]?.kind).toBe("changed");
  });

  it("accepts ISO strings and Dates for updatedAt, and ignores a bad date", () => {
    const iso = new Date(3000).toISOString();
    const r = diffVisit(before, [item("a", 0, { updatedAt: iso }), item("b", 0, { updatedAt: new Date(4000) }), item("c", 0, { updatedAt: "nonsense" })], { me: ME });
    expect(r.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("uses the snapshot's label when the record gives none, and the id as the last resort", () => {
    const r = diffVisit(before, [{ id: "old", updatedAt: 3000 }, { id: "fresh", updatedAt: 3100 }], { me: ME });
    expect(r.map((c) => c.label)).toEqual(["fresh", "Old one"]);
  });

  it("whoLabel can be replaced", () => {
    const r = diffVisit(before, [item("a", 3000)], { me: ME, whoLabel: (s) => s.toUpperCase() });
    expect(r[0]?.who).toBe(BOB.toUpperCase());
  });

  it("an id like 'constructor' is not mistaken for a known record", () => {
    const r = diffVisit(before, [item("constructor", 3000)], { me: ME });
    expect(r[0]?.kind).toBe("added");
  });
});

describe("recordVisit", () => {
  it("first visit: nothing, and the visit is written; second visit: the others' changes", () => {
    const s = mem();
    expect(recordVisit(s, KEY, [item("a", 100)], { me: ME, now: 1000 })).toEqual([]);
    expect(readVisit(s, KEY)).toEqual({ at: 1000, labels: { a: "Record a" } });
    const r = recordVisit(s, KEY, [item("a", 100), item("b", 1500), item("c", 1600, { statedBy: ME })], { me: ME, now: 2000 });
    expect(r.map((c) => [c.kind, c.id])).toEqual([["added", "b"]]);
    expect(readVisit(s, KEY)?.at).toBe(2000);
  });
  it("a second look right after shows nothing new", () => {
    const s = mem();
    recordVisit(s, KEY, [], { me: ME, now: 1000 });
    recordVisit(s, KEY, [item("b", 1500)], { me: ME, now: 2000 });
    expect(recordVisit(s, KEY, [item("b", 1500)], { me: ME, now: 3000 })).toEqual([]);
  });
});

describe("noteOwn", () => {
  it("an own add is known next time (so a later edit by someone else reads as changed)", () => {
    const s = mem();
    writeVisit(s, KEY, 1000, []);
    noteOwn(s, KEY, { added: { id: "m", label: "Mine" } });
    expect(diffVisit(readVisit(s, KEY), [item("m", 2000)], { me: ME })[0]?.kind).toBe("changed");
  });
  it("an own delete is forgotten, so it is not told as someone's delete", () => {
    const s = mem();
    writeVisit(s, KEY, 1000, [item("m", 1)]);
    noteOwn(s, KEY, { deleted: { id: "m" } });
    expect(diffVisit(readVisit(s, KEY), [], { me: ME, ended: [item("m", 2000)] })).toEqual([]);
  });
  it("does nothing before a first visit, or without a store", () => {
    const s = mem();
    noteOwn(s, KEY, { added: { id: "m" } });
    expect(s.m.size).toBe(0);
    expect(() => noteOwn(null, KEY, { added: { id: "m" } })).not.toThrow();
  });
});

describe("helpers", () => {
  it("defaultWhoLabel", () => {
    expect(defaultWhoLabel("https://john.example.test/vault")).toBe("john");
    expect(defaultWhoLabel("John")).toBe("John");
    expect(defaultWhoLabel("  ")).toBe("someone");
  });
  it("ago", () => {
    expect(ago(1000, 1000)).toBe("just now");
    expect(ago(0, 5 * 60_000)).toBe("5 min ago");
    expect(ago(0, 2 * 3_600_000)).toBe("2 h ago");
    expect(ago(0, 3 * 86_400_000)).toBe("3 d ago");
    expect(ago(5000, 1000)).toBe("just now");
  });
});
