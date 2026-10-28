// @vitest-environment node
// Every export of the unit, and the odd paths of each: the page walk's stops, a listed row with no document, the defaults written
// once, a level added at the top and under a parent, what is remembered in the two caches, and what is forgotten after a failed read.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { recordsKey } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { addProjectLevel, ensureDefaultLevels, planLevelsKey, readAllLevels, readLevelTree, rememberLevels, waitForLevels } from "./planLevelsIo";
import { MAX_PARALLEL_DEREFERENCES } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { DEFAULTS, installVault, V } from "../test/levelsWire";
import { ONTOLOGY, setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

const row = (id: string, extra: Partial<GridRecord> = {}): GridRecord => ({
  id,
  entityUri: `${V}/e/${id}`,
  typeUri: "t:CauseEffectLevel",
  facts: { unitTag: `Level.${id}`, label: id },
  opaqueFacts: [],
  etag: '"e"',
  updatedAt: 1,
  ...extra,
});

describe("planLevelsKey", () => {
  it("is the three-part key of a vault's levels", () => {
    expect(planLevelsKey(V)).toEqual(["base", "plan-levels", V]);
  });
});

describe("readAllLevels", () => {
  it("reads a listed row that carries no document with one record read, and marks it hydrated", async () => {
    const vault = installVault([{ id: "biz", token: "Business", position: 1, bodiless: true }]);
    const rows = await readAllLevels(V);
    expect(vault.reads).toHaveLength(1);
    expect(vault.reads[0]).toContain("/lws/r/biz");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.facts.unitTag).toBe("Level.Business");
    expect(rows[0]!.hydrated).toBe(true);
    expect(rows[0]!.updatedAt).toBe(Date.parse("2026-01-01T00:00:00.000Z"));
    expect(rows[0]!.entityUri).toBe(`${V}/e/biz`);
    expect(vault.gets).toHaveLength(1);
  });

  it("keeps the type and the address the list gave, though the document says another type", async () => {
    installVault([{ id: "biz", token: "Business", position: 1, bodiless: true, docType: "t:Note" }]);
    const rows = await readAllLevels(V);
    expect(rows[0]!.typeUri).toContain("CauseEffectLevel");
  });

  it("reads a row's document at the address the list gave it, not at the vault", async () => {
    const other = "https://other.platform.example.test/vault/e/biz";
    const vault = installVault([{ id: "biz", token: "Business", position: 1, bodiless: true, entity: other }]);
    const rows = await readAllLevels(V);
    expect(vault.reads[0]!.startsWith("https://other.platform.example.test/")).toBe(true);
    expect(rows[0]!.entityUri).toBe(other);
  });

  it("keeps a level the register's filter would hide, because the walk asks for presentation state", async () => {
    installVault([{ id: "x", token: "Business", position: 1, entity: "https://projecttesting.platform.example.test/base/r/x" }]);
    expect((await readAllLevels(V)).map((r) => r.id)).toEqual(["x"]);
  });

  it("reads at most as many documents at once as the client's limiter allows, across calls on one client", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const vault = installVault([{ id: "biz", token: "Business", position: 1, bodiless: true }], { holdReads: hold });
    const qc = new QueryClient();
    const calls = Array.from({ length: MAX_PARALLEL_DEREFERENCES + 6 }, (_, i) => readAllLevels(`https://v${i}.platform.example.test/vault`, qc));
    await new Promise((r) => setTimeout(r, 30));
    expect(vault.maxInFlight).toBe(MAX_PARALLEL_DEREFERENCES);
    release();
    await Promise.all(calls);
  });

  it("reads a listed row that carries its document without a record read, and keeps the list's type and time", async () => {
    const vault = installVault([{ id: "biz", token: "Business", position: 1 }]);
    const rows = await readAllLevels(V, new QueryClient());
    expect(vault.reads).toEqual([]);
    expect(rows[0]!.typeUri).toContain("CauseEffectLevel");
    expect(rows[0]!.hydrated).toBe(true);
  });

  it("throws the unread sentence when a listed row cannot be read", async () => {
    installVault([{ id: "biz", token: "Business", position: 1, bodiless: true }], { unreadable: new Set(["biz"]) });
    await expect(readAllLevels(V)).rejects.toThrow("Could not read every level of this vault.");
  });

  it("asks the typed list for the documents, newest page first offset 0, and then follows nextOffset", async () => {
    const vault = installVault(DEFAULTS, { pageSize: 3 });
    const rows = await readAllLevels(V);
    expect(rows.map((r) => r.id)).toEqual(["biz", "stk", "prod", "sol"]);
    expect(vault.gets).toHaveLength(2);
    const first = new URL(vault.gets[0]!);
    expect(first.searchParams.get("type")).toBe("CauseEffectLevel");
    expect(first.searchParams.get("include")).toBe("body");
    expect(first.searchParams.get("offset")).toBeNull();
    expect(new URL(vault.gets[1]!).searchParams.get("offset")).toBe("3");
  });

  it("returns nothing for a vault with no level, after one request", async () => {
    const vault = installVault([]);
    expect(await readAllLevels(V)).toEqual([]);
    expect(vault.gets).toHaveLength(1);
  });

  it("stops when the next offset does not advance, and keeps what it read", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return Response.json({
        records: [{ entity: `${V}/e/biz`, typeUri: "t:CauseEffectLevel", updatedAt: "2026-01-01T00:00:00.000Z", etag: '"l"', body: { "@id": `${V}/e/biz`, "@type": "t:CauseEffectLevel", "a:unitTag": "Level.Business" } }],
        total: 9,
        complete: false,
        nextOffset: 0,
      });
    });
    const rows = await readAllLevels(V);
    expect(calls).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(["biz"]);
  });

  it("stops after a page that has documents and no next offset", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return Response.json({
        records: [{ entity: `${V}/e/biz`, typeUri: "t:CauseEffectLevel", updatedAt: "2026-01-01T00:00:00.000Z", etag: '"l"', body: { "@id": `${V}/e/biz`, "@type": "t:CauseEffectLevel", "a:unitTag": "Level.Business" } }],
        total: 9,
        complete: false,
        nextOffset: null,
      });
    });
    expect((await readAllLevels(V)).map((r) => r.id)).toEqual(["biz"]);
    expect(calls).toBe(1);
  });

  it("goes on by the page's own length when there is no next offset and the rows carry no document, and stops on an empty page", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/lws/r/")) {
        const id = url.split("/lws/r/")[1]!.split("?")[0]!;
        return Response.json({ "@id": `${V}/e/${id}`, "@type": "t:CauseEffectLevel", "a:unitTag": `Level.${id}` }, { headers: { etag: '"l"' } });
      }
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      seen.push(String(offset));
      const records =
        offset === 0
          ? [{ entity: `${V}/e/a`, typeUri: "t:CauseEffectLevel", updatedAt: "2026-01-01T00:00:00.000Z", etag: '"l"' }, { entity: `${V}/e/b`, typeUri: "t:CauseEffectLevel", updatedAt: "2026-01-01T00:00:00.000Z", etag: '"l"' }]
          : [];
      return Response.json({ records, total: 2, complete: false, nextOffset: null });
    });
    const rows = await readAllLevels(V);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(seen).toEqual(["0", "2"]);
  });

  it("throws at the ceiling of fifty pages, having asked for exactly fifty", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      calls++;
      const offset = Number(new URL(String(input)).searchParams.get("offset") ?? "0");
      return Response.json({ records: [], total: 99, complete: false, nextOffset: offset + 1 });
    });
    await expect(readAllLevels(V)).rejects.toThrow("Could not read every level of this vault.");
    expect(calls).toBe(50);
  });
});

describe("ensureDefaultLevels", () => {
  it("keeps the levels a vault has, writes nothing, and remembers what it read", async () => {
    const vault = installVault(DEFAULTS);
    const qc = new QueryClient();
    const got = await ensureDefaultLevels(V, qc);
    expect(got.map((r) => r.id)).toEqual(["biz", "stk", "prod", "sol"]);
    expect(vault.posts).toEqual([]);
    expect(qc.getQueryData(planLevelsKey(V))).toBe(got);
  });

  it("writes the four defaults into an empty vault with the ontology term read when it writes, and remembers each", async () => {
    const vault = installVault([]);
    const qc = new QueryClient();
    const got = await ensureDefaultLevels(V, qc);
    expect(vault.posts).toHaveLength(4);
    expect(vault.posts.map((p) => p.body.facts)).toEqual(
      ["Business", "Stakeholder", "Product", "Solution"].map((t, i) => ({
        "a:unitTag": `Level.${t}`,
        "a:label": t,
        "a:levelPosition": i + 1,
        "a:ontologyTerm": `${ONTOLOGY}/base/t/${t}Level`,
      })),
    );
    expect(vault.posts.every((p) => p.url.endsWith("/vault/c") || p.url.includes("/lws/vault/"))).toBe(true);
    expect(got.map((r) => r.id)).toEqual(["new-1", "new-2", "new-3", "new-4"]);
    expect(got[0]!.facts).toMatchObject({ unitTag: "Level.Business", label: "Business", levelPosition: "1" });
    expect(got[0]!.etag).toBe('"sha256:level"');
    expect(got[0]!.entityUri).toContain("/e/new-1");
    expect(got[0]!.typeUri).toContain("CauseEffectLevel");
    expect(qc.getQueryData<GridRecord[]>(planLevelsKey(V))!.map((r) => r.id)).toEqual(["new-1", "new-2", "new-3", "new-4"]);
  });

  it("sends the label as the create's name hint", async () => {
    const vault = installVault([]);
    await ensureDefaultLevels(V, new QueryClient());
    expect(vault.posts.map((p) => p.headers.slug)).toEqual(["business", "stakeholder", "product", "solution"]);
  });

  it("names a row level-<token> when the create names no id", async () => {
    installVault([], { noLocation: true });
    const got = await ensureDefaultLevels(V, new QueryClient());
    expect(got.map((r) => r.id)).toEqual(["level-Business", "level-Stakeholder", "level-Product", "level-Solution"]);
  });

  it("shares one read between two calls at once", async () => {
    const vault = installVault(DEFAULTS);
    const qc = new QueryClient();
    await Promise.all([ensureDefaultLevels(V, qc), ensureDefaultLevels(V, qc)]);
    expect(vault.gets).toHaveLength(1);
  });

  it("forgets a failed read: the next call reads again and writes after a good read", async () => {
    const bad = installVault([], { listFails: true });
    const qc = new QueryClient();
    await expect(ensureDefaultLevels(V, qc)).rejects.toThrow();
    expect(bad.gets).toHaveLength(1);
    vi.unstubAllGlobals();
    const good = installVault([]);
    await ensureDefaultLevels(V, qc);
    expect(good.gets).toHaveLength(1);
    expect(good.posts).toHaveLength(4);
  });

  it("keeps a different vault's read apart", async () => {
    const vault = installVault(DEFAULTS);
    const qc = new QueryClient();
    const other = "https://other.platform.example.test/vault";
    await Promise.all([ensureDefaultLevels(V, qc), ensureDefaultLevels(other, qc).catch(() => null)]);
    expect(vault.gets.length).toBeGreaterThanOrEqual(2);
  });
});

describe("addProjectLevel", () => {
  it("refuses a label with no letter or digit, before any request", async () => {
    const vault = installVault(DEFAULTS);
    const qc = new QueryClient();
    await expect(addProjectLevel(V, qc, "   ", null)).rejects.toThrow("A level needs a label.");
    await expect(addProjectLevel(V, qc, " -- ", null)).rejects.toThrow("A level needs a label.");
    expect(vault.gets).toEqual([]);
    expect(vault.posts).toEqual([]);
  });

  it("refuses a parent the project does not have, writing nothing", async () => {
    const vault = installVault(DEFAULTS);
    const qc = new QueryClient();
    await expect(addProjectLevel(V, qc, "Sub", "Nowhere")).rejects.toThrow("That parent level is not in this project.");
    expect(vault.posts).toEqual([]);
  });

  it("adds a main level after the last main level, with no term, and answers its token", async () => {
    const vault = installVault(DEFAULTS);
    const qc = new QueryClient();
    const token = await addProjectLevel(V, qc, "  Sub system ", null);
    expect(token).toBe("SubSystem");
    expect(vault.posts).toHaveLength(1);
    expect(vault.posts[0]!.body.facts).toEqual({ "a:unitTag": "Level.SubSystem", "a:label": "Sub system", "a:levelPosition": 5, "a:ontologyTerm": "none" });
    expect(readLevelTree(qc, V).map((n) => n.token)).toEqual(["Business", "Stakeholder", "Product", "Solution", "SubSystem"]);
  });

  it("adds a level under a parent: the tag continues the parent's tag, the position starts at 1, and the link names the parent's address", async () => {
    const vault = installVault(DEFAULTS);
    const qc = new QueryClient();
    const token = await addProjectLevel(V, qc, "Sub", "Product");
    expect(token).toBe("Product.Sub");
    expect(vault.posts[0]!.body.facts).toMatchObject({ "a:unitTag": "Level.Product.Sub", "a:levelPosition": 1, "a:ontologyTerm": "none", "a:partOf": { "@id": `${V}/e/prod` } });
    const made = qc.getQueryData<GridRecord[]>(planLevelsKey(V))!.find((r) => r.id === "new-5")!;
    expect(made.facts).toMatchObject({ unitTag: "Level.Product.Sub", partOf: `${V}/e/prod`, levelPosition: "1" });
    expect(made.servedKeys).toEqual(["unitTag", "label", "levelPosition", "ontologyTerm", "partOf"]);
    const second = await addProjectLevel(V, qc, "Other", "Product");
    expect(second).toBe("Product.Other");
    expect(vault.posts[1]!.body.facts["a:levelPosition"]).toBe(2);
    expect(readLevelTree(qc, V).map((n) => [n.token, n.depth])).toContainEqual(["Product.Other", 1]);
  });

  it("names the new row level-<token> when the create names no id", async () => {
    installVault(DEFAULTS, { noLocation: true });
    const qc = new QueryClient();
    await addProjectLevel(V, qc, "Extra", null);
    expect(qc.getQueryData<GridRecord[]>(planLevelsKey(V))!.map((r) => r.id)).toContain("level-Extra");
  });

  it("links a child to the parent's own address, as the list gave it", async () => {
    const own = "https://other.platform.example.test/vault/e/prod";
    const vault = installVault([...DEFAULTS.filter((l) => l.id !== "prod"), { id: "prod", token: "Product", position: 3, entity: own }]);
    await addProjectLevel(V, new QueryClient(), "Sub", "Product");
    expect(vault.posts[0]!.body.facts["a:partOf"]).toEqual({ "@id": own });
  });

  it("writes the four defaults first when the vault has no level, then the level", async () => {
    const vault = installVault([]);
    const qc = new QueryClient();
    const token = await addProjectLevel(V, qc, "Extra", null);
    expect(token).toBe("Extra");
    expect(vault.posts).toHaveLength(5);
    expect(vault.posts[4]!.body.facts).toMatchObject({ "a:unitTag": "Level.Extra", "a:levelPosition": 5 });
  });
});

describe("waitForLevels", () => {
  it("reads the levels into the cache under their key", async () => {
    installVault(DEFAULTS);
    const qc = new QueryClient();
    await waitForLevels(qc, V);
    expect(qc.getQueryData<GridRecord[]>(planLevelsKey(V))!.map((r) => r.id)).toEqual(["biz", "stk", "prod", "sol"]);
  });

  it("rejects when the read fails and does not retry it, whatever the client's own default", async () => {
    const vault = installVault([], { listFails: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 1 } } });
    await expect(waitForLevels(qc, V)).rejects.toThrow(/Vault listing failed/);
    expect(vault.gets).toHaveLength(1);
  });
});

describe("readLevelTree", () => {
  it("is the tree of the levels the cache holds, and empty when it holds none", () => {
    const qc = new QueryClient();
    expect(readLevelTree(qc, V)).toEqual([]);
    qc.setQueryData(planLevelsKey(V), [row("Business", { served: { facts: { unitTag: "Level.Business", levelPosition: 1 }, context: undefined, etag: null } })]);
    expect(readLevelTree(qc, V).map((n) => n.token)).toEqual(["Business"]);
  });
});

describe("rememberLevels", () => {
  it("replaces a row with the same id and adds one that is new, in the levels' cache", () => {
    const qc = new QueryClient();
    rememberLevels(qc, V, [row("a"), row("b")]);
    rememberLevels(qc, V, [row("a", { etag: '"new"' }), row("c")]);
    const got = qc.getQueryData<GridRecord[]>(planLevelsKey(V))!;
    expect(got.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(got[0]!.etag).toBe('"new"');
  });

  it("puts the rows into the grid's first page only when that page exists, replacing by id, and grows its total", () => {
    const qc = new QueryClient();
    qc.setQueryData(recordsKey(V), {
      pages: [
        { records: [row("a")], total: 1, complete: false, pageSize: 50, offset: 0 },
        { records: [row("z")], total: 1, complete: true, pageSize: 50, offset: 50 },
      ],
      pageParams: [0, 50],
    });
    rememberLevels(qc, V, [row("a", { etag: '"new"' }), row("b"), row("c")]);
    const data = qc.getQueryData<{ pages: { records: GridRecord[]; total: number }[] }>(recordsKey(V))!;
    expect(data.pages[0]!.records.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(data.pages[0]!.records[0]!.etag).toBe('"new"');
    expect(data.pages[0]!.total).toBe(3);
    expect(data.pages[1]!.records.map((r) => r.id)).toEqual(["z"]);
  });

  it("keeps a first page's larger total, and leaves a grid with no pages alone", () => {
    const qc = new QueryClient();
    qc.setQueryData(recordsKey(V), { pages: [{ records: [row("a")], total: 40, complete: false, pageSize: 50, offset: 0 }], pageParams: [0] });
    rememberLevels(qc, V, [row("b")]);
    expect(qc.getQueryData<{ pages: { total: number }[] }>(recordsKey(V))!.pages[0]!.total).toBe(40);
    const empty = new QueryClient();
    empty.setQueryData(recordsKey(V), { pages: [], pageParams: [] });
    rememberLevels(empty, V, [row("b")]);
    expect(empty.getQueryData<{ pages: unknown[] }>(recordsKey(V))!.pages).toEqual([]);
  });
});

