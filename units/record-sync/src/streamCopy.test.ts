// streamCopy over a small fake platform (head, newest-first pages by `after`, an empty since pass), checked against what completeCopy asks.
import { describe, expect, it } from "vitest";
import { streamCopy } from "./streamCopy";
import { PlatformError, type PlatformClient } from "./platform";

const ORIGIN = "https://holder.platform.example.test";
const VAULT = `${ORIGIN}/vault`;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** `n` things, newest first (t{n-1} ... t0); `failPage` makes that walk page (1-based) answer 500. */
function rig(n: number, o: { pageSize?: number; failPage?: number } = {}) {
  const pageSize = o.pageSize ?? 200;
  const all = Array.from({ length: n }, (_, i) => n - 1 - i);
  const urls: URL[] = [];
  let pages = 0;
  const row = (i: number) => ({ entity: `${VAULT}/e/t${i}`, typeUri: "t:Thing", updatedAt: null, body: { name: `Thing ${i}` }, etag: `"v${i}"` });
  const platform: PlatformClient = {
    origin: ORIGIN,
    fetch: (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url);
      const q = url.searchParams;
      if (q.has("since")) return json(200, { records: [], complete: true, nextCursor: "s1" });
      pages++;
      if (o.failPage === pages) return json(500, { error: "boom" });
      const after = q.get("after");
      const start = after ? Number(after) : 0;
      const slice = all.slice(start, start + pageSize);
      const more = start + pageSize < all.length;
      return json(200, { records: slice.map(row), complete: !more, ...(more ? { nextCursor: String(start + pageSize) } : {}) });
    }) as typeof fetch,
  };
  return { platform, urls };
}
const map = (r: { entity: string; body?: Record<string, unknown> }) => ({ id: r.entity.replace(/^.*\/e\//, ""), name: String(r.body?.name) });

describe("streamCopy", () => {
  it("emits each walk page's NEW rows, mapped and newest first, then answers the whole copy", async () => {
    const r = rig(450, { pageSize: 200 });
    const pages: string[][] = [];
    const all = await streamCopy(r.platform, VAULT, "Thing", { map })((rows) => pages.push(rows.map((x) => x.id)));
    expect(pages.map((p) => p.length)).toEqual([200, 200, 50]);
    expect(pages[0]![0]).toBe("t449");
    expect(pages.flat()).toEqual(all.map((x) => x.id)); // no row twice, none missing
    expect(all).toHaveLength(450);
  });

  it("the first page is emitted before the second page is requested", async () => {
    const r = rig(450);
    const seenAtFirstEmit: number[] = [];
    await streamCopy(r.platform, VAULT, "Thing", { map })(() => seenAtFirstEmit.push(r.urls.length));
    // head, page 1 at the first emit; the later pages and the since pass come after
    expect(seenAtFirstEmit[0]).toBe(2);
    expect(r.urls.length).toBeGreaterThan(2);
  });

  it("asks the same requests with or without an emit (it adds none)", async () => {
    const a = rig(450);
    const b = rig(450);
    await streamCopy(a.platform, VAULT, "Thing", { map })();
    await streamCopy(b.platform, VAULT, "Thing", { map })(() => undefined);
    expect(a.urls.map(String)).toEqual(b.urls.map(String));
  });

  it("leaves out a row the map answers null for", async () => {
    const r = rig(5);
    const seen: string[] = [];
    const all = await streamCopy(r.platform, VAULT, "Thing", { map: (x) => (x.entity.endsWith("t2") ? null : map(x)) })((rows) => seen.push(...rows.map((x) => x.id)));
    expect(all.map((x) => x.id)).toEqual(["t4", "t3", "t1", "t0"]);
    expect(seen).toEqual(["t4", "t3", "t1", "t0"]);
  });

  it("an empty type answers [] and emits nothing", async () => {
    const r = rig(0);
    const pages: unknown[] = [];
    expect(await streamCopy(r.platform, VAULT, "Thing", { map })((rows) => pages.push(rows))).toEqual([]);
    expect(pages).toEqual([]);
  });

  it("a failed page throws after the earlier pages were emitted; with partialOk it answers what was read and onDone says truncated", async () => {
    const seen: number[] = [];
    await expect(streamCopy(rig(450, { failPage: 2 }).platform, VAULT, "Thing", { map })((rows) => seen.push(rows.length))).rejects.toBeInstanceOf(PlatformError);
    expect(seen).toEqual([200]);
    let truncated: boolean | undefined;
    const got = await streamCopy(rig(450, { failPage: 2 }).platform, VAULT, "Thing", { map, partialOk: true, onDone: (c) => (truncated = c.truncated) })();
    expect(got).toHaveLength(200);
    expect(truncated).toBe(true);
  });

  it("passes completeCopy's options on (pageLimit, filter) and never an onPage of its own to the caller's options", async () => {
    const r = rig(250);
    const sizes: number[] = [];
    await streamCopy(r.platform, VAULT, "Thing", { map, pageLimit: 100 })((rows) => sizes.push(rows.length));
    expect(r.urls.some((u) => u.searchParams.get("limit") === "100")).toBe(true);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(250);
  });
});
