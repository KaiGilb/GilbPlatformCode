// @vitest-environment jsdom
// Ported from GilbApp `src/components/records/AddressRows.c214e6.test.tsx` (9 cases: a person's Address section, MyNet's way).
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
const OTHER = `${VAULT}/e/06gkperson0000000000000002`;


function show(over: Partial<Parameters<typeof AddressRows>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AddressRows
        title="Postal Address"
        legacyText=""
        vaultId={VAULT}
        recordEntityUri={RECORD}
        principal={PRINCIPAL}
        canEdit
        {...over}
      />
    </QueryClientProvider>,
  );
}

const ofType = (t: string) => [...store.values()].filter((e) => e.type === t);

async function pick(q: ReturnType<typeof within>, box: string, text: string) {
  fireEvent.change(q.getByLabelText(box), { target: { value: text } });
  const rows = () => (q.getAllByRole("option") as HTMLElement[]).filter((o) => o.textContent?.startsWith(text));
  await waitFor(() => expect(rows().length).toBeGreaterThan(0));
  fireEvent.click(rows()[0]!);
}

/** An address as MyNet's writer stores one, about `subject`. */
function seedAddress(subject: string, label: string, street: string, placeIds: string[]) {
  const id = fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": subject }, "a:placeClaimLabel": label });
  const uri = `${VAULT}/e/${id}`;
  if (street) fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": subject }, "a:detailOf": { "@id": uri }, "a:streetLine": street });
  for (const p of placeIds) fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": subject }, "a:detailOf": { "@id": uri }, "a:claimPlace": { "@id": p } });
  return id;
}

describe("a person's Address section, MyNet's way", () => {
  it("the section is titled with the master's label, and its add control is built on it", async () => {
    show();
    expect(screen.getByRole("heading", { name: "Postal Address" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add Postal Address/ })).toBeTruthy();
  });

  it("ADD: Location, then a Country PICKED from the catalogue saves one t:PlaceClaim about this record", async () => {
    const { container } = show();
    const q = within(container);
    fireEvent.click(q.getByRole("button", { name: /Add Postal Address/ }));
    fireEvent.change(q.getByLabelText(/Location/), { target: { value: "home" } });
    await pick(q, "Country", "Norway");
    // Stored as MyNet stores it: the composite about the RECORD, and the country as its own field.
    await waitFor(() => expect(ofType("t:SelfAssertedFieldClaim")).toHaveLength(1));
    const [composite] = ofType("t:PlaceClaim");
    expect(composite!.facts).toEqual({ "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": "home", "a:directReader": PRINCIPAL });
    expect(ofType("t:SelfAssertedFieldClaim")[0]!.facts["a:claimPlace"]).toEqual({ "@id": `${GEO}/no` });
    // The store's read-back confirmed it: the add form closed and the saved address is shown.
    await waitFor(() => expect(q.getByTestId("place-claim-label").textContent).toBe("home"));
    expect(q.getByRole("button", { name: /Add Postal Address/ })).toBeTruthy();
  });

  it("CHANGE: a stored address is edited in place — the street becomes its own field claim, the rest untouched", async () => {
    const id = seedAddress(RECORD, "home", "", [`${GEO}/no`]);
    const before = JSON.stringify(store.get(id)!.facts);
    const { container } = show();
    await openStoredAddresses(container);
    const q = within(container);
    const street = await waitFor(() => q.getByLabelText(/Street\.\./) as HTMLInputElement);
    fireEvent.change(street, { target: { value: "Storgata 9" } });
    fireEvent.blur(street);
    await waitFor(() =>
      expect(ofType("t:SelfAssertedFieldClaim").map((e) => e.facts["a:streetLine"]).filter(Boolean)).toEqual(["Storgata 9"]),
    );
    const streetField = ofType("t:SelfAssertedFieldClaim").find((e) => e.facts["a:streetLine"])!;
    expect(streetField.facts["a:detailOf"]).toEqual({ "@id": `${VAULT}/e/${id}` });
    expect(streetField.facts["a:claimSubject"]).toEqual({ "@id": RECORD });
    // The composite carries the same facts it had (a merge-patch of label + subject, unchanged values).
    expect(JSON.stringify(store.get(id)!.facts)).toBe(before);
  });

  it("CHANGE: picking a Country on a stored address adds that field only; the city field is untouched", async () => {
    const id = seedAddress(RECORD, "home", "", [`${GEO}/oslo`]);
    const cityBefore = JSON.stringify(ofType("t:SelfAssertedFieldClaim")[0]!.facts);
    const { container } = show();
    await openStoredAddresses(container);
    const q = within(container);
    await waitFor(() => expect(q.getByTestId("place-city-value").textContent).toBe("Oslo"));
    await pick(q, "Country", "Norway");
    await waitFor(() => expect(ofType("t:SelfAssertedFieldClaim")).toHaveLength(2));
    const fields = ofType("t:SelfAssertedFieldClaim").map((e) => e.facts);
    expect(JSON.stringify(fields[0])).toBe(cityBefore);
    expect(fields[1]).toEqual({
      "a:claimSubject": { "@id": RECORD },
      "a:detailOf": { "@id": `${VAULT}/e/${id}` },
      "a:claimPlace": { "@id": `${GEO}/no` },
      "a:directReader": PRINCIPAL,
    });
    await waitFor(() => expect(q.getByTestId("place-country-value").textContent).toBe("Norway"));
  });

  it("REMOVE: the × retracts the address — its fields and the composite — and only it", async () => {
    seedAddress(RECORD, "home", "Storgata 1", [`${GEO}/no`]);
    const cabin = seedAddress(RECORD, "cabin", "", [`${GEO}/no`]);
    const { container } = show();
    const q = within(container);
    const remove = await waitFor(() => q.getByRole("button", { name: "Remove address home" }));
    fireEvent.click(remove);
    await waitFor(() => expect(q.queryByRole("button", { name: "Remove address home" })).toBeNull());
    expect(ofType("t:PlaceClaim").map((e) => e.facts["a:placeClaimLabel"])).toEqual(["cabin"]);
    expect(ofType("t:SelfAssertedFieldClaim").map((e) => e.facts["a:detailOf"])).toEqual([{ "@id": `${VAULT}/e/${cabin}` }]);
  });

  // s8 card UX (Kai's walk 2, item 2, verbatim: "the tiny little oddly placed x deleted the address. Use same
  // delete as in MyNet"): the address's remove control is MyNet's red round (−), the first element of the
  // frame's top row, in front of the address's name. It is not a text ×.
  it("S8: the remove control is MyNet's (−): an SVG, no text ×, first in the frame's top row, and disabled while a write is in flight", async () => {
    seedAddress(RECORD, "home", "Storgata 1", [`${GEO}/no`]);
    const { container } = show();
    const q = within(container);
    const remove = await waitFor(() => q.getByRole("button", { name: "Remove address home" }));
    expect(remove.getAttribute("data-remove-control")).toBe("minus-circle");
    expect(remove.textContent).toBe("");
    expect(remove.querySelector("svg")).not.toBeNull();
    expect(remove.className).toContain("size-6");
    const top = remove.parentElement!;
    expect(top.firstElementChild).toBe(remove);
    expect(top.contains(q.getByTestId("place-claim-label"))).toBe(true);
    expect(container.textContent ?? "").not.toMatch(/[×✕]/);
  });

  it("shows only this record's addresses; another person's in the same vault is not on this card", async () => {
    seedAddress(RECORD, "home", "", [`${GEO}/no`]);
    seedAddress(OTHER, "theirs", "", [`${GEO}/no`]);
    const { container } = show();
    const q = within(container);
    await waitFor(() => expect(q.getAllByTestId("place-claim-label").map((e) => e.textContent)).toEqual(["home"]));
  });

  it("READ-ONLY (the record may not be written): the stored address is shown, with no add and no remove", async () => {
    seedAddress(RECORD, "home", "Storgata 1", [`${GEO}/no`, `${GEO}/oslo`]);
    const { container } = show({ canEdit: false });
    const q = within(container);
    // ⚠ Kai's walk (Cycle214 1e): a read-only address shows its filled parts as compact lines, with
    //   nothing to tap (the read-only frame with `place-claim-street` is only shown until its places
    //   resolve).
    await waitFor(() => expect(q.getByTestId("place-view-region-country").textContent).toMatch(/Norway/));
    expect(q.getByTestId("place-view-street").textContent).toBe("Storgata 1");
    expect(q.queryByTestId("place-claim-compact")).toBeNull();
    expect(q.getByTestId("place-claim-label").textContent).toBe("home");
    expect(q.queryByRole("button", { name: /Add Postal Address/ })).toBeNull();
    expect(q.queryByRole("button", { name: /Remove address/ })).toBeNull();
    expect(q.queryByLabelText(/Street\.\./)).toBeNull();
  });

  it("a plain-text address the record already holds is shown, never dropped", async () => {
    const { container } = show({ legacyText: "Storgata 1\n0150 Oslo" });
    expect(within(container).getByTestId("postal-address-legacy").textContent).toBe("Storgata 1\n0150 Oslo");
  });
});
