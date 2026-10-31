// @vitest-environment jsdom
// Ported from GilbApp `src/components/records/AddressRows.addOwn.s5e.test.tsx` (6 cases: "+ Add your own" in place on the one card).
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
import type { OneCardGroup } from "@kaigilb/gilbplatformcode-one-card-merge";
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


/** The one card with a row of theirs in the Address group (their postal address, shared with the holder). */
const THEIRS: OneCardGroup = {
  field: "a:postalAddress",
  term: "https://id.gilb.test/base/a/postalAddress",
  label: "Postal Address",
  known: true,
  many: true,
  bothKept: false,
  rows: [{ field: "a:postalAddress", value: "Storgata 1, Oslo", source: "theirs", rung: "public", rungWords: "Public", editable: false }],
};
const VIEW: OneCardView = {
  marks: true,
  byKind: new Map([["address", { kind: "address", groups: [THEIRS] }]]),
  own: [],
  rowLabel: () => null,
  valueText: (r) => r.value,
};

function show({ canEdit = true, oneCard = true }: { canEdit?: boolean; oneCard?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rows = <AddressRows title="Postal Address" legacyText="" vaultId={VAULT} recordEntityUri={RECORD} principal={PRINCIPAL} canEdit={canEdit} />;
  const r = render(
    <QueryClientProvider client={qc}>
      <CardModeProvider canEdit={canEdit}>
        <CardModeBar />
        {oneCard ? <OneCardProvider view={VIEW}>{rows}</OneCardProvider> : rows}
      </CardModeProvider>
    </QueryClientProvider>,
  );
  return { ...r, q: within(r.container) };
}
const group = () => document.querySelector<HTMLElement>('section[data-group="address"]')!;
const settle = () => new Promise((r) => setTimeout(r, 40));
const freshRead = async () => claimsAbout(await listPlaceClaimsInVault(VAULT), RECORD);
/** Every write the record client was asked for, in order. */
const writes = () => [
  ...creates().map((c) => ["create", c.url, c.body]),
  ...patches().map((c) => ["patch", c.url, c.body]),
  ...deletes().map((c) => ["delete", c.url, c.body]),
];

describe("S5e + Add your own, Address group", () => {
  it("is under their address while the card is presented; pressing it opens the address's own add form in the group, the cursor in Location", async () => {
    show();
    const add = await within(group()).findByTestId("add-own");
    expect(add.getAttribute("aria-label")).toBe("Add your own postal address");
    await userEvent.click(add);
    const loc = await within(group()).findByLabelText("Location");
    expect(document.activeElement).toBe(loc);
    expect(within(group()).queryByTestId("add-own")).toBeNull();
    // their row stays, shaded and read-only; the card is still presented
    expect(within(group()).getAllByTestId("one-card-row")).toHaveLength(1);
    expect(document.querySelector("[data-card-mode]")?.getAttribute("data-card-mode")).toBe("presentation");
  });

  it("Enter in Street saves through the address's own save; the new address is the holder's, marked Yours, and the focus returns to the button", async () => {
    show();
    await userEvent.click(await within(group()).findByTestId("add-own"));
    const street = await within(group()).findByLabelText("Street..");
    fireEvent.change(street, { target: { value: "Bakkegata 4" } });
    fireEvent.keyDown(street, { key: "Enter" });
    await waitFor(async () => expect(await freshRead()).toHaveLength(1));
    await waitFor(() => expect(within(group()).queryByLabelText("Location")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(within(group()).getByTestId("add-own")));
    expect(group().textContent).toContain("Bakkegata 4");
    // C214-UI2 (changed on purpose, Kai "Remove the Their/Yours badges"): no Yours mark over a block of yours (was one-card-own-block).
    expect(within(group()).queryByTestId("one-card-own-block")).toBeNull();
    // theirs is still there: both are kept
    expect(within(group()).getAllByTestId("one-card-row")).toHaveLength(1);
  });

  it("Close writes nothing, even with something typed, and returns the focus to the button", async () => {
    show();
    await userEvent.click(await within(group()).findByTestId("add-own"));
    fireEvent.change(await within(group()).findByLabelText("Street.."), { target: { value: "Bakkegata 4" } });
    await userEvent.click(within(group()).getByTestId("place-add-close"));
    await settle();
    expect(writes()).toEqual([]);
    expect(within(group()).queryByLabelText("Location")).toBeNull();
    expect(document.activeElement).toBe(within(group()).getByTestId("add-own"));
  });

  it("Esc writes nothing, even with something typed, and returns the focus to the button", async () => {
    show();
    await userEvent.click(await within(group()).findByTestId("add-own"));
    const street = await within(group()).findByLabelText("Street..");
    fireEvent.change(street, { target: { value: "Bakkegata 4" } });
    fireEvent.keyDown(street, { key: "Escape" });
    await settle();
    expect(writes()).toEqual([]);
    expect(within(group()).queryByLabelText("Location")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(group()).getByTestId("add-own")));
  });

  it("a read-only holder sees no '+ Add your own'; nor does an unlinked card", async () => {
    show({ canEdit: false });
    await settle();
    expect(group()).toBeTruthy();
    expect(within(group()).queryByTestId("add-own")).toBeNull();
    cleanup();
    show({ oneCard: false });
    await settle();
    expect(document.querySelector("[data-testid='add-own']")).toBeNull();
  });

  it("the same writes as the existing editor (Edit, Add Postal Address, Street, Enter)", async () => {
    const existing = show();
    await userEvent.click(existing.q.getByTestId("card-edit"));
    await userEvent.click(await within(group()).findByTestId("address-add"));
    let street = await within(group()).findByLabelText("Street..");
    fireEvent.change(street, { target: { value: "Bakkegata 4" } });
    fireEvent.keyDown(street, { key: "Enter" });
    await waitFor(async () => expect(await freshRead()).toHaveLength(1));
    await settle();
    const a = JSON.stringify(writes());
    cleanup();
    fake.resetStore();
    show();
    await userEvent.click(await within(group()).findByTestId("add-own"));
    street = await within(group()).findByLabelText("Street..");
    fireEvent.change(street, { target: { value: "Bakkegata 4" } });
    fireEvent.keyDown(street, { key: "Enter" });
    await waitFor(async () => expect(await freshRead()).toHaveLength(1));
    await settle();
    expect(a).not.toBe("[]");
    expect(JSON.stringify(writes())).toBe(a);
  });
});
