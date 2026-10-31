// @vitest-environment jsdom
// Ported from GilbApp `PlacePicker.cycle168.test.tsx` ("PlaceClaimsCard - a saved address names its place", 7 cases) and 1 case of `PlacePicker.s8cityfix.test.tsx`: the 8 cases of the 15 left over from
// H15e that render a stored address only. The other 7 render the card's add form or its buttons (Kai's order of the boxes, a refused save keeps the draft, an accepted save clears it, a refused
// save is told from an accepted one, no Save button, the add mark) and go with the card (H15g); the s8cityfix case of the stored address's flag is in `AddressParts.flags.test.tsx`.
// Changed from the source: the cases render `SavedAddress` in the card's list element, and `openStoredAddresses` (A's test helper) is the loop below. The stored addresses are in the
// older, one-record shape (`memberOf` on the address, no field records), as in the source.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { emptyDraft, type PlaceClaimDraft } from "@kaigilb/gilbplatformcode-place-draft";
import type { PlaceClaim } from "@kaigilb/gilbplatformcode-place-claims";
import { compactLines } from "./index";
import { GEO, setCatalogueMode, useWorld } from "../test/world";
import { list } from "../test/support";

useWorld();
afterEach(cleanup);
beforeEach(() => setCatalogueMode("normal"));

const claim: PlaceClaim = {
  id: "c1", uri: "u/c1", label: "home", streetLine: "Gladvollveien 38c",
  memberOf: [`${GEO}/no`, `${GEO}/oslo`], subjects: [], fields: [], hiddenFieldCount: 0, etag: null,
} as PlaceClaim;

/** Opens every stored address (a tap on each), as the source's helper does. */
async function openStoredAddresses(container: HTMLElement) {
  const taps = await within(container).findAllByRole("button", { name: /^Edit address/ });
  for (const t of taps) fireEvent.click(t);
}

describe("a saved address names its place", () => {
  it("renders the place NAMES, never a count", async () => {
    render(list([claim], { editMode: true }));
    await waitFor(() => expect(screen.getByTestId("place-claim-bound").textContent).toBe("Norway · Oslo"));
    expect(screen.queryByText(/catalogue place/i)).toBeNull();
  });

  it("a stored address is AMENDABLE IN PLACE: the same controls a new one uses", async () => {
    const stored: PlaceClaim = { ...claim, memberOf: [`${GEO}/no`] };
    const { container } = render(list([stored], { editMode: true }));
    await openStoredAddresses(container);
    const q = within(container);
    await waitFor(() => expect(q.getByLabelText(/Street\.\./i)).toBeTruthy());
    expect((q.getByLabelText(/Street\.\./i) as HTMLInputElement).value).toBe("Gladvollveien 38c");
    expect(q.getByLabelText(/Location/i)).toBeTruthy();
    expect(q.queryByRole("button", { name: /^Edit/i })).toBeNull();
  });

  it("FAIL-CLOSED: a claim whose places have not resolved is read-only and says why", async () => {
    const unresolvable: PlaceClaim = { ...claim, memberOf: [`${GEO}/nope`] };
    const amends: unknown[] = [];
    const { container } = render(list([unresolvable], { editMode: true, onAmend: (c) => { amends.push(c); return true; } }));
    const q = within(container);
    // A resolvable address next to it becomes editable, so the wait is over when the catalogue has answered.
    const ok: PlaceClaim = { ...claim, id: "c9", memberOf: [`${GEO}/no`] };
    const second = render(list([ok], { editMode: true }));
    await openStoredAddresses(second.container);
    await waitFor(() => expect(within(second.container).getByLabelText(/Street\.\./i)).toBeTruthy());
    await waitFor(() => expect(q.getByTestId("place-claim-locked").textContent).toMatch(/no longer in the catalogue/i));
    expect(q.getByTestId("place-claim-locked").textContent).toMatch(/still remove it/i);
    expect(q.queryByLabelText(/Street\.\./i)).toBeNull();
    expect(q.queryByLabelText(/Location/i)).toBeNull();
    expect(amends).toHaveLength(0);
  });

  it("DATA: a claim holding MORE places than the three slots can show is NOT amendable", async () => {
    const crossApp: PlaceClaim = { ...claim, id: "cx", memberOf: [`${GEO}/no`, `${GEO}/oslo`, `${GEO}/york-city`] };
    const amends: unknown[] = [];
    const { container } = render(list([crossApp], { editMode: true, onAmend: (c) => { amends.push(c); return true; } }));
    const q = within(container);
    const ok: PlaceClaim = { ...claim, id: "c9", memberOf: [`${GEO}/no`] };
    const second = render(list([ok], { editMode: true }));
    await openStoredAddresses(second.container);
    await waitFor(() => expect(within(second.container).getByLabelText(/Street\.\./i)).toBeTruthy());
    expect(q.queryByLabelText(/Street\.\./i)).toBeNull();
    await waitFor(() => expect(q.getByTestId("place-claim-locked").textContent).toMatch(/more places than this screen can show/i));
    expect(amends).toHaveLength(0);
  });

  it("READINESS SYMMETRY: an amend may leave the address naming NO place, never holding NOTHING", async () => {
    const stored: PlaceClaim = { ...claim, id: "cp", memberOf: [`${GEO}/no`] };
    const amends: PlaceClaimDraft[] = [];
    const { container } = render(list([stored], { editMode: true, onAmend: (_c, d) => { amends.push(d); return true; } }));
    await openStoredAddresses(container);
    const q = within(container);
    await waitFor(() => expect(q.getByTestId("place-country-value")).toBeTruthy());
    // Tapping the bound country opens it for edit with the name kept, and writes nothing.
    fireEvent.click(q.getByRole("button", { name: /^Change Country — currently/i }));
    const box = q.getByLabelText("Country") as HTMLInputElement;
    expect(box.value).toBe("Norway");
    expect(amends).toHaveLength(0);
    // Emptying it is clearing the country, deliberately; the street change then commits an address naming no place.
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    fireEvent.change(q.getByLabelText(/Street\.\./i), { target: { value: "Ny gate 9" } });
    fireEvent.blur(q.getByLabelText(/Street\.\./i));
    await waitFor(() => expect(amends.length).toBeGreaterThan(0));
    const last = amends[amends.length - 1]!;
    expect(last.streetLine).toBe("Ny gate 9");
    expect([last.place.city, last.place.region, last.place.country]).toEqual([null, null, null]);
  });

  it("an amend that would leave the address holding NOTHING is not sent", async () => {
    const bare: PlaceClaim = { ...claim, id: "cn", label: "", streetLine: "Gate 1", memberOf: [] };
    const amends: unknown[] = [];
    const { container } = render(list([bare], { editMode: true, onAmend: (c) => { amends.push(c); return true; } }));
    await openStoredAddresses(container);
    const q = within(container);
    await waitFor(() => expect(q.getByLabelText(/Street\.\./i)).toBeTruthy());
    fireEvent.change(q.getByLabelText(/Street\.\./i), { target: { value: " " } });
    fireEvent.blur(q.getByLabelText(/Street\.\./i));
    await new Promise((r) => setTimeout(r, 20));
    expect(amends).toHaveLength(0);
    fireEvent.change(q.getByLabelText(/Street\.\./i), { target: { value: "Gate 2" } });
    fireEvent.blur(q.getByLabelText(/Street\.\./i));
    await waitFor(() => expect(amends).toHaveLength(1));
  });

  it("MA-8: blanking the Location IS an amend (Location is optional)", async () => {
    const stored: PlaceClaim = { ...claim, id: "cb", memberOf: [`${GEO}/no`] };
    const amends: PlaceClaimDraft[] = [];
    const { container } = render(list([stored], { editMode: true, onAmend: (_c, d) => { amends.push(d); return true; } }));
    await openStoredAddresses(container);
    const q = within(container);
    await waitFor(() => expect(q.getByLabelText(/Location/i)).toBeTruthy());
    fireEvent.change(q.getByLabelText(/Location/i), { target: { value: "  " } });
    fireEvent.blur(q.getByLabelText(/Location/i));
    await waitFor(() => expect(amends).toHaveLength(1));
    expect(amends[0]!.label.trim()).toBe("");
    expect(amends[0]!.place.country?.id).toBe(`${GEO}/no`);
  });
});

describe("the postal address's country line keeps the country's entity reference", () => {
  it("compactLines hands the country id with the 'Region, Country' line, and none when there is no country", () => {
    const d = emptyDraft();
    const norway = { id: `${GEO}/no`, label: "Norway", type: "Country", memberOf: [] as string[] };
    const oslo = { id: `${GEO}/oslo-admin`, label: "Oslo", type: "GeoAdminArea", memberOf: [`${GEO}/no`] };
    const withCountry = compactLines({ ...d, place: { ...d.place, region: oslo, country: norway } }).find((l) => l.key === "region-country");
    expect(withCountry).toMatchObject({ text: "Oslo, Norway", countryId: `${GEO}/no` });
    const without = compactLines({ ...d, place: { ...d.place, region: oslo } }).find((l) => l.key === "region-country");
    expect(without?.countryId ?? null).toBeNull();
  });
});
