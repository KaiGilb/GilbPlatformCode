// @vitest-environment jsdom
// Ported from GilbApp `PlaceClaimsCard.flags.c214.test.tsx` (3 cases) and `PlaceClaimsCard.flags.s130.agenttester.test.tsx` (13 of 14): a stored address draws its country's
// flag, reading it through the real flag reader over a fixture that answers the way the catalogue answers for the flag files. The 14th case (a record's one-string
// legacy address draws no flag) renders the card's legacy text and goes with the card (H15g).
// Changed from the source: the cases render the stored address (`SavedAddress`) instead of the whole card, in the card's own list element; the host of the fixture is the
// fake platform's; `axe-core` is run directly with colour contrast off (jsdom has no canvas).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import axeCore from "axe-core";
import { __resetFlags, geoFlagSource, setFlagSource, setFlagStore, type CountryFlag, type FlagStore } from "@kaigilb/gilbplatformcode-flag-source";
import { GEO, GEO_ORIGIN, fetchDouble, setCatalogueMode, useWorld } from "../test/world";
import { SVG_NO, geo } from "../test/flagWorld";
import { claim, field, list } from "../test/support";

useWorld();
const axe = (node: Element) => axeCore.run(node, { rules: { "color-contrast": { enabled: false } } });
const NORWAY = `${GEO}/no`;

/** One stored address: the picked country and/or a typed street (the shape A's tests used). */
function address(id: string, opts: { country?: string | null; street?: string; label?: string } = {}) {
  const fields = [];
  if (opts.country) fields.push(field(id, { id: `${id}-c`, subject: "place", placeId: opts.country }));
  if (opts.street) fields.push(field(id, { id: `${id}-s`, subject: "street", streetLine: opts.street }));
  return claim(id, opts.label ?? id, fields);
}
const card = (claims: ReturnType<typeof address>[]) => list(claims);
const flagsOn = (el: Element | Document) => [...el.querySelectorAll('[data-testid="flag-image"]')];

beforeEach(() => {
  setCatalogueMode("normal");
  vi.stubGlobal("fetch", fetchDouble());
  // No device store: every test starts as a first visit, and the reader is the real one, over the fixture.
  setFlagStore(null);
  __resetFlags();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setFlagSource(null);
  setFlagStore(null);
});

describe("c214 · the stored address's country line", () => {
  it("draws the picked country's flag from the catalogue on the 'Region, Country' line", async () => {
    const g = geo("ok");
    setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
    render(card([address("a", { country: NORWAY, label: "home" })]));
    const line = await screen.findByTestId("place-view-region-country");
    await waitFor(() => expect(line.textContent).toBe("Norway"));
    await waitFor(() => expect(line.querySelector('[data-testid="flag-image"]')?.getAttribute("data-flag-state")).toBe("flag"));
    const img = line.querySelector("img")!;
    expect(img.getAttribute("data-flag-country")).toBe(NORWAY);
    expect(img.getAttribute("alt")).toMatch(/^Flag of /);
    expect(decodeURIComponent(img.getAttribute("src")!.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""))).toBe(SVG_NO);
    // The slug rule, and never the country entity (it holds the polygon, 0.5-3.6 MB).
    expect(g.calls.map((c) => c.url)).toContain(`${GEO_ORIGIN}/files/flag-no`);
    expect(g.calls.some((c) => c.url === NORWAY)).toBe(false);
  });

  it("draws the neutral globe when the catalogue holds no flag for the picked country", async () => {
    const g = geo("ok", {});
    setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
    render(card([address("a", { country: NORWAY })]));
    const line = await screen.findByTestId("place-view-region-country");
    await waitFor(() => expect(line.textContent).toBe("Norway"));
    await waitFor(() => expect(g.calls.map((c) => c.url)).toContain(`${GEO_ORIGIN}/files/flag-no`));
    expect(line.querySelector('[data-testid="flag-image"]')?.getAttribute("data-flag-state")).toBe("globe");
    expect(line.querySelector("img")).toBeNull();
    // The globe is silent, so a screen reader does not say "No flag" before "Norway".
    expect(line.querySelector('[data-testid="flag-image"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("img", { name: "No flag" })).toBeNull();
  });

  it("draws no flag on a line that holds no picked country (the street line)", async () => {
    const g = geo("ok");
    setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
    render(card([address("a", { country: NORWAY, street: "Storgata 1" })]));
    const country = await screen.findByTestId("place-view-region-country");
    await waitFor(() => expect(country.querySelector('[data-testid="flag-image"]')?.getAttribute("data-flag-state")).toBe("flag"));
    const street = screen.getByTestId("place-view-street");
    expect(street.textContent).toBe("Storgata 1");
    expect(street.querySelector('[data-testid="flag-image"]')).toBeNull();
    expect(document.querySelectorAll('[data-testid="flag-image"]').length).toBe(1);
  });
});

describe("s130 · the flag reads are anonymous", () => {
  it("both flag reads go with credentials 'omit' and no Authorization or DPoP header", async () => {
    const g = geo("ok");
    setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
    render(card([address("a", { country: NORWAY })]));
    const line = await screen.findByTestId("place-view-region-country");
    await waitFor(() => expect(flagsOn(line)[0]?.getAttribute("data-flag-state")).toBe("flag"));
    expect(g.flagCalls().map((c) => c.url).sort()).toEqual([`${GEO_ORIGIN}/base/e/flag-no`, `${GEO_ORIGIN}/files/flag-no`]);
    for (const c of g.flagCalls()) {
      expect(c.init?.credentials).toBe("omit");
      expect(c.init?.method ?? "GET").toBe("GET");
      const h = new Headers(c.init?.headers);
      expect(h.has("authorization")).toBe(false);
      expect(h.has("dpop")).toBe(false);
    }
  });
});

describe("s130 · GilbGeo fails: no flag, no error, no loop", () => {
  it("500: the line draws the globe (no <img>), the card shows no error, and a re-render within the back-off asks nothing more", async () => {
    const g = geo("500");
    setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
    const { rerender } = render(card([address("a", { country: NORWAY })]));
    const line = await screen.findByTestId("place-view-region-country");
    await waitFor(() => expect(g.flagCalls().length).toBe(2));
    await waitFor(() => expect(flagsOn(line)[0]?.getAttribute("data-flag-state")).toBe("globe"));
    expect(line.querySelector("img")).toBeNull();
    expect(line.textContent).toBe("Norway");
    expect(document.body.textContent).not.toMatch(/GilbGeo|answered 500|could not be reached|error/i);
    // Unmount and mount again (a card closed and opened): within the back-off ⛔ no new read.
    rerender(<div />);
    rerender(card([address("a", { country: NORWAY })]));
    await screen.findByTestId("place-view-region-country");
    await new Promise((r) => setTimeout(r, 50));
    expect(g.flagCalls().length).toBe(2);
  });

  it("timeout: a GilbGeo that never answers ends in the globe after the reader's limit, with no new read while backing off", async () => {
    const g = geo("hang");
    setFlagSource(geoFlagSource({ fetchFn: g.fetchFn, timeoutMs: 40 }));
    const { rerender } = render(card([address("a", { country: NORWAY })]));
    const line = await screen.findByTestId("place-view-region-country");
    await waitFor(() => expect(g.flagCalls().length).toBe(2));
    await new Promise((r) => setTimeout(r, 120));
    expect(flagsOn(line)[0]?.getAttribute("data-flag-state")).toBe("globe");
    expect(line.querySelector("img")).toBeNull();
    rerender(<div />);
    rerender(card([address("a", { country: NORWAY })]));
    await screen.findByTestId("place-view-region-country");
    await new Promise((r) => setTimeout(r, 80));
    expect(g.flagCalls().length).toBe(2);
  });
});

describe("s130 · SVG safety still applies on the address line", () => {
  for (const mode of ["script", "onload", "href"] as const) {
    it(`an unsafe SVG (${mode}) is never drawn: the globe, no <img>, no data: URL`, async () => {
      const g = geo(mode);
      setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
      render(card([address("a", { country: NORWAY })]));
      const line = await screen.findByTestId("place-view-region-country");
      await waitFor(() => expect(g.flagCalls().length).toBe(2));
      await waitFor(() => expect(flagsOn(line)[0]?.getAttribute("data-flag-state")).toBe("globe"));
      expect(line.querySelector("img")).toBeNull();
      expect(document.body.innerHTML).not.toMatch(/alert\(|tracker\.example/);
    });
  }

  it("a whole SVG served as 200 text/html (not an image answer) is not a flag: the globe, no <img>", async () => {
    const g = geo("html");
    setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
    render(card([address("a", { country: NORWAY })]));
    const line = await screen.findByTestId("place-view-region-country");
    await waitFor(() => expect(g.flagCalls().length).toBe(2));
    await waitFor(() => expect(flagsOn(line)[0]?.getAttribute("data-flag-state")).toBe("globe"));
    expect(line.querySelector("img")).toBeNull();
  });
});

describe("s130 · no picked country: no flag at all", () => {
  it("an address of typed lines only (Street 'Norway', no picked country) draws no flag element and asks GilbGeo nothing", async () => {
    const g = geo("ok");
    setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
    render(card([address("a", { street: "Norway" })]));
    const street = await screen.findByTestId("place-view-street");
    expect(street.textContent).toBe("Norway");
    await new Promise((r) => setTimeout(r, 30));
    expect(flagsOn(document)).toHaveLength(0);
    expect(screen.queryByTestId("place-view-region-country")).toBeNull();
    expect(g.flagCalls()).toHaveLength(0);
  });
});

describe("s130 · cost: one read per country, kept on the device", () => {
  it("two addresses in the same country: both lines draw the flag from ONE pair of reads", async () => {
    const g = geo("ok");
    setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
    render(card([address("a", { country: NORWAY, label: "home" }), address("b", { country: NORWAY, label: "cabin" })]));
    await waitFor(() => expect(flagsOn(document).filter((f) => f.getAttribute("data-flag-state") === "flag")).toHaveLength(2));
    expect(g.flagCalls()).toHaveLength(2);
  });

  it("a flag kept fresh on the device is drawn with 0 reads (a new session)", async () => {
    const kept = new Map<string, CountryFlag>([[NORWAY, { svg: SVG_NO, code: "no", savedAt: Date.now() }]]);
    const store: FlagStore = { get: async (c) => kept.get(c) ?? null, put: async (c, f) => void kept.set(c, f) };
    const g = geo("ok");
    setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
    setFlagStore(store);
    render(card([address("a", { country: NORWAY })]));
    const line = await screen.findByTestId("place-view-region-country");
    await waitFor(() => expect(flagsOn(line)[0]?.getAttribute("data-flag-state")).toBe("flag"));
    expect(g.flagCalls()).toHaveLength(0);
  });
});

describe("s130 · layout: unchanged except for the flag", () => {
  it("a line with no country keeps exactly main's classes; the country line only adds the flag row classes", async () => {
    const g = geo("ok");
    setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
    render(card([address("a", { country: NORWAY, street: "Storgata 1" })]));
    const street = await screen.findByTestId("place-view-street");
    expect(street.className).toBe("text-[15px] leading-snug text-[var(--ink)]");
    const country = screen.getByTestId("place-view-region-country");
    expect(country.className).toBe("text-[15px] leading-snug text-[var(--ink)] inline-flex items-center gap-1.5");
    // The flag comes BEFORE the country's name, and the name is unchanged.
    await waitFor(() => expect(country.querySelector('[data-testid="flag-image"]')?.getAttribute("data-flag-state")).toBe("flag"));
    expect((country.childNodes[0] as Element).getAttribute?.("data-testid")).toBe("flag-image");
    expect(country.childNodes[country.childNodes.length - 1]!.textContent).toBe("Norway");
    expect(country.textContent).toBe("Norway");
    await act(async () => {});
  });
});

describe("s130 · accessibility (RuleA11yUnitTest): the address card with a drawn flag, and with the globe, is axe-clean", () => {
  for (const mode of ["ok", "500"] as const) {
    it(`axe: no violations on the card when GilbGeo answers ${mode === "ok" ? "a flag" : "500 (the globe)"}`, async () => {
      const g = geo(mode);
      setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
      const { container } = render(card([address("a", { country: NORWAY, street: "Storgata 1" })]));
      const line = await screen.findByTestId("place-view-region-country");
      await waitFor(() => expect(flagsOn(line)[0]?.getAttribute("data-flag-state")).toBe(mode === "ok" ? "flag" : "globe"));
      if (mode === "ok") expect(line.querySelector("img")?.getAttribute("alt")).toBe("Flag of Norway");
      expect((await axe(container)).violations).toEqual([]);
    });
  }
});

describe("every flag read is a GET", () => {
  it("across a flag drawn, a flag refused and a flag failed, nothing but GET reached the fixture", async () => {
    for (const mode of ["ok", "500", "script"] as const) {
      const g = geo(mode);
      __resetFlags();
      setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
      const { unmount } = render(card([address("a", { country: NORWAY })]));
      await waitFor(() => expect(g.flagCalls().length).toBeGreaterThan(0));
      expect(g.calls.filter((c) => (c.init?.method ?? "GET") !== "GET")).toEqual([]);
      unmount();
    }
  });
});
