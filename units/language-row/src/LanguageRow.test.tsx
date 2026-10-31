// @vitest-environment jsdom
// New. The source draws a language only inside the held card's languages section. These pin the viewer's row: the name and the
// flag, and that no state of it ever shows an address. Everything runs against one fake that answers the way the catalogue does.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { __resetFetchPool } from "@kaigilb/gilbplatformcode-language-fetch-pool";
import { __resetLanguageEntries } from "@kaigilb/gilbplatformcode-language-entry";
import { __resetFlags, geoFlagSource, setFlagSource, setFlagStore } from "@kaigilb/gilbplatformcode-flag-source";
import { LANGUAGE_READING_TEXT, LANGUAGE_UNNAMED_TEXT, LanguageRow, languageNameOf } from "./index";

const NOR = "https://veda.example.test/base/e/xja6zz79cmva";
const ENG = "https://veda.example.test/base/e/eng000000001";
const POR = "https://veda.example.test/base/e/por000000001";
const NOLABEL = "https://veda.example.test/base/e/nolabel00001";
const NORWAY = "https://geo.example.test/base/e/osm-r-2978650";
const UK = "https://geo.example.test/base/e/osm-r-62149";
const USA = "https://geo.example.test/base/e/osm-r-148838";
const SWEDEN = "https://geo.example.test/base/e/osm-r-52822";
const SVG = (c: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="${c}" d="M0 0h640v480H0z"/></svg>`;

const CATALOGUE: Record<string, { label?: string; iso6393Code: string; languageCountry?: string[] }> = {
  [NOR]: { label: "Norwegian", iso6393Code: "nor", languageCountry: [NORWAY] },
  [ENG]: { label: "English", iso6393Code: "eng", languageCountry: [UK, USA] },
  [POR]: { label: "Portuguese", iso6393Code: "por" },
  [NOLABEL]: { iso6393Code: "nor", languageCountry: [NORWAY] },
};
const FLAGS: Record<string, { code: string; svg: string }> = {
  "flag-osm-r-2978650": { code: "no", svg: SVG("#ed2939") },
  "flag-osm-r-62149": { code: "gb", svg: SVG("#012169") },
  "flag-osm-r-52822": { code: "se", svg: SVG("#006aa7") },
};

let calls: { url: string; method: string }[] = [];
let entryStatus = 200;
let entryHold: Promise<void> | null = null;

function install() {
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    const json = (p: unknown, status = 200) => new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/json" } });
    const flag = /^https:\/\/geo\.example\.test\/(base\/e|files)\/(flag-[a-z0-9-]+)$/.exec(url);
    if (flag) {
      const hit = FLAGS[flag[2]!];
      if (!hit) return new Response("no", { status: 404 });
      return flag[1] === "files" ? new Response(hit.svg, { status: 200, headers: { "content-type": "image/svg+xml" } }) : json({ fileTag: ["flag", hit.code] });
    }
    if (url.startsWith("https://geo.example.test/")) return json({ "@id": url, "@type": "t:Country", label: "a country entity: never asked for" });
    if (CATALOGUE[url]) {
      if (entryHold) await entryHold;
      if (entryStatus !== 200) return new Response("down", { status: entryStatus });
      const d = CATALOGUE[url]!;
      return json({ "@id": url, ...(d.label ? { label: d.label } : {}), iso6393Code: d.iso6393Code, ...(d.languageCountry ? { languageCountry: d.languageCountry.map((c) => ({ "@id": c })) } : {}) });
    }
    return json({}, 404);
  });
  vi.stubGlobal("fetch", f);
  setFlagSource(geoFlagSource({ fetchFn: f as unknown as typeof fetch }));
}

beforeEach(() => {
  calls = [];
  entryStatus = 200;
  entryHold = null;
  __resetLanguageEntries();
  __resetFetchPool();
  __resetFlags();
  setFlagStore(null);
  install();
});
afterEach(() => {
  cleanup();
  setFlagSource(null);
  setFlagStore(null);
  vi.unstubAllGlobals();
});

const state = () => screen.getByTestId("language-row").getAttribute("data-language-state");
const flagState = () => screen.getByTestId("flag-image").getAttribute("data-flag-state");
const text = () => screen.getByTestId("language-row").textContent ?? "";
const noAddress = (s: string) => {
  expect(s).not.toContain("://");
  expect(s).not.toContain("/base/e/");
};

describe("the name", () => {
  it("shows the entry's own name, once read", async () => {
    render(<LanguageRow language={NOR} />);
    await waitFor(() => expect(screen.getByTestId("language-row-name").textContent).toBe("Norwegian"));
    expect(state()).toBe("read");
  });
  it("N-d: the text never holds an address, while reading, once read, and when the read failed", async () => {
    let release: () => void = () => undefined;
    entryHold = new Promise<void>((r) => (release = r));
    const { unmount } = render(<LanguageRow language={NOR} />);
    expect(state()).toBe("reading");
    expect(text()).toBe(LANGUAGE_READING_TEXT);
    noAddress(text());
    release();
    await waitFor(() => expect(state()).toBe("read"));
    noAddress(text());
    unmount();
    __resetLanguageEntries();
    entryHold = null;
    entryStatus = 503;
    render(<LanguageRow language={ENG} />);
    await waitFor(() => expect(state()).toBe("failed"));
    expect(text()).toBe(LANGUAGE_UNNAMED_TEXT);
    noAddress(text());
  });
  it("N-d: an entry with no name of its own is 'A language', not the last part of its address", async () => {
    render(<LanguageRow language={NOLABEL} />);
    await waitFor(() => expect(state()).toBe("failed"));
    expect(text()).toBe(LANGUAGE_UNNAMED_TEXT);
    expect(text()).not.toContain("nolabel00001");
    await new Promise((r) => setTimeout(r, 30));
    expect(flagState()).toBe("globe");
    expect(calls.filter((c) => c.url.includes("geo.example.test"))).toEqual([]);
  });
  it("a value that is not an address is shown as the text it is, with no read", () => {
    render(<LanguageRow language="Norwegian" />);
    expect(state()).toBe("text");
    expect(screen.getByTestId("language-row-name").textContent).toBe("Norwegian");
    expect(calls).toEqual([]);
  });
  it("languageNameOf: a label, not a blank, not an address, not the address tail", () => {
    expect(languageNameOf({ uri: NOR, label: "Norwegian" })).toBe("Norwegian");
    expect(languageNameOf({ uri: NOR, label: "  " })).toBeNull();
    expect(languageNameOf({ uri: NOR, label: "https://x.example.test/a" })).toBeNull();
    expect(languageNameOf({ uri: NOR, label: "xja6zz79cmva" })).toBeNull();
  });
});

describe("the flag", () => {
  it("N-b: a language with exactly one country shows that country's flag", async () => {
    render(<LanguageRow language={NOR} />);
    await waitFor(() => expect(flagState()).toBe("flag"));
    expect(screen.getByRole("img", { name: "Flag of Norway" }).getAttribute("data-flag-country")).toBe(NORWAY);
  });
  it("N-c: a language with no country shows the globe", async () => {
    render(<LanguageRow language={POR} />);
    await waitFor(() => expect(state()).toBe("read"));
    expect(flagState()).toBe("globe");
    expect(calls.filter((c) => c.url.includes("geo.example.test"))).toEqual([]);
  });
  it("N-c: a language in two countries shows the globe, and asks for no flag", async () => {
    render(<LanguageRow language={ENG} />);
    await waitFor(() => expect(state()).toBe("read"));
    expect(flagState()).toBe("globe");
    expect(calls.filter((c) => c.url.includes("geo.example.test"))).toEqual([]);
  });
  it("N-a: the country given with the language wins over the entry's countries", async () => {
    render(<LanguageRow language={ENG} flagCountry={SWEDEN} />);
    await waitFor(() => expect(flagState()).toBe("flag"));
    expect(screen.getByRole("img", { name: "Flag of Sweden" }).getAttribute("data-flag-country")).toBe(SWEDEN);
  });
  it("N-a: the country given wins also over the one country of the entry", async () => {
    render(<LanguageRow language={NOR} flagCountry={UK} />);
    await waitFor(() => expect(flagState()).toBe("flag"));
    expect(screen.getByRole("img", { name: "Flag of United Kingdom" }).getAttribute("data-flag-country")).toBe(UK);
  });
  it("a country whose flag the catalogue does not hold shows the globe, and says nothing", async () => {
    render(<LanguageRow language={ENG} flagCountry={USA} />);
    await waitFor(() => expect(state()).toBe("read"));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/files/flag-osm-r-148838"))).toBe(true));
    expect(flagState()).toBe("globe");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("while the entry is read, and when it fails, the flag is the globe even if a country was given", async () => {
    entryStatus = 503;
    render(<LanguageRow language={NOR} flagCountry={SWEDEN} />);
    expect(flagState()).toBe("globe");
    await waitFor(() => expect(state()).toBe("failed"));
    expect(flagState()).toBe("globe");
  });
});

describe("what it asks for", () => {
  it("N-e: only the entry, and the two small flag files of a country: never a country entity", async () => {
    render(<LanguageRow language={NOR} />);
    await waitFor(() => expect(flagState()).toBe("flag"));
    cleanup();
    __resetLanguageEntries();
    render(<LanguageRow language={ENG} flagCountry={UK} />);
    await waitFor(() => expect(flagState()).toBe("flag"));
    expect(calls.length).toBeGreaterThan(0);
    for (const { url } of calls) {
      const ok = url === NOR || url === ENG || /^https:\/\/geo\.example\.test\/(files|base\/e)\/flag-osm-r-\d+$/.test(url);
      expect(ok, `asked for ${url}`).toBe(true);
    }
    for (const country of [NORWAY, UK, USA, SWEDEN]) expect(calls.map((c) => c.url)).not.toContain(country);
  });
  it("N-g: it makes no request but GET", async () => {
    render(<LanguageRow language={NOR} />);
    await waitFor(() => expect(flagState()).toBe("flag"));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });
  it("two rows of one language read the entry once", async () => {
    render(
      <>
        <LanguageRow language={NOR} />
        <LanguageRow language={NOR} />
      </>,
    );
    await waitFor(() => expect(screen.getAllByTestId("language-row-name").map((n) => n.textContent)).toEqual(["Norwegian", "Norwegian"]));
    expect(calls.filter((c) => c.url === NOR)).toHaveLength(1);
  });
});
