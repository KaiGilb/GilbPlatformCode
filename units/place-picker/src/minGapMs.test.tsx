// @vitest-environment jsdom
// New (0.1.2). `minGapMs`: the least time between the start of one catalogue search and the next. Fake timers, no real waiting; the catalogue
// is geo-catalogue's own fake (`/fake`), plugged in where `fetch` is, as the real one is.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { fakeGeo } from "@kaigilb/gilbplatformcode-geo-catalogue/fake";
import { PlacePicker } from "./index";
import { __resetPlaceSearchGap } from "./PlacePicker";
import { useWorld } from "../test/world";

useWorld();

let searchAddresses: string[] = [];
/** Held answers: a search whose `q` is a key waits for its release before it answers. */
let held = new Map<string, () => void>();
const isSearch = (u: string) => u.includes("/base/search");
const searches = () => searchAddresses.filter(isSearch).map((u) => new URL(u).searchParams.get("q"));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  __resetPlaceSearchGap();
  searchAddresses = [];
  held = new Map();
  const fake = fakeGeo();
  const real = fake.fetch(vi.fn() as unknown as typeof fetch);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      searchAddresses.push(url);
      const q = new URL(url).searchParams.get("q");
      if (isSearch(url) && q && held.has(`hold:${q}`)) await new Promise<void>((r) => held.set(q, r));
      return real(input, init);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(props: Partial<React.ComponentProps<typeof PlacePicker>> = {}) {
  render(<PlacePicker rung="country" label="Country" value={null} onPick={() => {}} onClear={() => {}} searchMode="prefix" {...props} />);
}
const typeText = (value: string) => fireEvent.change(screen.getByRole("combobox"), { target: { value } });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("minGapMs", () => {
  it("default 0: the second search starts after the usual wait, as before", async () => {
    mount();
    typeText("Nor");
    await advance(139);
    expect(searches()).toEqual([]);
    await advance(1);
    expect(searches().length).toBeGreaterThan(0);
    const first = searches().length;
    typeText("Norw");
    await advance(140);
    expect(searches().length).toBeGreaterThan(first);
    expect(searches().slice(first).every((q) => q === "Norw")).toBe(true);
  });

  it("minGapMs 300: a second search is held until 300 ms after the first one started", async () => {
    mount({ minGapMs: 300 });
    typeText("Nor");
    await advance(140); // the first search starts at +140
    const first = searches().length;
    expect(first).toBeGreaterThan(0);
    typeText("Norw");
    await advance(299); // +299 after the first start: still waiting (the usual wait alone would have fired at +140)
    expect(searches().length).toBe(first);
    await advance(1);
    expect(searches().length).toBeGreaterThan(first);
    expect(searches().slice(first).every((q) => q === "Norw")).toBe(true);
  });

  it("a gap already over costs nothing: the usual wait still applies, no more", async () => {
    mount({ minGapMs: 300 });
    typeText("Nor");
    await advance(140);
    const first = searches().length;
    await advance(1000);
    typeText("Norw");
    await advance(139);
    expect(searches().length).toBe(first);
    await advance(1);
    expect(searches().length).toBeGreaterThan(first);
  });

  it("the newest text wins: a search still waiting for its turn is dropped when the text changes", async () => {
    mount({ minGapMs: 300 });
    typeText("Nor");
    await advance(140);
    const first = searches().length;
    typeText("Norw"); // waiting for its turn (fires at +300)
    await advance(150); // without the gap it would have started at +140
    typeText("Norwa"); // replaces it
    await advance(1000);
    const later = searches().slice(first);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((q) => q === "Norwa")).toBe(true);
  });

  it("a stale answer is dropped: the older text's late answer is never shown", async () => {
    held.set("hold:Jap", () => {});
    mount(); // no gap: the staleness rule holds with or without one
    typeText("Jap");
    await advance(140); // "Jap" is asked and its answer is held
    expect(searches()).toContain("Jap");
    typeText("Nor");
    await advance(500); // "Nor" is asked and answered
    expect(screen.getByText("Norway")).toBeTruthy();
    await act(async () => {
      held.get("Jap")?.(); // the old answer arrives late
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.queryByText("Japan")).toBeNull();
    expect(screen.getByText("Norway")).toBeTruthy();
  });
});
