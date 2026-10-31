// @vitest-environment jsdom
// New. What the Address group says about the READ of the addresses (F1-F4), which GilbApp's group did not: with no vault it drew nothing, while reading it drew
// nothing, and after a failed read it drew an empty group that reads as "no address". Every state is told apart through `use-place-claims`'s `status`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { MAX_LIST_PAGES } from "@kaigilb/gilbplatformcode-vault-records-of-type";
import { NO_VAULT_SAYS, READ_FAILED_SAYS } from "@kaigilb/gilbplatformcode-use-place-claims";
import { NO_VAULT_NOTE, READING_NOTE, READ_FAILED_NOTE, incompleteNote } from "@kaigilb/gilbplatformcode-place-claims-card";
import { resetGeoOrigin } from "@kaigilb/gilbplatformcode-geo-origin";
import { AddressRows } from "./index";
import * as fake from "../test/fakePlaceStore";
import { GEO } from "../test/ported";
import { PRINCIPAL, RECORD, VAULT, useWorld } from "../test/world";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({
  attributeSpelling: vi.fn(async (name: string) => name),
  typeSpelling: vi.fn(async (name: string) => `t:${name}`),
  attributeLabel: vi.fn(async () => null),
}));

useWorld();
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  errors.mockRestore();
});

function show(over: Partial<Parameters<typeof AddressRows>[0]> = {}, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={qc}>
      <AddressRows title="Postal Address" legacyText="" vaultId={VAULT} recordEntityUri={RECORD} principal={PRINCIPAL} canEdit {...over} />
    </QueryClientProvider>,
  );
}
const group = () => document.querySelector<HTMLElement>('section[data-group="address"]');
/** Every listing of the vault fails (the platform is down for reads). */
function failAllListings() {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => (/\/lws\/vault\/[^/]+\/records$/.test(new URL(String(input)).pathname) ? new Response("down", { status: 503 }) : inner(input as never, init))));
}
const seedHome = (label = "home") => fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": label });

describe("(F1) no vault: said, not drawn as nothing", () => {
  it("the group stays and says the addresses are not shown, and that this is not 'none'; no request, no way to add", async () => {
    show({ vaultId: null });
    await waitFor(() => expect(within(group()!).getByTestId("place-claims-no-vault")).toBeTruthy());
    expect(within(group()!).getByTestId("place-claims-no-vault").textContent).toBe(NO_VAULT_SAYS);
    expect(NO_VAULT_NOTE).toBe(NO_VAULT_SAYS);
    expect(fake.calls).toEqual([]);
    expect(screen.queryByTestId("address-add")).toBeNull();
    expect(screen.queryByTestId("add-own")).toBeNull();
  });
});

describe("(F2) reading: said, and the group is never hidden meanwhile", () => {
  it("'Reading addresses…' (polite) until the first read answers; then the note goes", async () => {
    show({ canEdit: false });
    const note = within(group()!).getByTestId("place-claims-reading");
    expect(note.textContent).toBe(READING_NOTE);
    expect(note.getAttribute("aria-live")).toBe("polite");
    await waitFor(() => expect(screen.queryByTestId("place-claims-reading")).toBeNull());
  });

  it("with addresses read, nothing is said about reading", async () => {
    seedHome();
    show({ canEdit: false });
    await waitFor(() => expect(within(group()!).getAllByTestId("place-claim")).toHaveLength(1));
    expect(screen.queryByTestId("place-claims-reading")).toBeNull();
  });
});

describe("(F3) a failed read: said, and nothing offered on top of an address that was not seen", () => {
  it("the sentence is shown (an alert) and is not 'no address'; '+ Add' and '+ Add your own' are withheld", async () => {
    failAllListings();
    show();
    const alert = await screen.findByTestId("place-claims-error");
    expect(alert.textContent).toBe(READ_FAILED_SAYS);
    expect(READ_FAILED_NOTE).toBe(READ_FAILED_SAYS);
    expect(alert.getAttribute("role")).toBe("alert");
    expect(group()).toBeTruthy();
    expect(screen.queryByTestId("address-add")).toBeNull();
    expect(screen.queryByTestId("add-own")).toBeNull();
    expect(group()!.textContent).not.toMatch(/Add Postal Address/);
  });

  it("control: the same record with the read answering offers '+ Add'", async () => {
    show();
    expect(await screen.findByTestId("address-add")).toBeTruthy();
  });

  it("a read that answered and a later one that failed keeps what was read and the add (the person can still see what is there)", async () => {
    seedHome();
    show();
    await waitFor(() => expect(within(group()!).getAllByTestId("place-claim")).toHaveLength(1));
    fireEvent.click(await within(group()!).findByRole("button", { name: "Edit address home" }));
    failAllListings();
    const street = await screen.findByLabelText("Street..");
    fireEvent.change(street, { target: { value: "Storgata 2" } });
    fireEvent.blur(street);
    // the change was written; the read-back failed, so it is not confirmed, and the group says the read failed
    await waitFor(() => expect(screen.getAllByTestId("place-claims-error").length).toBeGreaterThan(0));
    expect(within(group()!).getAllByTestId("place-claim")).toHaveLength(1);
    expect(screen.getByTestId("address-add")).toBeTruthy();
  });
});

describe("(F3) the 'answered' mark belongs to one vault", () => {
  it("a vault whose read answered, then another vault whose read failed: nothing is offered for the second", async () => {
    seedHome();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = show({}, qc);
    await waitFor(() => expect(within(group()!).getAllByTestId("place-claim")).toHaveLength(1));
    expect(screen.getByTestId("address-add")).toBeTruthy();
    failAllListings();
    view.rerender(
      <QueryClientProvider client={qc}>
        <AddressRows title="Postal Address" legacyText="" vaultId={`${VAULT}2`} recordEntityUri={RECORD} principal={PRINCIPAL} canEdit />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("place-claims-error").textContent).toBe(READ_FAILED_SAYS));
    expect(screen.queryByTestId("address-add")).toBeNull();
  });
});

describe("(F4) an incomplete read: the addresses read, and what was not", () => {
  it("capped: the addresses read are drawn, and 'Not every address in <vault name> was read.'", async () => {
    for (let i = 0; i < MAX_LIST_PAGES + 3; i += 1) seedHome(`a${i}`);
    fake.door.pageSize = 1;
    show({ vaultName: "Hytta" });
    const note = await screen.findByTestId("place-claims-incomplete");
    expect(note.textContent).toBe("Not every address in Hytta was read.");
    expect(within(group()!).getAllByTestId("place-claim").length).toBe(MAX_LIST_PAGES);
  });

  it("without a name: 'this vault'", async () => {
    for (let i = 0; i < MAX_LIST_PAGES + 3; i += 1) seedHome(`a${i}`);
    fake.door.pageSize = 1;
    show();
    expect((await screen.findByTestId("place-claims-incomplete")).textContent).toBe("Not every address in this vault was read.");
  });

  it("stalled: the other wording, and an empty read is not an empty group", async () => {
    fake.door.pages = (offset, types) => (types.includes("PlaceClaim") ? { records: [], total: 9, complete: false, pageSize: 1, offset, nextOffset: offset } : null);
    show({ vaultName: "Hytta", canEdit: false });
    const note = await screen.findByTestId("place-claims-incomplete");
    expect(note.textContent).toBe(incompleteNote("stalled", "Hytta"));
    expect(note.textContent).toBe("Not every address in Hytta could be read: the read could not go on.");
    expect(group()).toBeTruthy();
  });
});

describe("the fail-closed sentence when the catalogue's address is not set", () => {
  it("a new address is refused with the use-place-claims sentence, and nothing is written", async () => {
    resetGeoOrigin();
    show();
    fireEvent.click(await screen.findByTestId("address-add"));
    const street = await screen.findByLabelText("Street..");
    fireEvent.change(street, { target: { value: "Storgata 1" } });
    fireEvent.keyDown(street, { key: "Enter" });
    expect((await screen.findByTestId("place-claims-error")).textContent).toBe("Addresses cannot be saved here: the place catalogue is not known.");
    expect(fake.writes.filter((w) => w.method !== "GET")).toEqual([]);
  });
});

describe("the add affordance by mode", () => {
  it("in a card with modes, presented: no '+ Add'; a read-only holder: none either", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CardModeProvider canEdit>
          <AddressRows title="Postal Address" legacyText="x" vaultId={VAULT} recordEntityUri={RECORD} principal={PRINCIPAL} canEdit />
        </CardModeProvider>
      </QueryClientProvider>,
    );
    await screen.findByTestId("postal-address-legacy");
    expect(screen.queryByTestId("address-add")).toBeNull();
    cleanup();
    show({ canEdit: false, legacyText: "x" });
    await screen.findByTestId("postal-address-legacy");
    expect(screen.queryByTestId("address-add")).toBeNull();
  });

  it("the vault is the record's: the listing and a new address go to the vault named, not another", async () => {
    show({ vaultId: VAULT });
    fireEvent.click(await screen.findByTestId("address-add"));
    const street = await screen.findByLabelText("Street..");
    fireEvent.change(street, { target: { value: "Storgata 1" } });
    fireEvent.keyDown(street, { key: "Enter" });
    await waitFor(() => expect(fake.writes.filter((w) => w.method === "POST").length).toBeGreaterThan(0));
    for (const w of fake.writes.filter((x) => x.method === "POST")) expect(w.url).toContain(new URL(VAULT).host);
    expect(GEO).toBeTruthy();
  });
});
