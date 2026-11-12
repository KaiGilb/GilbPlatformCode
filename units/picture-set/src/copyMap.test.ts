import { afterEach, describe, expect, test, vi } from "vitest";
import { copiesOf, copiesToEnd, largestUriOf, loadCopyMap, thumbUriOf, type CopyMap, type VaultFile } from "./index";

const origin = "https://vault.example.test";
const E = (n: string) => `https://vault.example.test/vault/e/${n.padEnd(10, "x")}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const file = (n: string, byteSize: number, transcodedFrom?: string): VaultFile => ({ entity: E(n), fileName: `${n}.jpg`, byteSize, ...(transcodedFrom ? { transcodedFrom } : {}) });

/** A send that answers GET .../files from a list, honouring the transcodedFrom filter. */
function listing(all: VaultFile[]) {
  const urls: string[] = [];
  const send = async (_m: string, url: string) => {
    urls.push(url);
    const q = new URL(url).searchParams;
    const from = q.get("transcodedFrom");
    const files = from ? all.filter((f) => f.transcodedFrom === from) : all;
    return json({ count: files.length, files });
  };
  return { send, urls };
}

afterEach(() => vi.restoreAllMocks());

describe("loadCopyMap", () => {
  test("lists once and groups master and thumbnail", async () => {
    const l = listing([file("master", 900), file("thumb", 90, E("master"))]);
    const m = await loadCopyMap("vault-root", { origin, send: l.send });
    expect(l.urls).toHaveLength(1);
    expect(l.urls[0]).toContain("/lws/vault/vault-root/files");
    expect(m.get("master" + "x".repeat(4))?.map((c) => c.bytes)).toEqual([90, 900]);
  });
  test("never throws: a refused listing warns and answers an empty map", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const m = await loadCopyMap("v", { origin, send: async () => json({ message: "no" }, 403) });
    expect(m.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  test("never throws: a sender that rejects warns and answers an empty map", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const m = await loadCopyMap("v", { origin, send: async () => Promise.reject(new Error("offline")) });
    expect(m.size).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});

describe("copiesOf, thumbUriOf, largestUriOf", () => {
  const map = async (): Promise<CopyMap> => {
    const l = listing([file("master", 900), file("thumb", 90, E("master")), file("lone", 500)]);
    return loadCopyMap("v", { origin, send: l.send });
  };
  test("copiesOf is every copy but the master, smallest first", async () => {
    const m = await map();
    expect(copiesOf(m, E("master")).map((c) => c.uri)).toEqual([E("thumb")]);
  });
  test("copiesOf meets /base/e/ and /vault/e/ spellings by id tail and is [] for an unknown master", async () => {
    const m = await map();
    expect(copiesOf(m, E("master").replace("/vault/e/", "/base/e/")).map((c) => c.uri)).toEqual([E("thumb")]);
    expect(copiesOf(m, E("nothere"))).toEqual([]);
    expect(copiesOf(m, E("lone"))).toEqual([]);
  });
  test("thumbUriOf is the smallest copy, the master when it is alone, null while the map is not loaded", async () => {
    const m = await map();
    expect(thumbUriOf(m, E("master"))).toBe(E("thumb"));
    expect(thumbUriOf(m, E("lone"))).toBe(E("lone"));
    expect(thumbUriOf(m, E("unknown"))).toBe(E("unknown"));
    expect(thumbUriOf(null, E("master"))).toBeNull();
  });
  test("largestUriOf keeps the master when it is the largest (the thumbnail is never chosen), and the master when nothing is listed", async () => {
    const m = await map();
    expect(largestUriOf(m, E("master"))).toBe(E("master"));
    expect(largestUriOf(m, E("lone"))).toBe(E("lone"));
    expect(largestUriOf(m, E("unknown"))).toBe(E("unknown"));
    expect(largestUriOf(null, E("master"))).toBe(E("master"));
  });
  test("largestUriOf picks a full copy larger than the master", async () => {
    const l = listing([file("full", 5000), file("master", 900, E("full")), file("thumb", 90, E("full"))]);
    const m = await loadCopyMap("v", { origin, send: l.send });
    expect(largestUriOf(m, E("master"))).toBe(E("full"));
    expect(copiesOf(m, E("master")).map((c) => c.uri)).toEqual([E("thumb"), E("full")]);
  });
});

describe("copiesToEnd", () => {
  test("with a map: no request", async () => {
    const l = listing([file("master", 900), file("thumb", 90, E("master"))]);
    const m = await loadCopyMap("v", { origin, send: l.send });
    l.urls.length = 0;
    expect(await copiesToEnd(E("master"), { origin, send: l.send, map: m })).toEqual([E("thumb")]);
    expect(l.urls).toHaveLength(0);
  });
  test("without a map: lists by the transcodedFrom filter, never the whole vault", async () => {
    const l = listing([file("master", 900), file("thumb", 90, E("master")), file("other", 700), file("otherthumb", 70, E("other"))]);
    expect(await copiesToEnd(E("master"), { origin, send: l.send, vaultRoot: "v" })).toEqual([E("thumb")]);
    expect(l.urls.length).toBeGreaterThan(0);
    for (const u of l.urls) expect(new URL(u).searchParams.get("transcodedFrom")).not.toBeNull();
  });
  test("without a map: follows a copy's own copies, once each, and never lists the master as its own copy", async () => {
    const l = listing([file("master", 900), file("thumb", 90, E("master")), file("thumbthumb", 9, E("thumb"))]);
    expect((await copiesToEnd(E("master"), { origin, send: l.send, vaultRoot: "v" })).sort()).toEqual([E("thumb"), E("thumbthumb")].sort());
  });
  test("without a map and without a vault root: a sentence, nothing sent", async () => {
    const l = listing([]);
    await expect(copiesToEnd(E("master"), { origin, send: l.send })).rejects.toThrow(/vaultRoot/);
    expect(l.urls).toHaveLength(0);
  });
  test("a refused listing throws a PictureFilesError with the status", async () => {
    await expect(copiesToEnd(E("m"), { origin, send: async () => json({ message: "Nope." }, 403), vaultRoot: "v" })).rejects.toMatchObject({ name: "PictureFilesError", status: 403 });
  });
});
