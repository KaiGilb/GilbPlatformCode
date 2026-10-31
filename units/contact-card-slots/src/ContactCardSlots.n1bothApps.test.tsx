// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/components/records/ContactCardSlots.n1bothApps.test.tsx`. One note per person: a card whose record is linked to a person reads and writes My Note and Where / How we met under his principal (the shared held-note key); an unlinked record keeps the record as its key. Real hooks, the annotations route as a stub keyed exactly as the platform keys it.
// Changes: the module mocks of the app's record client, vault sets, find-by-attribute, term slots, relation doors, `dpop` and adder card are replaced by the
// library's peers running over the fake platform of test/fakePlaceStore.ts (a `fetch` stub, test/support.ts), plus module mocks of `term-slots`, of the typed list
// (`listVaultRecordsPage` of `lws-vault-sets`), of the viewer's own card (`adder-card`, test/adderCardMock.ts) and, where the source mocked them, of the four
// relation doors (`lws-relations`) and of the annotations route's two functions (`contact-annotation`); the hosts are example.test hosts.
import userEvent from "@testing-library/user-event";
import * as fake from "../test/fakePlaceStore";
import { routedFetch, setUp, stubNetwork, tearDown } from "../test/support";


vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-vault-sets")>()),
  listVaultRecordsPage: (await import("../test/fakePlaceStore")).listVaultRecordsPage,
}));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) => (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri));

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { masterFetch } from "../test/masterFetch";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { CardGroup, CardTopSlots } from "@kaigilb/gilbplatformcode-card-group";
import { contactCardSlots } from "./ContactCardSlots";
import { __resetContactLabelVocab } from "@kaigilb/gilbplatformcode-contact-labels";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { __resetAnnotationCapability } from "@kaigilb/gilbplatformcode-contact-annotation";

afterEach(() => {
  cleanup();
  tearDown();
});

const stater = vi.hoisted(() => ({ uri: "" }));


const A = fake.VAULT; // the holder's own vault
const HOLDER = "https://id.platform.example.test/base/p/kai";
const GEIR = "https://geir.platform.example.test/base/p/3f2b6c1e-1111-4a2b-9c3d-000000000001";

/** The annotations route as the platform keys it: (vault, heldParty, field), exact. */
const platform = vi.hoisted(() => ({
  notes: {} as Record<string, string>,
  puts: [] as Record<string, unknown>[],
  gets: [] as string[],
  failParty: "" as string,
}));
const key = (party: string, field: "note" | "origin") => `${party}|${field}`;

let record: string;
beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetContactLabelVocab();
  __resetCatalogueCache();
  __resetHeldNoteChains();
  __resetAnnotationCapability();
  platform.notes = {};
  platform.puts.length = 0;
  platform.gets.length = 0;
  platform.failParty = "";
  stater.uri = `${A}/e/${fake.seed("t:Person", { "a:name": "Kai's vault" })}`;
  record = `${A}/e/${fake.seed("t:Person", { "a:name": "Geir Bergersen" })}`;
  const m = masterFetch();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/base/connect/annotations")) {
      if ((init?.method ?? "GET") === "PUT") {
        const body = JSON.parse(String(init?.body)) as { heldParty: string; vaultId: string; note?: string; origin?: string };
        platform.puts.push(body);
        if (body.note !== undefined) platform.notes[key(body.heldParty, "note")] = body.note;
        if (body.origin !== undefined) platform.notes[key(body.heldParty, "origin")] = body.origin;
        return Response.json({ heldParty: body.heldParty, changed: true });
      }
      const party = url.searchParams.get("heldParty")!;
      platform.gets.push(party);
      if (party === platform.failParty) return new Response("boom", { status: 503 });
      const note = platform.notes[key(party, "note")] || null;
      const origin = platform.notes[key(party, "origin")] || null;
      return Response.json({
        me: HOLDER,
        heldParty: party,
        note,
        origin,
        notes: note ? [{ entity: `${A}/e/n-${party.length}`, text: note }] : [],
        origins: origin ? [{ entity: `${A}/e/o-${party.length}`, text: origin }] : [],
        noteLoad: note ? "ok" : "empty",
        originLoad: origin ? "ok" : "empty",
        vault: A,
      });
    }
    return routedFetch(m.fetchImpl)(input, init);
  });
});

/** The record's own notes exist as records carrying a:heldParty = the record (the card's evidence find sees them). */
function seedRecordNotes(note: string | null, origin: string | null) {
  if (note) {
    platform.notes[key(record, "note")] = note;
    fake.seed("t:ContactPrivateNote", { "a:heldParty": { "@id": record }, "a:contactPrivateNote": note }, undefined, A);
  }
  if (origin) {
    platform.notes[key(record, "origin")] = origin;
    fake.seed("t:ConnectionOrigin", { "a:heldParty": { "@id": record }, "a:connectionOrigin": origin }, undefined, A);
  }
}

function Card({ linkedParty, linkedPending = false, notAPerson = false }: { linkedParty: string | null; linkedPending?: boolean; notAPerson?: boolean }) {
  const slots = contactCardSlots({
    vaultId: A,
    ownVaultId: A,
    principal: HOLDER,
    recordEntityUri: record,
    typeUri: "https://ontology.example.test/base/t/Person",
    canEdit: true,
    linkedParty,
    // Round 2: "linked" is the record's link; a record with a known principal or one still being looked up is linked.
    linked: linkedPending || !!linkedParty || notAPerson,
    ...(notAPerson ? { linkedLookupFailed: true, linkAnswer: "organization" as const } : {}),
  });
  return (
    <CardModeProvider canEdit>
      <CardModeBar />
      <CardTopSlots slots={slots} />
      <CardGroup kind="name" title="Name" aside={slots.nameAside} keepInEdit empty={false}>
        <p>Name</p>
      </CardGroup>
    </CardModeProvider>
  );
}
const mount = (linkedParty: string | null, linkedPending = false, notAPerson = false) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Card linkedParty={linkedParty} linkedPending={linkedPending} notAPerson={notAPerson} />
    </QueryClientProvider>,
  );
};

describe("C214-N1: one note per person, under the linked principal", () => {
  // Spec: C214-N1 — a note written in MyNet (under the principal) shows on the GilbApp card of the linked record.
  it("shows the notes kept under the linked principal (RED at 07c68901: empty boxes)", async () => {
    platform.notes[key(GEIR, "note")] = "Cool dude";
    platform.notes[key(GEIR, "origin")] = "At Marstrand through Håkon";
    mount(GEIR);
    expect(await screen.findByText("Cool dude")).toBeInTheDocument();
    expect(await screen.findByText("At Marstrand through Håkon")).toBeInTheDocument();
    expect(screen.getAllByTestId("contact-note")).toHaveLength(1);
    expect(platform.gets).toEqual([GEIR]);
  });

  // Spec: C214-N1 — every write of a linked card goes under the principal (the key MyNet reads), in the holder's vault.
  it("a first note on a linked card is written under the principal, never under the record", async () => {
    mount(GEIR);
    // C214-UI2 (changed on purpose): an empty note is a one-line box already open (was: a placeholder text to click first).
    const box = (await screen.findByTestId("contact-note-editor")) as HTMLTextAreaElement;
    await userEvent.click(box);
    await userEvent.type(box, "Cool dude");
    await userEvent.tab();
    await waitFor(() => expect(platform.notes[key(GEIR, "note")]).toBe("Cool dude"));
    expect(platform.puts.every((p) => p.heldParty === GEIR && p.vaultId === A)).toBe(true);
    expect(platform.notes[key(record, "note")]).toBeUndefined();
  });

  // Spec: C214-N1 — old record-keyed notes on a linked person are no longer shown (Kai: "never mind the old gilbapp notes") and stay untouched.
  it("does not show a note kept under the record of a linked person, and an edit leaves it as it is", async () => {
    seedRecordNotes("old GilbApp test note", null);
    mount(GEIR);
    // C214-UI2 (changed on purpose): an empty note is a one-line box already open (was: a placeholder text to click first).
    const box = (await screen.findByTestId("contact-note-editor")) as HTMLTextAreaElement;
    expect(screen.queryByText("old GilbApp test note")).toBeNull();
    await userEvent.click(box);
    expect(box.value).toBe("");
    await userEvent.type(box, "new");
    await userEvent.tab();
    await waitFor(() => expect(platform.notes[key(GEIR, "note")]).toBe("new"));
    expect(platform.notes[key(record, "note")]).toBe("old GilbApp test note");
    expect(platform.gets).not.toContain(record);
  });

  // Spec: C214-N1 — a local stakeholder with no link keeps the record as its key (behaviour as today).
  it("an unlinked record reads and writes under the record, as before", async () => {
    seedRecordNotes("local note", null);
    mount(null);
    expect(await screen.findByText("local note")).toBeInTheDocument();
    expect(platform.gets).toEqual([record]);
  });

  it("an unlinked record with nothing held asks no annotations read (as before)", async () => {
    mount(null);
    // C214-UI2 (changed on purpose): an empty note is a one-line box already open (was: a placeholder text to click first).
    await screen.findByTestId("contact-note-editor");
    expect(platform.gets).toEqual([]);
  });

  it("while the linked person is not resolved yet, no box is drawn and nothing is read", async () => {
    platform.notes[key(GEIR, "note")] = "Cool dude";
    mount(null, true);
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.queryByTestId("contact-note-text")).toBeNull();
    expect(screen.queryByTestId("contact-note-editor")).toBeNull();
    expect(platform.gets).toEqual([]);
  });

  it("a failed read of the principal's notes is said, with no box", async () => {
    platform.failParty = GEIR;
    mount(GEIR);
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("contact-note-editor")).toBeNull();
  });

  // Spec: C214-N1 round 3 (Kai-Zen ruling on Tester s124 Q4) — a link the resolver DEFINITELY answered is not a person (an organization, a
  // group vault: not_a_person) keys the notes to the record, as on main; only a link to a person keys by the principal.
  it("a link definitely not to a person keeps its notes under the record, as on main", async () => {
    seedRecordNotes("org note under the record", null);
    mount(null, false, true);
    expect(await screen.findByText("org note under the record")).toBeInTheDocument();
    expect(platform.gets).toEqual([record]);
    await userEvent.click(screen.getByText("org note under the record"));
    const box = (await screen.findByTestId("contact-note-editor")) as HTMLTextAreaElement;
    await userEvent.type(box, "!");
    await userEvent.tab();
    await waitFor(() => expect(platform.notes[key(record, "note")]).toBe("org note under the record!"));
    expect(platform.puts.every((p) => p.heldParty === record)).toBe(true);
  });
});
