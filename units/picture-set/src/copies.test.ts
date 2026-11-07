import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCopyMap, buildThumbMap, onCellular, pickBySize } from "./index";

const A = "https://vault.example.test/vault/e/master001";
const FULL = "https://vault.example.test/vault/e/fullfull1";
const file = (uri: string, size: number | null, from?: string) => ({
  entityUri: uri,
  body: { ...(size === null ? {} : { "a:fileByteSize": size }), ...(from ? { "a:transcodedFrom": { "@id": from } } : {}) } as Record<string, unknown>,
});

// Ported from TestFlowerPower test/batch5.test.ts:105-123 (the reading of copies), unchanged: buildThumbMap is kept as it was.
describe("buildThumbMap (as in 0.1.0)", () => {
  it("picks the fewest bytes among copies", () => {
    const m = buildThumbMap([file(A, 900), file("https://vault.example.test/vault/e/thumbbig1", 80, A), file("https://vault.example.test/vault/e/thumbsml1", 50, A)]);
    expect(m.get("master001")).toBe("https://vault.example.test/vault/e/thumbsml1");
  });
  it("meets /vault/e and /base/e spellings by id tail", () => {
    const m = buildThumbMap([file("https://vault.example.test/base/e/thumbsml1", 50, "https://vault.example.test/base/e/master001"), file(A, 900)]);
    expect(m.get("master001")).toBe("https://vault.example.test/base/e/thumbsml1");
  });
  it("skips a copy with no size, and falls back to the master when it is the only sized candidate", () => {
    const m = buildThumbMap([file(A, 900), file("https://vault.example.test/vault/e/thumbnosz", null, A)]);
    expect(m.get("master001")).toBe(A);
    expect(buildThumbMap([file("https://vault.example.test/vault/e/thumbnosz", null, A)]).has("master001")).toBe(false);
  });
  it("a file with an empty address is not a master", () => {
    expect(buildThumbMap([file("", 5)]).size).toBe(0);
  });
  it("breaks a tie by the lower IRI as text", () => {
    const m = buildThumbMap([file("https://vault.example.test/vault/e/thumbbbbb", 50, A), file("https://vault.example.test/vault/e/thumbaaaa", 50, A)]);
    expect(m.get("master001")).toBe("https://vault.example.test/vault/e/thumbaaaa");
  });
});

describe("buildCopyMap", () => {
  const T1 = "https://vault.example.test/vault/e/thumbsml1";
  const T2 = "https://vault.example.test/vault/e/thumbbig1";

  it("master-only shape: every copy and the master, smallest first, under the master's tail", () => {
    const m = buildCopyMap([file(A, 900), file(T2, 80, A), file(T1, 50, A)]);
    expect(m.get("master001")).toEqual([{ uri: T1, bytes: 50 }, { uri: T2, bytes: 80 }, { uri: A, bytes: 900 }]);
  });
  it("root shape: master and thumb both name the full copy; one group under the master's tail and the full's tail", () => {
    const m = buildCopyMap([file(FULL, 5000), file(A, 900, FULL), file(T1, 50, FULL)]);
    const want = [{ uri: T1, bytes: 50 }, { uri: A, bytes: 900 }, { uri: FULL, bytes: 5000 }];
    expect(m.get("master001")).toEqual(want);
    expect(m.get("fullfull1")).toEqual(want);
    expect(m.get("thumbsml1")).toEqual(want);
  });
  it("mixed: a thumb still naming the master, and the master naming the full (two steps up)", () => {
    const m = buildCopyMap([file(FULL, 5000), file(A, 900, FULL), file(T1, 50, A)]);
    expect(m.get("fullfull1")).toEqual([{ uri: T1, bytes: 50 }, { uri: A, bytes: 900 }, { uri: FULL, bytes: 5000 }]);
    expect(m.get("master001")).toBe(m.get("fullfull1"));
  });
  it("follows at most two steps: a third step up is not taken", () => {
    const R = "https://vault.example.test/vault/e/rootroot1";
    const m = buildCopyMap([file(R, 9000), file(FULL, 5000, R), file(A, 900, FULL), file(T1, 50, A)]);
    // T1 reaches FULL in two steps and stops there; A and FULL reach R.
    expect(m.get("thumbsml1")).toEqual([{ uri: T1, bytes: 50 }]);
    expect(m.get("rootroot1")).toEqual([{ uri: A, bytes: 900 }, { uri: FULL, bytes: 5000 }, { uri: R, bytes: 9000 }]);
  });
  it("meets /vault/e and /base/e spellings by id tail", () => {
    const m = buildCopyMap([file("https://vault.example.test/base/e/thumbsml1", 50, "https://vault.example.test/base/e/master001"), file(A, 900)]);
    expect(m.get("master001")!.map((c) => c.bytes)).toEqual([50, 900]);
  });
  it("a broken link: a thumb naming a missing file is in no group and nothing throws", () => {
    const m = buildCopyMap([file(A, 900), file(T1, 50, "https://vault.example.test/vault/e/gone0000")]);
    expect(m.has("thumbsml1")).toBe(false);
    expect(m.get("master001")).toEqual([{ uri: A, bytes: 900 }]);
    expect(m.has("gone0000")).toBe(false);
  });
  it("a copy with no size is not offered; the master with no size is not offered but its group stands", () => {
    const m = buildCopyMap([file(A, null), file(T1, 50, A), file(T2, null, A)]);
    expect(m.get("master001")).toEqual([{ uri: T1, bytes: 50 }]);
    expect(buildCopyMap([file(A, null)]).size).toBe(0);
  });
  it("a tie goes to the lower IRI as text", () => {
    const m = buildCopyMap([file("https://vault.example.test/vault/e/thumbbbbb", 50, A), file("https://vault.example.test/vault/e/thumbaaaa", 50, A), file(A, 900)]);
    expect(m.get("master001")!.map((c) => c.uri.slice(-9))).toEqual(["thumbaaaa", "thumbbbbb", "master001"]);
  });
  it("a file that names itself is listed once; a cycle does not hang", () => {
    expect(buildCopyMap([file(A, 900, A)]).get("master001")).toEqual([{ uri: A, bytes: 900 }]);
    const m = buildCopyMap([file(A, 900, T1), file(T1, 50, A)]);
    expect(m.get("master001")).toEqual([{ uri: A, bytes: 900 }]);
    expect(m.get("thumbsml1")).toEqual([{ uri: T1, bytes: 50 }]);
  });
  it("reads the bare spelling of the facts as well", () => {
    const m = buildCopyMap([{ entityUri: A, body: { fileByteSize: "900" } }, { entityUri: T1, body: { fileByteSize: 50, transcodedFrom: A } }]);
    expect(m.get("master001")!.map((c) => c.bytes)).toEqual([50, 900]);
  });
  it("no files, no groups", () => {
    expect(buildCopyMap([]).size).toBe(0);
  });
});

describe("pickBySize", () => {
  const copies = [{ uri: "u/50", bytes: 50 }, { uri: "u/80", bytes: 80 }, { uri: "u/900", bytes: 900 }];
  it("0 gives the smallest (the thumb)", () => expect(pickBySize(copies, 0)!.bytes).toBe(50));
  it("the smallest that is large enough", () => {
    expect(pickBySize(copies, 51)!.bytes).toBe(80);
    expect(pickBySize(copies, 80)!.bytes).toBe(80);
  });
  it("when none is large enough, the largest", () => {
    expect(pickBySize(copies, 901)!.bytes).toBe(900);
    expect(pickBySize(copies, Infinity)!.bytes).toBe(900);
  });
  it("does not depend on the order of the list", () => {
    expect(pickBySize([...copies].reverse(), 60)!.bytes).toBe(80);
    expect(pickBySize([...copies].reverse(), 5000)!.bytes).toBe(900);
  });
  it("ties go to the lower IRI as text, in both arms", () => {
    const tie = [{ uri: "u/b", bytes: 80 }, { uri: "u/a", bytes: 80 }];
    expect(pickBySize(tie, 10)!.uri).toBe("u/a");
    expect(pickBySize(tie, 999)!.uri).toBe("u/a");
  });
  it("ties go to the lower IRI whichever comes first", () => {
    expect(pickBySize([{ uri: "u/a", bytes: 80 }, { uri: "u/b", bytes: 80 }], 10)!.uri).toBe("u/a");
    expect(pickBySize([{ uri: "u/a", bytes: 80 }, { uri: "u/b", bytes: 80 }], 999)!.uri).toBe("u/a");
  });
  it("no copies: null", () => expect(pickBySize([], 0)).toBeNull());
});

describe("onCellular", () => {
  afterEach(() => vi.unstubAllGlobals());
  const nav = (connection?: object) => vi.stubGlobal("navigator", { connection });
  it("cellular is true", () => { nav({ type: "cellular" }); expect(onCellular()).toBe(true); });
  it("wifi is false", () => { nav({ type: "wifi" }); expect(onCellular()).toBe(false); });
  it("ethernet is false", () => { nav({ type: "ethernet" }); expect(onCellular()).toBe(false); });
  it("wifi wins over saveData", () => { nav({ type: "wifi", saveData: true }); expect(onCellular()).toBe(false); });
  it("saveData alone is true", () => { nav({ saveData: true }); expect(onCellular()).toBe(true); });
  it("saveData false and an unknown type is unknown", () => { nav({ saveData: false, type: "other" }); expect(onCellular()).toBeNull(); });
  it("no connection object is unknown", () => { nav(undefined); expect(onCellular()).toBeNull(); });
  it("no navigator is unknown", () => { vi.stubGlobal("navigator", undefined); expect(onCellular()).toBeNull(); });
});
