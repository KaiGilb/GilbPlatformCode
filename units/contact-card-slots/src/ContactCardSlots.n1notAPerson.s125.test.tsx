// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/components/records/ContactCardSlots.n1notAPerson.s125.test.tsx`. A link that is DEFINITELY not a person (an organization) keys the notes to the record; the platform's one 404 gives no key.
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
import { CardTopSlots } from "@kaigilb/gilbplatformcode-card-group";
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

async function personCardWith(answer: unknown, target: string): Promise<PersonCard> {
  return resolvePersonCard(
    {
      platform: { origin: "https://id.platform.example.test", fetch: async () => new Response("{}", { status: 500 }) },
      connections: async () => ({ people: [] }) as never,
      canonical: async () => null,
      resolve: async () => answer as never,
    },
    { record: { uri: record, link: { state: "linked", target } as never } },
  );
}
const wiring3 = (pc: PersonCard) => ({ linkedParty: pc.party ?? null, linked: true, linkAnswer: pc.anchor?.kind ?? null });
function Card3({ w }: { w: ReturnType<typeof wiring3> }) {
  const slots = contactCardSlots({ vaultId: A, ownVaultId: A, principal: HOLDER, recordEntityUri: record, typeUri: "https://ontology.example.test/base/t/Person", canEdit: true, ...w });
  return (<CardModeProvider canEdit><CardModeBar /><CardTopSlots slots={slots} /></CardModeProvider>);
}
const mount3 = (w: ReturnType<typeof wiring3>) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Card3 w={w} /></QueryClientProvider>);
};
const ORG_VAULT = "https://unl.platform.example.test/vault";

describe("C214-N1 QA s125: the round-3 not-a-person rule", () => {
  // Spec: Kai-Zen ruling (s125): a DEFINITE not-a-person answer (organization) keys the notes to the record, as on main.
  it("a link answered 'organization' reads and shows the record's note (as main)", async () => {
    seedRecordNotes("Org note under the record", null);
    mount3(wiring3(await personCardWith({ kind: "organization", vaultId: ORG_VAULT, entity: ORG_VAULT }, ORG_VAULT)));
    expect(await screen.findByText("Org note under the record")).toBeInTheDocument();
    expect(platform.gets).toEqual([record]);
  });

  // Spec: C214-N1 + ruling: only a DEFINITE not-a-person answer keys to the record; an unanswered or failed lookup gives no key.
  // The platform's ONE 404 (`none`) is also its answer when the target's deed cannot be reached across stores
  // (connect-online-card-anchor.ts classifyAnchor -> representsForVaultOutcome reached:false -> null -> refuse), so for a link to a
  // PERSON's principal it is not definite. F-3 (s125): RED at 90eb8e7 (the old record-keyed note is shown and read).
  it("a link to a person's principal answered by the single 404 ('none') does not show the old record-keyed note", async () => {
    seedRecordNotes("OLD record-keyed note", null);
    platform.notes[key(GEIR, "note")] = "Note under the principal";
    mount3(wiring3(await personCardWith({ kind: "none" }, GEIR)));
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByText("OLD record-keyed note")).toBeNull();
    expect(platform.gets).not.toContain(record);
  });
});
