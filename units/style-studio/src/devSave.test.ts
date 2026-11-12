import { describe, expect, it, vi } from "vitest";
import type { StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import * as unit from "./index";
import { makeDevServerSave, makeExtractFromUrl, splitLogo } from "./index";

const base = { version: 1, name: "n" } as unknown as StyleSheet;
const withLogo = (logo: Record<string, string>) => ({ ...base, logo }) as unknown as StyleSheet;
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("the new exports are on the barrel", () => {
  it("splitLogo, makeDevServerSave and makeExtractFromUrl are functions", () => {
    expect(typeof unit.splitLogo).toBe("function");
    expect(typeof unit.makeDevServerSave).toBe("function");
    expect(typeof unit.makeExtractFromUrl).toBe("function");
  });
});

describe("splitLogo", () => {
  it("takes a PNG data URL out of the sheet and answers it as logoPng", () => {
    const r = splitLogo(withLogo({ primary: "data:image/png;base64,AAAA" }));
    expect(r.logoPng).toBe("data:image/png;base64,AAAA");
    expect(r.sheet).not.toHaveProperty("logo");
  });
  it("leaves a sheet without a logo alone", () => expect(splitLogo(base)).toEqual({ sheet: base }));
  it("keeps https logo URLs and drops only the data URLs", () => {
    const r = splitLogo(withLogo({ primary: "data:image/png;base64,AAAA", mark: "https://x.test/m.png" }));
    expect(r.sheet.logo).toEqual({ mark: "https://x.test/m.png" });
    expect(r.logoPng).toBe("data:image/png;base64,AAAA");
  });
  it("a data URL that is not a PNG is dropped and not answered as logoPng", () => {
    const r = splitLogo(withLogo({ primary: "data:image/jpeg;base64,AAAA" }));
    expect(r.logoPng).toBeUndefined();
    expect(r.sheet).not.toHaveProperty("logo");
  });
  it("does not change its input", () => {
    const s = withLogo({ primary: "data:image/png;base64,AAAA" });
    splitLogo(s);
    expect(s.logo?.primary).toBe("data:image/png;base64,AAAA");
  });
});

describe("makeDevServerSave", () => {
  it("POSTs the split sheet as JSON to /__studio/save by default", async () => {
    const f = reply(200, { message: "Saved style and logo." });
    await makeDevServerSave({ fetchImpl: f as unknown as typeof fetch })(withLogo({ primary: "data:image/png;base64,AAAA" }));
    const [url, init] = (f.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(url).toBe("/__studio/save");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ sheet: base, logoPng: "data:image/png;base64,AAAA" });
  });
  it("takes another endpoint", async () => {
    const f = reply(200, {});
    await makeDevServerSave({ endpoint: "/x/save", fetchImpl: f as unknown as typeof fetch })(base);
    expect((f.mock.calls as unknown as [string][])[0]![0]).toBe("/x/save");
  });
  it("throws the server's message so the Studio shows it", async () => {
    await expect(makeDevServerSave({ fetchImpl: reply(400, { message: "The logo must be a PNG data URL." }) as unknown as typeof fetch })(base)).rejects.toThrow("The logo must be a PNG data URL.");
  });
  it("throws 'Save failed.' when the answer has no message or is not JSON", async () => {
    await expect(makeDevServerSave({ fetchImpl: reply(500, {}) as unknown as typeof fetch })(base)).rejects.toThrow("Save failed.");
    const notJson = vi.fn(async () => new Response("<html>", { status: 502 }));
    await expect(makeDevServerSave({ fetchImpl: notJson as unknown as typeof fetch })(base)).rejects.toThrow("Save failed.");
  });
  it("says the dev server could not be reached when the request itself fails", async () => {
    await expect(makeDevServerSave({ fetchImpl: (async () => { throw new TypeError("x"); }) as unknown as typeof fetch })(base)).rejects.toThrow(/dev server/);
  });
  it("passes a fonts warning to onWarning and still resolves", async () => {
    const onWarning = vi.fn();
    await makeDevServerSave({ fetchImpl: reply(200, { message: "Saved style.", fontsWarning: "Lora was not found." }) as unknown as typeof fetch, onWarning })(base);
    expect(onWarning).toHaveBeenCalledWith("Lora was not found.");
    const quiet = vi.fn();
    await makeDevServerSave({ fetchImpl: reply(200, { message: "Saved style." }) as unknown as typeof fetch, onWarning: quiet })(base);
    expect(quiet).not.toHaveBeenCalled();
  });
});

describe("makeExtractFromUrl with a credential", () => {
  it("signs exactly POST <baseUrl>/base/style/extract (a trailing slash on baseUrl is dropped) and sends those headers", async () => {
    const f = reply(200, { colors: ["#fff"], fonts: [] });
    const signed: [string, string][] = [];
    const credential = { authHeaders: async (m: string, u: string) => (signed.push([m, u]), { Authorization: "DPoP t", DPoP: "p" }) };
    await makeExtractFromUrl({ baseUrl: "https://api.example.test/", fetchImpl: f as unknown as typeof fetch, credential })("https://site.test");
    expect(signed).toEqual([["POST", "https://api.example.test/base/style/extract"]]);
    const [url, init] = (f.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(url).toBe(signed[0]![1]);
    expect(init.method).toBe(signed[0]![0]);
    expect(init.headers).toMatchObject({ Authorization: "DPoP t", DPoP: "p", "content-type": "application/json" });
    expect(init.credentials).toBe("omit");
  });
  it("a credential wins over getAuthHeaders", async () => {
    const f = reply(200, { colors: [], fonts: [] });
    const getAuthHeaders = vi.fn(async () => ({ Authorization: "old" }));
    await makeExtractFromUrl({ baseUrl: "https://a.test", fetchImpl: f as unknown as typeof fetch, getAuthHeaders, credential: { authHeaders: async () => ({ Authorization: "new" }) } })("https://s.test");
    expect(getAuthHeaders).not.toHaveBeenCalled();
    expect(((f.mock.calls as unknown as [string, RequestInit][])[0]![1].headers as Record<string, string>).Authorization).toBe("new");
  });
  it("a credential that cannot sign gives the generic message and sends nothing", async () => {
    const f = reply(200, {});
    await expect(
      makeExtractFromUrl({ baseUrl: "https://a.test", fetchImpl: f as unknown as typeof fetch, credential: { authHeaders: async () => { throw new Error("not signed in"); } } })("https://s.test"),
    ).rejects.toThrow("The site could not be read.");
    expect(f).not.toHaveBeenCalled();
  });
});
