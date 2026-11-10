// @vitest-environment node
// The honesty rule (DESIGN.md section 5): ROUTES is the only route source, every row cites the platform line it mirrors,
// and anything no row answers is a violation and a 404, never a quiet pass.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLATFORM_SHA, ROUTES } from "../src";
import { matchRoute } from "../src/routes";
import { body, json, vaultUrl, world } from "./support";

const design = readFileSync(new URL("../DESIGN.md", import.meta.url), "utf8");

describe("the route table", () => {
  it("is pinned to a GilbPlatform commit", () => {
    expect(PLATFORM_SHA).toMatch(/^[0-9a-f]{40}$/);
    expect(design).toContain(PLATFORM_SHA);
  });
  it("part 1 holds exactly rows 5, 7, 8, 9, 10, 11, 12 of DESIGN section 2, each once", () => {
    expect(ROUTES.map((r) => r.row)).toEqual([5, 7, 8, 9, 10, 11, 12]);
    expect(new Set(ROUTES.map((r) => `${r.method} ${r.path}`)).size).toBe(ROUTES.length);
  });
  it("every row cites GilbPlatform path:line and is a row of DESIGN.md with the same method and path", () => {
    for (const r of ROUTES) {
      expect(r.mirrors.length, `${r.method} ${r.path}`).toBeGreaterThan(0);
      for (const m of r.mirrors) expect(m, `${r.method} ${r.path}`).toMatch(/^src\/[\w./-]+\.ts:\d+(-\d+)?$/);
      const line = design.split("\n").find((l) => l.startsWith(`| ${r.row} |`));
      expect(line, `DESIGN row ${r.row}`).toBeDefined();
      expect(line!.replace(/\\\|/g, "|")).toContain(`${r.method} \`${r.path}`);
    }
  });
  it("the first cite of a row (file:start line) is also in the DESIGN.md row it mirrors", () => {
    for (const r of ROUTES) {
      const line = design.split("\n").find((l) => l.startsWith(`| ${r.row} |`))!;
      const first = r.mirrors[0]!.replace(/^.*\//, "").replace(/-\d+$/, "");
      expect(line, `row ${r.row} cites ${first}`).toContain(first);
    }
  });
  it("matchRoute answers only rows of the table, by method and path, decoding :params", () => {
    expect(matchRoute("GET", "/lws/vaults")!.route).toBe(ROUTES[0]);
    expect(matchRoute("GET", "/lws/vault/https%3A%2F%2Fa.test%2Fvault/records")!.params).toEqual({ vault: "https://a.test/vault" });
    expect(matchRoute("DELETE", "/lws/vaults")).toBeNull();
    expect(matchRoute("GET", "/lws/vault//records")).toBeNull();
    expect(matchRoute("GET", "/lws/r/a/b")).toBeNull();
  });
  it("the dispatcher holds no route literal of its own", () => {
    const src = readFileSync(new URL("../src/fake.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/["'`]\/(lws|base|files|onboard)\b/);
  });
});

describe("a request no row answers", () => {
  it("is 404 fake_platform_no_such_route, recorded in violations and in the call log", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const res = await a.fetch("https://fake.test/lws/records");
    expect(res.status).toBe(404);
    expect((await body(res)).error).toBe("fake_platform_no_such_route");
    expect(w.fake.violations).toEqual(["GET /lws/records"]);
    expect(w.fake.calls.last()!.status).toBe(404);
  });
  it("covers a known path with a method no row has, an unbuilt platform route, and a made-up route on a vault host", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    expect((await a.fetch("https://fake.test/lws/vaults", { method: "DELETE" })).status).toBe(404);
    expect((await a.fetch("https://fake.test/base/vault/create-named", { method: "POST", ...json({ name: "x", represents: "y" }) })).status).toBe(404);
    expect((await a.fetch(vaultUrl(w.annV, "/anything"))).status).toBe(404);
    expect(w.fake.violations).toHaveLength(3);
  });
  it("assertClean throws naming each; it passes when every request had a row", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    await a.fetch("https://fake.test/lws/vaults");
    expect(() => w.fake.assertClean()).not.toThrow();
    await a.fetch("https://fake.test/nope");
    expect(() => w.fake.assertClean()).toThrow(/GET \/nope/);
  });
  it("an unknown route is judged before auth: it is 404 even without credentials", async () => {
    const w = await world();
    const res = await w.fake.fetch("https://fake.test/nope");
    expect(res.status).toBe(404);
  });
});

describe("a foreign host", () => {
  it("rejects fetch with a TypeError and records a violation", async () => {
    const w = await world();
    await expect(w.fake.fetch("https://evil.example/lws/vaults")).rejects.toBeInstanceOf(TypeError);
    await expect(w.fake.fetch("https://fake.test.evil.example/lws/vaults")).rejects.toBeInstanceOf(TypeError);
    expect(w.fake.violations).toEqual(["GET https://evil.example/lws/vaults", "GET https://fake.test.evil.example/lws/vaults"]);
    expect(() => w.fake.assertClean()).toThrow();
  });
  it("answers the origin, vault hosts under the domain, and the hosts option; nothing else", async () => {
    const w = await world({ hosts: ["localhost:5173"] });
    for (const u of ["https://fake.test/nope", "https://anyone.fake.test/nope", "http://localhost:5173/nope"]) expect((await w.fake.fetch(u)).status, u).toBe(404);
    expect(w.fake.violations.every((v) => !v.includes("https://"))).toBe(true);
    await expect(w.fake.fetch("http://localhost:9999/x")).rejects.toBeInstanceOf(TypeError);
  });
});
