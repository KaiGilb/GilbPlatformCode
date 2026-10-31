// @vitest-environment jsdom
// New. The source has no test of this component of its own (its flag cases are in the held languages section's tests, which are
// not in this unit). Pins the globe fallback, the flag, its accessible name, and that the read is the flag unit's only.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { __resetFlags, setFlagSource, setFlagStore, type CountryFlag } from "@kaigilb/gilbplatformcode-flag-source";
import { FlagImage, Globe } from "./index";

const NORWAY = "https://geo.example.test/base/e/osm-r-2978650";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#ed2939" d="M0 0h640v480H0z"/></svg>';
let reads: string[] = [];
function source(answer: (c: string) => CountryFlag | null | Error) {
  setFlagSource({
    read: async (country) => {
      reads.push(country);
      const a = answer(country);
      if (a instanceof Error) throw a;
      return a;
    },
  });
}

beforeEach(() => {
  reads = [];
  __resetFlags();
  setFlagStore(null);
});
afterEach(() => {
  cleanup();
  setFlagSource(null);
  setFlagStore(null);
});

describe("FlagImage", () => {
  it("no country: the globe, and no read", () => {
    source(() => ({ svg: SVG, code: "no" }));
    render(<FlagImage country={null} />);
    expect(screen.getByTestId("flag-image").getAttribute("data-flag-state")).toBe("globe");
    expect(reads).toEqual([]);
  });
  it("a country with a flag: the flag as an image, named by the ISO code", async () => {
    source(() => ({ svg: SVG, code: "no" }));
    render(<FlagImage country={NORWAY} />);
    await waitFor(() => expect(screen.getByTestId("flag-image").getAttribute("data-flag-state")).toBe("flag"));
    const img = screen.getByRole("img", { name: "Flag of Norway" });
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(img.getAttribute("data-flag-country")).toBe(NORWAY);
  });
  it("a flag with no ISO code is just named Flag", async () => {
    source(() => ({ svg: SVG, code: null }));
    render(<FlagImage country={NORWAY} />);
    expect(await screen.findByRole("img", { name: "Flag" })).toBeTruthy();
  });
  it("while the flag is being read, and when the country holds none, it is the globe", async () => {
    source(() => null);
    render(<FlagImage country={NORWAY} />);
    expect(screen.getByTestId("flag-image").getAttribute("data-flag-state")).toBe("globe");
    await waitFor(() => expect(reads).toEqual([NORWAY]));
    expect(screen.getByTestId("flag-image").getAttribute("data-flag-state")).toBe("globe");
  });
  it("a read that fails is the globe and says nothing", async () => {
    source(() => new Error("down"));
    render(<FlagImage country={NORWAY} />);
    await waitFor(() => expect(reads).toEqual([NORWAY]));
    expect(screen.getByTestId("flag-image").getAttribute("data-flag-state")).toBe("globe");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("the globe is decoration: hidden from a screen reader, and takes the class given", () => {
    render(<Globe className="mt-1" />);
    const g = screen.getByTestId("flag-image");
    expect(g.getAttribute("aria-hidden")).toBe("true");
    expect(g.getAttribute("class")).toContain("mt-1");
  });
  it("changing the country draws the new country's flag, not the old one's", async () => {
    const SWEDEN = "https://geo.example.test/base/e/osm-r-52822";
    let releaseSweden: () => void = () => undefined;
    const swedenHeld = new Promise<void>((r) => (releaseSweden = r));
    setFlagSource({
      read: async (c) => {
        if (c === SWEDEN) await swedenHeld;
        return { svg: SVG, code: c === NORWAY ? "no" : "se" };
      },
    });
    const { rerender } = render(<FlagImage country={NORWAY} />);
    await screen.findByRole("img", { name: "Flag of Norway" });
    rerender(<FlagImage country={SWEDEN} />);
    // while Sweden's flag is read, Norway's is not shown for it
    expect(screen.queryByRole("img", { name: "Flag of Norway" })).toBeNull();
    expect(screen.getByTestId("flag-image").getAttribute("data-flag-state")).toBe("globe");
    releaseSweden();
    expect(await screen.findByRole("img", { name: "Flag of Sweden" })).toBeTruthy();
  });
  it("an answer that arrives after the country changed is dropped", async () => {
    const SWEDEN = "https://geo.example.test/base/e/osm-r-52822";
    let releaseNorway: () => void = () => undefined;
    const norwayHeld = new Promise<void>((r) => (releaseNorway = r));
    setFlagSource({
      read: async (c) => {
        if (c === NORWAY) await norwayHeld;
        return { svg: SVG, code: c === NORWAY ? "no" : "se" };
      },
    });
    const { rerender } = render(<FlagImage country={NORWAY} />);
    rerender(<FlagImage country={SWEDEN} />);
    await screen.findByRole("img", { name: "Flag of Sweden" });
    releaseNorway();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole("img", { name: "Flag of Sweden" })).toBeTruthy();
  });
});
