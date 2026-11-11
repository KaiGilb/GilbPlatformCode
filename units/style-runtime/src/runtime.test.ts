import { beforeEach, describe, expect, it } from "vitest";
import { applyStyleSheet, loadStyle } from "./runtime";
import { validSheet } from "./fixtures";

const sheetWith = (accent: string) => {
  const s = validSheet();
  s.palette.accent = accent;
  return s;
};
const accentOf = () => document.getElementById("gilb-style")?.textContent ?? "";
const memStore = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

beforeEach(() => {
  document.head.innerHTML = "";
});

describe("runtime", () => {
  it("applyStyleSheet writes one element and replaces it", () => {
    applyStyleSheet(sheetWith("#111111"));
    applyStyleSheet(sheetWith("#222222"));
    expect(document.querySelectorAll("#gilb-style").length).toBe(1);
    expect(accentOf()).toContain("#222222");
  });

  it("applies the cache synchronously, then remote replaces it and refreshes the cache", async () => {
    const storage = memStore({ k: JSON.stringify(sheetWith("#aa0000")) });
    let release!: (v: unknown) => void;
    const remote = new Promise((r) => (release = r));
    const p = loadStyle({ fetchRemote: () => remote, cacheKey: "k", storage });
    expect(accentOf()).toContain("#aa0000"); // before the remote resolved
    release(sheetWith("#00aa00"));
    const r = await p;
    expect(r).toEqual({ source: "remote", errors: [] });
    expect(accentOf()).toContain("#00aa00");
    expect(accentOf()).not.toContain("#aa0000");
    expect(JSON.parse(storage.m.get("k")!).palette.accent).toBe("#00aa00");
    expect(document.querySelectorAll("#gilb-style").length).toBe(1);
  });

  it("remote timeout uses the fallback when nothing is cached", async () => {
    let aborted = false;
    const r = await loadStyle({
      fetchRemote: (signal) => new Promise((_res, rej) => signal?.addEventListener("abort", () => ((aborted = true), rej(new Error("aborted"))))),
      fallbackUrl: "/style.tokens.json",
      cacheKey: "k",
      storage: memStore(),
      timeoutMs: 30,
      fetchImpl: (async () => new Response(JSON.stringify(sheetWith("#0000aa")), { status: 200 })) as typeof fetch,
    });
    expect(aborted).toBe(true);
    expect(r.source).toBe("fallback");
    expect(r.errors.some((e) => e.includes("timed out"))).toBe(true);
    expect(accentOf()).toContain("#0000aa");
  });

  it("invalid remote keeps the cache and reports errors", async () => {
    const storage = memStore({ k: JSON.stringify(sheetWith("#aa0000")) });
    const evil = sheetWith("red;}body{display:none");
    const r = await loadStyle({ fetchRemote: async () => evil, cacheKey: "k", storage, fallbackUrl: "/x" });
    expect(r.source).toBe("cache");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain("remote: $.palette.accent");
    expect(accentOf()).toContain("#aa0000");
    expect(accentOf()).not.toContain("display:none");
    expect(JSON.parse(storage.m.get("k")!).palette.accent).toBe("#aa0000");
  });

  it("never throws: everything fails, source none", async () => {
    const r = await loadStyle({
      fetchRemote: async () => {
        throw new Error("boom");
      },
      fallbackUrl: "/x",
      cacheKey: "k",
      storage: memStore({ k: "{not json" }),
      fetchImpl: (async () => new Response("nope", { status: 500 })) as typeof fetch,
    });
    expect(r.source).toBe("none");
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
    expect(document.querySelectorAll("#gilb-style").length).toBe(0);
  });

  it("an invalid cache entry is ignored", async () => {
    const r = await loadStyle({ fetchRemote: async () => sheetWith("#123456"), cacheKey: "k", storage: memStore({ k: JSON.stringify({ version: 1 }) }) });
    expect(r.source).toBe("remote");
    expect(r.errors.some((e) => e.startsWith("cache:"))).toBe(true);
  });
});
