// @vitest-environment jsdom
// Ported from GilbApp `src/components/records/AddressRows.reviewFixes.c214.test.tsx`, the view parts (the library-level cases are `place-claim-write`'s, H15d): F2, N1, F5, the card case of F4, F7, R2-R4.
// Changed from the source: the record client, the vault list and the master's spellings were module mocks; here the same in-memory vault is the platform behind `fetch`
// (`../test/fakePlaceStore.ts`), with the real reads and writes of the units running over it. The catalogue is the fake platform's. 
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { OneCardProvider, type OneCardView } from "@kaigilb/gilbplatformcode-one-card-context";
import { PlaceClaimsCard } from "@kaigilb/gilbplatformcode-place-claims-card";
import {
  claimFieldText,
  claimsAbout,
  listPlaceClaimsInVault,
  EMPTY_ADDRESS_MESSAGE,
  type PlaceClaimInput,
} from "@kaigilb/gilbplatformcode-place-claims";
import { createPlaceClaim, removePlaceClaim, updatePlaceClaim } from "@kaigilb/gilbplatformcode-place-claim-write";
import { AddressRows } from "./index";
import * as fake from "../test/fakePlaceStore";
import { GEO, creates, deletes, failNextListing, holdNextCreate, openStoredAddresses, patches } from "../test/ported";
import { PRINCIPAL, useWorld } from "../test/world";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({
  attributeSpelling: vi.fn(async (name: string) => name),
  typeSpelling: vi.fn(async (name: string) => `t:${name}`),
  attributeLabel: vi.fn(async (name: string) => ({ addressLine1: "Address 1", addressLine2: "Address 2", postalCode: "Postal Code" } as Record<string, string>)[name] ?? null),
}));

useWorld();
afterEach(cleanup);
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const { VAULT, store } = fake;
const RECORD = `${VAULT}/e/06gkperson0000000000000001`;
const NONE = { city: null, region: null, country: null };
const input = (over: Partial<PlaceClaimInput>): PlaceClaimInput => ({ label: "", streetLine: "", place: NONE, ...over });
const freshRead = async () => claimsAbout(await listPlaceClaimsInVault(VAULT), RECORD);
const ofType = (t: string) => [...store.entries()].filter(([, e]) => e.type === t);
const settle = () => new Promise((r) => setTimeout(r, 30));


function show(record = RECORD) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const r = render(
    <QueryClientProvider client={qc}>
      <AddressRows title="Postal Address" legacyText="" vaultId={VAULT} recordEntityUri={record} principal={PRINCIPAL} canEdit />
    </QueryClientProvider>,
  );
  return { ...r, q: within(r.container) };
}

describe("F2 — typing during a new address's first save is ⛔ not lost", () => {
  it("Address 1 typed (and Enter pressed) while the Street's save is in flight is stored on that same address", async () => {
    const { q, container } = show();
    fireEvent.click(await q.findByRole("button", { name: /Add Postal Address/ }));
    const release = holdNextCreate();
    const street = container.querySelector<HTMLInputElement>("#place-street")!;
    fireEvent.change(street, { target: { value: "Storgata 1" } });
    fireEvent.keyDown(street, { key: "Enter" });
    await waitFor(() => expect(creates()).toHaveLength(1));

    // The save is in flight. The person carries on: Address 1, then Enter.
    const line1 = container.querySelector<HTMLInputElement>("#place-line1")!;
    fireEvent.change(line1, { target: { value: "c/o Hansen" } });
    fireEvent.keyDown(line1, { key: "Enter" });

    await act(async () => {
      release();
    });
    await waitFor(async () => {
      const rows = await freshRead();
      expect(rows).toHaveLength(1);
      expect(claimFieldText(rows[0]!, "streetLine")).toBe("Storgata 1");
      expect(claimFieldText(rows[0]!, "addressLine1")).toBe("c/o Hansen");
    });
    expect(ofType("t:PlaceClaim")).toHaveLength(1);
    await openStoredAddresses(container);
    await waitFor(() => {
      const id = ofType("t:PlaceClaim")[0]![0];
      expect(container.querySelector<HTMLInputElement>(`#line-${id}-line1`)?.value).toBe("c/o Hansen");
    });
  });

  it("a save with nothing typed during it clears the form as before (no extra write)", async () => {
    const { q, container } = show();
    fireEvent.click(await q.findByRole("button", { name: /Add Postal Address/ }));
    const street = container.querySelector<HTMLInputElement>("#place-street")!;
    fireEvent.change(street, { target: { value: "Storgata 1" } });
    fireEvent.keyDown(street, { key: "Enter" });
    await waitFor(() => expect(container.querySelector("#place-street")).toBeNull());
    await settle();
    expect(patches()).toHaveLength(0);
    expect(ofType("t:PlaceClaim")).toHaveLength(1);
  });

  it("if the new address cannot be told apart, the typing goes back into the form and the person is told", async () => {
    let resolve!: (v: boolean) => void;
    const onSave = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const { container } = render(
      <PlaceClaimsCard title="Postal Address" claims={[]} editMode onSave={onSave} onAmend={() => true} onRemove={() => true} />,
    );
    fireEvent.click(within(container).getByRole("button", { name: /Add Postal Address/ }));
    const street = container.querySelector<HTMLInputElement>("#place-street")!;
    fireEvent.change(street, { target: { value: "Storgata 1" } });
    fireEvent.keyDown(street, { key: "Enter" });
    fireEvent.change(container.querySelector<HTMLInputElement>("#place-line1")!, { target: { value: "c/o Hansen" } });
    await act(async () => {
      resolve(true);
    });
    await waitFor(() => expect(container.querySelector("[data-testid='place-carry-returned']")).not.toBeNull());
    expect(container.querySelector<HTMLInputElement>("#place-line1")!.value).toBe("c/o Hansen");
    // 🔴 N1: ONLY what was typed since the save began comes back — ⛔ never the street it already saved.
    expect(container.querySelector<HTMLInputElement>("#place-street")!.value).toBe("");
    expect(container.querySelector("[data-testid='place-carry-returned']")!.textContent).toMatch(/only\s+that is still here, not the parts already saved/);
    // Leaving the form saves only that — ⛔ not a second copy of "Storgata 1".
    fireEvent.blur(container.querySelector<HTMLInputElement>("#place-line1")!, { relatedTarget: document.body });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    const second = (onSave.mock.calls as unknown as [import("@kaigilb/gilbplatformcode-place-draft").PlaceClaimDraft][])[1]![0];
    expect(second.streetLine).toBe("");
    expect(second.addressLine1).toBe("c/o Hansen");
  });
});

describe("N1 — the typing goes to the address the save NAMED, ⛔ never a guess", () => {
  it("another address for the same person lands during the first save: the typing lands on OUR address, and no duplicate is stored", async () => {
    // Agent.Scaling's probe G-D1, in its steps (a collaborator adds an address on the same card).
    const { q, container } = show();
    fireEvent.click(await q.findByRole("button", { name: /Add Postal Address/ }));
    const release = holdNextCreate();
    const street = container.querySelector<HTMLInputElement>("#place-street")!;
    fireEvent.change(street, { target: { value: "Storgata 1" } });
    fireEvent.keyDown(street, { key: "Enter" });
    await waitFor(() => expect(creates()).toHaveLength(1));
    await createPlaceClaim(VAULT, RECORD, input({ label: "cabin", streetLine: "Hytteveien 2" }));
    fireEvent.change(container.querySelector<HTMLInputElement>("#place-line1")!, { target: { value: "c/o Hansen" } });
    await act(async () => {
      release();
    });
    // The save has confirmed: the form closed, or (the defect) came back with a notice.
    await waitFor(
      () =>
        expect(
          container.querySelector("#place-street") === null || container.querySelector("[data-testid='place-carry-returned']") !== null,
        ).toBe(true),
      { timeout: 2000 },
    );
    await new Promise((r) => setTimeout(r, 100));
    // The person leaves the form. ⚠ Before N1 the form was back here holding Storgata 1 + c/o Hansen,
    // and this blur stored a SECOND "Storgata 1" address.
    const stillOpen = container.querySelector<HTMLInputElement>("#place-line1");
    if (stillOpen) fireEvent.blur(stillOpen, { relatedTarget: document.body });
    await new Promise((r) => setTimeout(r, 150));
    // ⇒ TWO addresses (ours and the collaborator's), and "Storgata 1" is stored ONCE.
    expect(ofType("t:PlaceClaim")).toHaveLength(2);
    expect(ofType("t:SelfAssertedFieldClaim").filter(([, e]) => e.facts["a:streetLine"] === "Storgata 1")).toHaveLength(1);
    // ⇒ the typing is on OUR address (the one holding "Storgata 1").
    await waitFor(async () => {
      const ours = (await freshRead()).find((c) => claimFieldText(c, "streetLine") === "Storgata 1");
      expect(ours && claimFieldText(ours, "addressLine1")).toBe("c/o Hansen");
    });
    expect(container.querySelector("[data-testid='place-carry-returned']")).toBeNull();
    const rows = await freshRead();
    expect(rows.map((r) => claimFieldText(r, "streetLine")).sort()).toEqual(["Hytteveien 2", "Storgata 1"]);
    expect(claimFieldText(rows.find((r) => claimFieldText(r, "streetLine") === "Hytteveien 2")!, "addressLine1")).toBe("");
  });
});

describe("F5 — the add form's double-save guard", () => {
  it("Enter, leaving the form, then Enter again while the save is pending gives ONE save", async () => {
    let resolve!: (v: boolean) => void;
    const onSave = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const { container } = render(
      <PlaceClaimsCard title="Postal Address" claims={[]} editMode onSave={onSave} onAmend={() => true} onRemove={() => true} />,
    );
    fireEvent.click(within(container).getByRole("button", { name: /Add Postal Address/ }));
    const street = container.querySelector<HTMLInputElement>("#place-street")!;
    fireEvent.change(street, { target: { value: "Storgata 1" } });
    fireEvent.keyDown(street, { key: "Enter" });
    fireEvent.blur(street);
    fireEvent.keyDown(street, { key: "Enter" });
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(true);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe("F4 — an address cannot be amended into an empty one", () => {
  it("on the card, clearing the last part shows a message on the frame and the store keeps its value", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ streetLine: "Gate 1" }), PRINCIPAL);
    const { container } = show();
    await openStoredAddresses(container);
    const id = ofType("t:PlaceClaim")[0]![0];
    await waitFor(() => expect(container.querySelector<HTMLInputElement>(`#street-${id}`)?.value).toBe("Gate 1"));
    const street = container.querySelector<HTMLInputElement>(`#street-${id}`)!;
    fireEvent.change(street, { target: { value: "" } });
    fireEvent.blur(street);
    await waitFor(() =>
      expect(container.querySelector("[data-testid='place-claim-empty-refused']")?.textContent).toBe(EMPTY_ADDRESS_MESSAGE),
    );
    expect(patches()).toHaveLength(0);
    expect(deletes()).toHaveLength(0);
    expect(claimFieldText((await freshRead())[0]!, "streetLine")).toBe("Gate 1");
    fireEvent.change(street, { target: { value: "Gate 2" } });
    await waitFor(() => expect(container.querySelector("[data-testid='place-claim-empty-refused']")).toBeNull());
  });
});

/**
 * Press Close the way a browser does: the press, then (only if the press was NOT kept from moving
 * focus) the field losing focus to nothing — Safari's click on a button — and then the click.
 */
function pressClose(container: HTMLElement, field: HTMLInputElement) {
  const close = within(container).getByRole("button", { name: "Close" });
  const focusMoves = fireEvent.mouseDown(close);
  if (focusMoves) fireEvent.blur(field, { relatedTarget: null });
  fireEvent.mouseUp(close);
  fireEvent.click(close);
}

describe("F7 — Close on the new-address form", () => {
  it("Close with typed text saves nothing and closes the form", async () => {
    const { q, container } = show();
    fireEvent.click(await q.findByRole("button", { name: /Add Postal Address/ }));
    const street = container.querySelector<HTMLInputElement>("#place-street")!;
    fireEvent.change(street, { target: { value: "Storgata 1" } });
    fireEvent.change(container.querySelector<HTMLInputElement>("#place-line1")!, { target: { value: "c/o Hansen" } });
    street.focus();
    // ⚠ The trap: pressing Close must ⛔ not count as focus leaving the form, which saves.
    pressClose(container, street);
    await settle();
    expect(creates()).toHaveLength(0);
    expect(patches()).toHaveLength(0);
    expect(store.size).toBe(0);
    expect(container.querySelector("#place-street")).toBeNull();
    // Opening it again starts empty: the draft was thrown away.
    fireEvent.click(q.getByRole("button", { name: /Add Postal Address/ }));
    expect(container.querySelector<HTMLInputElement>("#place-street")!.value).toBe("");
    expect(container.querySelector<HTMLInputElement>("#place-line1")!.value).toBe("");
  });

  it("Close while the first save is in flight keeps that address, writes nothing more, and does not undo it", async () => {
    const { q, container } = show();
    fireEvent.click(await q.findByRole("button", { name: /Add Postal Address/ }));
    const release = holdNextCreate();
    const street = container.querySelector<HTMLInputElement>("#place-street")!;
    fireEvent.change(street, { target: { value: "Storgata 1" } });
    fireEvent.keyDown(street, { key: "Enter" });
    await waitFor(() => expect(creates()).toHaveLength(1));
    const line1 = container.querySelector<HTMLInputElement>("#place-line1")!;
    fireEvent.change(line1, { target: { value: "c/o Hansen" } });
    pressClose(container, line1);
    expect(container.querySelector("#place-street")).toBeNull();
    await act(async () => {
      release();
    });
    await waitFor(async () => expect((await freshRead()).map((c) => claimFieldText(c, "streetLine"))).toEqual(["Storgata 1"]), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 100));
    const [kept] = await freshRead();
    // ⇒ the saved address is kept as saved; what was typed after it was thrown away with the form.
    expect(claimFieldText(kept!, "addressLine1")).toBe("");
    expect(ofType("t:PlaceClaim")).toHaveLength(1);
    expect(deletes()).toHaveLength(0);
    expect(patches()).toHaveLength(0);
    expect(container.querySelector("#place-street")).toBeNull();
    expect(container.querySelector("[data-testid='place-carry-returned']")).toBeNull();
    // ⛔ Close is not an edit of the saved address: nothing is carried onto it, so no refusal shows.
    expect(container.querySelector("[data-testid='place-claim-empty-refused']")).toBeNull();
  });

  it("Close after a confirmed save keeps the address", async () => {
    const { q, container } = show();
    fireEvent.click(await q.findByRole("button", { name: /Add Postal Address/ }));
    const street = container.querySelector<HTMLInputElement>("#place-street")!;
    fireEvent.change(street, { target: { value: "Storgata 1" } });
    fireEvent.keyDown(street, { key: "Enter" });
    await waitFor(() => expect(container.querySelector("#place-street")).toBeNull(), { timeout: 2000 });
    const id = ofType("t:PlaceClaim")[0]![0];
    await openStoredAddresses(container);
    await waitFor(() => expect(container.querySelector<HTMLInputElement>(`#street-${id}`)?.value).toBe("Storgata 1"));
    // A second address is started and then closed.
    fireEvent.click(q.getByRole("button", { name: /Add Postal Address/ }));
    const next = container.querySelector<HTMLInputElement>("#place-street")!;
    fireEvent.change(next, { target: { value: "Hytteveien 2" } });
    pressClose(container, next);
    await settle();
    expect(creates().filter((c) => (c.body as { type?: string } | null)?.type === "t:PlaceClaim")).toHaveLength(1);
    expect(deletes()).toHaveLength(0);
    expect((await freshRead()).map((c) => claimFieldText(c, "streetLine"))).toEqual(["Storgata 1"]);
    expect(container.querySelector<HTMLInputElement>(`#street-${id}`)?.value).toBe("Storgata 1");
  });
});

/** Opens the add form on the card, types `street` into Street, and focuses it. */
async function openAndType(container: HTMLElement, street: string) {
  const q = within(container);
  fireEvent.click(await q.findByRole("button", { name: /Add Postal Address/ }));
  const field = container.querySelector<HTMLInputElement>("#place-street")!;
  fireEvent.change(field, { target: { value: street } });
  field.focus();
  return { field, close: q.getByRole("button", { name: "Close" }) };
}

describe("R2–R4 — Close (Agent.Scaling delta 2, K2, K3, K5)", () => {
  it("R2 a blur that arrives AFTER the click, while the form closes, saves nothing (the `closing` guard)", async () => {
    // K2: a browser may fire focusout as it removes the focused Close button, after a keyboard
    // press; in the same batch React has not yet unmounted the form, so its onBlur still runs.
    const { container } = show();
    const { field, close } = await openAndType(container, "Storgata 1");
    act(() => {
      fireEvent.click(close);
      fireEvent.blur(field, { relatedTarget: null });
    });
    await settle();
    expect(creates()).toHaveLength(0);
    expect(store.size).toBe(0);
    expect(container.querySelector("#place-street")).toBeNull();
  });

  it("R3 a blur that arrives BEFORE the click (focus moved at pointerdown) saves nothing", async () => {
    const { container } = show();
    const { field, close } = await openAndType(container, "Storgata 1");
    fireEvent.pointerDown(close);
    fireEvent.blur(field, { relatedTarget: null });
    fireEvent.mouseDown(close);
    fireEvent.mouseUp(close);
    fireEvent.click(close);
    await settle();
    expect(creates()).toHaveLength(0);
    expect(store.size).toBe(0);
    expect(container.querySelector("#place-street")).toBeNull();
  });

  it("R3 control: a press on Close that is cancelled, then leaving the form, still saves", async () => {
    const { container } = show();
    const { field, close } = await openAndType(container, "Storgata 1");
    fireEvent.pointerDown(close);
    fireEvent.pointerCancel(close);
    fireEvent.blur(field, { relatedTarget: null });
    await waitFor(() => expect(ofType("t:PlaceClaim")).toHaveLength(1));
  });

  it("R3 control: a press on Close, then focus back in the form, then leaving it, still saves", async () => {
    const { container } = show();
    const { field, close } = await openAndType(container, "Storgata 1");
    fireEvent.pointerDown(close);
    fireEvent.focus(field);
    fireEvent.blur(field, { relatedTarget: null });
    await waitFor(() => expect(ofType("t:PlaceClaim")).toHaveLength(1));
  });

  it("R4 Close during a save whose read-back then fails: the message is true (may be stored, not shown, do not retype)", async () => {
    // K5: the hook's own message says "Your address is still here — try again", but the form is gone.
    const { container } = show();
    const { field } = await openAndType(container, "Storgata 1");
    const release = holdNextCreate();
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(creates()).toHaveLength(1));
    pressClose(container, field);
    // The read-back after the save fails.
    failNextListing();
    await act(async () => {
      release();
    });
    await waitFor(() => expect(container.querySelector("[data-testid='place-closed-unconfirmed']")).not.toBeNull());
    const shown = container.querySelector("[data-testid='place-closed-unconfirmed']")!.textContent!;
    expect(shown).toMatch(/may be stored/);
    expect(shown).toMatch(/do not type it again/);
    expect(container.textContent).not.toMatch(/still here/);
    expect(container.querySelector("[data-testid='place-claims-error']")).toBeNull();
    expect(container.querySelector("#place-street")).toBeNull();
    // The address was in fact stored, and Close deleted nothing.
    expect(ofType("t:PlaceClaim")).toHaveLength(1);
    expect(deletes()).toHaveLength(0);
    // Opening the form again puts the message away.
    fireEvent.click(within(container).getByRole("button", { name: /Add Postal Address/ }));
    expect(container.querySelector("[data-testid='place-closed-unconfirmed']")).toBeNull();
  });
});
