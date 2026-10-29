// @vitest-environment node
// Ported from the source's recordFactItems test (4 of its 5 cases; the fifth drives two other modules, see the README): the
// writer conditions its patch the way `holder-reference`'s `conditionFromEtag` does. `vi.mock("./records")` is replaced by the real
// `lws-records` over a fake vault (test/support.ts). New cases follow the ported ones.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordConflictError } from "@kaigilb/gilbplatformcode-lws-records";
import { changeRecordFactItems, factItemsToWire, RecordVersionUnknownError, storedFactItems } from "./recordFactItems";
import { TAG, fakeVault, setUp, tearDown } from "../test/support";

const A = "https://q.example.test/vault/e/a";
const B = "https://q.example.test/vault/e/b";
const both = { memberOf: [{ "@id": A }, { "@id": B }] };
const dropA = (stored: readonly unknown[]) => stored.filter((i) => (i as { "@id"?: string })["@id"] !== A);

beforeEach(() => setUp());
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("the record-fact writer's If-Match is conditionFromEtag's", () => {
  it("a read with NO ETag: 'not known yet', and NOTHING is sent (never an unconditional patch)", async () => {
    const v = fakeVault({ read: () => ({ facts: both, etag: null }) });
    const err = await changeRecordFactItems("r1", null, "memberOf", dropA, "the link was not removed").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RecordVersionUnknownError);
    expect((err as Error).message).toMatch(/no version \(no ETag\).*the link was not removed\. Nothing was sent\./);
    expect(v.patches()).toHaveLength(0);
  });

  it("the production edge's WEAK form of the platform's own tag: the platform's strong tag under it is sent", async () => {
    const v = fakeVault({ read: () => ({ facts: both, etag: `W/${TAG}` }) });
    await expect(changeRecordFactItems("r1", null, "memberOf", dropA, "x")).resolves.toEqual([{ "@id": B }]);
    expect(v.patches()).toHaveLength(1);
    expect(v.patches()[0]!.headers["if-match"]).toBe(TAG);
    expect(Object.values(v.patches()[0]!.body as object)).toEqual([{ "@id": B }]);
  });

  it("any OTHER weak tag (not the platform's form): 'not known yet', and nothing is sent", async () => {
    for (const weak of ['W/"v7"', 'W/"sha256:62ac"', `W/${TAG.toUpperCase()}`]) {
      fakeVault({ read: () => ({ facts: both, etag: weak }) });
      const err = await changeRecordFactItems("r1", null, "memberOf", dropA, "x").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RecordVersionUnknownError);
      expect((err as RecordVersionUnknownError).etag).toBe(weak);
    }
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "PATCH")).toHaveLength(0);
  });

  it("a strong tag is sent as it is (control)", async () => {
    const v = fakeVault({ read: () => ({ facts: both, etag: TAG }) });
    await changeRecordFactItems("r1", null, "memberOf", dropA, "x");
    expect(v.patches()[0]!.headers["if-match"]).toBe(TAG);
    expect(v.patches()[0]!.method).toBe("PATCH");
  });
});

describe("what is written", () => {
  it("hands `change` the items as stored now, a scalar as a one-item list", async () => {
    fakeVault({ read: () => ({ facts: { nick: "Al" }, etag: TAG }) });
    const change = vi.fn((s: readonly unknown[]) => [...s, "Bo"]);
    await expect(changeRecordFactItems("r1", null, "nick", change, "x")).resolves.toEqual(["Al", "Bo"]);
    expect(change).toHaveBeenCalledWith(["Al"]);
  });

  it("writes only the one key; several items go as an array, one as a scalar, none as null (retract)", async () => {
    const v = fakeVault({ read: () => ({ facts: { nick: ["Al", "Bo", "Cy"] }, etag: TAG }) });
    await changeRecordFactItems("r1", null, "nick", () => ["Al", "Bo"], "x");
    await changeRecordFactItems("r1", null, "nick", () => ["Al"], "x");
    await changeRecordFactItems("r1", null, "nick", () => [], "x");
    const bodies = v.patches().map((p) => Object.values(p.body as object));
    expect(bodies).toEqual([[["Al", "Bo"]], ["Al"], [null]]);
    for (const p of v.patches()) expect(Object.keys(p.body as object)).toHaveLength(1);
  });

  it("strips a leading `a:` from the fact key, for the read and for the write", async () => {
    const v = fakeVault({ read: () => ({ facts: { nick: ["Al"] }, etag: TAG }) });
    const change = vi.fn((s: readonly unknown[]) => [...s, "Bo"]);
    await changeRecordFactItems("r1", null, "a:nick", change, "x");
    expect(change).toHaveBeenCalledWith(["Al"]);
    expect(Object.keys(v.patches()[0]!.body as object).map((k) => k.replace(/^a:/, ""))).toEqual(["nick"]);
  });

  it("when `change` returns the same items nothing is written, even with no ETag, and the stored items are returned", async () => {
    const v = fakeVault({ read: () => ({ facts: { nick: ["Al"] }, etag: null }) });
    await expect(changeRecordFactItems("r1", null, "nick", (s) => [...s], "x")).resolves.toEqual(["Al"]);
    expect(v.patches()).toHaveLength(0);
  });

  it("a record that cannot be read: an error saying `notChanged`, nothing sent", async () => {
    const v = fakeVault({ read: () => null });
    await expect(changeRecordFactItems("r1", null, "nick", () => ["x"], "the nick was not saved")).rejects.toThrow("The person's record could not be read, so the nick was not saved.");
    expect(v.patches()).toHaveLength(0);
  });

  it("reads the record at its own address when it is given", async () => {
    const v = fakeVault({ read: () => ({ facts: {}, etag: TAG }) });
    await changeRecordFactItems("r1", "https://mona.platform.example.test/base/e/r1", "nick", () => ["x"], "x");
    expect(v.reads()[0]!.url.startsWith("https://mona.platform.example.test/")).toBe(true);
    expect(v.patches()[0]!.url.startsWith("https://mona.platform.example.test/")).toBe(true);
  });
});

describe("a 412 re-reads and re-applies, up to 3 tries", () => {
  it("a 412 on the first patch: the record is read again, `change` sees the new items, the second patch carries the new tag", async () => {
    const T2 = `"sha256:${"fedcba9876543210".repeat(4)}"`;
    const v = fakeVault({
      read: (_id, n) => (n === 1 ? { facts: { nick: ["Al"] }, etag: TAG } : { facts: { nick: ["Al", "Zed"] }, etag: T2 }),
      patch: (_id, n) => (n === 1 ? 412 : 200),
    });
    await expect(changeRecordFactItems("r1", null, "nick", (s) => [...s, "Bo"], "x")).resolves.toEqual(["Al", "Zed", "Bo"]);
    expect(v.reads()).toHaveLength(2);
    expect(v.patches().map((p) => p.headers["if-match"])).toEqual([TAG, T2]);
  });

  it("three 412s: the third is thrown as the conflict, after exactly 3 reads and 3 patches", async () => {
    const v = fakeVault({ read: () => ({ facts: { nick: ["Al"] }, etag: TAG }), patch: () => 412 });
    await expect(changeRecordFactItems("r1", null, "nick", () => ["Bo"], "x")).rejects.toBeInstanceOf(RecordConflictError);
    expect(v.reads()).toHaveLength(3);
    expect(v.patches()).toHaveLength(3);
  });

  it("an error that is not a conflict is thrown at once, without a retry", async () => {
    const v = fakeVault({ read: () => ({ facts: { nick: ["Al"] }, etag: TAG }), patch: () => 500 });
    await expect(changeRecordFactItems("r1", null, "nick", () => ["Bo"], "x")).rejects.not.toBeInstanceOf(RecordConflictError);
    expect(v.patches()).toHaveLength(1);
  });

  it("a 412 after which the new read already has the wanted items: nothing more is written", async () => {
    const v = fakeVault({
      read: (_id, n) => (n === 1 ? { facts: { nick: ["Al"] }, etag: TAG } : { facts: { nick: ["Al", "Bo"] }, etag: TAG }),
      patch: () => 412,
    });
    await expect(changeRecordFactItems("r1", null, "nick", (s) => (s.includes("Bo") ? [...s] : [...s, "Bo"]), "x")).resolves.toEqual(["Al", "Bo"]);
    expect(v.patches()).toHaveLength(1);
  });
});

describe("one write at a time per record", () => {
  it("two changes of one record run one after the other: the second reads after the first has been patched", async () => {
    const order: string[] = [];
    const v = fakeVault({ read: () => ({ facts: { nick: ["Al"] }, etag: TAG }) });
    v.fetchFake.mockImplementation(async (url: string, init: RequestInit = {}) => {
      order.push(`${init.method ?? "GET"}`);
      await Promise.resolve();
      return new Response(init.method === "PATCH" ? "" : JSON.stringify({ nick: ["Al"] }), { status: 200, headers: { etag: TAG } });
    });
    await Promise.all([changeRecordFactItems("r1", null, "nick", () => ["Bo"], "x"), changeRecordFactItems("r1", null, "nick", () => ["Cy"], "x")]);
    expect(order).toEqual(["GET", "PATCH", "GET", "PATCH"]);
  });

  it("two changes of two records are not queued behind each other: both read before either patches", async () => {
    const order: string[] = [];
    const gates: Array<() => void> = [];
    const v = fakeVault({ read: () => ({ facts: { nick: ["Al"] }, etag: TAG }) });
    v.fetchFake.mockImplementation(async (url: string, init: RequestInit = {}) => {
      const id = /\/lws\/r\/([^/?#]+)/.exec(url)![1]!;
      order.push(`${init.method ?? "GET"} ${id}`);
      if ((init.method ?? "GET") === "GET") await new Promise<void>((r) => gates.push(r));
      return new Response(init.method === "PATCH" ? "" : JSON.stringify({ nick: ["Al"] }), { status: 200, headers: { etag: TAG } });
    });
    const p = Promise.all([changeRecordFactItems("r1", null, "nick", () => ["Bo"], "x"), changeRecordFactItems("r2", null, "nick", () => ["Bo"], "x")]);
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    expect(order).toEqual(["GET r1", "GET r2"]);
    gates.forEach((g) => g());
    await p;
  });

  it("a failed change does not stop the next one of the same record", async () => {
    let n = 0;
    fakeVault({ read: () => (++n === 1 ? null : { facts: { nick: ["Al"] }, etag: TAG }) });
    const first = changeRecordFactItems("r1", null, "nick", () => ["Bo"], "x");
    const second = changeRecordFactItems("r1", null, "nick", () => ["Cy"], "x");
    await expect(first).rejects.toThrow();
    await expect(second).resolves.toEqual(["Cy"]);
  });
});

describe("helpers", () => {
  it("storedFactItems: none, a scalar, a list (copied)", () => {
    expect(storedFactItems(undefined)).toEqual([]);
    expect(storedFactItems(null)).toEqual([]);
    expect(storedFactItems("")).toEqual([]);
    expect(storedFactItems("a")).toEqual(["a"]);
    expect(storedFactItems(0)).toEqual([0]);
    const list = ["a", "b"];
    expect(storedFactItems(list)).toEqual(list);
    expect(storedFactItems(list)).not.toBe(list);
  });
  it("factItemsToWire: none is null, one is the item itself, several are an array (copied)", () => {
    expect(factItemsToWire([])).toBeNull();
    expect(factItemsToWire(["a"])).toBe("a");
    const list = ["a", "b"];
    expect(factItemsToWire(list)).toEqual(list);
    expect(factItemsToWire(list)).not.toBe(list);
  });
  it("RecordVersionUnknownError: name, etag, and a message that says nothing was sent", () => {
    const none = new RecordVersionUnknownError(null, "x was not done");
    expect(none.name).toBe("RecordVersionUnknownError");
    expect(none.etag).toBeNull();
    expect(none.message).toBe("The record's read named no version (no ETag), so a change cannot be conditioned on it and x was not done. Nothing was sent.");
    const weak = new RecordVersionUnknownError('W/"v1"', "y");
    expect(weak.message).toContain('the version W/"v1", which is not the platform\'s own');
    expect(weak).toBeInstanceOf(Error);
  });
});
