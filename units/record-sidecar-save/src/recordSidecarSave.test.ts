// @vitest-environment node
// Ported from the source's recordSidecarSave test (all 3 cases, as they were: they pin `noteServedVersion` and `heldVersion` with no
// network). New cases follow: the queue, the If-Match, the 412 path and what the module holds, with the real `lws-records` over a fake
// vault (test/support.ts). The module has no reset, so every case uses ids of its own.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordConflictError, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { heldVersion, noteServedVersion, saveRecordSidecar } from "./recordSidecarSave";
import { fakeVault, gate, setUp, tearDown } from "../test/support";

beforeEach(() => setUp());
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("F15 — noteServedVersion (ported)", () => {
  it("with no ETag, every fresh read (a different sidecar) replaces the held sidecar", () => {
    noteServedVersion("f15-a", null, { skill: { type: "skill", order: 1 } });
    noteServedVersion("f15-a", null, { skill: { type: "skill", order: 1 }, skill2: { type: "skill", order: 2 } });
    expect(heldVersion("f15-a").meta).toEqual({ skill: { type: "skill", order: 1 }, skill2: { type: "skill", order: 2 } });
  });

  it("a new ETag is taken even when the sidecar is the same", () => {
    noteServedVersion("f15-b", '"v1"', { a: 1 });
    noteServedVersion("f15-b", '"v2"', { a: 1 });
    expect(heldVersion("f15-b").etag).toBe('"v2"');
  });

  it("the same read noted again (same ETag, same sidecar) is not news", () => {
    noteServedVersion("f15-c", '"v1"', { a: 1 });
    noteServedVersion("f15-c", '"v1"', { a: 1 });
    expect(heldVersion("f15-c")).toEqual({ etag: '"v1"', meta: { a: 1 } });
  });
});

/** Lets every promise that is ready run (the fake vault answers from microtasks only): no timer, no wait. */
const settle = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
};
const meta = (n: number) => ({ items: [n] });
const emptyBuild = (patch: Record<string, unknown> = { k: 1 }) => () => ({ patch: patch as never, meta: { k: 1 } });

describe("noteServedVersion, more", () => {
  it("an id never noted holds nothing: no ETag and no sidecar", () => {
    expect(heldVersion("n-none")).toEqual({ etag: null, meta: undefined });
  });

  it("the first read is taken, even when it is `null` with no sidecar", () => {
    noteServedVersion("n-first", null, undefined);
    expect(heldVersion("n-first")).toEqual({ etag: null, meta: undefined });
    noteServedVersion("n-first", null, { a: 1 });
    expect(heldVersion("n-first").meta).toEqual({ a: 1 });
  });

  it("a re-render that carries an OLDER read, after a newer one was noted, rolls the version back (it is a different read)", () => {
    noteServedVersion("n-old", '"v1"', { a: 1 });
    noteServedVersion("n-old", '"v2"', { a: 2 });
    noteServedVersion("n-old", '"v1"', { a: 1 });
    expect(heldVersion("n-old")).toEqual({ etag: '"v1"', meta: { a: 1 } });
  });

  it("the same ETag with a different sidecar is news", () => {
    noteServedVersion("n-meta", '"v1"', { a: 1 });
    noteServedVersion("n-meta", '"v1"', { a: 2 });
    expect(heldVersion("n-meta").meta).toEqual({ a: 2 });
  });

  it("a missing sidecar and a `null` sidecar are the same read", () => {
    noteServedVersion("n-null", '"v1"', undefined);
    noteServedVersion("n-null", '"v1"', null);
    expect(heldVersion("n-null")).toEqual({ etag: '"v1"', meta: undefined });
  });

  it("records are kept apart: a note for one id never touches another", () => {
    noteServedVersion("n-r1", '"v1"', { a: 1 });
    noteServedVersion("n-r2", '"v9"', { a: 9 });
    expect(heldVersion("n-r1")).toEqual({ etag: '"v1"', meta: { a: 1 } });
    expect(heldVersion("n-r2")).toEqual({ etag: '"v9"', meta: { a: 9 } });
  });

  it("is ignored while a save of that record is in flight, and taken again once it has settled", async () => {
    const g = gate<{ status: number; etag: string }>();
    fakeVault({ patch: () => g.promise });
    noteServedVersion("n-busy", '"v1"', meta(1));
    const saved = saveRecordSidecar("n-busy", null, "k", emptyBuild(), () => {});
    noteServedVersion("n-busy", '"v7"', meta(7));
    expect(heldVersion("n-busy").etag).toBe('"v1"');
    g.release({ status: 200, etag: '"v2"' });
    await saved;
    await Promise.resolve();
    expect(heldVersion("n-busy").etag).toBe('"v2"');
    noteServedVersion("n-busy", '"v7"', meta(7));
    expect(heldVersion("n-busy")).toEqual({ etag: '"v7"', meta: meta(7) });
  });
});

describe("saveRecordSidecar", () => {
  it("sends the patch the section built, with If-Match = the held version, and holds the version the server answers", async () => {
    const v = fakeVault({ patch: () => ({ status: 200, etag: '"v2"' }) });
    noteServedVersion("s-one", '"v1"', { old: true });
    const build = vi.fn((stored: unknown) => ({ patch: { k: { x: 1 } }, meta: { k: { x: 1 }, gone: null } }));
    await saveRecordSidecar("s-one", null, "k", build, () => {});
    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith({ old: true });
    expect(v.patches()).toHaveLength(1);
    expect(v.patches()[0]!.method).toBe("PATCH");
    expect(v.patches()[0]!.headers["if-match"]).toBe('"v1"');
    expect(Object.values(v.patches()[0]!.body as object)).toEqual([{ x: 1 }]);
    // an entry sent as null is gone from the held sidecar
    expect(heldVersion("s-one")).toEqual({ etag: '"v2"', meta: { k: { x: 1 } } });
  });

  it("with no held version it sends no If-Match", async () => {
    const v = fakeVault({ patch: () => ({ status: 200, etag: '"v1"' }) });
    await saveRecordSidecar("s-nover", null, "k", emptyBuild(), () => {});
    expect(v.patches()[0]!.headers).not.toHaveProperty("if-match");
  });

  it("a server that answers no ETag leaves the held version `null`, and the next save sends no If-Match", async () => {
    const v = fakeVault({ patch: () => ({ status: 200, etag: null }) });
    noteServedVersion("s-noetag", '"v1"', meta(1));
    await saveRecordSidecar("s-noetag", null, "k", emptyBuild(), () => {});
    expect(heldVersion("s-noetag").etag).toBeNull();
    await saveRecordSidecar("s-noetag", null, "k", emptyBuild(), () => {});
    expect(v.patches()[0]!.headers["if-match"]).toBe('"v1"');
    expect(v.patches()[1]!.headers).not.toHaveProperty("if-match");
  });

  it("is addressed at the record's own address when it is given, and writes only that record", async () => {
    const v = fakeVault({});
    await saveRecordSidecar("s-addr", "https://mona.platform.example.test/base/e/s-addr", "k", emptyBuild(), () => {});
    expect(v.patches()[0]!.url.startsWith("https://mona.platform.example.test/")).toBe(true);
    expect(v.patches()[0]!.url).toContain("/lws/r/s-addr");
  });

  it("the second section's save carries the version the first one left (no 412 to pay), and builds from the sidecar the first one left", async () => {
    const v = fakeVault({ patch: (_id, n) => ({ status: 200, etag: `"v${n + 1}"` }) });
    noteServedVersion("s-two", '"v1"', { a: 0 });
    const seenStored: unknown[] = [];
    const first = saveRecordSidecar("s-two", null, "k", (stored) => (seenStored.push(stored), { patch: { k: 1 }, meta: { a: 1 } }), () => {});
    const second = saveRecordSidecar("s-two", null, "k", (stored) => (seenStored.push(stored), { patch: { k: 2 }, meta: { a: 2 } }), () => {});
    await Promise.all([first, second]);
    expect(v.patches().map((p) => p.headers["if-match"])).toEqual(['"v1"', '"v2"']);
    expect(seenStored).toEqual([{ a: 0 }, { a: 1 }]);
    expect(heldVersion("s-two")).toEqual({ etag: '"v3"', meta: { a: 2 } });
  });

  it("saves of one record run one at a time: the second PATCH is not sent before the first has answered", async () => {
    const g = gate<{ status: number; etag: string }>();
    const v = fakeVault({ patch: (_id, n) => (n === 1 ? g.promise : { status: 200, etag: '"v3"' }) });
    const first = saveRecordSidecar("s-serial", null, "k", emptyBuild(), () => {});
    const second = saveRecordSidecar("s-serial", null, "k", emptyBuild(), () => {});
    await settle();
    expect(v.patches()).toHaveLength(1);
    g.release({ status: 200, etag: '"v2"' });
    await Promise.all([first, second]);
    expect(v.patches()).toHaveLength(2);
  });

  it("saves of different records do not wait for each other", async () => {
    const g = gate<{ status: number; etag: string }>();
    const v = fakeVault({ patch: (id) => (id === "s-par-a" ? g.promise : { status: 200, etag: '"b"' }) });
    const a = saveRecordSidecar("s-par-a", null, "k", emptyBuild(), () => {});
    const b = saveRecordSidecar("s-par-b", null, "k", emptyBuild(), () => {});
    await b;
    expect(v.patches().map((p) => p.url.includes("s-par-b"))).toContain(true);
    g.release({ status: 200, etag: '"a"' });
    await a;
  });

  it("the build is called as late as the save runs: the second save builds after the first has finished", async () => {
    const order: string[] = [];
    fakeVault({ patch: () => (order.push("patch"), { status: 200, etag: '"v2"' }) });
    const a = saveRecordSidecar("s-late", null, "k", () => (order.push("build1"), { patch: { k: 1 }, meta: {} }), () => {});
    const b = saveRecordSidecar("s-late", null, "k", () => (order.push("build2"), { patch: { k: 2 }, meta: {} }), () => {});
    await Promise.all([a, b]);
    expect(order).toEqual(["build1", "patch", "build2", "patch"]);
  });

  it("resolves with nothing", async () => {
    fakeVault({});
    await expect(saveRecordSidecar("s-void", null, "k", emptyBuild(), () => {})).resolves.toBeUndefined();
  });
});

describe("a 412: someone else wrote since", () => {
  const T = "movedOn";
  const read = (etag: string | null, sidecar: unknown) => () => ({ facts: sidecar === undefined ? {} : { [T]: sidecar }, etag });

  it("re-reads the record, hands it to `rebase`, builds again from the fresh sidecar, and sends once more with the fresh version", async () => {
    const v = fakeVault({ read: read('"v9"', { theirs: true }), patch: (_id, n) => (n === 1 ? { status: 412 } : { status: 200, etag: '"v10"' }) });
    noteServedVersion("c-1", '"v1"', { mine: true });
    const stored: unknown[] = [];
    const rebase = vi.fn((fresh: BaseRecord) => void fresh);
    await saveRecordSidecar("c-1", null, T, (s) => (stored.push(s), { patch: { [T]: { merged: true } }, meta: { merged: true } }), rebase);
    expect(stored).toEqual([{ mine: true }, { theirs: true }]);
    expect(rebase).toHaveBeenCalledTimes(1);
    expect(rebase.mock.calls[0]![0].id).toBe("c-1");
    expect(v.reads()).toHaveLength(1);
    expect(v.patches().map((p) => p.headers["if-match"])).toEqual(['"v1"', '"v9"']);
    expect(heldVersion("c-1")).toEqual({ etag: '"v10"', meta: { merged: true } });
  });

  it("`rebase` is called after the re-read and before the second build", async () => {
    const order: string[] = [];
    fakeVault({ read: (_id, _n) => (order.push("read"), { facts: { [T]: { x: 1 } }, etag: '"v9"' }), patch: (_id, n) => (order.push("patch" + n), n === 1 ? { status: 412 } : { status: 200, etag: '"v10"' }) });
    noteServedVersion("c-order", '"v1"', {});
    await saveRecordSidecar("c-order", null, T, () => (order.push("build"), { patch: { k: 1 }, meta: {} }), () => order.push("rebase"));
    expect(order).toEqual(["build", "patch1", "read", "rebase", "build", "patch2"]);
  });

  it("the re-read is at the record's own address", async () => {
    const v = fakeVault({ read: read('"v9"', {}), patch: (_id, n) => (n === 1 ? { status: 412 } : { status: 200, etag: '"v10"' }) });
    await saveRecordSidecar("c-addr", "https://mona.platform.example.test/base/e/c-addr", T, emptyBuild(), () => {});
    expect(v.reads()[0]!.url.startsWith("https://mona.platform.example.test/")).toBe(true);
  });

  it("a record whose fresh read has no ETag is held with `null`, and the resend sends no If-Match", async () => {
    const v = fakeVault({ read: read(null, { x: 1 }), patch: (_id, n) => (n === 1 ? { status: 412 } : { status: 200, etag: '"v2"' }) });
    noteServedVersion("c-noetag", '"v1"', {});
    await saveRecordSidecar("c-noetag", null, T, emptyBuild(), () => {});
    expect(v.patches()[0]!.headers["if-match"]).toBe('"v1"');
    expect(v.patches()[1]!.headers).not.toHaveProperty("if-match");
  });

  it("a fresh read with no sidecar under the key builds from `undefined`", async () => {
    fakeVault({ read: read('"v9"', undefined), patch: (_id, n) => (n === 1 ? { status: 412 } : { status: 200, etag: '"v2"' }) });
    noteServedVersion("c-nometa", '"v1"', { old: 1 });
    const stored: unknown[] = [];
    await saveRecordSidecar("c-nometa", null, T, (s) => (stored.push(s), { patch: { k: 1 }, meta: {} }), () => {});
    expect(stored).toEqual([{ old: 1 }, undefined]);
  });

  it("a second 412 is thrown as the conflict: one re-read, two patches, no third try", async () => {
    const v = fakeVault({ read: read('"v9"', {}), patch: () => ({ status: 412 }) });
    noteServedVersion("c-twice", '"v1"', {});
    await expect(saveRecordSidecar("c-twice", null, T, emptyBuild(), () => {})).rejects.toBeInstanceOf(RecordConflictError);
    expect(v.reads()).toHaveLength(1);
    expect(v.patches()).toHaveLength(2);
  });

  it("a 412 on a record that can no longer be read throws the conflict, and `rebase` is not called", async () => {
    const v = fakeVault({ read: () => null, patch: () => ({ status: 412 }) });
    const rebase = vi.fn();
    await expect(saveRecordSidecar("c-gone", null, T, emptyBuild(), rebase)).rejects.toBeInstanceOf(RecordConflictError);
    expect(rebase).not.toHaveBeenCalled();
    expect(v.patches()).toHaveLength(1);
  });
});

describe("a failed save", () => {
  it("any other error is thrown as it is: no re-read, no second try", async () => {
    const v = fakeVault({ patch: () => ({ status: 500 }) });
    const rebase = vi.fn();
    const err = await saveRecordSidecar("e-500", null, "k", emptyBuild(), rebase).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(RecordConflictError);
    expect(v.reads()).toHaveLength(0);
    expect(v.patches()).toHaveLength(1);
    expect(rebase).not.toHaveBeenCalled();
  });

  it("an error thrown by `build` is thrown, nothing is sent", async () => {
    const v = fakeVault({});
    await expect(saveRecordSidecar("e-build", null, "k", () => { throw new Error("no build"); }, () => {})).rejects.toThrow("no build");
    expect(v.patches()).toHaveLength(0);
  });

  it("a failed save does not stop the queue: the next save of the record still runs", async () => {
    const v = fakeVault({ patch: (_id, n) => (n === 1 ? { status: 500 } : { status: 200, etag: '"v2"' }) });
    const first = saveRecordSidecar("e-queue", null, "k", emptyBuild(), () => {});
    const second = saveRecordSidecar("e-queue", null, "k", emptyBuild(), () => {});
    await expect(first).rejects.toBeInstanceOf(Error);
    await expect(second).resolves.toBeUndefined();
    expect(v.patches()).toHaveLength(2);
  });

  it("after a failure the record is no longer 'busy': a read is taken again", async () => {
    fakeVault({ patch: () => ({ status: 500 }) });
    noteServedVersion("e-busy", '"v1"', meta(1));
    await saveRecordSidecar("e-busy", null, "k", emptyBuild(), () => {}).catch(() => undefined);
    await Promise.resolve();
    noteServedVersion("e-busy", '"v5"', meta(5));
    expect(heldVersion("e-busy").etag).toBe('"v5"');
  });

  it("a failed save leaves the held version and sidecar as they were", async () => {
    fakeVault({ patch: () => ({ status: 500 }) });
    noteServedVersion("e-held", '"v1"', { a: 1 });
    await saveRecordSidecar("e-held", null, "k", () => ({ patch: { k: 1 }, meta: { b: 2 } }), () => {}).catch(() => undefined);
    expect(heldVersion("e-held")).toEqual({ etag: '"v1"', meta: { a: 1 } });
  });
});
