// @vitest-environment jsdom
// New. How the typed text is matched: prefix by default (the last word may be the start of a word), word on request, and a catalogue that
// refuses the parameter is asked again as text. Over the test world's fetch double, which records every request.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlacePicker } from "./index";
import { GEO, calls, fetchDouble, setCatalogueMode, useWorld } from "../test/world";

useWorld();
afterEach(cleanup);
beforeEach(() => setCatalogueMode("cities-live"));

const searches = () => calls.filter((c) => c.url.includes("/base/search")).map((c) => new URL(c.url).searchParams);

function type(value: string, props: Partial<React.ComponentProps<typeof PlacePicker>> = {}) {
  render(<PlacePicker rung="country" label="Country" value={null} onPick={() => {}} onClear={() => {}} {...props} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
}
const waitForSearch = () => waitFor(() => expect(searches().length).toBeGreaterThan(0));

describe("searchMode", () => {
  it("by default a query whose last word has two letters or more is asked with match=prefix", async () => {
    type("Nor");
    await waitForSearch();
    expect(searches().every((p) => p.get("match") === "prefix")).toBe(true);
  });

  it("a query whose last word is one letter is asked as text, with no match parameter", async () => {
    type("New Y");
    await waitForSearch();
    expect(searches().every((p) => p.get("match") === null)).toBe(true);
  });

  it("searchMode word never sends match", async () => {
    type("Nor", { searchMode: "word" });
    await waitForSearch();
    expect(searches().every((p) => p.get("match") === null)).toBe(true);
  });

  it("a catalogue that refuses the parameter (400) is asked again as text, and the answer is listed", async () => {
    const base = fetchDouble();
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      if (String(input).includes("match=prefix")) {
        calls.push({ method: "GET", url: String(input), credentials: init?.credentials, body: undefined });
        return new Response("querystring must NOT have additional properties", { status: 400 });
      }
      return base(input, init);
    }));
    type("Norway");
    expect(await screen.findByText("Norway")).toBeTruthy();
    const ps = searches();
    expect(ps.some((p) => p.get("match") === "prefix")).toBe(true);
    expect(ps.some((p) => p.get("match") === null)).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("any other failure of a prefix search is still the fixed sentence, not a retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => (String(input).includes("/base/search") ? new Response("down", { status: 502 }) : fetchDouble()(input))));
    type("Norway");
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not be searched right now/);
  });

  it("the word 'GEO' stays out of the way: a pick still calls onPick with the row", async () => {
    const onPick = vi.fn();
    type("Norway", { onPick });
    fireEvent.click(await screen.findByRole("option"));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: `${GEO}/no`, label: "Norway" })));
  });
});
