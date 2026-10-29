// @vitest-environment node
// New tests: the screen's links per holder and the rows seen in view, each export pinned. The state is module state, so each test loads a
// fresh copy of the module.
import { beforeEach, describe, expect, it, vi } from "vitest";

let m: typeof import("./pageLinks");
beforeEach(async () => {
  vi.resetModules();
  m = await import("./pageLinks");
});

const rec = (id: string, title = "Ann") => ({ id, title });

describe("newestLinkedId", () => {
  it("is the greatest id, whatever the order", () => {
    expect(m.newestLinkedId(["a1", "c3", "b2"])).toBe("c3");
    expect(m.newestLinkedId(["c3", "b2", "a1"])).toBe("c3");
  });
  it("is null for none and the one id for one", () => {
    expect(m.newestLinkedId([])).toBeNull();
    expect(m.newestLinkedId(["a1"])).toBe("a1");
  });
  it("compares as text, as the platform's record ids are text", () => {
    expect(m.newestLinkedId(["9", "10"])).toBe("9");
  });
});

describe("the screen's links per holder", () => {
  it("answers null and none for a holder never set", () => {
    expect(m.screenRecordLinkedTo("h1", "p1")).toBeNull();
    expect(m.screenLinkedRecordsOf("h1", "p1")).toEqual([]);
  });
  it("keeps the row owner and the group of each person, per holder", () => {
    m.setScreenLinks("h1", new Map([["p1", "r2"]]), new Map([["p1", [rec("r2"), rec("r1")]]]));
    m.setScreenLinks("h2", new Map([["p1", "r9"]]));
    expect(m.screenRecordLinkedTo("h1", "p1")).toBe("r2");
    expect(m.screenRecordLinkedTo("h1", "p2")).toBeNull();
    expect(m.screenLinkedRecordsOf("h1", "p1").map((r) => r.id)).toEqual(["r2", "r1"]);
    expect(m.screenRecordLinkedTo("h2", "p1")).toBe("r9");
    expect(m.screenLinkedRecordsOf("h2", "p1")).toEqual([]);
  });
  it("a second set for a holder replaces the first and never adds to it", () => {
    m.setScreenLinks("h1", new Map([["p1", "r2"], ["p2", "r3"]]), new Map([["p1", [rec("r2")]]]));
    m.setScreenLinks("h1", new Map([["p1", "r5"]]));
    expect(m.screenRecordLinkedTo("h1", "p1")).toBe("r5");
    expect(m.screenRecordLinkedTo("h1", "p2")).toBeNull();
    expect(m.screenLinkedRecordsOf("h1", "p1")).toEqual([]);
  });
  it("keeps a copy of what it was given: changing the maps afterwards changes nothing", () => {
    const owners = new Map([["p1", "r2"]]);
    const groups = new Map([["p1", [rec("r2")]]]);
    m.setScreenLinks("h1", owners, groups);
    owners.set("p1", "r7");
    groups.clear();
    expect(m.screenRecordLinkedTo("h1", "p1")).toBe("r2");
    expect(m.screenLinkedRecordsOf("h1", "p1").map((r) => r.id)).toEqual(["r2"]);
  });
  it("a record carries its vault and time as given", () => {
    m.setScreenLinks("h1", new Map(), new Map([["p1", [{ id: "r1", title: "Ann", vaultId: "v1", updatedAt: 5 }]]]));
    expect(m.screenLinkedRecordsOf("h1", "p1")).toEqual([{ id: "r1", title: "Ann", vaultId: "v1", updatedAt: 5 }]);
  });
  it("every set tells the listeners once and moves the revision by one, even to the same value", () => {
    const heard = vi.fn();
    m.onScreenLinks(heard);
    expect(m.screenLinksRevision()).toBe(0);
    m.setScreenLinks("h1", new Map());
    m.setScreenLinks("h1", new Map());
    expect(heard).toHaveBeenCalledTimes(2);
    expect(m.screenLinksRevision()).toBe(2);
  });
  it("a listener finds the new screen already in place when it is told", () => {
    let seen: string | null = null;
    m.onScreenLinks(() => (seen = m.screenRecordLinkedTo("h1", "p1")));
    m.setScreenLinks("h1", new Map([["p1", "r2"]]));
    expect(seen).toBe("r2");
  });
  it("forgetScreenLinks forgets every holder and tells, even when there was nothing", () => {
    const heard = vi.fn();
    m.onScreenLinks(heard);
    m.forgetScreenLinks();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(m.screenLinksRevision()).toBe(1);
    m.setScreenLinks("h1", new Map([["p1", "r2"]]));
    m.setScreenLinks("h2", new Map([["p1", "r3"]]));
    m.forgetScreenLinks();
    expect(m.screenRecordLinkedTo("h1", "p1")).toBeNull();
    expect(m.screenRecordLinkedTo("h2", "p1")).toBeNull();
    expect(heard).toHaveBeenCalledTimes(4);
  });
  it("onScreenLinks answers an unsubscribe that stops it", () => {
    const heard = vi.fn();
    const off = m.onScreenLinks(heard);
    expect(off()).toBe(true);
    m.setScreenLinks("h1", new Map());
    expect(heard).not.toHaveBeenCalled();
  });
  it("the screen's state and the page links do not meet: neither moves the other's revision", () => {
    m.setScreenLinks("h1", new Map());
    expect(m.pageLinksRevision()).toBe(0);
    m.notePageLinks([{ id: "a", body: { sameAs: { "@id": "https://k.platform.example.test/vault" } } }]);
    expect(m.screenLinksRevision()).toBe(1);
  });
});

describe("the rows seen in view", () => {
  it("start empty", () => {
    expect(m.recordsInView().size).toBe(0);
  });
  it("a row coming into view is kept once and tells once", () => {
    const heard = vi.fn();
    m.onRecordsInView(heard);
    m.noteRecordInView("https://a.platform.example.test/vault/e/r1");
    m.noteRecordInView("https://a.platform.example.test/vault/e/r1");
    expect(heard).toHaveBeenCalledTimes(1);
    expect([...m.recordsInView()]).toEqual(["https://a.platform.example.test/vault/e/r1"]);
    m.noteRecordInView("https://a.platform.example.test/vault/e/r2");
    expect(heard).toHaveBeenCalledTimes(2);
  });
  it("is kept by the address as given: an id and its address are two entries", () => {
    m.noteRecordInView("r1");
    m.noteRecordInView("https://a.platform.example.test/vault/e/r1");
    expect(m.recordsInView().size).toBe(2);
  });
  it("recordsInView answers the live set, not a copy (kept as the source has it)", () => {
    const a = m.recordsInView();
    m.noteRecordInView("r1");
    expect(m.recordsInView()).toBe(a);
    expect(a.has("r1")).toBe(true);
  });
  it("a listener finds the row already kept when it is told", () => {
    let had = false;
    m.onRecordsInView(() => (had = m.recordsInView().has("r1")));
    m.noteRecordInView("r1");
    expect(had).toBe(true);
  });
  it("forgetRecordsInView empties the set and tells nobody (kept as the source has it)", () => {
    const heard = vi.fn();
    m.noteRecordInView("r1");
    m.onRecordsInView(heard);
    m.forgetRecordsInView();
    expect(m.recordsInView().size).toBe(0);
    expect(heard).not.toHaveBeenCalled();
    m.noteRecordInView("r1");
    expect(heard).toHaveBeenCalledTimes(1);
  });
  it("onRecordsInView answers an unsubscribe that stops it", () => {
    const heard = vi.fn();
    const off = m.onRecordsInView(heard);
    expect(off()).toBe(true);
    m.noteRecordInView("r1");
    expect(heard).not.toHaveBeenCalled();
  });
});
