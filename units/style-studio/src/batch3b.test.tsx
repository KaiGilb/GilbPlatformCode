import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StyleStudio, makeExtractFromUrl } from "./studio/index";
import { classifyFont, closestBundled, matchBundled } from "./studio/fonts";
import { sheetFromCatalogue } from "./studio/model";
import { popPalettes } from "./catalogue/index";
import { contrastRatio } from "@kaigilb/gilbplatformcode-style-runtime";
import { toCssText, toCssVars } from "@kaigilb/gilbplatformcode-style-runtime";
import { validateStyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import { validSheet } from "./fixtures";

afterEach(cleanup);
const tab = (name: string) => screen.getByRole("tab", { name });
const opts = () => within(screen.getByRole("listbox", { name: "Palettes" })).queryAllByRole("option");
const preview = () => screen.getByTestId("gs-preview");

describe("palette.extra (schema + css)", () => {
  it("accepts up to 6 colours, rejects 7, non-colours and injection", () => {
    const ok = validSheet();
    ok.palette.extra = ["#ff0000", "rgb(1, 2, 3)", "oklch(0.7 0.1 30)"];
    expect(validateStyleSheet(ok).ok).toBe(true);
    for (const bad of [Array(7).fill("#ffffff"), ["red"], ["#fff; x"], "#ffffff", [1]]) {
      const s = validSheet();
      (s.palette as any).extra = bad;
      expect(validateStyleSheet(s).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it("emits --gs-extra-N contrast-fixed to 3:1 against paper, in both modes", () => {
    const s = validSheet();
    s.palette.extra = ["#fff3b0", "#ffe14d", "#e63946", "#111111"];
    for (const mode of ["light", "dark"] as const) {
      const v = toCssVars(s, mode);
      const paper = (mode === "dark" ? s.dark!.paper : s.palette.paper);
      for (let i = 1; i <= 4; i++) expect(contrastRatio(v[`--gs-extra-${i}`]!, paper)).toBeGreaterThanOrEqual(3);
      expect(v["--gs-extra-5"]).toBeUndefined();
    }
    const css = toCssText(s);
    expect(css).toContain("--gs-extra-1:");
    expect(css.split('[data-theme="dark"]')[1]).toContain("--gs-extra-4:");
  });
  it("a catalogue palette keeps all its original colours in order", () => {
    const pal = popPalettes.find((p) => p.name === "Hot Coral")!;
    const next = sheetFromCatalogue(validSheet(), "pop", pal)!;
    expect(next.palette.extra).toEqual(pal.colors.slice(0, 6));
    expect(validateStyleSheet(next).ok).toBe(true);
  });
  it("the preview chart row uses the palette's own colours", () => {
    render(<StyleStudio />);
    fireEvent.click(screen.getByRole("option", { name: /Hot Coral/ }));
    const pal = popPalettes.find((p) => p.name === "Hot Coral")!;
    const bars = preview().querySelectorAll(".gp-swatches span");
    expect(bars.length).toBe(Math.min(6, pal.colors.length));
    expect((bars[3] as HTMLElement).style.background).toContain("--gs-extra-4");
    expect(preview().style.getPropertyValue("--gs-extra-4")).toMatch(/^#/);
  });
});

describe("window styles are distinct", () => {
  it("flat / bordered / card / glass differ in border and shadow", () => {
    const v = (w: "flat" | "bordered" | "card" | "glass") => toCssVars({ ...validSheet(), window: w }, "light");
    expect(v("flat")["--gs-window-border"]).toBe("none");
    expect(v("flat")["--gs-window-shadow"]).toBe("none");
    expect(v("flat")["--gs-window-bg"]).toContain("96%");
    expect(v("bordered")["--gs-window-border"]).toContain("22%");
    expect(v("bordered")["--gs-window-shadow"]).toBe("none");
    expect(v("card")["--gs-window-border"]).toBe("none");
    expect(v("card")["--gs-window-shadow"]).toBe("var(--shadow-md)");
    expect(v("card")["--gs-window-radius"]).toBe("var(--r-lg)");
    expect(v("glass")["--gs-window-border"]).toContain("rgba(255, 255, 255, 0.35)");
    expect(v("glass")["--gs-window-backdrop"]).toBe("blur(14px)");
    expect(() => toCssText({ ...validSheet(), window: "glass" })).not.toThrow();
  });
});

describe("button CSS", () => {
  it("buttons are centred flex boxes", async () => {
    const css = (await import("node:fs")).readFileSync("src/studio/studio.css", "utf8");
    const rule = css.split("\n").find((l) => l.includes(".gs-btn {"))!;
    for (const part of ["display: inline-flex", "align-items: center", "justify-content: center", "min-height: var(--gs-control-h)", "padding: 0 calc(var(--gs-space) * 3)"]) expect(rule).toContain(part);
  });
});

describe("palette filter and shuffle", () => {
  it("filters by name and number, and shows a message when nothing matches", async () => {
    render(<StyleStudio includeWada />);
    await screen.findByText("Wada");
    const f = screen.getByLabelText("Filter palettes");
    fireEvent.change(f, { target: { value: "hot coral" } });
    expect(opts().length).toBe(1);
    fireEvent.change(f, { target: { value: "No. 348" } });
    expect(opts().map((o) => o.textContent)).toEqual([expect.stringContaining("Wada No. 348")]);
    fireEvent.change(f, { target: { value: "zzzz" } });
    expect(opts().length).toBe(0);
    expect(screen.getByText("No palettes match.")).toBeTruthy();
  });
  it("shuffle previews a random palette without committing", () => {
    render(<StyleStudio />);
    const before = preview().style.getPropertyValue("--accent");
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    fireEvent.click(screen.getByRole("button", { name: "Shuffle" }));
    vi.restoreAllMocks();
    const last = opts().at(-1)!;
    expect(screen.getByRole("listbox").getAttribute("aria-activedescendant")).toBe(last.id);
    expect(preview().style.getPropertyValue("--accent")).not.toBe(before);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(preview().style.getPropertyValue("--accent")).toBe(before);
  });
});

describe("makeExtractFromUrl", () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const run = (f: typeof fetch) => makeExtractFromUrl({ baseUrl: "https://api.example.com/", fetchImpl: f })("https://site.test");
  const cases: [number, unknown, string][] = [
    [400, { error: "address_not_allowed" }, "That address cannot be read (private or not allowed)."],
    [400, { error: "other" }, "The site could not be read."],
    [401, {}, "Sign in first."],
    [415, {}, "That address is not a web page."],
    [429, {}, "Too many reads — wait a minute."],
    [504, {}, "The site took too long to answer."],
    [500, {}, "The site could not be read."],
  ];
  for (const [status, body, msg] of cases)
    it(`maps ${status} ${JSON.stringify(body)}`, async () => {
      await expect(run(reply(status, body) as unknown as typeof fetch)).rejects.toThrow(msg);
    });
  it("network failure gives the generic message", async () => {
    await expect(run((async () => { throw new TypeError("x"); }) as unknown as typeof fetch)).rejects.toThrow("The site could not be read.");
  });
  it("POSTs json to the route with no cookies and auth headers, and passes through four fields", async () => {
    const f = reply(200, { colors: ["#fff"], fonts: ["Inter"], radiusPx: 6, logoUrl: "https://x/l.png", url: "u", readAt: "t", sheetsRead: 2, bytesRead: 9 });
    const out = await makeExtractFromUrl({ baseUrl: "https://api.example.com/", fetchImpl: f as unknown as typeof fetch, getAuthHeaders: async () => ({ Authorization: "DPoP abc", DPoP: "proof" }) })("https://site.test");
    expect(out).toEqual({ colors: ["#fff"], fonts: ["Inter"], radiusPx: 6, logoUrl: "https://x/l.png" });
    const [url, init] = (f.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(url).toBe("https://api.example.com/base/style/extract");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(init.body).toBe(JSON.stringify({ url: "https://site.test" }));
    expect(init.headers).toMatchObject({ Authorization: "DPoP abc", DPoP: "proof", "content-type": "application/json" });
  });
  it("the website tab shows the plain message", async () => {
    render(<StyleStudio extractFromUrl={makeExtractFromUrl({ baseUrl: "https://a.test", fetchImpl: reply(429, {}) as unknown as typeof fetch })} />);
    fireEvent.click(tab("From website"));
    fireEvent.change(screen.getByLabelText("Website address"), { target: { value: "https://site.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Read styles" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Too many reads — wait a minute.");
  });
});

describe("website fonts", () => {
  it("classifies and matches names", () => {
    expect(classifyFont("EB Garamond")).toBe("serif");
    expect(classifyFont("Source Code Pro")).toBe("mono");
    expect(classifyFont("Noto Sans Serif")).toBe("sans");
    expect(classifyFont("Helvetica")).toBe("sans");
    expect(matchBundled("inter")).toEqual({ family: "Inter", role: "sans" });
    expect(matchBundled("Comic Sans")).toBeNull();
    expect(closestBundled("EB Garamond")).toBe("Source Serif 4");
    expect(closestBundled("Fira Mono")).toBe("JetBrains Mono");
  });
  it("offers Use <font> for bundled and a closest hint for others; the chip sets the font", async () => {
    render(<StyleStudio extractFromUrl={async () => ({ colors: ["#0b6e4f"], fonts: ["inter", "Times New Roman"] })} />);
    fireEvent.click(tab("From website"));
    fireEvent.change(screen.getByLabelText("Website address"), { target: { value: "https://site.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Read styles" }));
    expect(await screen.findByText(/Times New Roman \(not bundled — closest: Source Serif 4\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use Inter" }));
    await waitFor(() => expect(preview().style.getPropertyValue("--sans")).toMatch(/^"Inter"/));
  });
  it("Use these on a website read stores the site's colours as palette.extra", async () => {
    const onSave = vi.fn();
    render(<StyleStudio onSave={onSave} extractFromUrl={async () => ({ colors: ["#0b6e4f", "#e4572e", "#f7f3e8"], fonts: [] })} />);
    fireEvent.click(tab("From website"));
    fireEvent.change(screen.getByLabelText("Website address"), { target: { value: "https://site.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Read styles" }));
    await screen.findByLabelText("Use #e4572e as accent");
    fireEvent.click(screen.getByLabelText(/I have the right/));
    fireEvent.click(screen.getByRole("button", { name: "Use these" }));
    expect(preview().style.getPropertyValue("--gs-extra-2")).toMatch(/^#/);
    expect(preview().querySelectorAll(".gp-swatches span").length).toBe(3);
  });
});

describe("makeExtractFromUrl credentials", () => {
  it("sends no cookies (the route answers CORS without Allow-Credentials)", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({}), { status: 500 }));
    await makeExtractFromUrl({ baseUrl: "https://api.example.com", fetchImpl: f as unknown as typeof fetch })("https://site.test").catch(() => {});
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].credentials).toBe("omit");
  });
});
