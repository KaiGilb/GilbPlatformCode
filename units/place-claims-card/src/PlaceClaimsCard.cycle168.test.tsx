// @vitest-environment jsdom
// Ported from GilbApp `PlacePicker.cycle168.test.tsx` ("A REFUSED SAVE IS SAID, AND NEVER DESTROYS WHAT THE PERSON TYPED"): the 6 cases of the 30 that render the card's add form
// and its buttons (Kai's order of the boxes, a refused save keeps the draft and says why, an accepted save clears it, a refused save is told from an accepted one and from never
// opening the form, there is no Save button, the add mark is the shipped one). The other 24 are `place-picker`'s (H15e, 17) and `address-card-parts`' (H15f, 7).
// Changed from the source: the catalogue is the fake platform of `../test/world.ts` (the same rows and a search over them); the card is given `canAdd` and no read state, as GilbApp's was.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type React from "react";
import { PlaceClaimsCard } from "./index";
import type { PlaceClaimDraft } from "@kaigilb/gilbplatformcode-place-draft";
import { GEO } from "../test/ported";
import { useWorld } from "../test/world";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({
  attributeSpelling: vi.fn(async (name: string) => name),
  typeSpelling: vi.fn(async (name: string) => `t:${name}`),
  attributeLabel: vi.fn(async () => null),
}));
useWorld();
afterEach(cleanup);
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

/**
 * ⚠ Selects a PLACE row by its text, never by index. The access-level `<select>` renders real
 * `<option>` elements, so `getAllByRole("option")` is non-empty the instant the form opens and an
 * index-based wait passes before the catalogue has answered.
 */
async function clickPlaceOption(q: ReturnType<typeof within>, startsWith: string) {
  const { fireEvent } = await import("@testing-library/react");
  const rows = () => (q.getAllByRole("option") as HTMLElement[]).filter((o) => o.textContent?.startsWith(startsWith));
  await waitFor(() => expect(rows().length).toBeGreaterThan(0));
  fireEvent.click(rows()[0]);
}

describe("A REFUSED SAVE IS SAID, AND NEVER DESTROYS WHAT THE PERSON TYPED", () => {
  async function fillForm(props: Partial<React.ComponentProps<typeof PlaceClaimsCard>>) {
    const { fireEvent, within } = await import("@testing-library/react");
    const { container, unmount } = render(
      // ⚠ `onAmend` re-asserted AFTER the spread: it is REQUIRED now, and a Partial<> spread
      //   could otherwise set it back to undefined — which is the compiler doing its job.
      <PlaceClaimsCard
        title="Address"
        claims={[]}
        onSave={() => true}
        onRemove={() => true}
        {...props}
        onAmend={props.onAmend ?? (() => true)}
        editMode={props.editMode ?? true}
      />,
    );
    const q = within(container);
    fireEvent.click(q.getByRole("button", { name: /Add Address/i }));
    // ⚠ NO SAVE BUTTON — Kai: "we dont use a save button, selecting a values then auto saves."
    //   The label is typed first, then the country PICK is the selection that commits.
    // ⚠ NO SAVE BUTTON — Kai: "we dont use a save button, selecting a values then auto saves."
    //   Do NOT assert the country chip here: on an ACCEPTED save the commit clears the draft
    //   in the same tick, so the chip legitimately never settles. Each test asserts its own
    //   outcome instead — waiting on a chip that only one of the two paths produces would make
    //   this helper pass for one and hang for the other.
    fireEvent.change(q.getByLabelText(/Location/i), { target: { value: "home" } });
    fireEvent.change(q.getByLabelText("Country"), { target: { value: "Norway" } });
    await clickPlaceOption(q, "Norway");
    return { container, q, unmount };
  }

  it("THERE IS NO SAVE BUTTON — the address commits on a selection", async () => {
    // Kai's correction, as a guard: a submit control on this entry is the defect.
    const { fireEvent, within } = await import("@testing-library/react");
    const saves: unknown[] = [];
    const { container } = render(
      <PlaceClaimsCard title="Address" editMode claims={[]} onSave={(d) => { saves.push(d); return true; }} onAmend={() => true} onRemove={() => true} />,
    );
    const q = within(container);
    fireEvent.click(q.getByRole("button", { name: /Add Address/i }));
    expect(q.queryByRole("button", { name: /Save this address/i })).toBeNull();
    expect(q.queryByRole("button", { name: /^Cancel$/i })).toBeNull();
    // Nothing commits from a label alone — that would mint an address per keystroke.
    fireEvent.change(q.getByLabelText(/Location/i), { target: { value: "home" } });
    expect(saves).toHaveLength(0);
    // ✅ The SELECTION is what commits.
    fireEvent.change(q.getByLabelText("Country"), { target: { value: "Norway" } });
    await clickPlaceOption(q, "Norway");
    await waitFor(() => expect(saves.length).toBeGreaterThan(0));
  });

  it("the ADD affordance is the shipped ⊕ one, not a boxed button of its own", async () => {
    // Kai: "the add address should be the same as used for adding other info, + Add Address".
    //    ⚠ Asserted on the SHIPPED shape — the `fa-plus-circle` mark every other section's add
    //    control carries — not on the label text, which a restyled button could also match.
    const { within } = await import("@testing-library/react");
    const { container } = render(<PlaceClaimsCard title="Address" editMode claims={[]} onSave={() => true} onAmend={() => true} onRemove={() => true} />);
    const add = within(container).getByRole("button", { name: /Add Address/i });
    // ⚠ GilbApp: the person card's own add mark (it4's "⊕"), in place of MyNet's FontAwesome
    //   `fa-plus-circle` (GilbApp ships no FontAwesome) — the same "shipped add, not a box" property.
    expect(add.querySelector('[aria-hidden="true"]')?.textContent).toBe("⊕");
    // CONTROL — the boxed-button styling this replaces must be gone.
    expect(add.className).not.toMatch(/rounded-xl/);
    expect(add.className).not.toMatch(/border-line-minimal/);
  });

  it("KAI'S ORDER — Location / Street.. / City / Region/State / Country, top to bottom", async () => {
    // Kai, 2026-09-05, verbatim: *"Reverse the order, / Location (change from 'Your name for
    //    this address') / Street.. / City / Region/State (Change from Region) / Country"*.
    //
    // ⚠ THIS TEST GUARDED THE OPPOSITE ORDER UNTIL MNB168.21b, AND THE REVERSAL IS NOT A
    //   REGRESSION — the mitigation it held is DISCHARGED, not overridden. The name sat LAST
    //   because auto-save commits at the first nameable moment and there was NO AMEND PATH
    //   (D6/D-N7): a top-to-bottom fill with the name first minted "Hytta / Norway / — / —" and
    //   the City, Street and rung became UNREACHABLE. VATester measured that twice, on two SHAs.
    //   The amend path now EXISTS — `SavedAddress` renders the same controls on a stored
    //   address and every change commits through `updatePlaceClaim` — so a truncated address is
    //   repairable in place and the premise of the inversion is gone.
    //   ⚠ The sibling test *"a stored address is AMENDABLE IN PLACE"* is what holds that premise
    //   discharged; if it ever goes red, this order becomes unsafe again and BOTH must be
    //   reconsidered together. Recorded here so a later reader does not read this reversal as
    //   somebody quietly undoing a measured mitigation.
    const { fireEvent, within } = await import("@testing-library/react");
    const { container } = render(<PlaceClaimsCard title="Address" editMode claims={[]} onSave={() => true} onAmend={() => true} onRemove={() => true} />);
    const q = within(container);
    fireEvent.click(q.getByRole("button", { name: /Add Address/i }));

    const name = q.getByLabelText(/Location/i);
    const street = q.getByLabelText(/Street\.\./i);
    const city = q.getByLabelText("City");
    const region = q.getByLabelText("Region/State");
    const country = q.getByLabelText("Country");

    // DOCUMENT_POSITION_FOLLOWING = 4 — each field must come AFTER the one above it.
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(name, street)).toBe(true);
    expect(follows(street, city)).toBe(true);
    expect(follows(city, region)).toBe(true);
    expect(follows(region, country)).toBe(true);
    // CONTROL — the ordering assertion is real and not vacuously true: the reverse of every
    //    pair must NOT hold. Without this, an assertion that always returned truthy would pass.
    expect(follows(street, name)).toBe(false);
    expect(follows(country, region)).toBe(false);
  });

  it("a refused save keeps the DRAFT, keeps the typed label and the bound place, and says why", async () => {
    // `usePlaceClaims.save` catches and RESOLVES, so the card used to close the form and call
    //    emptyDraft() unconditionally: `REFUSED-SAVE == NEVER-OPENED-THE-FORM ? true`, with the
    //    error rendered only inside the branch that same click had switched off.
    const { q } = await fillForm({
      onSave: () => false,
      error: "Could not save this address: 502 upstream down",
    });
    const alert = await waitFor(() => q.getByTestId("place-claims-error"));
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toMatch(/could not save this address/i);
    // The person does not retype what they already entered. With no form to "keep open",
    //    the DRAFT is what has to survive — label and bound place both still there.
    await waitFor(() => expect(q.getByTestId("place-country-value").textContent).toBe("Norway"));
    expect((q.getByLabelText(/Location/i) as HTMLInputElement).value).toBe("home");
  });

  it("CONTROL — an ACCEPTED save clears the draft", async () => {
    const { q } = await fillForm({ onSave: () => true });
    await waitFor(() => expect(q.queryByLabelText(/Location/i)).toBeNull());
    expect(q.queryByTestId("place-claims-error")).toBeNull();
    expect(q.getByRole("button", { name: /Add Address/i })).toBeTruthy();
  });

  it("a REFUSED save is distinguishable from an accepted one AND from never opening the form", async () => {
    // VATester measured `REFUSED-SAVE == NEVER-OPENED-THE-FORM ? true` and refused == accepted.
    //    Both comparisons are asserted here, on whole rendered surfaces.
    // ⚠ Unmounted between renders: `PlaceClaimsCard` uses hardcoded element ids
    //   (`place-label`, `place-street`, `place-access`), so two mounted cards make
    //   `getByLabelText` resolve across containers. Carried, not fixed — out of this scope.
    // ⚠ The save handler is async, so each surface is captured only AFTER it settles —
    //   capturing synchronously would compare two mid-flight renders and prove nothing.
    const a = await fillForm({ onSave: () => false, error: "Could not save this address: 502" });
    await waitFor(() => expect(a.q.getByTestId("place-claims-error")).toBeTruthy());
    const refused = a.container.textContent ?? "";
    a.unmount();
    const b = await fillForm({ onSave: () => true });
    await waitFor(() => expect(b.q.queryByLabelText(/Location/i)).toBeNull());
    const accepted = b.container.textContent ?? "";
    b.unmount();
    const nev = render(<PlaceClaimsCard title="Address" editMode claims={[]} onSave={() => true} onAmend={() => true} onRemove={() => true} />);
    const never = nev.container.textContent ?? "";
    nev.unmount();

    expect(refused).not.toBe(accepted);
    expect(refused).not.toBe(never);

    // ⚠ `accepted === never` here, and that is CORRECT, not a defect to paper over: this
    //   component does not own the claim list. A stubbed `onSave` that returns true without
    //   adding a row legitimately returns the surface to the empty state. In the app the parent
    //   re-reads the store (`usePlaceClaims.save` → `reload()`), so the accepted case gains a
    //   row — asserted directly below rather than asserted falsely here.
    expect(accepted).toBe(never);
    const withRow = render(
      <PlaceClaimsCard
        title="Address"
        editMode
        claims={[{ id: "c9", uri: "u/c9", label: "home", streetLine: "", memberOf: [`${GEO}/no`], subjects: [], fields: [], hiddenFieldCount: 0, etag: null }]}
        onSave={() => true}
        onAmend={() => true} onRemove={() => true}
      />,
    ).container.textContent ?? "";
    expect(withRow).not.toBe(never);
    // ⚠ Discriminated on the ROW itself, not on a "N kept" counter: that counter is gone —
    //   no other section on the card has one, and its presence was part of what made this entry
    //   read as a separate block rather than as one more entry.
    expect(withRow).toMatch(/home/);
  });
});

