// The start: the settings check, the platform settings and credential, and the style as Dev.Guide.AppStyle describes it.
import { baseOrigin, systemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settingsProblems, type StarterSettings } from "./settings";
import { NO_SAVED_STYLE, startStarter, styleCacheKey } from "./start";
import { makeWorld, settingsFor, STYLE_FILE, TYPE, type World } from "../test/world";

let world: World;
afterEach(() => world?.undo());

const good: StarterSettings = { appId: "things", appName: "Things", platformOrigin: "https://platform.example.test", idOrigin: "https://id.example.test", vaultType: TYPE, vaultNameSuffix: "things" };
const styleText = () => document.getElementById("gilb-style")?.textContent ?? "";

// Spec: brief item 7 — a new app sets its names, origins and type in one place; a missing or wrong one is named before anything starts.
describe("settingsProblems", () => {
  it("finds nothing wrong with good settings", () => {
    expect(settingsProblems(good)).toEqual([]);
    expect(settingsProblems({ ...good, systemVaultHosts: ["id.example.test"], localRigHosts: ["rig.example.test", "[::1]"], styleSheetUrl: "https://app.example.test/base/e/abc", styleFallbackUrl: "/my.json" })).toEqual([]);
  });

  it.each([
    [{ appId: "Things" }, "appId must start with a letter"],
    [{ appId: "" }, "appId must start with a letter"],
    [{ appName: "  " }, "appName is empty."],
    [{ platformOrigin: "https://platform.example.test/base" }, "platformOrigin must be an http or https origin with no path."],
    [{ platformOrigin: "platform.example.test" }, "platformOrigin must be an http or https origin with no path."],
    [{ idOrigin: "" }, "idOrigin must be an http or https origin with no path."],
    [{ idOrigin: "https://id.example.test?x=1" }, "idOrigin must be an http or https origin with no path."],
    [{ vaultType: "" }, "vaultType must be the full address"],
    [{ vaultType: "t:Thing" }, "vaultType must be the full address"],
    [{ vaultType: "https://types.example.test" }, "vaultType must be the full address"],
    [{ vaultNameSuffix: "my-things" }, "vaultNameSuffix must hold only lower-case letters and digits."],
    [{ systemVaultHosts: ["https://id.example.test"] }, "systemVaultHosts must be bare host names"],
    [{ localRigHosts: ["rig.example.test:5300"] }, "localRigHosts must be bare host names"],
    [{ styleSheetUrl: "not an address" }, "styleSheetUrl must be the http or https address"],
    [{ styleFallbackUrl: " " }, "styleFallbackUrl is empty"],
  ] as const)("names the problem in %j", (over, sentence) => {
    const problems = settingsProblems({ ...good, ...over } as StarterSettings);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(sentence);
  });

  it("lists every problem, not only the first", () => {
    expect(settingsProblems({ ...good, appId: "", appName: "", vaultType: "" })).toHaveLength(3);
  });
});

// Spec: brief item 2 — the style is loaded as Dev.Guide.AppStyle.Load says: the cached style at once, then the saved style, else /style.tokens.json.
describe("startStarter", () => {
  beforeEach(() => {
    world = makeWorld();
  });

  it("refuses unusable settings before anything is set, naming each problem", () => {
    expect(() => startStarter({ ...good, appId: "", vaultType: "" })).toThrow(/starter-app: the settings cannot be used\. appId must .* vaultType must /);
  });

  it("sets the platform origin and the system vault hosts, and makes the credential, the card's identity and the vault settings", () => {
    const rt = startStarter({ ...settingsFor(world.fake), idOrigin: `${world.fake.origin}/`, systemVaultHosts: ["id.fake.test"] }, { returnTo: () => "https://app.example.test" });
    expect(baseOrigin()).toBe(world.fake.origin);
    expect(systemVaultHosts().has("id.fake.test")).toBe(true);
    expect(rt.credential).toBeInstanceOf(SessionCredential);
    expect(rt.settings.idOrigin).toBe(world.fake.origin); // no trailing slash reaches a request
    expect({ ...rt.app, returnTo: rt.app.returnTo() }).toEqual({ id: "things", productName: "Things", title: "Things", origin: world.fake.origin, returnTo: "https://app.example.test" });
    expect(rt.vaultConfig).toEqual({ represents: TYPE, nameSuffix: "things", storageKey: "things" });
  });

  it("with no saved style named, the app's own /style.tokens.json is applied, and no platform address is asked for a style", async () => {
    const rt = startStarter(settingsFor(world.fake));
    const result = await rt.style;
    expect(result.source).toBe("fallback");
    expect(result.errors).toEqual([`remote: ${NO_SAVED_STYLE}`]);
    expect(world.ownFiles).toEqual(["/style.tokens.json"]);
    expect(styleText()).toContain("--accent: #3b6fd4");
    expect(document.querySelectorAll("style#gilb-style")).toHaveLength(1);
    expect(world.fake.calls.all).toEqual([]);
  });

  it("another fallback file can be named", async () => {
    world.undo();
    world = makeWorld(null);
    const result = await startStarter(settingsFor(world.fake, { styleFallbackUrl: "/brand/tokens.json" })).style;
    expect(world.ownFiles).toEqual(["/brand/tokens.json"]);
    expect(result.source).toBe("none"); // that file is not there: no crash, the app's own CSS shows
    expect(styleText()).toBe("");
  });

  it("the style of the last visit is applied before the function returns, so the page does not flash", () => {
    const cached = { ...STYLE_FILE, palette: { ...STYLE_FILE.palette, accent: "#aa3355" } };
    localStorage.setItem(styleCacheKey("things"), JSON.stringify(cached));
    startStarter(settingsFor(world.fake));
    expect(styleText()).toContain("--accent: #aa3355"); // no await before this line
  });

  it("a saved style named in the settings is read from its address with plain GET calls and no sign-in, replaces the app's own file, and is kept for the next visit", async () => {
    // The three records as a vault answers them (bare keys), the shapes of style-runtime's own vault test.
    const base = "https://style.example.test";
    const id = (n: number) => `${base}/lws/vault/v1/e/${n}`;
    const records: Record<string, unknown> = {
      [id(1)]: { stylePalette: { "@id": id(2) }, styleBrandKit: { "@id": id(3) } },
      [id(2)]: { paletteColour: [{ colourHex: "#112233", colourRole: "primary" }, { colourHex: "#ffffff", colourRole: "background" }, { colourHex: "#111111", colourRole: "text" }] },
      [id(3)]: { brandFont: "Inter" },
    };
    world.undo();
    const asked: { url: string; method: string; signed: boolean; cookies: unknown }[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      asked.push({ url, method: init?.method ?? "GET", signed: headers.has("authorization") || headers.has("dpop"), cookies: init?.credentials });
      if (url in records) return new Response(JSON.stringify(records[url]), { status: 200 });
      return new Response(JSON.stringify(STYLE_FILE), { status: url === "/style.tokens.json" ? 200 : 404 });
    }) as typeof fetch);

    const result = await startStarter({ ...good, styleSheetUrl: id(1) }).style;
    expect(result).toEqual({ source: "remote", errors: [] });
    expect(styleText()).toContain("--accent: #112233"); // the saved style, not the file's #3b6fd4
    expect(document.querySelectorAll("style#gilb-style")).toHaveLength(1);
    expect(asked.map((a) => a.url).sort()).toEqual([id(1), id(2), id(3)]); // the app's own file was not needed
    expect(asked.every((a) => a.method === "GET" && !a.signed && a.cookies === "omit")).toBe(true);
    expect(JSON.parse(localStorage.getItem(styleCacheKey("things"))!).palette.accent).toBe("#112233");
  });

  it("a saved style that cannot be read leaves the app's own file in place", async () => {
    const result = await startStarter(settingsFor(world.fake, { styleSheetUrl: `${world.fake.origin}/base/e/nostyle` })).style;
    expect(result.source).toBe("fallback");
    expect(result.errors.some((e) => e.startsWith("remote:"))).toBe(true);
    expect(styleText()).toContain("--accent: #3b6fd4");
  });
});
