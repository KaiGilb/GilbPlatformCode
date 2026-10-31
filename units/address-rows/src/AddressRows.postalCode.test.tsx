// @vitest-environment jsdom
// Ported from GilbApp `src/components/records/AddressRows.postalCode.c214.test.tsx` (5 cases: Postal Code).
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
  const r = render(
    <QueryClientProvider client={qc}>
      <AddressRows title="Postal Address" legacyText="" vaultId={VAULT} recordEntityUri={RECORD} principal={PRINCIPAL} canEdit {...over} />
    </QueryClientProvider>,
  );
  return { ...r, q: within(r.container) };
}

const labels = (el: HTMLElement) => [...el.querySelectorAll("label")].map((l) => l.textContent?.trim() ?? "");
const ofType = (t: string) => [...store.values()].filter((e) => e.type === t);
const freshRead = async () => claimsAbout(await listPlaceClaimsInVault(VAULT), RECORD);

/** An address as MyNet's writer stores one: Location, Address 2, Postal Code "0150", Norway. */
function seedAddress(placeId = `${GEO}/no`) {
  const id = fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": "home" });
  const uri = `${VAULT}/e/${id}`;
  const f = (facts: Record<string, unknown>) =>
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": RECORD }, "a:detailOf": { "@id": uri }, ...facts });
  f({ "a:addressLine2": "Building B" });
  f({ "a:postalCode": "0150" });
  f({ "a:claimPlace": { "@id": placeId } });
  return id;
}

describe("Cycle214 1e — Postal Code on a person card", () => {
  it("the add form shows Postal Code directly under Address 2, labelled by the master, as a text box", async () => {
    const { container, q } = show();
    fireEvent.click(q.getByRole("button", { name: /Add Postal Address/ }));
    await waitFor(() => {
      const ls = labels(container);
      const at = ls.indexOf("Address 2");
      expect(ls.slice(at, at + 2)).toEqual(["Address 2", "Postal Code"]);
    });
    // ⛔ A text box, ⛔ not a number box: a number box would drop the zero.
    expect((q.getByLabelText("Postal Code") as HTMLInputElement).type).toBe("text");
  });

  it("🔴 only a Postal Code, then leaving the form → saved as '0150', and there on a fresh read", async () => {
    const { q } = show();
    fireEvent.click(await q.findByRole("button", { name: /Add Postal Address/ }));
    const box = await q.findByLabelText("Postal Code");
    fireEvent.change(box, { target: { value: "0150" } });
    fireEvent.blur(box); // focus leaves the form
    await waitFor(() => expect(q.getByTestId("place-claim-label").textContent).toBe("0150"));
    expect(q.queryByTestId("place-claims-error")).toBeNull();
    const rows = await freshRead();
    expect(rows).toHaveLength(1);
    expect(claimFieldText(rows[0]!, "postalCode")).toBe("0150");
    const stored = ofType("t:SelfAssertedFieldClaim").map((e) => e.facts["a:postalCode"]).filter((v) => v !== undefined);
    expect(stored).toEqual(["0150"]);
  });

  it("a stored address: the box holds '0150' under Address 2; a change writes the postal code only", async () => {
    seedAddress();
    const { container, q } = show();
    await openStoredAddresses(container);
    const box = await waitFor(() => q.getByLabelText("Postal Code") as HTMLInputElement);
    const ls = labels(container);
    const at = ls.indexOf("Address 2");
    expect(ls.slice(at, at + 2)).toEqual(["Address 2", "Postal Code"]);
    expect(box.value).toBe("0150");

    fireEvent.change(box, { target: { value: "0010" } });
    fireEvent.blur(box);
    await waitFor(() =>
      expect(ofType("t:SelfAssertedFieldClaim").map((e) => e.facts["a:postalCode"]).filter(Boolean)).toEqual(["0010"]),
    );
    expect(ofType("t:SelfAssertedFieldClaim").map((e) => e.facts["a:addressLine2"]).filter(Boolean)).toEqual(["Building B"]);
  });

  it("clearing the Postal Code removes that field only; the address and Address 2 stay", async () => {
    const id = seedAddress();
    const { container, q } = show();
    await openStoredAddresses(container);
    const box = await waitFor(() => q.getByLabelText("Postal Code") as HTMLInputElement);
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    await waitFor(() => expect(ofType("t:SelfAssertedFieldClaim").some((e) => "a:postalCode" in e.facts)).toBe(false));
    expect(store.has(id)).toBe(true);
    expect(ofType("t:SelfAssertedFieldClaim").map((e) => e.facts["a:addressLine2"]).filter(Boolean)).toEqual(["Building B"]);
  });

  it("read-only (a record that may not be written): the postal code shows under Address 2", async () => {
    seedAddress();
    const { container, q } = show({ canEdit: false });
    // ⚠ Kai's walk (Cycle214 1e): the settled read-only view is the compact lines; the Postal Code
    //   leads its "Postal City" line.
    await waitFor(() => expect(q.getByTestId("place-view-postal-city").textContent).toMatch(/^0150( |$)/));
    const text = container.textContent ?? "";
    expect(text.indexOf("Building B")).toBeLessThan(text.indexOf("0150"));
  });
});
