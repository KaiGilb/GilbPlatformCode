// New. What the slots hand the card, who gets the same read, and what goes where: the header's "Where / How we met" line and the body's group share
// ONE read (the same `useHolderOriginLine`); the holder's notes are written only to the holder's own vault node and never to the person's card host;
// a card held in another vault offers no note and writes nothing; and the chips follow the card's mode and the holder's right to edit.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as fake from "../test/fakePlaceStore";
import { setUp, stubNetwork, tearDown } from "../test/support";
import { installAnnotationsRoute, resetRoute, route } from "../test/annotationsRoute";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-vault-sets")>()),
  listVaultRecordsPage: (await import("../test/fakePlaceStore")).listVaultRecordsPage,
}));
const stater = vi.hoisted(() => ({ uri: "", noOwnVault: false }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri, () => stater),
);

import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { CardGroup, CardTopSlots } from "@kaigilb/gilbplatformcode-card-group";
import { __resetAnnotationCapability } from "@kaigilb/gilbplatformcode-contact-annotation";
import { __resetContactLabelVocab } from "@kaigilb/gilbplatformcode-contact-labels";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { NO_OWN_VAULT_SAYS } from "@kaigilb/gilbplatformcode-adder-card";
import { contactCardSlots, useHolderOriginLine, type ContactCardArgs } from "./index";

const { VAULT } = fake;
const OTHER = "https://kid.platform.example.test/base";
const HOLDER = "https://id.platform.example.test/base/p/kai";
const M = "https://ontology.example.test/base";
let party: string;

beforeEach(() => {
  setUp();
  fake.resetStore();
  fake.typeSpelling.mockClear();
  __resetContactLabelVocab();
  __resetCatalogueCache();
  __resetHeldNoteChains();
  __resetAnnotationCapability();
  resetRoute();
  stater.uri = `${VAULT}/e/${fake.seed("t:Person", { "a:name": "Kai's vault" })}`;
  stater.noOwnVault = false;
  party = `${VAULT}/e/${fake.seed("t:Person", { "a:name": "Rita Larsen" })}`;
  stubNetwork();
  installAnnotationsRoute(VAULT);
});
afterEach(() => {
  cleanup();
  tearDown();
});

const base = (over: Partial<ContactCardArgs> = {}): ContactCardArgs => ({ vaultId: VAULT, ownVaultId: VAULT, principal: HOLDER, recordEntityUri: party, typeUri: `${M}/t/Person`, canEdit: true, ...over });
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const seedNote = (vault = VAULT, of = party) => fake.seed("t:ContactPrivateNote", { "a:heldParty": { "@id": of }, "a:contactPrivateNote": "x" }, undefined, vault);
const wrapperOf = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
function Card({ args, modeCanEdit = args.canEdit }: { args: ContactCardArgs; modeCanEdit?: boolean }) {
  const slots = contactCardSlots(args);
  return (
    <CardModeProvider canEdit={modeCanEdit}>
      <CardModeBar />
      <CardTopSlots slots={slots} />
      <CardGroup kind="name" title="Name" aside={slots.nameAside} keepInEdit empty={false}>
        <p>Rita Larsen</p>
      </CardGroup>
    </CardModeProvider>
  );
}
const mount = (args: ContactCardArgs, qc = client()) => render(<Card args={args} />, { wrapper: wrapperOf(qc) });
const GEIR = "https://geir.platform.example.test/base/p/3f2b6c1e-1111-4a2b-9c3d-000000000001";
const writes = () => (globalThis.fetch as unknown as { mock: { calls: Array<[unknown, RequestInit | undefined]> } }).mock.calls.filter(([, i]) => ["POST", "PUT", "PATCH", "DELETE"].includes(i?.method ?? "GET"));

describe("the slots", () => {
  it("are nothing without a vault or a record, and exactly three places with both", () => {
    expect(contactCardSlots(base({ vaultId: null }))).toEqual({});
    expect(contactCardSlots(base({ recordEntityUri: null }))).toEqual({});
    expect(Object.keys(contactCardSlots(base())).sort()).toEqual(["howWeMet", "myNote", "nameAside"]);
  });
});

describe("the header and the body get the SAME read", () => {
  it("the header's Where / How we met line and the body's group are one request, and an edit in the group shows in the header at once", async () => {
    route.origin = "Madrid Conference";
    seedNote();
    const qc = client();
    const header = renderHook(() => useHolderOriginLine(base()), { wrapper: wrapperOf(qc) });
    const body = render(<Card args={base()} />, { wrapper: wrapperOf(qc) });
    await waitFor(() => expect(header.result.current.origin).toBe("Madrid Conference"));
    expect(await screen.findByTestId("connection-origin-text")).toHaveTextContent("Madrid Conference");
    expect(route.gets).toHaveLength(1);
    await userEvent.click(screen.getByTestId("card-edit"));
    const box = (await screen.findByTestId("connection-origin-editor")) as HTMLTextAreaElement;
    await userEvent.clear(box);
    await userEvent.type(box, "Oslo summit");
    await userEvent.tab();
    await waitFor(() => expect(header.result.current.origin).toBe("Oslo summit"));
    expect(route.saves.at(-1)).toMatchObject({ origin: "Oslo summit" });
    body.unmount();
  });
  it("the header line is the ORIGIN and never the note, and is blank while there is none", async () => {
    route.note = "my private note";
    seedNote();
    const header = renderHook(() => useHolderOriginLine(base()), { wrapper: wrapperOf(client()) });
    await waitFor(() => expect(route.gets.length).toBeGreaterThan(0));
    await waitFor(() => expect(header.result.current.loading).toBe(false));
    expect(header.result.current.origin).toBeNull();
  });
  it("while the claims are being read the line says it is loading; with no record about the contact it asks the route nothing and is not loading", async () => {
    const header = renderHook(() => useHolderOriginLine(base()), { wrapper: wrapperOf(client()) });
    expect(header.result.current).toEqual({ origin: null, loading: true });
    await waitFor(() => expect(header.result.current.loading).toBe(false));
    expect(route.gets).toHaveLength(0);
  });
});

describe("privacy: the notes go to the holder's own vault node only", () => {
  it("a write goes to the holder's vault node and to no other host, never to the host of the person's card", async () => {
    seedNote();
    mount(base());
    await userEvent.click(await screen.findByTestId("contact-note-editor"));
    await userEvent.type(screen.getByTestId("contact-note-editor"), "Only I see this");
    await userEvent.tab();
    await waitFor(() => expect(route.saves.length).toBeGreaterThan(0));
    const puts = writes().filter(([, i]) => i?.method === "PUT");
    expect(puts.length).toBeGreaterThan(0);
    for (const [u] of puts) {
      const url = new URL(String(u));
      expect(url.origin).toBe("https://hytta.platform.example.test");
      expect(url.pathname).toBe("/base/connect/annotations");
    }
    expect(JSON.stringify(route.saves)).toContain("Only I see this");
    // nothing but the PUT writes: the contact's card is not edited and no claim is made for a note
    expect(writes().filter(([, i]) => i?.method !== "PUT")).toEqual([]);
  });
  it("a card held in ANOTHER vault shows the chips read-only, offers no note, asks the route nothing and writes nothing", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": `${M}/e/relationship-kind-friend` }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    seedNote();
    mount(base({ ownVaultId: OTHER }));
    expect(await screen.findByTestId("contact-kind-chip")).toHaveTextContent("Friend");
    await userEvent.click(screen.getByTestId("card-edit"));
    await new Promise((r) => setTimeout(r, 40));
    expect(screen.queryByTestId("contact-kind-add")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Friend" })).toBeNull();
    expect(screen.queryByTestId("contact-note-editor")).toBeNull();
    expect(screen.queryByTestId("connection-origin-editor")).toBeNull();
    expect(route.gets).toHaveLength(0);
    expect(writes()).toEqual([]);
  });
});

describe("the chips", () => {
  it("are editable only for a holder who may edit, in edit mode, in their own vault", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:circleLabel": { "@id": `${M}/e/circle-label-professional-inner-circle` }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    const view = mount(base());
    expect(await screen.findByTestId("contact-kind-chip")).toBeTruthy();
    expect(screen.queryByTestId("contact-kind-add")).toBeNull(); // presentation: no "+ Kind"
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(await screen.findByTestId("contact-kind-add")).toBeTruthy();
    view.unmount();
    mount(base({ canEdit: false }));
    expect(await screen.findByTestId("contact-kind-chip")).toBeTruthy();
    expect(screen.queryByTestId("card-edit")).toBeNull();
    expect(screen.queryByTestId("contact-kind-add")).toBeNull();
  });
  it("a person with no landing vault is told once to an editor beside the name, and a reader is told nothing", async () => {
    stater.noOwnVault = true;
    const view = mount(base());
    await waitFor(() => expect(document.body.textContent).toContain(NO_OWN_VAULT_SAYS));
    expect(document.body.textContent!.split(NO_OWN_VAULT_SAYS).length - 1).toBe(1);
    view.unmount();
    mount(base({ canEdit: false }));
    await act(() => new Promise((r) => setTimeout(r, 40)));
    expect(document.body.textContent).not.toContain(NO_OWN_VAULT_SAYS);
  });
  it("the tooltip of a chip is the app's help line, and the chip says it is a label", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:circleLabel": { "@id": `${M}/e/circle-label-professional-inner-circle` }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    mount(base());
    const chip = await screen.findByTestId("contact-kind-chip");
    expect(chip.getAttribute("title")).toBe("How they relate to this vault, for you only. It gives them no access to anything.");
  });
});

describe("what the card asks, and for whom", () => {
  it("the chips are the holder's to edit only when the holder may edit, whatever the card's mode says", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:circleLabel": { "@id": `${M}/e/circle-label-professional-inner-circle` }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    render(<Card args={base({ canEdit: false })} modeCanEdit />, { wrapper: wrapperOf(client()) });
    expect(await screen.findByTestId("contact-kind-chip")).toBeTruthy();
    await userEvent.click(screen.getByTestId("card-edit"));
    await act(() => new Promise((r) => setTimeout(r, 40)));
    expect(screen.queryByTestId("contact-kind-add")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });
  it("the chips say they are a LABEL, not access", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:circleLabel": { "@id": `${M}/e/circle-label-professional-inner-circle` }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    mount(base());
    expect((await screen.findByTestId("contact-kind-chips")).getAttribute("data-meaning")).toBe("label");
    expect(screen.getByTestId("contact-kind-chip").getAttribute("data-meaning")).toBe("label");
  });
  it("a card with no record about the contact asks the master for no claim type; one with a record asks once", async () => {
    mount(base());
    await act(() => new Promise((r) => setTimeout(r, 60)));
    expect(fake.typeSpelling).not.toHaveBeenCalled();
    cleanup();
    seedNote();
    mount(base());
    await waitFor(() => expect(fake.typeSpelling).toHaveBeenCalled());
  });
  it("a claims read that FAILS is not evidence of nothing: the notes are asked for anyway and shown", async () => {
    route.note = "Met her through Walker";
    fake.findByAttribute.mockRejectedValue(new Error("boom"));
    mount(base());
    expect(await screen.findByTestId("contact-note-text")).toHaveTextContent("Met her through Walker");
    expect(route.gets).toHaveLength(1);
  });
  it("a box is a new box when the record becomes linked to a person: it starts over and is keyed by the person", async () => {
    route.note = "Met her through Walker";
    seedNote();
    const qc = client();
    const view = render(<Card args={base()} />, { wrapper: wrapperOf(qc) });
    const before = await screen.findByTestId("contact-note-text");
    expect(route.gets).toEqual([party]);
    view.rerender(<Card args={base({ linkedParty: GEIR, linked: true })} />);
    await waitFor(() => expect(route.gets).toEqual([party, GEIR]));
    const after = await screen.findByTestId("contact-note-text");
    expect(after).not.toBe(before);
  });
  it("switching between two people whose notes are already read swaps the box itself, so a draft of one is never carried into the other", async () => {
    const GEIR2 = "https://ola.platform.example.test/base/p/3f2b6c1e-2222-4a2b-9c3d-000000000002";
    route.note = "Met through Walker";
    const qc = client();
    const view = render(<Card args={base({ linkedParty: GEIR, linked: true })} />, { wrapper: wrapperOf(qc) });
    await screen.findByTestId("contact-note-text");
    view.rerender(<Card args={base({ linkedParty: GEIR2, linked: true })} />);
    await waitFor(() => expect(route.gets).toEqual([GEIR, GEIR2]));
    const second = await screen.findByTestId("contact-note-text");
    view.rerender(<Card args={base({ linkedParty: GEIR, linked: true })} />);
    const first = await screen.findByTestId("contact-note-text");
    expect(first).not.toBe(second);
    expect(route.gets).toEqual([GEIR, GEIR2]); // both were kept: no third read
  });
  it("the read is kept per VAULT: the same person's notes in another vault are read there, not taken from the first", async () => {
    route.note = "kept in the first vault";
    const qc = client();
    const view = render(<Card args={base({ linkedParty: GEIR, linked: true })} />, { wrapper: wrapperOf(qc) });
    expect(await screen.findByTestId("contact-note-text")).toHaveTextContent("kept in the first vault");
    expect(route.origins).toEqual(["https://hytta.platform.example.test"]);
    view.rerender(<Card args={base({ vaultId: OTHER, ownVaultId: OTHER, linkedParty: GEIR, linked: true })} />);
    await waitFor(() => expect(route.origins).toEqual(["https://hytta.platform.example.test", "https://kid.platform.example.test"]));
  });
});
