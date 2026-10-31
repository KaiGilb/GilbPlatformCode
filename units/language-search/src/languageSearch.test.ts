// Ported from the source: `searchLanguagesRemote.test.ts` (3) and the `findEntryForLegacyTag` group of `languageEntries.s8lang.test.ts` (4) = 7.
// New: the entry address pattern is read from the origin at call time and refuses a foreign origin (STOP-7), the request
// is anonymous and asks the catalogue of the origin set, the minimum characters and the paging, the failure.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { __resetLanguageEntries } from "@kaigilb/gilbplatformcode-language-entry";
import {
  LANGUAGE_SEARCH_DEBOUNCE_MS,
  LANGUAGE_SEARCH_LIST_CHARS,
  LANGUAGE_SEARCH_MIN_CHARS,
  LanguageSearchError,
  findEntryForLegacyTag,
  languageEntityPattern,
  searchLanguagesRemote,
} from "./index";

const ORIGIN = "https://veda.example.test";
const NOR = `${ORIGIN}/base/e/xja6zz79cmva`;
const POR = `${ORIGIN}/base/e/por000000001`;

beforeEach(() => setTermOrigin(ORIGIN));
afterEach(() => {
  __resetLanguageEntries();
  vi.unstubAllGlobals();
  resetTermOrigin();
});

const NORSK = {
  total: { kind: "exact", value: 5 },
  count: 5,
  ids: [
    `${ORIGIN}/base/e/eqmwwc4aa22f`,
    `${ORIGIN}/base/e/xqca00950d7v`,
    `${ORIGIN}/base/e/psgcn0bxhj9k`,
    `${ORIGIN}/base/e/xja6zz79cmva`,
    `${ORIGIN}/base/e/drj71y4783xn`,
  ],
  hits: [
    { entity: `${ORIGIN}/base/e/eqmwwc4aa22f`, label: "Norwegian Sign Language", typeUri: null, does: null },
    { entity: `${ORIGIN}/base/e/xqca00950d7v`, label: "Bokmål", typeUri: null, does: null },
    { entity: `${ORIGIN}/base/e/psgcn0bxhj9k`, label: "Nynorsk", typeUri: null, does: null },
    { entity: `${ORIGIN}/base/e/xja6zz79cmva`, label: "Norwegian", typeUri: null, does: null },
    { entity: `${ORIGIN}/base/e/drj71y4783xn`, label: "Old Norse", typeUri: null, does: null },
  ],
  pageSize: 20,
  next: null,
  complete: true,
};

describe("searchLanguagesRemote (the source's cases)", () => {
  it("asks only for HumanLanguage and keeps the entry IRI", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(String(input));
        expect(init?.signal).toBeUndefined();
        return new Response(JSON.stringify(NORSK), { status: 200 });
      }),
    );
    const page = await searchLanguagesRemote("norsk");
    expect(seen[0]).toContain("type=HumanLanguage");
    expect(seen[0]).toContain("match=prefix");
    const ids = page.hits.map((h) => h.entity);
    expect(ids).toContain(`${ORIGIN}/base/e/xqca00950d7v`);
    expect(ids).toContain(`${ORIGIN}/base/e/psgcn0bxhj9k`);
    expect(ids).toContain(`${ORIGIN}/base/e/xja6zz79cmva`);
    expect(page.hits.every((h) => h.entity.includes("/base/e/"))).toBe(true);
  });

  it("never offers a term IRI such as t/Norwegian", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            hits: [
              {
                entity: `${ORIGIN}/base/e/j22dnt1r6hr9mjxedss304swqm`,
                label: "Norwegian",
                typeUri: `${ORIGIN}/base/t/Norwegian`,
              },
              {
                entity: `${ORIGIN}/base/e/xja6zz79cmva`,
                label: "Norwegian",
                typeUri: null,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const page = await searchLanguagesRemote("norsk");
    expect(page.hits).toEqual([
      { entity: `${ORIGIN}/base/e/xja6zz79cmva`, label: "Norwegian" },
    ]);
  });

  it("passes the abort signal through", async () => {
    const ac = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.signal).toBe(ac.signal);
        return new Response(JSON.stringify({ hits: [] }), { status: 200 });
      }),
    );
    await searchLanguagesRemote("no", { signal: ac.signal });
  });
});

describe("finding the entry for a legacy tag (the source's cases)", () => {
  const SEARCH = (hits: { entity: string; label: string }[]) => ({ hits: hits.map((h) => ({ ...h, typeUri: null, does: null })), next: null });
  const stub = (searchHits: { entity: string; label: string }[], docs: Record<string, object>) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/base/search")) return new Response(JSON.stringify(SEARCH(searchHits)), { status: 200 });
        const id = Object.keys(docs).find((k) => url.endsWith(new URL(k).pathname));
        return id ? new Response(JSON.stringify(docs[id]), { status: 200 }) : new Response("no", { status: 404 });
      }),
    );
  it("exactly one hit whose tag has the stored primary subtag: that entry", async () => {
    stub(
      [{ entity: NOR, label: "Norwegian" }, { entity: `${ORIGIN}/base/e/nsl000000001`, label: "Norwegian Sign Language" }],
      { [NOR]: { label: "Norwegian", iso6393Code: "nor" }, [`${ORIGIN}/base/e/nsl000000001`]: { label: "Norwegian Sign Language", iso6393Code: "nsl" } },
    );
    expect((await findEntryForLegacyTag("no"))?.uri).toBe(NOR);
  });
  it("pt-BR finds Portuguese (the primary subtag), the stored value is left alone", async () => {
    stub([{ entity: POR, label: "Portuguese" }], { [POR]: { label: "Portuguese", iso6393Code: "por" } });
    expect((await findEntryForLegacyTag("pt-BR"))?.uri).toBe(POR);
  });
  it("🔴 zero matches, or several, is null: it does not guess", async () => {
    stub([{ entity: NOR, label: "Norwegian" }], { [NOR]: { label: "Norwegian", iso6393Code: "nor" } });
    expect(await findEntryForLegacyTag("sv")).toBeNull();
    __resetLanguageEntries();
    const NB = `${ORIGIN}/base/e/twin00000001`;
    stub([{ entity: NOR, label: "Norwegian" }, { entity: NB, label: "Norwegian too" }], { [NOR]: { label: "Norwegian", iso6393Code: "nor" }, [NB]: { label: "Norwegian too", iso6393Code: "nor" } });
    expect(await findEntryForLegacyTag("no")).toBeNull();
  });
  it("a tag the browser cannot name is null (nothing to search by)", async () => {
    stub([], {});
    expect(await findEntryForLegacyTag("")).toBeNull();
  });
});

describe("🔴 the entry address pattern: read from the origin at call time, refuses a foreign origin (STOP-7)", () => {
  it("accepts an entry address on the origin the host set", () => {
    expect(languageEntityPattern().test(`${ORIGIN}/base/e/xja6zz79cmva`)).toBe(true);
  });
  it("refuses the same path on a foreign origin", () => {
    expect(languageEntityPattern().test("https://other.example.test/base/e/xja6zz79cmva")).toBe(false);
    expect(languageEntityPattern().test("http://veda.example.test/base/e/xja6zz79cmva")).toBe(false);
    expect(languageEntityPattern().test("https://veda.example.test.evil.test/base/e/xja6zz79cmva")).toBe(false);
    expect(languageEntityPattern().test(`https://other.example.test/?next=${NOR}`)).toBe(false);
    expect(languageEntityPattern().test(`x${NOR}`)).toBe(false);
  });
  it("refuses what is not an entry path on the right origin", () => {
    for (const bad of [`${ORIGIN}/base/t/Norwegian`, `${ORIGIN}/base/e/`, `${ORIGIN}/base/e/a/b`, `${ORIGIN}/base/e/a?x=1`, `${ORIGIN}`, ""]) {
      expect(languageEntityPattern().test(bad)).toBe(false);
    }
  });
  it("follows the origin when it is set again (it is not fixed when the file loads)", () => {
    setTermOrigin("https://second.example.test");
    expect(languageEntityPattern().test("https://second.example.test/base/e/abc123")).toBe(true);
    expect(languageEntityPattern().test(`${ORIGIN}/base/e/abc123`)).toBe(false);
  });
  it("a search hit on a foreign origin is not offered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hits: [{ entity: "https://other.example.test/base/e/xja6zz79cmva", label: "Norwegian", typeUri: null }, { entity: NOR, label: "Norwegian", typeUri: null }] }), { status: 200 })));
    const page = await searchLanguagesRemote("nor");
    expect(page.hits.map((h) => h.entity)).toEqual([NOR]);
  });
  it("throws before any request when no origin has been set", async () => {
    resetTermOrigin();
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(searchLanguagesRemote("nor")).rejects.toThrow(/term-origin/);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("the request", () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const stub = (body: unknown = { hits: [] }, status = 200) =>
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
    }));
  beforeEach(() => { seen.length = 0; });

  it("is one anonymous GET of the origin's search, with the vault of that origin and the language type", async () => {
    stub();
    await searchLanguagesRemote("  nor ");
    expect(seen).toHaveLength(1);
    const u = new URL(seen[0]!.url);
    expect(u.origin + u.pathname).toBe(`${ORIGIN}/base/search`);
    expect(u.searchParams.get("q")).toBe("nor");
    expect(u.searchParams.get("match")).toBe("prefix");
    expect(u.searchParams.get("vault")).toBe(`${ORIGIN}/base`);
    expect(u.searchParams.get("type")).toBe("HumanLanguage");
    expect(seen[0]!.init?.method).toBe("GET");
    expect(seen[0]!.init?.credentials).toBeUndefined();
  });
  it("asks the origin set now", async () => {
    stub();
    setTermOrigin("https://second.example.test");
    await searchLanguagesRemote("nor");
    expect(new URL(seen[0]!.url).origin).toBe("https://second.example.test");
    expect(new URL(seen[0]!.url).searchParams.get("vault")).toBe("https://second.example.test/base");
  });
  it("sends the cursor, and an empty text makes no request unless there is a cursor", async () => {
    stub();
    expect(await searchLanguagesRemote("   ")).toEqual({ hits: [], next: null });
    expect(seen).toHaveLength(0);
    await searchLanguagesRemote("", { cursor: "c2" });
    expect(new URL(seen[0]!.url).searchParams.get("cursor")).toBe("c2");
  });
  it("hands on the next page cursor, and drops a hit with no name", async () => {
    stub({ hits: [{ entity: NOR, label: "  " }, { entity: POR, label: " Portuguese " }], next: "c3" });
    expect(await searchLanguagesRemote("po")).toEqual({ hits: [{ entity: POR, label: "Portuguese" }], next: "c3" });
  });
  it("a refusing catalogue is a LanguageSearchError with its status", async () => {
    stub("no way", 503);
    await expect(searchLanguagesRemote("nor")).rejects.toMatchObject({ name: "LanguageSearchError", status: 503 });
    expect(new LanguageSearchError(500, "").message).toBe("LanguageSearch 500");
  });
  it("the numbers", () => {
    expect([LANGUAGE_SEARCH_DEBOUNCE_MS, LANGUAGE_SEARCH_MIN_CHARS, LANGUAGE_SEARCH_LIST_CHARS]).toEqual([140, 1, 2]);
  });
});

describe("the legacy lookup asks the origin set", () => {
  it("searches the origin set and reads at most 12 hits", async () => {
    const urls: string[] = [];
    const many = Array.from({ length: 15 }, (_, i) => ({ entity: `${ORIGIN}/base/e/n${String(i).padStart(2, "0")}`, label: `Norwegian ${i}`, typeUri: null }));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/base/search")) return new Response(JSON.stringify({ hits: many }), { status: 200 });
      return new Response(JSON.stringify({ label: "x", iso6393Code: "swe" }), { status: 200 });
    }));
    expect(await findEntryForLegacyTag("no")).toBeNull();
    expect(urls.filter((u) => u.includes("/base/search"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("/base/e/n"))).toHaveLength(12);
  });
});
