import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { listOps, memoryStore, progressOf, setQueueStore, type PendingOp } from "./index";

const op = (extra: Partial<PendingOp> = {}): PendingOp => ({ id: "x", kind: "create", change: {}, createdAt: "2026-01-01T00:00:00.000Z", tries: 0, principal: "p", ...extra });

/** The 0.1.0 progressOf, copied: what an op with only the first three steps must still give. */
const progressOf010 = (o: PendingOp) => ({ ...(o.masterEntity ? { masterEntity: o.masterEntity } : {}), ...(o.thumbEntity ? { thumbEntity: o.thumbEntity } : {}), ...(o.thumbLinked ? { thumbLinked: true } : {}) });

beforeEach(() => setQueueStore(memoryStore()));

describe("progressOf, 0.1.0 fields", () => {
  test("an op with only the 0.1.0 fields gives the 0.1.0 progress object, byte for byte", () => {
    const o = op({ masterEntity: "m", thumbEntity: "t", thumbLinked: true });
    expect(JSON.stringify(progressOf(o).progress)).toBe('{"masterEntity":"m","thumbEntity":"t","thumbLinked":true}');
    expect(JSON.stringify(progressOf(o).progress)).toBe(JSON.stringify(progressOf010(o)));
    expect(Object.keys(progressOf(op()).progress)).toEqual([]);
  });
  test("all eight combinations of the three old steps equal the 0.1.0 answer", () => {
    for (let i = 0; i < 8; i++) {
      const o = op({ ...(i & 1 ? { masterEntity: "m" } : {}), ...(i & 2 ? { thumbEntity: "t" } : {}), ...(i & 4 ? { thumbLinked: true } : {}), tries: 3, fullBlob: undefined });
      expect(JSON.stringify(progressOf(o).progress)).toBe(JSON.stringify(progressOf010(o)));
    }
  });
  test("a false or empty new field is left out", () => {
    const o = op({ masterEntity: "m", fullEntity: "", masterLinked: false, thumbRelinked: false });
    expect(progressOf(o).progress).toStrictEqual({ masterEntity: "m" });
  });
  test("the full blob is not part of the progress", () => {
    const o = op({ fullBlob: new Blob(["x"]) });
    expect(progressOf(o).progress).toStrictEqual({});
  });
});

describe("progressOf, the full-copy steps", () => {
  test("each new field set on the op is carried in progress", () => {
    expect(progressOf(op({ fullEntity: "f" })).progress).toStrictEqual({ fullEntity: "f" });
    expect(progressOf(op({ masterLinked: true })).progress).toStrictEqual({ masterLinked: true });
    expect(progressOf(op({ thumbRelinked: true })).progress).toStrictEqual({ thumbRelinked: true });
  });
  test("all six together", () => {
    const o = op({ masterEntity: "m", thumbEntity: "t", thumbLinked: true, fullEntity: "f", masterLinked: true, thumbRelinked: true });
    expect(progressOf(o).progress).toStrictEqual({ masterEntity: "m", thumbEntity: "t", thumbLinked: true, fullEntity: "f", masterLinked: true, thumbRelinked: true });
  });
  test.each([
    ["fullEntity", { fullEntity: "f" }],
    ["masterLinked", { masterLinked: true }],
    ["thumbRelinked", { thumbRelinked: true }],
  ] as const)("onProgress({ %s }) lands on the op and in the store, and the next progressOf carries it", async (_name, step) => {
    const o = op({ id: "r1" });
    await progressOf(o).onProgress(step);
    expect(o).toMatchObject(step);
    expect((await listOps()).find((x) => x.id === "r1")).toMatchObject(step);
    expect(progressOf(o).progress).toStrictEqual(step);
  });
  test("onProgress takes all six at once", async () => {
    const o = op({ id: "r2" });
    const all = { masterEntity: "m", thumbEntity: "t", thumbLinked: true, fullEntity: "f", masterLinked: true, thumbRelinked: true };
    await progressOf(o).onProgress(all);
    expect((await listOps()).find((x) => x.id === "r2")).toMatchObject(all);
  });
  test("fullBlob round-trips through the store", async () => {
    const o = op({ id: "r3", fullBlob: new Blob(["full"], { type: "image/jpeg" }) });
    await progressOf(o).onProgress({ fullEntity: "f" });
    const back = (await listOps()).find((x) => x.id === "r3")!;
    expect(await new Response(back.fullBlob!).text()).toBe("full");
    expect(back.fullEntity).toBe("f");
  });
});

describe("the steps carry exactly what picture-set reports", () => {
  const keysOf = (src: string, typeName: string): string[] => {
    const m = new RegExp(`export type ${typeName} = \\{([^}]*)\\}`).exec(src);
    if (!m) throw new Error(`type ${typeName} not found`);
    return [...m[1]!.matchAll(/(\w+)\??:/g)].map((k) => k[1]!).sort();
  };
  // Both read as source text; run from the unit's folder (npm test does), picture-set is ../picture-set.
  const setKeys = keysOf(readFileSync(resolve(process.cwd(), "..", "picture-set", "src", "uploadSet.ts"), "utf8"), "UploadProgress");
  const queueKeys = keysOf(readFileSync(resolve(process.cwd(), "src", "policy.ts"), "utf8"), "UploadSteps");
  test("the UploadSteps keys equal picture-set's UploadProgress keys", () => {
    expect(setKeys.length).toBeGreaterThan(0);
    expect(queueKeys).toEqual(setKeys);
  });
  test("progressOf carries every one of those keys when set", () => {
    const all = Object.fromEntries(setKeys.map((k) => [k, k.endsWith("Entity") ? "e" : true]));
    expect(Object.keys(progressOf(op(all)).progress).sort()).toEqual(setKeys);
  });
});
