// @vitest-environment jsdom
// Ported from GilbApp `PlacePicker.cycle168.test.tsx` (30 cases): the 17 that render the picker alone or the picker's three boxes with the draft
// helpers. The other 13 render the whole address card (`PlaceClaimsCard`); they go with the card parts (H15f) and the Address view (H15g).
// The three boxes are `../test/AddressBoxes.tsx` (the card's three pickers, same props, same pick handlers).
// Changed from the source: `axe-core` is run directly; the catalogue is the fake platform of `../test/world.ts`; the failed-pick cases keep the
// catalogue's own sentence and nothing else.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axeCore from "axe-core";
import { PlacePicker } from "./index";
import { AddressBoxes } from "../test/AddressBoxes";
import { GEO, failIds, setCatalogueMode, useWorld } from "../test/world";

useWorld();
afterEach(cleanup);
beforeEach(() => setCatalogueMode("normal"));
// Colour contrast is switched off: jsdom does not resolve the host's colours (and has no canvas).
const axe = (node: Element) => axeCore.run(node, { rules: { "color-contrast": { enabled: false } } });

describe("PlacePicker: the rendered surface", () => {
  it("N9: the listbox owns options and nothing else (axe clean on the results state)", async () => {
    const { container } = render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Oslo" } });
    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    expect((await axe(container)).violations).toEqual([]);
  });

  it("N6: a server-truncated empty result never renders as 'no matches'", async () => {
    setCatalogueMode("truncated-empty");
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} restrictToCountryId={`${GEO}/no`} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "oblast" } });
    await waitFor(() => expect(screen.getByText(/not a statement that the place does not exist/i)).toBeTruthy());
    expect(screen.queryByText(/Try another spelling/i)).toBeNull();
  });

  it("a genuinely empty, complete result does say no matches: the two stay distinguishable", async () => {
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzqqnothing" } });
    await waitFor(() => expect(screen.getByText(/Try another spelling/i)).toBeTruthy());
  });
});

describe("NEW-2: the country clause is conditional, never asserted about a country nobody chose", () => {
  it("unpinned and capped: the surface does not claim a country restriction", async () => {
    setCatalogueMode("truncated-with-hits");
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "New York" } });
    await waitFor(() => expect(screen.getByTestId("place-city-capped-note")).toBeTruthy());
    expect(screen.getByTestId("place-city-capped-note").textContent).not.toMatch(/country you chose/i);
  });

  it("pinned and capped: it does say so", async () => {
    setCatalogueMode("truncated-with-hits");
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} restrictToCountryId={`${GEO}/us`} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "New York" } });
    await waitFor(() => expect(screen.getByTestId("place-city-capped-note")).toBeTruthy());
    expect(screen.getByTestId("place-city-capped-note").textContent).toMatch(/country you chose/i);
  });

  it("unpinned, capped and empty: still no claim about a country nobody chose", async () => {
    setCatalogueMode("truncated-empty");
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "oblast" } });
    const notice = await screen.findByText(/not a statement that the place does not exist/i);
    expect(notice.textContent).not.toMatch(/country you chose/i);
    expect(screen.queryByText(/Try another spelling/i)).toBeNull();
  });

  it("MX7: the capped-with-results disclosure exists at all, and is absent when uncapped", async () => {
    setCatalogueMode("truncated-with-hits");
    const { unmount } = render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "New York" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByTestId("place-city-capped-note")).toBeTruthy());
    unmount();

    setCatalogueMode("normal");
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "New York" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    expect(screen.queryByTestId("place-city-capped-note")).toBeNull();
  });
});

describe("NEW-4: an option row says which field it will land in, before the pick", () => {
  it("the City box marks the row that will not go in the City field", async () => {
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "New York" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(1));
    const options = screen.getAllByRole("option");
    const ny = options.find((o) => o.textContent?.startsWith("New York"))!;
    const york = options.find((o) => o.textContent?.startsWith("York"))!;
    expect(ny).toBeTruthy();
    expect(york).toBeTruthy();
    expect(ny.textContent).toMatch(/region/i);
    expect(ny.textContent).toMatch(/goes in your Region field/i);
    expect(york.textContent).toMatch(/city/i);
    expect(york.textContent).not.toMatch(/goes in your/i);
  });

  it("an unclassifiable row says so; it is never quietly relabelled to this box's own rung", async () => {
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Puzzling" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    const row = screen.getAllByRole("option")[0]!;
    expect(row.textContent).toMatch(/grain not classified/i);
    expect(row.textContent).toMatch(/will be filed as City/i);
    // The control: a classified row carries neither phrase.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "New York" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(1));
    const classified = screen.getAllByRole("option").find((o) => o.textContent?.startsWith("York"))!;
    expect(classified).toBeTruthy();
    expect(classified.textContent).toMatch(/city/i);
    expect(classified.textContent).not.toMatch(/grain not classified/i);
    expect(classified.textContent).not.toMatch(/will be filed as/i);
  });

  it("MX8 / MX9: the option names its nearest container, and the chain is bounded (two hops, not the walk)", async () => {
    render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Manchester" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    const row = screen.getByRole("option", { name: /Manchester/ });
    await waitFor(() => expect(row.textContent).toMatch(/Greater Manchester/));
    await waitFor(() => expect(row.textContent).toMatch(/in Greater Manchester, United Kingdom/));
  });
});

describe("NEW-1: a pick that lands at another rung is said, in both places", () => {
  async function pickNewYorkIn(boxLabel: string) {
    const { container } = render(<AddressBoxes />);
    const q = within(container);
    fireEvent.change(q.getByLabelText(boxLabel), { target: { value: "New York" } });
    await waitFor(() => expect(q.getAllByRole("option").some((o) => o.textContent?.startsWith("New York"))).toBe(true));
    fireEvent.click(q.getAllByRole("option").find((o) => o.textContent?.startsWith("New York"))!);
    await waitFor(() => expect(q.getByTestId("place-region-value").textContent).toBe("New York"));
    await waitFor(() => expect(q.getByTestId("place-country-value").textContent).toBe("United States"));
    return { text: container.textContent ?? "", q };
  }

  it("the surface after a City-box pick is not byte-identical to a Region-box pick", async () => {
    const viaCity = await pickNewYorkIn("City");
    cleanup();
    const viaRegion = await pickNewYorkIn("Region/State");
    expect(viaCity.text).not.toBe(viaRegion.text);
  });

  it("the Region chip says the pick came from the City search, not 'filled from your pick'", async () => {
    const { q } = await pickNewYorkIn("City");
    expect(q.getByTestId("place-region-provenance").textContent).toMatch(/found in your City search/i);
    expect(q.getByTestId("place-country-provenance").textContent).toMatch(/filled from your pick/i);
  });

  it("the City box, the control the person used, says where their pick went", async () => {
    const { q } = await pickNewYorkIn("City");
    const notice = q.getByTestId("place-city-landed-elsewhere");
    expect(notice.textContent).toMatch(/New York/);
    expect(notice.textContent).toMatch(/Region field/i);
  });

  it("control: a pick made in the box it belongs to carries no notice", async () => {
    const { q } = await pickNewYorkIn("Region/State");
    expect(q.queryByTestId("place-region-landed-elsewhere")).toBeNull();
    expect(q.queryByTestId("place-city-landed-elsewhere")).toBeNull();
    expect(q.queryByTestId("place-region-provenance")).toBeNull();
  });

  it("the model is unchanged: New York still lands in Region, and is never called a city", async () => {
    const { q } = await pickNewYorkIn("City");
    expect(q.getByTestId("place-region-value").textContent).toBe("New York");
    expect(q.queryByTestId("place-city-value")).toBeNull();
  });
});

describe("a pick whose commit fails is said, never a form that looks untouched", () => {
  it("a 502 on the deepest hop keeps the query, says why, and is not an untouched form", async () => {
    const { container } = render(<AddressBoxes />);
    const q = within(container);
    const untouched = container.textContent ?? "";
    fireEvent.change(q.getByLabelText("City"), { target: { value: "Deepcity" } });
    await waitFor(() => expect(q.getAllByRole("option").some((o) => o.textContent?.startsWith("Deepcity"))).toBe(true));
    failIds.add(`${GEO}/deep-country`);
    fireEvent.click(q.getAllByRole("option").find((o) => o.textContent?.startsWith("Deepcity"))!);
    const alert = await waitFor(() => q.getByRole("alert"));
    expect(alert.textContent).toMatch(/place catalogue could not be reached/i);
    expect(alert.textContent).toMatch(/not a statement that the place does not exist/i);
    expect((q.getByLabelText("City") as HTMLInputElement).value).toBe("Deepcity");
    expect(container.textContent).not.toBe(untouched);
    expect(q.queryByTestId("place-city-value")).toBeNull();
  });

  it("control: the same pick with the catalogue healthy clears the box and files the row", async () => {
    const { container } = render(<AddressBoxes />);
    const q = within(container);
    fireEvent.change(q.getByLabelText("City"), { target: { value: "Deepcity" } });
    await waitFor(() => expect(q.getAllByRole("option").some((o) => o.textContent?.startsWith("Deepcity"))).toBe(true));
    fireEvent.click(q.getAllByRole("option").find((o) => o.textContent?.startsWith("Deepcity"))!);
    await waitFor(() => expect(q.getByTestId("place-city-value").textContent).toBe("Deepcity"));
    await waitFor(() => expect(q.getByTestId("place-country-value").textContent).toBe("Deepland"));
    expect(q.queryByRole("alert")).toBeNull();
  });
});
