// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/components/records/ContactCardSlots.s8labels.test.tsx`. The card's reserved places, filled: kind-of-contact chips beside the name, My Note over Where / How we met at the top. Real hooks over the in-memory vault, the master as a fake fetch, the annotations route as an in-memory pair of holder-only fields.
// Changes: the module mocks of the app's record client, vault sets, find-by-attribute, term slots, relation doors, `dpop` and adder card are replaced by the
// library's peers running over the fake platform of test/fakePlaceStore.ts (a `fetch` stub, test/support.ts), plus module mocks of `term-slots`, of the typed list
// (`listVaultRecordsPage` of `lws-vault-sets`), of the viewer's own card (`adder-card`, test/adderCardMock.ts) and, where the source mocked them, of the four
// relation doors (`lws-relations`) and of the annotations route's two functions (`contact-annotation`); the hosts are example.test hosts.
import userEvent from "@testing-library/user-event";
import * as fake from "../test/fakePlaceStore";
import { routedFetch, setUp, stubNetwork, tearDown } from "../test/support";
import { installAnnotationsRoute, resetRoute, route } from "../test/annotationsRoute";


vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-vault-sets")>()),
  listVaultRecordsPage: (await import("../test/fakePlaceStore")).listVaultRecordsPage,
}));
vi.mock("@kaigilb/gilbplatformcode-lws-relations", async (orig) => {
  const f = await import("../test/relationStoreFake");
  return { ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-relations")>()), writePairRelation: f.writePairRelation, endRelation: f.endRelation, readRelationDoc: f.readRelationDoc, readRelations: f.readRelations };
});
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) => (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri));

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { masterFetch } from "../test/masterFetch";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { CardGroup, CardTopSlots } from "@kaigilb/gilbplatformcode-card-group";
import { AddInformationButton, AddInformationSheet } from "@kaigilb/gilbplatformcode-add-information";
import { contactCardSlots } from "./ContactCardSlots";
import { GILBAPP_CHIP_HELP } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import { __resetContactLabelVocab } from "@kaigilb/gilbplatformcode-contact-labels";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { __resetKindRelationVocab, type KindVault } from "@kaigilb/gilbplatformcode-kind-relation";
import { relationsLive, resetRelationStore } from "../test/relationStoreFake";
import { __setCatalogForTest, catalogFromGraph } from "@kaigilb/gilbplatformcode-lws-relations";

afterEach(() => {
  cleanup();
  tearDown();
});

const stater = vi.hoisted(() => ({ uri: "" }));


const { VAULT, store } = fake;
const M = "https://ontology.example.test/base";
const HOLDER = "https://id.platform.example.test/base/p/kai";
const FRIEND = `${M}/e/relationship-kind-friend`;
let party: string;
const PERSON_VAULT: KindVault = { vaultId: VAULT, entity: `${VAULT}/e/vault-entity-kai`, represents: `${M}/t/Person` };
const USER_PLANE = catalogFromGraph(
  ["AssociatedWith", "FriendOf", "CustomerOf"].map((n) => ({ "@id": `${M}/t/${n}`, "a:label": n === "AssociatedWith" ? "associated-with" : n, "a:linkPlane": "user", "a:typeAttribute": `t:${n}`, "a:symmetric": n !== "CustomerOf" })),
  "user",
);

function Card({ vaultId = VAULT, own = VAULT, typeUri = `${M}/t/Person`, canEdit = true, kindVault = PERSON_VAULT }: { vaultId?: string; own?: string; typeUri?: string; canEdit?: boolean; kindVault?: KindVault | null }) {
  const slots = contactCardSlots({ vaultId, ownVaultId: own, principal: HOLDER, recordEntityUri: party, typeUri, canEdit, kindVault });
  return (
    <CardModeProvider canEdit={canEdit}>
      <CardModeBar />
      <CardTopSlots slots={slots} />
      <CardGroup kind="name" title="Name" aside={slots.nameAside} keepInEdit empty={false}>
        <p>Rita Larsen</p>
      </CardGroup>
      <AddInformationButton />
      <AddInformationSheet />
    </CardModeProvider>
  );
}
const mount = (props: Parameters<typeof Card>[0] = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Card {...props} />
    </QueryClientProvider>,
  );
};
const claims = () => [...store.entries()].filter(([, e]) => e.type === "t:HeldPartyFieldClaim");
/** The record the annotations route keeps a note in: it carries `a:heldParty` like a claim, so the card's own find sees it (s9: that is the evidence the route is worth asking). */
const seedNoteRecord = (text = "x") => fake.seed("t:ContactPrivateNote", { "a:heldParty": { "@id": party }, "a:contactPrivateNote": text });

beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetContactLabelVocab();
  __resetCatalogueCache();
  __resetHeldNoteChains();
  __resetKindRelationVocab();
  resetRelationStore();
  __setCatalogForTest(USER_PLANE);
  resetRoute();
  stater.uri = `${VAULT}/e/${fake.seed("t:Person", { "a:name": "Kai's vault" })}`;
  party = `${VAULT}/e/${fake.seed("t:Person", { "a:name": "Rita Larsen" })}`;
  stubNetwork();
  installAnnotationsRoute(VAULT);
});

describe("presentation", () => {
  it("shows the chips beside the name and My Note over Where / How we met, each PRIVATE, above the name", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": FRIEND }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    route.note = "Met her through Walker";
    route.origin = "Madrid Conference";
    seedNoteRecord();
    mount();
    expect(await screen.findByTestId("contact-note-text")).toHaveTextContent("Met her through Walker");
    expect(await screen.findByTestId("connection-origin-text")).toHaveTextContent("Madrid Conference");
    const chip = await screen.findByTestId("contact-kind-chip");
    expect(chip).toHaveTextContent("Friend");
    // The chip is in the NAME group's header, the notes are above the name group, My Note first.
    const name = screen.getAllByTestId("card-group").find((g) => g.getAttribute("data-group") === "name")!;
    expect(within(name).getByTestId("contact-kind-chip")).toBeTruthy();
    const order = [...document.querySelectorAll("[data-group]")].map((g) => g.getAttribute("data-group"));
    expect(order).toEqual(["my-note", "how-we-met", "name"]);
    expect(screen.getByTestId("contact-note-private").textContent).toBe("Private");
    expect(screen.getByTestId("connection-origin-private").textContent).toBe("Private");
    expect(chip.getAttribute("title")).toBe(GILBAPP_CHIP_HELP);
    // presentation: no (−), no add, no box
    expect(screen.queryByTestId("contact-kind-add")).toBeNull();
    expect(screen.queryByTestId("contact-note-editor")).toBeNull();
  });

  // Kai 2026-10-18: "I dont see Where/How we met and My Note in gilbapp, it is there in mynet." MyNet draws both on every contact, empty or not. A person card the
  // holder can write now draws both too, empty ones with their placeholder (RED at a97ce4d: an empty one was not drawn and was only listed under "+ Add Information").
  // C214-UI2 (changed on purpose, Kai 2026-10-21: "make them way smaller when empty. Ready to take notes"): each empty one is a one-line box to
  // type in at once (was: a placeholder button, no box open, and the presented hint line, which UI2 also removed).
  it("an empty card the holder can write shows My Note and Where / How we met, each PRIVATE, each a one-line box with its words as placeholder; no chip", async () => {
    mount();
    expect(((await screen.findByTestId("contact-note-editor")) as HTMLTextAreaElement).placeholder).toBe("Something only you will see…");
    expect(((await screen.findByTestId("connection-origin-editor")) as HTMLTextAreaElement).placeholder).toBe("e.g. Madrid Conference");
    expect(screen.queryByTestId("contact-note-text")).toBeNull();
    expect(screen.getByTestId("contact-note-private").textContent).toBe("Private");
    expect(screen.getByTestId("connection-origin-private").textContent).toBe("Private");
    expect([...document.querySelectorAll("[data-group]")].map((g) => g.getAttribute("data-group"))).toEqual(["my-note", "how-we-met", "name"]);
    expect(screen.queryByTestId("contact-kind-chips")).toBeNull();
    expect(route.saves).toHaveLength(0);
  });

  // C214-UI2 (changed on purpose): the empty box is already there; a click puts the cursor in it (was: a click on the placeholder opened it).
  it("a click on an empty note's box puts the cursor in it; nothing is saved until something is typed", async () => {
    mount();
    const box = (await screen.findByTestId("connection-origin-editor")) as HTMLTextAreaElement;
    await userEvent.click(box);
    expect(document.activeElement).toBe(box);
    expect(box.value).toBe("");
    await userEvent.tab();
    expect(route.saves).toHaveLength(0);
  });

  it("a card the holder may NOT write draws an empty note nowhere (nothing to show and no way to add)", async () => {
    mount({ canEdit: false });
    await screen.findByText("Rita Larsen");
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByTestId("contact-kind-chips")).toBeNull();
    expect(document.querySelector('[data-group="my-note"]')).toBeNull();
    expect(document.querySelector('[data-group="how-we-met"]')).toBeNull();
    expect(document.querySelectorAll("[data-card-slot] > *").length).toBe(0);
  });

  it("a note that cannot be read is said, never shown as empty", async () => {
    route.failLoad = true;
    seedNoteRecord();
    mount();
    const alert = await screen.findAllByRole("alert");
    expect(alert[0]!.textContent).toMatch(/Could not load your note/);
    expect(screen.getAllByRole("button", { name: "Try again" }).length).toBe(2);
  });
});

describe("the notes: click to edit, leave to save, '+ Add Information' to add", () => {
  it("a click on the note's text turns edit mode on with the cursor in it; leaving the box saves it, to the route, with no audience", async () => {
    route.note = "Met her through Walker";
    seedNoteRecord();
    mount();
    await userEvent.click(await screen.findByTestId("contact-note-text"));
    const box = (await screen.findByTestId("contact-note-editor")) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(box);
    expect(box.value).toBe("Met her through Walker");
    await userEvent.type(box, " and Hayes");
    await userEvent.tab();
    await waitFor(() => expect(route.saves.length).toBeGreaterThan(0));
    expect(route.saves[0]).toEqual({ heldParty: party, vaultId: VAULT, note: "Met her through Walker and Hayes", keepalive: false });
  });

  // C214-UI2 (changed on purpose): the empty one-line box is clicked directly (was: its placeholder text, which opened the box).
  it("an empty note is typed into where it stands: the box opens with the cursor in it, and leaving it saves", async () => {
    mount();
    const box = await screen.findByTestId("connection-origin-editor");
    await userEvent.click(box);
    await waitFor(() => expect(document.activeElement).toBe(box));
    expect((box as HTMLTextAreaElement).placeholder).toBe("e.g. Madrid Conference");
    await userEvent.type(box, "Madrid Conference");
    await userEvent.tab();
    await waitFor(() => expect(route.saves.at(-1)).toEqual({ heldParty: party, vaultId: VAULT, origin: "Madrid Conference", keepalive: false }));
  });

  it("My Note's box says 'Something only you will see…'", async () => {
    mount();
    // C214-UI2 (changed on purpose): the empty box is there without a click.
    expect(((await screen.findByTestId("contact-note-editor")) as HTMLTextAreaElement).placeholder).toBe("Something only you will see…");
  });

  it("a card held in another vault than the holder's own offers no note (the route reads the holder's own vault only), and still has its chips", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": FRIEND }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    mount({ own: "https://other.platform.example.test/base" });
    expect(await screen.findByTestId("contact-kind-chip")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('[data-group="my-note"]')).toBeNull();
  });
});

describe("the chips: add and remove in edit mode, and nothing else is written", () => {
  it("adds a kind from the chooser as ONE private RELATION to the vault's entity (no claim, nothing else); the (−) ENDS it and the tie falls back to associated-with", async () => {
    mount();
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.click(await screen.findByTestId("contact-kind-add"));
    const dlg = await screen.findByRole("dialog", { name: "Add a kind of contact" });
    const before = new Map([...store.entries()].map(([k, v]) => [k, JSON.stringify(v)]));
    await userEvent.click(await within(dlg).findByRole("button", { name: "Friend" }));
    await waitFor(() => expect(relationsLive().length).toBe(1));
    const rel = relationsLive()[0]!;
    expect(rel).toMatchObject({ type: "t:FriendOf", source: party, target: PERSON_VAULT.entity });
    expect(rel.extra).toEqual({ "a:claimSubject": { "@id": HOLDER }, "a:visibilityTier": "private" });
    // No claim, and the contact's own record and the rest of the vault are byte-equal: the kind is a relation, a statement about the tie.
    expect(claims().length).toBe(0);
    for (const [k, v] of before) expect(JSON.stringify(store.get(k))).toBe(v);
    expect(store.size).toBe(before.size);
    expect(await screen.findByTestId("contact-kind-chip")).toHaveTextContent("Friend");
    await userEvent.click(screen.getByRole("button", { name: "Remove Friend" }));
    // the floor rule (Agent.Concept 2026-10-21): the last specific kind removed, the tie stays as associated-with
    await waitFor(() => expect(relationsLive().map((r) => r.type)).toEqual(["t:AssociatedWith"]));
    expect(await screen.findByTestId("contact-kind-chip")).toHaveTextContent("associated-with");
    expect(store.size).toBe(before.size);
  });

  it("a card (even in edit mode) asks the master nothing until the chooser is opened; then it reads the lists and says so while it does", async () => {
    const m = stubNetwork();
    installAnnotationsRoute(VAULT);
    mount();
    await userEvent.click(screen.getByTestId("card-edit"));
    const plus = await screen.findByTestId("contact-kind-add");
    await new Promise((r) => setTimeout(r, 50));
    expect(m.log).toEqual([]);
    await userEvent.click(plus);
    const dlg = await screen.findByRole("dialog", { name: "Add a kind of contact" });
    expect(await within(dlg).findByRole("button", { name: "Friend" })).toBeTruthy();
    expect(m.log.some((u) => u.includes("/base/search?") && u.includes("type=RelationshipKind"))).toBe(true);
  });

  it("an organization is offered Customer and not Friend, and neither Competitor nor Non-profit (not a tie to the holder: Agent.Concept 2026-10-17)", async () => {
    mount({ typeUri: `${M}/t/Organization` });
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.click(await screen.findByTestId("contact-kind-add"));
    const dlg = await screen.findByRole("dialog");
    expect(await within(dlg).findByRole("button", { name: "Customer" })).toBeTruthy();
    expect(within(dlg).queryByRole("button", { name: "Friend" })).toBeNull();
    expect(within(dlg).queryByRole("button", { name: "Competitor" })).toBeNull();
    expect(within(dlg).queryByRole("button", { name: "Non-profit" })).toBeNull();
  });

  it("a card that may not be written has no (−) and no '+' even if it is somehow in edit mode", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": FRIEND }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    mount({ canEdit: false });
    expect(await screen.findByTestId("contact-kind-chip")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /^Remove / })).toEqual([]);
    expect(screen.queryByTestId("contact-kind-add")).toBeNull();
  });
});

// s9 labels fix round (Agent.Scaling C2/C3; Agent.Architect decides the route itself): the annotations route is asked only when it can matter, and kept for a minute.
describe("the annotations read is lazy and kept (the read stays in ONE function, loadHolderAnnotations)", () => {
  const sharedClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const mountWith = (qc: QueryClient) =>
    render(
      <QueryClientProvider client={qc}>
        <Card />
      </QueryClientProvider>,
    );
  beforeEach(() => {
    route.gets.length = 0;
  });

  it("a contact with no held record at all: the route is NOT asked (RED at c3972dd: asked on every card open)", async () => {
    mount();
    // C214-UI2 (changed on purpose): the presented hint line is gone; the card is drawn when its empty note box is.
    await screen.findByTestId("contact-note-editor");
    await new Promise((r) => setTimeout(r, 80));
    expect(route.gets).toHaveLength(0);
  });

  it("a contact with only chips: the route is NOT asked", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": FRIEND }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    mount();
    expect(await screen.findByTestId("contact-kind-chip")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 80));
    expect(route.gets).toHaveLength(0);
  });

  it("a contact with a note record: asked ONCE, and a card opened again inside the minute asks nothing", async () => {
    route.note = "Met her through Walker";
    seedNoteRecord();
    const qc = sharedClient();
    const first = mountWith(qc);
    expect(await screen.findByTestId("contact-note-text")).toHaveTextContent("Met her through Walker");
    expect(route.gets).toHaveLength(1);
    first.unmount();
    mountWith(qc);
    expect(await screen.findByTestId("contact-note-text")).toHaveTextContent("Met her through Walker");
    expect(route.gets).toHaveLength(1);
  });

  it("a note written on a card that had none shows on the card opened again inside the minute, with no read of the route", async () => {
    const qc = sharedClient();
    const first = mountWith(qc);
    // C214-UI2 (changed on purpose): an empty note is a one-line box already open (was: a placeholder text to click first).
    const box = await screen.findByTestId("contact-note-editor");
    await userEvent.click(box);
    await userEvent.type(box, "Only I see this");
    await userEvent.tab();
    await waitFor(() => expect(route.saves.at(-1)).toMatchObject({ note: "Only I see this" }));
    first.unmount();
    mountWith(qc);
    expect(await screen.findByTestId("contact-note-text")).toHaveTextContent("Only I see this");
    expect(route.gets).toHaveLength(0);
  });
});

describe("the chip row stays inside the card (Agent.Tester F4)", () => {
  it("the Name group's aside may shrink and wrap (it did not: four chips and '+ Kind' ran to the card's edge in dark edit mode with the left panel open)", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": FRIEND }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    mount();
    await screen.findByTestId("contact-kind-chip");
    // (My Note and Where / How we met carry a PRIVATE aside of their own; this is the Name group's.)
    const aside = within(document.querySelector('[data-group="name"]') as HTMLElement).getByTestId("card-group-aside");
    expect(aside.className).toMatch(/\bmin-w-0\b/);
    expect(aside.className).not.toMatch(/\bshrink-0\b/);
    expect(screen.getByTestId("contact-kind-chips").className).toMatch(/\bmax-w-full\b/);
  });
});

// Kai-Zen 2026-10-16 (F5): on a record held in a vault that is not the signer's own, the chips that can be read are shown READ-ONLY.
describe("a record held in another person's vault: chips read-only (F5)", () => {
  const OTHER_OWN = "https://other.platform.example.test/base";
  const seedFriend = () => fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": FRIEND }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
  it("the readable chip is shown; in edit mode there is no (−) and no '+ Kind'", async () => {
    seedFriend();
    mount({ own: OTHER_OWN });
    expect(await screen.findByTestId("contact-kind-chip")).toHaveTextContent("Friend");
    await userEvent.click(screen.getByTestId("card-edit"));
    await new Promise((r) => setTimeout(r, 60));
    expect(screen.queryByTestId("contact-kind-add")).toBeNull();
    expect(screen.queryAllByRole("button", { name: /^Remove / })).toEqual([]);
    expect(screen.queryByTestId("contact-kind-help")).toBeNull();
  });
  it("the same card in the signer's own vault has both (the control)", async () => {
    seedFriend();
    mount();
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(await screen.findByTestId("contact-kind-add")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Friend" })).toBeTruthy();
  });
  it("a card with no vault known as the signer's own writes nothing either", async () => {
    seedFriend();
    mount({ own: "" });
    await userEvent.click(screen.getByTestId("card-edit"));
    await new Promise((r) => setTimeout(r, 60));
    expect(screen.queryByTestId("contact-kind-add")).toBeNull();
  });
});
