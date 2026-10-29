// @vitest-environment node
// New tests: the rest of the session's up-front answers (the kept finds and reads, the screen's answers and their lapse, the anchor ask in
// flight, the joined ids and the ended ids), each export pinned. The state is module state, so each test loads a fresh copy of the module.
import { beforeEach, describe, expect, it, vi } from "vitest";

let m: typeof import("./linkedAnswers");
beforeEach(async () => {
  vi.resetModules();
  m = await import("./linkedAnswers");
});

const found = (id: string) => ({ vaultId: "v1", record: { recordId: `https://a.platform.example.test/vault/e/${id}`, title: "Ann", type: null, updatedAt: null } });

describe("the kept answers are plain maps the doors read and write", () => {
  it("start empty and hold what is put in them", () => {
    expect(m.memberAnswers.size).toBe(0);
    expect(m.recordReads.size).toBe(0);
    expect(m.screenAnswerUntil.size).toBe(0);
    m.memberAnswers.set("k", { ids: ["a"], complete: true });
    m.recordReads.set("https://a.platform.example.test/vault/e/r1", found("r1"));
    m.recordReads.set("https://a.platform.example.test/vault/e/r2", null);
    expect(m.memberAnswers.get("k")).toEqual({ ids: ["a"], complete: true });
    expect(m.recordReads.get("https://a.platform.example.test/vault/e/r2")).toBeNull();
  });
});

describe("screenAnswerLapsed", () => {
  it("is false for a key with no screen answer", () => {
    expect(m.screenAnswerLapsed("nobody", 5)).toBe(false);
  });
  it("is false before the time and true at the time and after it", () => {
    m.screenAnswerUntil.set("k", 100);
    expect(m.screenAnswerLapsed("k", 99)).toBe(false);
    expect(m.screenAnswerLapsed("k", 100)).toBe(true);
    expect(m.screenAnswerLapsed("k", 101)).toBe(true);
  });
  it("reads the clock now when no time is given", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000);
      m.screenAnswerUntil.set("k", 1500);
      expect(m.screenAnswerLapsed("k")).toBe(false);
      vi.setSystemTime(1500);
      expect(m.screenAnswerLapsed("k")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("keptResolve, state across calls", () => {
  it("shares the ask in flight per key and forgets it when it answers or fails", async () => {
    const release: Array<(v: string) => void> = [];
    let sent = 0;
    const ask = () => new Promise<string>((r) => { sent += 1; release.push(r); });
    const a = m.keptResolve("h\u0000r1", ask);
    const b = m.keptResolve("h\u0000r1", ask);
    expect(b).toBe(a);
    expect(sent).toBe(1);
    release[0]!("one");
    expect(await a).toBe("one");
    const c = m.keptResolve("h\u0000r1", ask);
    expect(c).not.toBe(a);
    expect(sent).toBe(2);
    release[1]!("two");
    expect(await c).toBe("two");
  });
  it("a failed ask is dropped from the register too, and its rejection reaches every waiter", async () => {
    let fail: (e: Error) => void = () => undefined;
    const first = m.keptResolve("k", () => new Promise<string>((_r, rej) => { fail = rej; }));
    const second = m.keptResolve("k", async () => "never asked");
    fail(new Error("down"));
    await expect(first).rejects.toThrow("down");
    await expect(second).rejects.toThrow("down");
    expect(await m.keptResolve("k", async () => "again")).toBe("again");
  });
});

describe("isDeletedLinkedRecord", () => {
  it("is true for a deleted id, whether asked by its id or its address, and false for another", () => {
    m.forgetDeletedLinkedRecord("x1");
    expect(m.isDeletedLinkedRecord("x1")).toBe(true);
    expect(m.isDeletedLinkedRecord("https://b.platform.example.test/vault/e/x1")).toBe(true);
    expect(m.isDeletedLinkedRecord("x2")).toBe(false);
  });
  it("is true for a record taken as ended", () => {
    m.forgetEndedLinkedRecord("https://a.platform.example.test/vault/e/x9");
    expect(m.isDeletedLinkedRecord("x9")).toBe(true);
    expect(m.isDeletedLinkedRecord("x8")).toBe(false);
  });
});

describe("forgetLinkedFinds", () => {
  it("clears the finds, the reads, the screen's answers and the joined ids, and keeps the deleted and the ended", () => {
    m.memberAnswers.set("k", { ids: ["a"], complete: false });
    m.recordReads.set("https://a.platform.example.test/vault/e/r1", found("r1"));
    m.screenAnswerUntil.set("k", 10);
    m.noteJoinedLinkedRecord("r1");
    m.forgetDeletedLinkedRecord("d1");
    m.forgetEndedLinkedRecord("e1");
    m.forgetLinkedFinds();
    expect(m.memberAnswers.size).toBe(0);
    expect(m.recordReads.size).toBe(0);
    expect(m.screenAnswerUntil.size).toBe(0);
    expect(m.wasJoinedLinkedRecord("r1")).toBe(false);
    expect([...m.deletedLinkedRecords()]).toEqual(["d1"]);
    expect([...m.endedLinkedRecords()]).toEqual(["e1"]);
  });
  it("tells nobody", () => {
    const deleted = vi.fn();
    const ended = vi.fn();
    m.forgetDeletedLinkedRecord("d1");
    m.forgetEndedLinkedRecord("e1");
    m.onDeletedLinkedRecords(deleted);
    m.onEndedLinkedRecords(ended);
    m.forgetLinkedFinds();
    expect(deleted).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
  });
  it("leaves the anchor asks in flight shared", () => {
    let sent = 0;
    const ask = () => new Promise<string>(() => { sent += 1; });
    m.keptResolve("k", ask);
    m.forgetLinkedFinds();
    m.keptResolve("k", ask);
    expect(sent).toBe(1);
  });
});

describe("forgetLinkedRecords (sign-out)", () => {
  it("clears every kept answer, the deleted, the joined and the ended ids, and the anchor asks in flight", () => {
    m.memberAnswers.set("k", { ids: ["a"], complete: true });
    m.recordReads.set("https://a.platform.example.test/vault/e/r1", null);
    m.screenAnswerUntil.set("k", 10);
    m.noteJoinedLinkedRecord("r1");
    m.forgetDeletedLinkedRecord("d1");
    m.forgetEndedLinkedRecord("e1");
    let sent = 0;
    const ask = () => new Promise<string>(() => { sent += 1; });
    m.keptResolve("k", ask);
    m.forgetLinkedRecords();
    expect(m.memberAnswers.size).toBe(0);
    expect(m.recordReads.size).toBe(0);
    expect(m.screenAnswerUntil.size).toBe(0);
    expect(m.wasJoinedLinkedRecord("r1")).toBe(false);
    expect(m.deletedLinkedRecords().size).toBe(0);
    expect(m.endedLinkedRecords().size).toBe(0);
    m.keptResolve("k", ask);
    expect(sent).toBe(2);
  });
  it("tells the deleted listeners and the ended listeners once each, and only when there was something", () => {
    const deleted = vi.fn();
    const ended = vi.fn();
    m.onDeletedLinkedRecords(deleted);
    m.onEndedLinkedRecords(ended);
    m.forgetLinkedRecords();
    expect(deleted).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
    m.forgetDeletedLinkedRecord("d1");
    m.forgetEndedLinkedRecord("e1");
    deleted.mockClear();
    ended.mockClear();
    m.forgetLinkedRecords();
    expect(deleted).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith(new Set());
  });
  it("moves the deleted revision once when it emptied the list, and not when the list was empty", () => {
    const r0 = m.deletedLinkedRevision();
    m.forgetLinkedRecords();
    expect(m.deletedLinkedRevision()).toBe(r0);
    m.forgetDeletedLinkedRecord("d1");
    m.forgetLinkedRecords();
    expect(m.deletedLinkedRevision()).toBe(r0 + 2);
  });
});

describe("the joined ids", () => {
  it("are noted by id or address and asked by id or address", () => {
    expect(m.wasJoinedLinkedRecord("r1")).toBe(false);
    m.noteJoinedLinkedRecord("https://a.platform.example.test/vault/e/r1");
    expect(m.wasJoinedLinkedRecord("r1")).toBe(true);
    expect(m.wasJoinedLinkedRecord("https://b.platform.example.test/vault/e/r1")).toBe(true);
    expect(m.wasJoinedLinkedRecord("r2")).toBe(false);
  });
});

describe("isKeptLinkedRecord", () => {
  it("is true for a record whose read answered a record, by id or address", () => {
    m.recordReads.set("https://a.platform.example.test/vault/e/r1", found("r1"));
    expect(m.isKeptLinkedRecord("r1")).toBe(true);
    expect(m.isKeptLinkedRecord("https://b.platform.example.test/vault/e/r1")).toBe(true);
  });
  it("is false for a record read as gone, and for one not read", () => {
    m.recordReads.set("https://a.platform.example.test/vault/e/r2", null);
    expect(m.isKeptLinkedRecord("r2")).toBe(false);
    expect(m.isKeptLinkedRecord("r3")).toBe(false);
  });
});

describe("the ended ids", () => {
  it("forgetEndedLinkedRecord adds an id once and tells the listeners with a copy of the whole set", () => {
    const heard = vi.fn();
    m.onEndedLinkedRecords(heard);
    m.forgetEndedLinkedRecord("https://a.platform.example.test/vault/e/e1");
    expect(heard).toHaveBeenCalledTimes(1);
    const told = heard.mock.calls[0]![0] as Set<string>;
    expect([...told]).toEqual(["e1"]);
    m.forgetEndedLinkedRecord("e1");
    expect(heard).toHaveBeenCalledTimes(1);
    m.forgetEndedLinkedRecord("e2");
    expect(heard).toHaveBeenCalledTimes(2);
    expect([...(heard.mock.calls[1]![0] as Set<string>)]).toEqual(["e1", "e2"]);
    expect([...told]).toEqual(["e1"]);
  });
  it("relistLinkedRecord takes an id back out and tells; an id that was not there tells nothing", () => {
    const heard = vi.fn();
    m.forgetEndedLinkedRecord("e1");
    m.onEndedLinkedRecords(heard);
    m.relistLinkedRecord("e2");
    expect(heard).not.toHaveBeenCalled();
    m.relistLinkedRecord("https://a.platform.example.test/vault/e/e1");
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith(new Set());
    expect(m.endedLinkedRecords().size).toBe(0);
    expect(m.isDeletedLinkedRecord("e1")).toBe(false);
  });
  it("endedLinkedRecords is a copy", () => {
    m.forgetEndedLinkedRecord("e1");
    const copy = m.endedLinkedRecords() as Set<string>;
    copy.clear();
    expect([...m.endedLinkedRecords()]).toEqual(["e1"]);
  });
  it("onEndedLinkedRecords answers an unsubscribe that stops it", () => {
    const heard = vi.fn();
    const off = m.onEndedLinkedRecords(heard);
    expect(off()).toBe(true);
    m.forgetEndedLinkedRecord("e1");
    expect(heard).not.toHaveBeenCalled();
    expect(off()).toBe(false);
  });
  it("an ended id does not appear in the deleted list, and does not move its revision", () => {
    const r0 = m.deletedLinkedRevision();
    m.forgetEndedLinkedRecord("e1");
    expect(m.deletedLinkedRecords().size).toBe(0);
    expect(m.deletedLinkedRevision()).toBe(r0);
  });
});
