// @vitest-environment jsdom
// Ported from GilbApp `src/components/records/AddressRows.addressLines.c214.test.tsx` (4 cases: Address 1 / Address 2).
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
import { GEO, creates, deletes, holdNextCreate, openStoredAddresses, patches } from "../test/ported";
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


function show(over: Partial<Parameters<typeof AddressRows>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AddressRows title="Postal Address" legacyText="" vaultId={VAULT} recordEntityUri={RECORD} principal={PRINCIPAL} canEdit {...over} />
    </QueryClientProvider>,
  );
}

/** Every `<label>` in the container, in document order. */
const labels = (el: HTMLElement) => [...el.querySelectorAll("label")].map((l) => l.textContent?.trim() ?? "");
const ofType = (t: string) => [...store.values()].filter((e) => e.type === t);

/** An address as MyNet's writer stores one: street, two lines, Norway. */
function seedAddress(placeId = `${GEO}/no`) {
  const id = fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": "home" });
  const uri = `${VAULT}/e/${id}`;
  const f = (facts: Record<string, unknown>) =>
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": RECORD }, "a:detailOf": { "@id": uri }, ...facts });
  f({ "a:streetLine": "Storgata 1" });
  f({ "a:addressLine1": "c/o Hansen" });
  f({ "a:addressLine2": "Building B" });
  f({ "a:claimPlace": { "@id": placeId } });
  return id;
}

describe("Cycle214 1e — Address 1 / Address 2 on a person card", () => {
  it("the add form shows both lines directly under Street, labelled by the master", async () => {
    const { container } = show();
    const q = within(container);
    fireEvent.click(q.getByRole("button", { name: /Add Postal Address/ }));
    await waitFor(() => {
      const ls = labels(container);
      const at = ls.indexOf("Street..");
      expect(ls.slice(at, at + 3)).toEqual(["Street..", "Address 1", "Address 2"]);
    });
  });

  it("a stored address: the editor shows both lines under Street with their values; a change writes that line only", async () => {
    seedAddress();
    const { container } = show();
    await openStoredAddresses(container);
    const q = within(container);
    const line1 = await waitFor(() => q.getByLabelText("Address 1") as HTMLInputElement);
    const ls = labels(container);
    const at = ls.indexOf("Street..");
    expect(ls.slice(at, at + 3)).toEqual(["Street..", "Address 1", "Address 2"]);
    expect(line1.value).toBe("c/o Hansen");
    expect((q.getByLabelText("Address 2") as HTMLInputElement).value).toBe("Building B");

    fireEvent.change(line1, { target: { value: "c/o Olsen" } });
    fireEvent.blur(line1);
    await waitFor(() =>
      expect(ofType("t:SelfAssertedFieldClaim").map((e) => e.facts["a:addressLine1"]).filter(Boolean)).toEqual(["c/o Olsen"]),
    );
    expect(ofType("t:SelfAssertedFieldClaim").map((e) => e.facts["a:addressLine2"]).filter(Boolean)).toEqual(["Building B"]);
    expect(ofType("t:SelfAssertedFieldClaim").map((e) => e.facts["a:streetLine"]).filter(Boolean)).toEqual(["Storgata 1"]);
  });

  it("clearing Address 1 removes that line only; the address and Address 2 stay", async () => {
    const id = seedAddress();
    const { container } = show();
    await openStoredAddresses(container);
    const q = within(container);
    const line1 = await waitFor(() => q.getByLabelText("Address 1") as HTMLInputElement);
    fireEvent.change(line1, { target: { value: "" } });
    fireEvent.blur(line1);
    await waitFor(() => expect(ofType("t:SelfAssertedFieldClaim").some((e) => "a:addressLine1" in e.facts)).toBe(false));
    expect(store.has(id)).toBe(true);
    expect(ofType("t:SelfAssertedFieldClaim").map((e) => e.facts["a:addressLine2"]).filter(Boolean)).toEqual(["Building B"]);
  });

  it("read-only (a record that may not be written): the lines show under the street", async () => {
    seedAddress();
    const { container } = show({ canEdit: false });
    const q = within(container);
    // ⚠ Kai's walk (Cycle214 1e): once its places resolve, a read-only address shows its filled parts
    //   as compact lines (`place-view-*`). Waiting for THOSE, ⛔ not the read-only frame shown while the
    //   places are still being looked up, so this checks the settled view.
    await waitFor(() => expect(q.getByTestId("place-view-line1").textContent).toBe("c/o Hansen"));
    expect(q.getByTestId("place-view-line2").textContent).toBe("Building B");
    const text = container.textContent ?? "";
    expect(text.indexOf("Storgata 1")).toBeLessThan(text.indexOf("c/o Hansen"));
    expect(text.indexOf("c/o Hansen")).toBeLessThan(text.indexOf("Building B"));
  });
});
