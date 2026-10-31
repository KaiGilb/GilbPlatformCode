// @vitest-environment jsdom
// New. What the box says when it does not know, and what it never says: the decisions of the H15e plan (F13, F14, F15, the failed search) and the
// behaviours the mutants of the plan pin (M28, M29). GilbApp's box said "No match" for an answer that left matches out, wrote an id tail on a row,
// and drew `String(e)` for an error it did not know. Every file ends with the world's proof that nothing but a GET was ever sent to the catalogue.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { resetGeoOrigin } from "@kaigilb/gilbplatformcode-geo-origin";
import { PlacePicker } from "./index";
import { GEO, GEO_ORIGIN, calls, callsTo, fetchDouble, setCatalogueMode, useWorld } from "../test/world";

useWorld();
afterEach(cleanup);
beforeEach(() => setCatalogueMode("cities-live"));

/** Every string a person or a screen reader can get from the box: text, names, titles, placeholders, values. NOT `data-*` attributes. */
function readable(root: HTMLElement = document.body): string {
  const out: string[] = [root.textContent ?? ""];
  root.querySelectorAll<HTMLElement>("*").forEach((e) => {
    for (const a of ["aria-label", "aria-description", "title", "placeholder", "alt"]) {
      const v = e.getAttribute(a);
      if (v) out.push(v);
    }
    if (e instanceof HTMLInputElement) out.push(e.value);
  });
  return out.join("\n");
}
/** An address, a host, an id tail of the fake catalogue's rows, or the old "entry <tail>" line. */
const NO_ADDRESS = /https?:|\/base\/e\/|oslo-township|oslo-admin|oslo-kommune|ny-admin|york-city|uk-region|deep-region|deepcity|manchester\b.*entry|\bentry\b|@evil/;
const UNPLACED = "Some matches could not be placed in a country, so they are not listed.";

function type(value: string, props: Partial<React.ComponentProps<typeof PlacePicker>> = {}) {
  render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} {...props} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
}

describe("(F13) a partial answer is never drawn as 'no match'", () => {
  it("a country is chosen and the only match has no recorded country: the box says some matches could not be placed, not 'No city matches'", async () => {
    // Pinned to the United Kingdom: Oslo (Norway) is another country; "Oslo kommune" has no container, so no country can be found for it.
    type("Oslo", { restrictToCountryId: `${GEO}/uk` });
    const note = await screen.findByTestId("place-city-partial-note");
    expect(note.textContent).toContain(UNPLACED);
    expect(note.textContent).toMatch(/not a statement that the place does not exist/);
    expect(readable()).not.toMatch(/No city matches|Try another spelling/);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("matches are listed and one was left out for want of a country: the list says so under it", async () => {
    type("Oslo", { restrictToCountryId: `${GEO}/no` });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    expect((await screen.findByTestId("place-city-unplaced-note")).textContent).toBe(UNPLACED);
    // The listed rows are the ones in Norway: neither the township in the United States nor the kommune with no container.
    const names = screen.getAllByRole("option").map((o) => o.querySelector("span")!.textContent);
    expect(names).toEqual(["Oslo", "Oslo"]);
  });

  it("control: every match placed, none left out, no note", async () => {
    type("Bergen", { restrictToCountryId: `${GEO}/no` });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("place-city-unplaced-note")).toBeNull();
    expect(readable()).not.toContain(UNPLACED);
  });

  it("control: no country is chosen, so nothing can be 'unplaced' and no such note is made up", async () => {
    type("Oslo");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
    expect(screen.queryByTestId("place-city-unplaced-note")).toBeNull();
  });

  it("(capped) an answer the catalogue cut short and that listed nothing says it could not check every match", async () => {
    setCatalogueMode("truncated-empty");
    type("oblast");
    const note = await screen.findByTestId("place-city-partial-note");
    expect(note.textContent).toMatch(/Could not check every match for “oblast”/);
    expect(readable()).not.toMatch(/No city matches/);
  });

  it("a complete answer with nothing in it does say 'No city matches', the one place that sentence is true", async () => {
    type("zzqqnothing");
    await waitFor(() => expect(screen.getByText(/No city matches “zzqqnothing”/)).toBeTruthy());
    expect(screen.queryByTestId("place-city-partial-note")).toBeNull();
  });
});

describe("(F14) no address, id tail or host is readable anywhere, in any state", () => {
  it("idle, keep typing, searching, the list with its second lines, a picked and bound value, the edit of it", async () => {
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    expect(readable()).not.toMatch(NO_ADDRESS);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "O" } });
    expect(readable()).not.toMatch(NO_ADDRESS);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Oslo" } });
    expect(readable()).not.toMatch(NO_ADDRESS);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
    // Wait for every second line to be learned: the kinds and containers, then the position words of the two rows with one name.
    await waitFor(() => expect(screen.getAllByRole("option").every((o) => /municipality|region/.test(o.textContent ?? ""))).toBe(true));
    await waitFor(() => expect(screen.getAllByRole("option").some((o) => /in Norway/.test(o.textContent ?? ""))).toBe(true));
    expect(readable()).not.toMatch(NO_ADDRESS);
  });

  it("a bound value and its edit: the name, the accessible name and the box show the label, and the id is only in a data attribute", () => {
    const place = { id: `${GEO}/oslo-admin`, label: "Oslo", type: "GeoAdminArea", memberOf: [] as string[] };
    render(<PlacePicker rung="region" label="Region" value={place} onPick={() => {}} onClear={() => {}} />);
    expect(readable()).not.toMatch(NO_ADDRESS);
    expect(screen.getByTestId("place-region-value").getAttribute("data-place-id")).toBe(place.id);
    fireEvent.click(screen.getByTestId("place-region-value"));
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Oslo");
    expect(readable()).not.toMatch(NO_ADDRESS);
  });

  it("two rows with one name are told apart by a position word, not by the end of their address", async () => {
    type("Oslo");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
    await waitFor(() => expect(screen.getAllByRole("option").every((o) => /municipality|region/.test(o.textContent ?? ""))).toBe(true));
    const lines = screen.getAllByRole("option").map((o) => `${o.querySelector("span")!.textContent} | ${o.querySelector('[data-testid="place-option-lands"]')!.textContent}`);
    expect(new Set(lines).size).toBe(4);
    expect(lines.join("\n")).not.toMatch(NO_ADDRESS);
  });
});

describe("(F15) a search that fails or is refused says one fixed sentence", () => {
  const SENTENCE = "The place catalogue could not be searched right now. This is not a statement that the place does not exist.";
  function failSearchWith(make: () => Response | Promise<Response>) {
    const inner = fetchDouble();
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => (String(input).includes("/base/search") ? make() : inner(input, init))));
  }

  it("a 502 from the search: the sentence, no status, no server text, nothing about 'No match'; the detail goes to the console", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    failSearchWith(() => new Response("upstream melted: stack trace at https://geo.example.test/internal", { status: 502 }));
    type("Oslo");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(SENTENCE);
    expect(readable()).not.toMatch(/502|melted|stack|https?:|No city matches|Try another spelling/);
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls.flat().map(String).join(" ")).toMatch(/502|melted|catalogue/);
    log.mockRestore();
  });

  it("a request that throws: the sentence, and not the thrown text", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    failSearchWith(() => {
      throw new TypeError("boom at https://secret.example.test/x");
    });
    type("Oslo");
    expect((await screen.findByRole("alert")).textContent).toBe(SENTENCE);
    expect(readable()).not.toMatch(/boom|secret|TypeError|https?:/);
    log.mockRestore();
  });

  it("the catalogue's address is not set, so the fence refuses: the same sentence, and no request reached the catalogue", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    resetGeoOrigin();
    calls.length = 0;
    type("Oslo");
    expect((await screen.findByRole("alert")).textContent).toBe(SENTENCE);
    expect(callsTo(GEO_ORIGIN)).toEqual([]);
    expect(readable()).not.toMatch(/No city matches|Try another spelling/);
    log.mockRestore();
  });

  it("a failed search is not a stuck box: the next key searches again and lists", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let failing = true;
    const inner = fetchDouble();
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => (failing && String(input).includes("/base/search") ? new Response("x", { status: 503 }) : inner(input, init))));
    type("Oslo");
    await screen.findByRole("alert");
    failing = false;
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Bergen" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));
    expect(screen.queryByRole("alert")).toBeNull();
    log.mockRestore();
  });
});

describe("(M28) the box waits for the pick", () => {
  it("while the pick is being committed the rows are disabled and the query stays; when it lands the box clears", async () => {
    let release!: () => void;
    const onPick = vi.fn(() => new Promise<void>((r) => { release = r; }));
    type("Oslo", { onPick });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
    fireEvent.click(screen.getAllByRole("option")[0]!);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect((screen.getAllByRole("option")[0] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Oslo");
    await act(async () => { release(); });
    await waitFor(() => expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe(""));
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("a pick that fails leaves the query and the rows' box in place with the reason (the thrown text is not it)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    type("Oslo", { onPick: async () => { throw new Error("nope"); } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
    fireEvent.click(screen.getAllByRole("option")[0]!);
    await screen.findByRole("alert");
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Oslo");
    log.mockRestore();
  });
});

describe("(M29) a newer key aborts the older search, and an older answer never replaces a newer one", () => {
  it("the slow answer for 'Oslo' arrives after 'Bergen' was listed and is not drawn", async () => {
    const inner = fetchDouble();
    const held: Array<() => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        const res = await inner(input, init);
        if (url.includes("/base/search") && url.includes("q=Oslo")) await new Promise<void>((r) => held.push(r));
        return res;
      }),
    );
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "Oslo" } });
    await waitFor(() => expect(held.length).toBeGreaterThan(0));
    fireEvent.change(box, { target: { value: "Bergen" } });
    await waitFor(() => expect(screen.getAllByRole("option").map((o) => o.querySelector("span")!.textContent)).toContain("Bergen"));
    await act(async () => { held.forEach((r) => r()); await new Promise((r) => setTimeout(r, 60)); });
    const names = screen.getAllByRole("option").map((o) => o.querySelector("span")!.textContent);
    expect(names.every((n) => n?.startsWith("Bergen") || n === "Town of Bergen")).toBe(true);
    expect(names).not.toContain("Oslo");
  });
});

describe("the states in words", () => {
  it("idle, keep typing, searching", async () => {
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    expect(screen.getByText(/Type to search/)).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "O" } });
    expect(screen.getByText("Keep typing…")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Oslo" } });
    expect(screen.getByText("Searching the place catalogue…")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
  });

  it("(M-pin) a pinned country is said in the placeholder, and the country box is not narrowed by itself", () => {
    const { unmount } = render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} restrictToCountryId={`${GEO}/no`} />);
    expect(screen.getByRole("combobox").getAttribute("placeholder")).toBe("Search city in the chosen country…");
    unmount();
    render(<PlacePicker rung="country" label="Country" value={null} onPick={() => {}} onClear={() => {}} restrictToCountryId={`${GEO}/no`} />);
    expect(screen.getByRole("combobox").getAttribute("placeholder")).toBe("Search the place catalogue for a country…");
  });
});

describe("the box as a control (what the first mutants of the plan left unpinned)", () => {
  const BOUND = { id: `${GEO}/manchester`, label: "Manchester", type: "City", memberOf: [] as string[] };
  const searches = () => calls.filter((c) => c.url.includes("/base/search"));

  it("the catalogue is not asked until the typing pauses, and only for the last text", async () => {
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "Os" } });
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    fireEvent.change(box, { target: { value: "Oslo" } });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(searches()).toEqual([]);
    await waitFor(() => expect(searches().length).toBeGreaterThan(0));
    expect(searches().every((c) => new URL(c.url).searchParams.get("q") === "Oslo")).toBe(true);
  });

  it("a change of the chosen country searches again for the text that is still there", async () => {
    const { rerender } = render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Oslo" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
    rerender(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} restrictToCountryId={`${GEO}/uk`} />);
    await waitFor(() => expect(screen.queryAllByRole("option")).toHaveLength(0));
    expect((await screen.findByTestId("place-city-partial-note")).textContent).toContain(UNPLACED);
  });

  it("the access pill keeps its place on the bound row and while the box is searched", () => {
    const pill = <span data-testid="pill">private</span>;
    render(<PlacePicker rung="city" label="City" value={BOUND} onPick={() => {}} onClear={() => {}} rungPill={pill} />);
    expect(screen.getByTestId("pill")).toBeTruthy();
    fireEvent.click(screen.getByTestId("place-city-value"));
    expect(screen.getByTestId("pill")).toBeTruthy();
  });

  it("Escape closes the edit and keeps the place, and clears nothing", () => {
    const onClear = vi.fn();
    render(<PlacePicker rung="city" label="City" value={BOUND} onPick={() => {}} onClear={onClear} />);
    fireEvent.click(screen.getByTestId("place-city-value"));
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.getByTestId("place-city-value").textContent).toBe("Manchester");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("the box says whether a list is open", async () => {
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    const box = screen.getByRole("combobox");
    expect(box.getAttribute("aria-expanded")).toBe("false");
    fireEvent.change(box, { target: { value: "Oslo" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
    expect(box.getAttribute("aria-expanded")).toBe("true");
  });

  it("leaving the box while a pick is being committed does not close the edit under it", async () => {
    let release!: () => void;
    const onPick = vi.fn(() => new Promise<void>((r) => { release = r; }));
    render(<PlacePicker rung="city" label="City" value={BOUND} onPick={onPick} onClear={() => {}} />);
    fireEvent.click(screen.getByTestId("place-city-value"));
    const box = await waitFor(() => screen.getByRole("combobox"));
    fireEvent.change(box, { target: { value: "Oslo" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
    fireEvent.click(screen.getAllByRole("option")[0]!);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    act(() => { (box as HTMLElement).blur(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.getAllByRole("option").length).toBe(4);
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Oslo");
    await act(async () => { release(); });
  });
});
