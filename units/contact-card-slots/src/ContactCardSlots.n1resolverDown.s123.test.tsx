// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/components/records/ContactCardSlots.n1resolverDown.s123.test.tsx`. The person lookup of a linked record fails (unreachable, timed out, sign-in): the notes are not read and not written, never under the record.
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
import { contactCardSlots, useHolderOriginLine } from "./ContactCardSlots";
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

function OriginLine({ linkedParty, linked, linkedLookupFailed }: { linkedParty: string | null; linked: boolean; linkedLookupFailed: boolean }) {
  const o = useHolderOriginLine({ vaultId: A, ownVaultId: A, recordEntityUri: record, linkedParty, linked, linkedLookupFailed });
  return <p data-testid="origin-line">{o.loading ? "loading" : (o.origin ?? "none")}</p>;
}

describe("C214-N1 QA s123: the key as RecordDetail derives it from the person resolver", () => {
  // Spec: C214-N1 — a linked person is keyed by his principal (resolver answers the person).
  it("resolver answers the person: the card reads the principal's note", async () => {
    platform.notes[key(GEIR, "note")] = "Note under the principal";
    const w = wiring(await personCardFor("person"));
    mount(w.linkedParty, w.linked);
    expect(await screen.findByText("Note under the principal")).toBeInTheDocument();
    expect(platform.gets).toEqual([GEIR]);
  });

  // Spec: C214-N1 — old notes kept under the record of a linked person are no longer shown. F-1 (s123): RED at a8ab3e8.
  it("resolver could not be reached: the old record-keyed note of a LINKED person is not shown", async () => {
    seedRecordNotes("OLD record-keyed note", null);
    platform.notes[key(GEIR, "note")] = "Note under the principal";
    const pc = await personCardFor("unavailable");
    expect(pc.link.state).toBe("linked"); // the record IS linked
    const w = wiring(pc);
    mount(w.linkedParty, w.linked);
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText("OLD record-keyed note")).toBeNull();
    expect(platform.gets).not.toContain(record);
  });

  // Spec: C214-N1 — every write of a linked card goes under the principal; the old record-keyed note is left untouched. F-1 (s123): RED at a8ab3e8.
  it("resolver could not be reached: typing on a LINKED card never writes under the record", async () => {
    seedRecordNotes("OLD record-keyed note", null);
    const w = wiring(await personCardFor("unavailable"));
    mount(w.linkedParty, w.linked);
    const text = await screen.findByTestId("contact-note-text").catch(() => null);
    if (text) {
      await userEvent.click(text);
      const box = (await screen.findByTestId("contact-note-editor")) as HTMLTextAreaElement;
      await userEvent.clear(box);
      await userEvent.type(box, "typed while the resolver was down");
      await userEvent.tab();
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(platform.puts.filter((p) => p.heldParty === record)).toEqual([]);
    expect(platform.notes[key(record, "note")]).toBe("OLD record-keyed note");
  });

  // Spec: C214-N1 — the header's Where / How we met line is the same read. F-1 (s123): RED at a8ab3e8.
  it("resolver could not be reached: the header's origin line does not show the record-keyed origin of a LINKED person", async () => {
    seedRecordNotes(null, "OLD record-keyed origin");
    const w = wiring(await personCardFor("unavailable"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <OriginLine linkedParty={w.linkedParty} linked={w.linked} linkedLookupFailed={w.linkedLookupFailed} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("origin-line").textContent).not.toBe("loading"));
    expect(screen.getByTestId("origin-line").textContent).not.toBe("OLD record-keyed origin");
  });
});
