// @vitest-environment jsdom
// New. No test of the source exercises the chooser alone (its cases are in the languages section's tests, which are in `language-section`),
// and none reaches the country search. These pin the short list, the names, "No flag", and the `renderCountrySearch` slot (STOP-3):
// ABSENT, there is no "Another country…" button and no search; PRESENT, it is mounted with an `onPick` whose pick is the chooser's pick.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { __resetFlags, setFlagSource, setFlagStore } from "@kaigilb/gilbplatformcode-flag-source";
import type { LanguageEntryInfo } from "@kaigilb/gilbplatformcode-language-entry";
import { FlagChooser } from "./index";

const NO = "https://geo.example.test/base/e/osm-r-2978650";
const SE = "https://geo.example.test/base/e/osm-r-52822";
const FI = "https://geo.example.test/base/e/osm-r-54224";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#ed2939" d="M0 0h640v480H0z"/></svg>';
const CODES: Record<string, string> = { [NO]: "no", [SE]: "se" };
let reads: string[] = [];

beforeEach(() => {
  reads = [];
  __resetFlags();
  setFlagStore(null);
  setFlagSource({
    read: async (country) => {
      reads.push(country);
      const code = CODES[country];
      return code ? { svg: SVG, code } : null;
    },
  });
});
afterEach(() => {
  cleanup();
  setFlagSource(null);
  setFlagStore(null);
});

const info = (countries: string[]): LanguageEntryInfo => ({ uri: "https://veda.example.test/base/e/x", label: "Swedish", tag: "sv", code: "swe", countries });
const many = Array.from({ length: 13 }, (_, i) => `https://geo.example.test/base/e/osm-r-${100 + i}`);
const base = () => ({ languageName: "Swedish", current: null as string | null, onPick: vi.fn(), onClose: vi.fn() });

describe("the short list", () => {
  it("lists the countries the entry names, each by its flag and name, and a pick hands the country on", async () => {
    const p = base();
    render(<FlagChooser {...p} info={info([NO, SE])} />);
    const rows = screen.getAllByTestId("flag-choice");
    expect(rows).toHaveLength(2);
    expect(await screen.findByRole("button", { name: "Use the flag of Norway" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use the flag of Sweden" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use the flag of Sweden" }));
    expect(p.onPick).toHaveBeenCalledWith(SE);
  });
  it("marks the flag shown now as pressed", () => {
    render(<FlagChooser {...base()} current={SE} info={info([NO, SE])} />);
    const [a, b] = screen.getAllByTestId("flag-choice");
    expect(a!.getAttribute("aria-pressed")).toBe("false");
    expect(b!.getAttribute("aria-pressed")).toBe("true");
  });
  it("a country with no flag file is named by its local id, never by reading the country entity", async () => {
    render(<FlagChooser {...base()} info={info([FI])} />);
    expect(await screen.findByRole("button", { name: "Use the flag of osm-r-54224" })).toBeTruthy();
    expect(reads).toEqual([FI]);
  });
  it("names the group for the language", () => {
    render(<FlagChooser {...base()} info={info([NO])} />);
    expect(screen.getByRole("group", { name: "Choose a flag for Swedish" })).toBeTruthy();
  });
});

describe("No flag and Cancel", () => {
  it("'No flag (globe)' hands null on; Cancel closes", () => {
    const p = base();
    render(<FlagChooser {...p} info={info([NO])} />);
    fireEvent.click(screen.getByTestId("flag-none"));
    expect(p.onPick).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("the country search slot (STOP-3): renderCountrySearch ABSENT", () => {
  it("one or two countries: no 'Another country…' button, no search; the short list and 'No flag' stay", () => {
    render(<FlagChooser {...base()} info={info([NO, SE])} />);
    expect(screen.queryByTestId("flag-another")).toBeNull();
    expect(screen.queryByText("Another country…")).toBeNull();
    expect(screen.getAllByTestId("flag-choice")).toHaveLength(2);
    expect(screen.getByTestId("flag-none")).toBeTruthy();
  });
  it("no country, or more than twelve: no search either, only 'No flag' and Cancel", () => {
    for (const countries of [[], many]) {
      cleanup();
      render(<FlagChooser {...base()} info={info(countries)} />);
      expect(screen.queryByTestId("flag-another")).toBeNull();
      expect(screen.queryAllByTestId("flag-choice")).toHaveLength(0);
      expect(screen.queryByTestId("country-search")).toBeNull();
      expect(screen.getByTestId("flag-none")).toBeTruthy();
    }
  });
  it("the entry not yet read: no search and no button", () => {
    render(<FlagChooser {...base()} info={undefined} />);
    expect(screen.queryByTestId("flag-another")).toBeNull();
    expect(screen.getByTestId("flag-none")).toBeTruthy();
  });
});

describe("the country search slot (STOP-3): renderCountrySearch PRESENT", () => {
  const slot = vi.fn((p: { onPick(country: string): void }) => (
    <button type="button" data-testid="country-search" onClick={() => p.onPick(FI)}>search</button>
  ));
  beforeEach(() => slot.mockClear());

  it("with a short list: 'Another country…' is offered, and the search is not mounted until it is asked for", () => {
    render(<FlagChooser {...base()} info={info([NO, SE])} renderCountrySearch={slot} />);
    expect(screen.getByTestId("flag-another").textContent).toBe("Another country…");
    expect(screen.queryByTestId("country-search")).toBeNull();
    expect(slot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("flag-another"));
    expect(screen.getByTestId("country-search")).toBeTruthy();
    expect(screen.queryByTestId("flag-another")).toBeNull();
  });
  it("the pick of the slot is the chooser's pick", () => {
    const p = base();
    render(<FlagChooser {...p} info={info([NO])} renderCountrySearch={slot} />);
    fireEvent.click(screen.getByTestId("flag-another"));
    fireEvent.click(screen.getByTestId("country-search"));
    expect(p.onPick).toHaveBeenCalledTimes(1);
    expect(p.onPick).toHaveBeenCalledWith(FI);
  });
  it("an entry that names no country, or more than twelve, shows the search at once", () => {
    for (const countries of [[], many]) {
      cleanup();
      render(<FlagChooser {...base()} info={info(countries)} renderCountrySearch={slot} />);
      expect(screen.getByTestId("country-search")).toBeTruthy();
      expect(screen.queryByTestId("flag-another")).toBeNull();
    }
  });
  it("the entry not yet read: the button, not the search", () => {
    render(<FlagChooser {...base()} info={undefined} renderCountrySearch={slot} />);
    expect(screen.getByTestId("flag-another")).toBeTruthy();
    expect(screen.queryByTestId("country-search")).toBeNull();
  });
});

describe("what is read", () => {
  it("only the flags of the listed countries; the thirteen-country list reads none", async () => {
    render(<FlagChooser {...base()} info={info(many)} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(reads).toEqual([]);
  });
});
