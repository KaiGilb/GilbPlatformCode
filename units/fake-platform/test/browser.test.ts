// installFakePlatform: the browser dev-mode installer (what an app's main.fake.tsx did by hand).
import { SESSION_DB_NAME } from "@kaigilb/gilbplatformcode-signin/session";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGNIN_SESSION_DB, createFakePlatform, installFakePlatform } from "../src";

afterEach(() => vi.unstubAllGlobals());

function target() {
  const real = vi.fn(async (input: RequestInfo | URL) => new Response(`real:${typeof input === "string" ? input : input instanceof URL ? input.href : input.url}`));
  const deleted: string[] = [];
  return { real, deleted, t: { fetch: real as unknown as typeof fetch, indexedDB: { deleteDatabase: (n: string) => (deleted.push(n), {} as IDBOpenDBRequest) }, location: { href: "http://localhost:5173/app" } } };
}

describe("installFakePlatform", () => {
  it("the default database is the signin unit's session database", () => {
    expect(SIGNIN_SESSION_DB).toBe(SESSION_DB_NAME);
  });
  it("sends the fake's host and its subdomains to the fake, everything else to the real fetch", async () => {
    const fake = createFakePlatform({ origin: "https://fake.test" });
    const { t, real } = target();
    installFakePlatform(fake, { target: t });
    const apex = await t.fetch("https://fake.test/lws/vaults");
    expect(apex.status).not.toBe(0);
    expect(fake.calls.count("GET /lws/vaults")).toBe(1);
    await t.fetch("https://ann.fake.test/lws/vaults");
    expect(fake.calls.count()).toBe(2);
    const other = await t.fetch("https://fonts.example.test/x.css");
    expect(await other.text()).toBe("real:https://fonts.example.test/x.css");
    await t.fetch(new URL("https://notfake.test/y"));
    await t.fetch(new Request("https://fake.test.evil.test/z"));
    expect(real).toHaveBeenCalledTimes(3);
    expect(fake.calls.count()).toBe(2);
  });
  it("a relative address resolves against the page and goes to the real fetch", async () => {
    const fake = createFakePlatform();
    const { t, real } = target();
    installFakePlatform(fake, { target: t });
    await t.fetch("/style.css");
    expect(real).toHaveBeenCalledTimes(1);
    expect(fake.calls.count()).toBe(0);
  });
  it("a Request to the fake goes to the fake", async () => {
    const fake = createFakePlatform();
    const { t } = target();
    installFakePlatform(fake, { target: t });
    await t.fetch(new Request("https://fake.test/lws/vaults"));
    expect(fake.calls.count("GET /lws/vaults")).toBe(1);
  });
  it("hosts: a predicate replaces the default (a dev rig host with a port)", async () => {
    const fake = createFakePlatform({ hosts: ["localhost:5173"] });
    const { t, real } = target();
    installFakePlatform(fake, { target: t, hosts: (h) => h === "localhost:5173" });
    await t.fetch("http://localhost:5173/lws/vaults");
    expect(fake.calls.count()).toBe(1);
    await t.fetch("https://fake.test/lws/vaults");
    expect(real).toHaveBeenCalledTimes(1);
  });
  it("fallback: other addresses go to it, not to the fetch the target had", async () => {
    const fake = createFakePlatform();
    const { t, real } = target();
    const fallback = vi.fn(async () => new Response("fb")) as unknown as typeof fetch;
    installFakePlatform(fake, { target: t, fallback });
    expect(await (await t.fetch("https://x.example.test/")).text()).toBe("fb");
    expect(real).not.toHaveBeenCalled();
  });
  it("deletes the signin session database by default, others when named, none when false", () => {
    const fake = createFakePlatform();
    const a = target();
    installFakePlatform(fake, { target: a.t });
    expect(a.deleted).toEqual(["gilb-signin-session"]);
    const b = target();
    installFakePlatform(fake, { target: b.t, resetDatabases: ["one", "two"] });
    expect(b.deleted).toEqual(["one", "two"]);
    const c = target();
    installFakePlatform(fake, { target: c.t, resetDatabases: false });
    expect(c.deleted).toEqual([]);
  });
  it("the reset happens before the router is in place (before the credential can open the database)", () => {
    const fake = createFakePlatform();
    const { t } = target();
    const original = t.fetch;
    let seenFetch: typeof fetch | null = null;
    (t.indexedDB as { deleteDatabase: (n: string) => unknown }).deleteDatabase = () => ((seenFetch = t.fetch), {});
    installFakePlatform(fake, { target: t });
    expect(seenFetch).toBe(original);
    expect(t.fetch).not.toBe(original);
  });
  it("the function it returns puts the previous fetch back; a later install is not undone by an earlier uninstall", () => {
    const fake = createFakePlatform();
    const { t } = target();
    const original = t.fetch;
    const off = installFakePlatform(fake, { target: t });
    expect(t.fetch).not.toBe(original);
    off();
    expect(t.fetch).toBe(original);
    const off1 = installFakePlatform(fake, { target: t });
    const second = installFakePlatform(fake, { target: t });
    const top = t.fetch;
    off1();
    expect(t.fetch).toBe(top);
    second();
  });
  it("with no target it installs on globalThis and uninstalls from it; no indexedDB there is fine", async () => {
    const fake = createFakePlatform();
    const before = globalThis.fetch;
    const off = installFakePlatform(fake);
    expect(globalThis.fetch).not.toBe(before);
    await globalThis.fetch("https://fake.test/lws/vaults");
    expect(fake.calls.count("GET /lws/vaults")).toBe(1);
    off();
    expect(globalThis.fetch).toBe(before);
  });
});
