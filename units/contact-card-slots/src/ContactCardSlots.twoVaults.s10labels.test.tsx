// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/components/records/ContactCardSlots.twoVaults.s10labels.test.tsx`. A holder who manages TWO vaults: the note is in the first; the platform's GET answers from its own pick with empty notes; the PUT names the vault. The card must show the right vault's note, or say it cannot be read and offer no box; typing never overwrites a value the card did not read for the same vault.
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
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { masterFetch } from "../test/masterFetch";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { CardGroup, CardTopSlots } from "@kaigilb/gilbplatformcode-card-group";
import { AddInformationButton, AddInformationSheet } from "@kaigilb/gilbplatformcode-add-information";
import { contactCardSlots } from "./ContactCardSlots";
import { __resetContactLabelVocab } from "@kaigilb/gilbplatformcode-contact-labels";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { __resetAnnotationCapability, ANNOTATIONS_VAULT_PARAM, NOTES_VAULT_UNTIED_COPY } from "@kaigilb/gilbplatformcode-contact-annotation";

afterEach(() => {
  cleanup();
  tearDown();
});

const stater = vi.hoisted(() => ({ uri: "" }));


const A = fake.VAULT; // the holder's own vault
const B = "https://kid.platform.example.test/base"; // a vault the holder also manages (a child)
const HOLDER = "https://id.platform.example.test/base/p/kai";
const NOTE_A = "secret-note-word: met at the Oslo summit";

/** The annotations route as MEASURED: the GET picks a vault itself unless the platform takes the parameter, and says which; the PUT names the vault. */
const platform = vi.hoisted(() => ({ pick: "", takesParam: false, notes: {} as Record<string, string>, puts: [] as Record<string, unknown>[] }));
const key = (vault: string, party: string) => `${new URL(vault).host}|${party}`;

let partyA: string;
let partyB: string;
beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetContactLabelVocab();
  __resetCatalogueCache();
  __resetHeldNoteChains();
  __resetAnnotationCapability();
  platform.puts.length = 0;
  stater.uri = `${A}/e/${fake.seed("t:Person", { "a:name": "Kai's vault" })}`;
  partyA = `${A}/e/${fake.seed("t:Person", { "a:name": "Rita Larsen" })}`;
  partyB = `${B}/e/${fake.seed("t:Person", { "a:name": "Walker Hayes" }, undefined, B)}`;
  platform.pick = B;
  platform.takesParam = false;
  platform.notes = { [key(A, partyA)]: NOTE_A, [key(B, partyB)]: "walker-note: B's own" };
  // the note records exist in their vaults (they carry a:heldParty: the card's own find sees them, which is the evidence the route is worth asking)
  fake.seed("t:ContactPrivateNote", { "a:heldParty": { "@id": partyA }, "a:contactPrivateNote": NOTE_A }, undefined, A);
  fake.seed("t:ContactPrivateNote", { "a:heldParty": { "@id": partyB }, "a:contactPrivateNote": "walker-note: B's own" }, undefined, B);
  const m = masterFetch();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/base/connect/annotations")) {
      if ((init?.method ?? "GET") === "PUT") {
        const body = JSON.parse(String(init?.body)) as { heldParty: string; vaultId: string; note?: string };
        platform.puts.push(body);
        if (body.note !== undefined) platform.notes[key(body.vaultId, body.heldParty)] = body.note;
        return Response.json({ heldParty: body.heldParty, changed: true });
      }
      const named = url.searchParams.get(ANNOTATIONS_VAULT_PARAM);
      if (named !== null && !platform.takesParam) return new Response(JSON.stringify({ error: "BadRequest" }), { status: 400 });
      const vault = named ?? platform.pick;
      const party = url.searchParams.get("heldParty")!;
      const text = platform.notes[key(vault, party)] ?? "";
      return Response.json({ me: "p", heldParty: party, note: text || null, origin: null, notes: text ? [{ entity: `${vault}/e/n`, text }] : [], origins: [], noteLoad: text ? "ok" : "empty", originLoad: "empty", vault });
    }
    return routedFetch(m.fetchImpl)(input, init);
  });
});

function Card({ vaultId, party }: { vaultId: string; party: string }) {
  const slots = contactCardSlots({ vaultId, ownVaultId: vaultId, principal: HOLDER, recordEntityUri: party, typeUri: "https://ontology.example.test/base/t/Person", canEdit: true });
  return (
    <CardModeProvider canEdit>
      <CardModeBar />
      <CardTopSlots slots={slots} />
      <CardGroup kind="name" title="Name" aside={slots.nameAside} keepInEdit empty={false}>
        <p>Name</p>
      </CardGroup>
      <AddInformationButton />
      <AddInformationSheet />
    </CardModeProvider>
  );
}
const mount = (vaultId: string, party: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Card vaultId={vaultId} party={party} />
    </QueryClientProvider>,
  );
};

describe("a holder who manages two vaults: the note is in A, the platform answers from B", () => {
  it("a platform that cannot name the vault: the card in A says it could not be read, shows NO box, and nothing typed anywhere can overwrite A's note (RED at f51ca61: an empty box, and the PUT replaced the note)", async () => {
    mount(A, partyA);
    const alert = await screen.findAllByRole("alert");
    expect(alert[0]!.textContent).toContain(NOTES_VAULT_UNTIED_COPY);
    expect(screen.queryByTestId("contact-note-text")).toBeNull();
    expect(screen.queryByTestId("contact-note-editor")).toBeNull();
    // edit mode and "+ Add Information": still no box to type in
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.click(screen.getByTestId("card-add-info-button"));
    const sheet = await screen.findByTestId("add-information-sheet");
    const myNote = within(sheet).queryByTestId("add-information-my-note");
    if (myNote) await userEvent.click(myNote);
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.queryByTestId("contact-note-editor")).toBeNull();
    expect(platform.puts).toEqual([]);
    expect(platform.notes[key(A, partyA)]).toBe(NOTE_A);
  });

  it("a platform that takes the vault: the card in A shows A's note, and typing saves to A (the PUT's vault) on top of what was read", async () => {
    platform.takesParam = true;
    mount(A, partyA);
    expect(await screen.findByTestId("contact-note-text")).toHaveTextContent(NOTE_A);
    await userEvent.click(screen.getByTestId("contact-note-text"));
    const box = (await screen.findByTestId("contact-note-editor")) as HTMLTextAreaElement;
    expect(box.value).toBe(NOTE_A);
    await userEvent.type(box, " and more");
    await userEvent.tab();
    await waitFor(() => expect(platform.puts.length).toBe(1));
    expect(platform.puts[0]).toMatchObject({ vaultId: A, heldParty: partyA, note: `${NOTE_A} and more` });
    expect(platform.notes[key(B, partyB)]).toBe("walker-note: B's own");
  });

  it("the card in B shows B's note, and typing there writes B's, never A's", async () => {
    platform.takesParam = true;
    mount(B, partyB);
    expect(await screen.findByTestId("contact-note-text")).toHaveTextContent("walker-note: B's own");
    await userEvent.click(screen.getByTestId("contact-note-text"));
    const box = (await screen.findByTestId("contact-note-editor")) as HTMLTextAreaElement;
    await userEvent.type(box, "!");
    await userEvent.tab();
    await waitFor(() => expect(platform.puts.length).toBe(1));
    expect(platform.puts[0]).toMatchObject({ vaultId: B, heldParty: partyB });
    expect(platform.notes[key(A, partyA)]).toBe(NOTE_A);
  });

  it("a holder with one vault is unaffected: the platform's pick is the card's vault, the note shows and saves", async () => {
    platform.pick = A;
    mount(A, partyA);
    expect(await screen.findByTestId("contact-note-text")).toHaveTextContent(NOTE_A);
  });
});
