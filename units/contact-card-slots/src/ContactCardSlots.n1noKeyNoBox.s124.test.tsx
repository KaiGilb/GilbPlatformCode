// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/components/records/ContactCardSlots.n1noKeyNoBox.s124.test.tsx`. A linked record whose person is not named has no key, so no box is drawn and nothing is read or written. The person resolver is the real shared one, answering the person or failing.
// Changes: the module mocks of the app's record client, vault sets, find-by-attribute, term slots, relation doors, `dpop` and adder card are replaced by the
// library's peers running over the fake platform of test/fakePlaceStore.ts (a `fetch` stub, test/support.ts), plus module mocks of `term-slots`, of the typed list
// (`listVaultRecordsPage` of `lws-vault-sets`), of the viewer's own card (`adder-card`, test/adderCardMock.ts) and, where the source mocked them, of the four
// relation doors (`lws-relations`) and of the annotations route's two functions (`contact-annotation`); the hosts are example.test hosts.
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
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { masterFetch } from "../test/masterFetch";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { CardGroup, CardTopSlots } from "@kaigilb/gilbplatformcode-card-group";
import { contactCardSlots } from "./ContactCardSlots";
import { resolvePersonCard, type PersonCard } from "@kaigilb/gilbplatformcode-person-connections";
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

function Card({ linkedParty, linked = false }: { linkedParty: string | null; linked?: boolean }) {
  const slots = contactCardSlots({
    vaultId: A,
    ownVaultId: A,
    principal: HOLDER,
    recordEntityUri: record,
    typeUri: "https://ontology.example.test/base/t/Person",
    canEdit: true,
    linkedParty,
    linked,
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
const mount = (linkedParty: string | null, linked = false) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Card linkedParty={linkedParty} linked={linked} />
    </QueryClientProvider>,
  );
};


/** The PersonCard RecordDetail receives for a linked record, from the real shared resolver, with the resolver answering or failing. */
async function personCardFor(resolver: "person" | "unavailable"): Promise<PersonCard> {
  return resolvePersonCard(
    {
      platform: { origin: "https://id.platform.example.test", fetch: async () => new Response("{}", { status: 500 }) },
      connections: async () => ({ people: [] }) as never,
      canonical: async () => null,
      resolve: async () =>
        resolver === "person"
          ? ({ kind: "person", principal: GEIR } as never)
          : ({ kind: "unavailable", status: 0 } as never),
    },
    { record: { uri: record, link: { state: "linked", target: GEIR } as never } },
  );
}

/** RecordDetail's round-2 wiring for a record that carries a link: the principal when the resolver named it, and "linked" from the link. */
const wiring = (pc: PersonCard | null) => ({ linkedParty: pc?.party ?? null, linked: true, linkedLookupFailed: !!pc && !pc.party });



describe("C214-N1 QA s124: a linked card whose person could not be named draws no box and sends nothing", () => {
  // Spec: C214-N1 — a linked record never uses the record key; with no key, nothing can be typed or written (s124, kills M8).
  it("lookup failed: no My Note / Where-we-met box, no annotations request of any key", async () => {
    seedRecordNotes("OLD record-keyed note", "OLD record-keyed origin");
    const w = wiring(await personCardFor("unavailable"));
    mount(w.linkedParty, w.linked);
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByTestId("contact-note-text")).toBeNull();
    expect(screen.queryByTestId("contact-note-editor")).toBeNull();
    expect(screen.queryByTestId("connection-origin-text")).toBeNull();
    expect(platform.gets).toEqual([]);
    expect(platform.puts).toEqual([]);
  });
});
