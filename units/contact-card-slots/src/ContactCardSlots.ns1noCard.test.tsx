// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/components/records/ContactCardSlots.ns1noCard.test.tsx`. The source of anything a person adds is THEIR OWN card in THEIR landing vault, so the card of the vault written to is never read, needed or mentioned; the only thing that stops an editor is a person with no landing vault of their own, said ONCE where the chips sit. ADAPTED: the source's `Sections` also mounted the Interest, Language and Organization-number sections of the app (in no unit); here the same five cases run over the card's name-aside slot and the held-notes hook, and the assertions about those three sections' controls are dropped.
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
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) => (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => adder.card, () => adder));

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { selfCardEntityUri } from "@kaigilb/gilbplatformcode-self-card";
import { contactCardSlots } from "./ContactCardSlots";
import { useHeldNotes, __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { NO_OWN_VAULT_SAYS } from "@kaigilb/gilbplatformcode-adder-card";
import { vaultRootOf } from "@kaigilb/gilbplatformcode-vault-profile-photo";

afterEach(() => {
  cleanup();
  tearDown();
});

const adder = vi.hoisted(() => ({ card: "https://adder.platform.example.test/base/e/vsc-adder", noOwnVault: false }));


const { VAULT } = fake;
const OTHER_VAULT = "https://kai.platform.example.test/base";
const AGENT = "https://id.platform.example.test/base/p/kai";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
/** Reads of THE WRITTEN VAULT's own card (the derived `vsc-…` address), as the record client was asked: the new rule makes it 0. */
const vaultCardReads = () => fake.readRecord.mock.calls.filter(([id]) => String(id).startsWith("vsc-")).length;
const RAW = /no card of its holder|nothing is kept|no source|person recorded|has no card of its own/i;

let tom: string;
beforeEach(() => {
  setUp();
  stubNetwork();
  fake.resetStore();
  __resetHeldNoteChains();
  adder.noOwnVault = false;
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
});
afterEach(() => cleanup());

/** Give the written vault its own card at the derived address (the platform's `POST …/selfcard` result). */
async function seedVaultCard(): Promise<void> {
  const uri = await selfCardEntityUri(vaultRootOf(VAULT)!);
  fake.seed("t:Person", { "a:name": "hytta" }, uri.slice(uri.lastIndexOf("/") + 1));
}

/** The skill section's hook, as `SkillRows` hands it to `ContactRows`. */
function SkillProbe({ subject }: { subject: string }) {
  const s = useHeldNotes("skill", VAULT, subject, AGENT);
  return <p data-testid="skill-probe">{`noOwnVault=${String(s.noOwnVault)} readError=${s.readError ?? ""}`}</p>;
}

/** The card's name-aside slot, and the skill section's hook, as one person card holds them. */
function Sections({ canEdit }: { canEdit: boolean }) {
  const subject = uriOf(tom);
  const slots = contactCardSlots({ vaultId: VAULT, ownVaultId: OTHER_VAULT, principal: AGENT, recordEntityUri: subject, typeUri: "t:Person", canEdit });
  return (
    <>
      <div data-testid="name-aside">{slots.nameAside}</div>
      <SkillProbe subject={subject} />
    </>
  );
}

const wrap = (node: ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>;
const settle = () => act(() => new Promise((r) => setTimeout(r, 30)));

describe("RuleBaseappSourceIsAdder — a card in a vault with NO card of its own", () => {
  it("is drawn in full: nothing about the vault's card is said and the vault's card is NEVER read", async () => {
    render(wrap(<Sections canEdit />));
    await waitFor(() => expect(screen.getByTestId("skill-probe").textContent).toBe("noOwnVault=false readError="));
    await settle();
    expect(screen.getByTestId("name-aside").textContent).toBe("");
    expect(document.body.textContent).not.toMatch(RAW);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(vaultCardReads()).toBe(0);
  });

  it("control: a vault that HAS a card of its own is drawn the same, and its card is still never read", async () => {
    await seedVaultCard();
    render(wrap(<Sections canEdit />));
    await waitFor(() => expect(screen.getByTestId("skill-probe").textContent).toBe("noOwnVault=false readError="));
    await settle();
    expect(document.body.textContent).not.toMatch(RAW);
    expect(vaultCardReads()).toBe(0);
  });

  it("a vault card that would answer 503 changes nothing: the card never asks it", async () => {
    const real = fake.readRecord.getMockImplementation()!;
    fake.readRecord.mockImplementation((async (id: string, ...rest: unknown[]) => {
      if (String(id).startsWith("vsc-")) throw new Error("Service Unavailable (503)");
      return (real as (...a: unknown[]) => unknown)(id, ...rest);
    }) as typeof real);
    render(wrap(<Sections canEdit />));
    await waitFor(() => expect(screen.getByTestId("skill-probe").textContent).toBe("noOwnVault=false readError="));
    await settle();
    expect(document.body.textContent).not.toMatch(/503/);
    fake.readRecord.mockImplementation(real);
  });
});

describe("RuleBaseappSourceIsAdder — a person with NO own (landing) vault", () => {
  beforeEach(() => {
    adder.noOwnVault = true;
  });

  it("an editor is told ONCE, in plain words, where the chips sit; no raw text, no alert", async () => {
    render(wrap(<Sections canEdit />));
    await waitFor(() => expect(screen.getByTestId("skill-probe").textContent).toBe("noOwnVault=true readError="));
    await settle();
    expect(screen.getByTestId("name-aside").textContent).toBe(NO_OWN_VAULT_SAYS);
    expect(document.body.textContent!.split(NO_OWN_VAULT_SAYS).length - 1).toBe(1);
    expect(document.body.textContent!.replace(NO_OWN_VAULT_SAYS, "")).not.toMatch(RAW);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("a READER (cannot edit) is told nothing beside the name and still sees what the platform returns", async () => {
    render(wrap(<Sections canEdit={false} />));
    await waitFor(() => expect(screen.getByTestId("skill-probe").textContent).toBe("noOwnVault=true readError="));
    await settle();
    expect(screen.getByTestId("name-aside").textContent).toBe("");
    expect(document.body.textContent).not.toMatch(RAW);
    expect(document.body.textContent).not.toContain(NO_OWN_VAULT_SAYS);
  });
});
