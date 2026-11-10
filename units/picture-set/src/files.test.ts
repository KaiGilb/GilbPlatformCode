import { describe, expect, test } from "vitest";
import { PictureFilesError, endFile, endPictureFiles, listVaultFiles, thumbFor, thumbIndexFor, type VaultFile } from "./index";

const origin = "https://vault.example.test";
const E = (n: string) => `https://vault.example.test/base/e/${n.padEnd(10, "x")}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const f = (n: string, extra: Partial<VaultFile> = {}): VaultFile => ({ entity: E(n), fileName: `${n}.jpg`, ...extra });

describe("listVaultFiles", () => {
  test("pages with limit and offset and joins three pages once", async () => {
    const all = Array.from({ length: 5 }, (_, i) => f(`f${i}`));
    const urls: string[] = [];
    const send = async (_m: string, url: string) => {
      urls.push(url);
      const u = new URL(url);
      const off = Number(u.searchParams.get("offset"));
      return json({ count: 5, files: all.slice(off, off + 2) });
    };
    const got = await listVaultFiles("my vault", { origin: origin + "/", send, pageSize: 2 });
    expect(got.map((x) => x.entity)).toEqual(all.map((x) => x.entity));
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(`${origin}/lws/vault/my%20vault/files?limit=2&offset=0`);
    expect(urls[2]).toContain("offset=4");
  });

  test("a repeated page stops the listing and adds no duplicate", async () => {
    let calls = 0;
    const send = async () => {
      calls++;
      return json({ count: 99, files: [f("a"), f("b")] });
    };
    const got = await listVaultFiles("v", { origin, send, pageSize: 2 });
    expect(got).toHaveLength(2);
    expect(calls).toBe(2);
  });

  test("stops at maxPages", async () => {
    let calls = 0;
    const send = async () => {
      calls++;
      return json({ count: 1e9, files: [f(`p${calls}`), f(`q${calls}`)] });
    };
    await listVaultFiles("v", { origin, send, pageSize: 2, maxPages: 4 });
    expect(calls).toBe(4);
  });

  test("the transcodedFrom filter is sent and stamped on each answered copy", async () => {
    let url = "";
    const send = async (_m: string, u: string) => {
      url = u;
      return json({ count: 1, files: [f("c")] });
    };
    const got = await listVaultFiles("v", { origin, send, transcodedFrom: E("m") });
    expect(new URL(url).searchParams.get("transcodedFrom")).toBe(E("m"));
    expect(got[0]!.transcodedFrom).toBe(E("m"));
  });

  test("non-2xx throws status and the platform's message word for word", async () => {
    const send = async () => json({ message: "You may not read this vault." }, 403);
    await expect(listVaultFiles("v", { origin, send })).rejects.toMatchObject({ name: "PictureFilesError", status: 403, message: "You may not read this vault." });
  });
});

describe("thumbIndexFor", () => {
  test("uses transcodedFrom; the smallest copy wins", () => {
    const master = f("master", { byteSize: 5000 });
    const mid = f("mid", { byteSize: 900, transcodedFrom: master.entity });
    const small = f("small", { byteSize: 100, transcodedFrom: master.entity });
    const idx = thumbIndexFor([master, mid, small]);
    expect(idx.get(master.entity)).toBe(small.entity);
    expect(thumbFor(master.entity, idx)).toBe(small.entity);
  });

  test("root shape: master and copy both name the full copy", () => {
    const full = f("full", { byteSize: 90000 });
    const master = f("master", { byteSize: 5000, transcodedFrom: full.entity });
    const small = f("small", { byteSize: 100, transcodedFrom: full.entity });
    const idx = thumbIndexFor([full, master, small]);
    expect(idx.get(master.entity)).toBe(small.entity);
    expect(idx.get(full.entity)).toBe(small.entity);
  });

  test("the name rule matches only files with no link", () => {
    const idx = thumbIndexFor([
      { entity: E("rose"), fileName: "rose.jpg" },
      { entity: E("rose320"), fileName: "rose-320.jpg" },
    ]);
    expect(idx.get(E("rose"))).toBe(E("rose320"));
  });

  test("a linked file is never matched by its name (fails if the name rule is used for a linked file)", () => {
    const rose = { entity: E("rose"), fileName: "rose.jpg", byteSize: 5000 };
    const other = { entity: E("other"), fileName: "other.jpg", byteSize: 6000 };
    // "rose-320.jpg" is linked to `other`, so its name must not tie it to rose.jpg.
    const thumb = { entity: E("t"), fileName: "rose-320.jpg", byteSize: 100, transcodedFrom: other.entity };
    const idx = thumbIndexFor([rose, other, thumb]);
    expect(idx.get(other.entity)).toBe(thumb.entity);
    expect(idx.has(rose.entity)).toBe(false);
    expect(thumbFor(rose.entity, idx)).toBe(rose.entity);
  });

  test("thumbFor answers the master when there is no copy", () => {
    expect(thumbFor("x", new Map())).toBe("x");
  });
});

describe("endFile and endPictureFiles", () => {
  const sender = (status: (url: string) => number, log: string[] = [], body = "") =>
    async (m: string, url: string) => {
      log.push(`${m} ${url}`);
      const s = status(url);
      return new Response(s === 204 ? null : body, { status: s });
    };

  test("204 and 404 resolve; the DELETE goes to <origin>/files/<id>", async () => {
    const log: string[] = [];
    await endFile(E("one"), { origin: origin + "/", send: sender(() => 204, log) });
    await endFile(E("two"), { origin, send: sender(() => 404) });
    expect(log).toEqual([`DELETE ${origin}/files/onexxxxxxx`]);
  });

  test("403 throws with the platform's message", async () => {
    const send = sender(() => 403, [], JSON.stringify({ message: "Write access is needed to end a file." }));
    const err = await endFile(E("one"), { origin, send }).catch((e) => e);
    expect(err).toBeInstanceOf(PictureFilesError);
    expect(err.status).toBe(403);
    expect(err.message).toBe("Write access is needed to end a file.");
  });

  test("endPictureFiles ends master then copies and continues past a failure", async () => {
    const log: string[] = [];
    const send = sender((u) => (u.endsWith("/copyaxxxxx") ? 500 : 204), log, "boom");
    const failed = await endPictureFiles(E("master"), [E("copya"), E("copyb"), E("copyb")], { origin, send });
    expect(log.map((l) => l.split("/").pop())).toEqual(["masterxxxx", "copyaxxxxx", "copybxxxxx"]);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.entity).toBe(E("copya"));
    expect((failed[0]!.error as PictureFilesError).status).toBe(500);
  });
});
