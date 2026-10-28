// @vitest-environment node
// The reads and writes behind the level chooser: every level of a vault read page by page, the four defaults written once, and the
// levels remembered in the two caches. Ported from planLevels.vaultit.test.ts (the `readAllLevels` and `rememberLevels` blocks; the
// `levelTree` block is in `project-levels`). The app's mock of its token manager is the fake host of the auth seam here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { levelTree } from "@kaigilb/gilbplatformcode-project-levels";
import { recordsKey } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { ensureDefaultLevels, planLevelsKey, readAllLevels, rememberLevels } from "./planLevelsIo";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
});

const V = "https://projecttesting.platform.example.test/vault";

function levelBody(id: string, token: string, position: number): Record<string, unknown> {
  return {
    "@id": `${V}/e/${id}`,
    "@type": "t:CauseEffectLevel",
    "a:unitTag": `Level.${token}`,
    "a:label": token,
    "a:levelPosition": position,
  };
}

function listed(id: string, token: string, position: number) {
  return {
    entity: `${V}/e/${id}`,
    typeUri: "t:CauseEffectLevel",
    updatedAt: "2026-01-01T00:00:00.000Z",
    etag: '"lvl"',
    body: levelBody(id, token, position),
  };
}

type Page = { records: ReturnType<typeof listed>[]; complete: boolean; nextOffset: number | null; total: number };

function installFetch(pages: (offset: number) => Page | "fail") {
  const posts: Record<string, unknown>[] = [];
  const gets: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    if (method === "GET" && url.includes("type=CauseEffectLevel")) {
      gets.push(url);
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      const page = pages(offset);
      if (page === "fail") return new Response("", { status: 500 });
      return Response.json({
        records: page.records,
        total: page.total,
        complete: page.complete,
        nextOffset: page.nextOffset,
      });
    }
    if (method === "POST") {
      posts.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response("{}", { status: 201, headers: { etag: '"sha256:level"', "content-type": "application/json" } });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json", etag: '"x"' } });
  });
  return { posts, gets };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

describe("readAllLevels", () => {
  it("follows nextOffset across two pages and does not stop at the first page", async () => {
    const { gets } = installFetch((offset) =>
      offset === 0
        ? { records: [listed("biz", "Business", 1)], complete: false, nextOffset: 20, total: 2 }
        : { records: [listed("sol", "Solution", 4)], complete: true, nextOffset: null, total: 2 },
    );
    const rows = await readAllLevels(V);
    expect(gets).toHaveLength(2);
    expect(gets[0]).toContain(encodeURIComponent(V));
    expect(gets[1]).toContain("offset=20");
    expect(rows.map((r) => r.facts.unitTag)).toEqual(["Level.Business", "Level.Solution"]);
    expect(levelTree(rows).map((n) => n.token)).toEqual(["Business", "Solution"]);
  });

  it("throws when the typed list never completes inside the page ceiling, and writes nothing", async () => {
    const { posts } = installFetch((offset) => ({
      records: [listed(`p${offset}`, `Page${offset}`, offset + 1)],
      complete: false,
      nextOffset: offset + 1,
      total: 999,
    }));
    const qc = new QueryClient();
    await expect(ensureDefaultLevels(V, qc)).rejects.toThrow("Could not read every level of this vault.");
    expect(posts).toEqual([]);
  });

  it("throws the vault-listing sentence on HTTP 500 and writes nothing", async () => {
    const { posts } = installFetch(() => "fail");
    const qc = new QueryClient();
    await expect(ensureDefaultLevels(V, qc)).rejects.toThrow(/Vault listing failed \(HTTP 500\)/);
    expect(posts).toEqual([]);
  });

  it("writes the four defaults once when the typed list is empty, including two calls at once", async () => {
    const created: ReturnType<typeof listed>[] = [];
    const { posts } = installFetch(() => ({
      records: created,
      complete: true,
      nextOffset: null,
      total: created.length,
    }));
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await realFetch(input, init);
      if (String(init?.method ?? "GET").toUpperCase() === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { facts?: Record<string, unknown> };
        const tag = String(body.facts?.["a:unitTag"] ?? "");
        const token = tag.startsWith("Level.") ? tag.slice("Level.".length) : tag;
        created.push(listed(`level-${token}`, token, created.length + 1));
      }
      return res;
    });
    const qc = new QueryClient();
    const [a, b] = await Promise.all([ensureDefaultLevels(V, qc), ensureDefaultLevels(V, qc)]);
    expect(posts).toHaveLength(4);
    expect(posts.map((p) => (p.facts as Record<string, unknown>)["a:unitTag"])).toEqual([
      "Level.Business",
      "Level.Stakeholder",
      "Level.Product",
      "Level.Solution",
    ]);
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
    posts.length = 0;
    await ensureDefaultLevels(V, qc);
    expect(posts).toEqual([]);
  });
});

describe("rememberLevels", () => {
  it("does not create a grid page when the list cache is missing, and merges when a page is already there", () => {
    const qc = new QueryClient();
    const row = {
      id: "level-Business",
      entityUri: `${V}/e/level-Business`,
      typeUri: "t:CauseEffectLevel",
      facts: { unitTag: "Level.Business", label: "Business" },
      opaqueFacts: [],
      etag: '"lvl"',
      updatedAt: 1,
    } satisfies GridRecord;
    rememberLevels(qc, V, [row]);
    expect(qc.getQueryData(recordsKey(V))).toBeUndefined();
    expect(qc.getQueryData<GridRecord[]>(planLevelsKey(V))?.map((r) => r.id)).toEqual(["level-Business"]);

    qc.setQueryData(recordsKey(V), {
      pages: [{ records: [], total: 0, complete: true, pageSize: 50, offset: 0 }],
      pageParams: [0],
    });
    rememberLevels(qc, V, [row]);
    const pages = qc.getQueryData<{ pages: { records: GridRecord[] }[] }>(recordsKey(V));
    expect(pages?.pages[0]?.records.map((r) => r.id)).toEqual(["level-Business"]);
  });
});
