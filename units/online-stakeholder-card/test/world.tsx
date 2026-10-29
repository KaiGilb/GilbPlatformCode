// Test support: the world the card is drawn in. One holder (Ann) who placed Ben in her circles, a platform that answers the card, the circles and
// the find over a stubbed fetch, and a fake host that records every call. The fake peers are in `mocks.ts`.
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OneCardHostContext, type OneCardHost } from "@kaigilb/gilbplatformcode-one-card";
import { StakeholderContactHeaderHostContext, type StakeholderContactHeaderHost } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import {
  OnlineStakeholderCard,
  OnlineStakeholderCardHostContext,
  type OnlineStakeholderCardHost,
  type OnlineStakeholderCardShell,
} from "../src";
import { CIRCLES, FIND, LOG, M, ONTOLOGY, VOCAB, type FakeField } from "./mocks";

export const OWN = "https://ann.platform.example.test/vault";
/** The holder's principal is the address of her own vault. */
export const ANN = OWN;
export const BEN = "https://ben.platform.example.test/vault";
export const STRANGER = "https://cy.platform.example.test/vault";
export const FOREIGN = "https://evil.example.test/vault";
export const TEAM = "https://team.platform.example.test/vault";

export const own: ReachableVault = {
  vaultId: OWN,
  entity: `${OWN}/e/self`,
  name: "Ann",
  parent: null,
  parentAmbiguous: false,
  represents: null,
  modes: ["read", "write"],
  isLandingVault: true,
} as unknown as ReachableVault;
/** A second vault the holder may write (a team vault): the create must still land in her own. */
export const team: ReachableVault = { ...own, vaultId: TEAM, entity: `${TEAM}/e/self`, name: "Team", isLandingVault: false } as unknown as ReachableVault;
export const side: ReachableVault = { ...team, vaultId: "https://side.platform.example.test/vault", entity: "https://side.platform.example.test/vault/e/self", name: "Side" } as unknown as ReachableVault;

/** The fields of the Person kind, in the order the kind stores them. */
export function personFields(rows: readonly (readonly [string, string, string])[]): FakeField[] {
  return rows.map(([name, label, slug]) => ({
    term: `${ONTOLOGY}/base/t/${name}`,
    label,
    readKeys: [`a:${slug}`],
    writeKey: `a:${slug}`,
    writeKeyProblem: null,
    encoding: slug === "birthday" ? "inline-literal:date-or-month-day" : "inline-literal:text",
    many: false,
    declaredOn: [`${ONTOLOGY}/base/t/Person`],
    record: null,
  }));
}

/** Every request the stubbed platform saw, as "METHOD url". */
export let sent: string[] = [];
export function stubPlatform(opts: { ben?: { given: string; family: string; email?: string | null; nickname?: string | null; birthday?: string | null } } = {}) {
  sent = [];
  const ben = { given: "Ben", family: "Larsen", email: "ben@example.test", nickname: null, birthday: null, ...opts.ben };
  vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
    const url = String(u);
    sent.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("/base/connect/public-card")) {
      // Deliberately not term order, so a card that followed arrival order would not match an assertion on order.
      const fields = [
        { principal: BEN, field: "a:givenName", value: ben.given, rung: "public" },
        ben.nickname != null ? { principal: BEN, field: "a:nickname", value: ben.nickname, rung: "public" } : null,
        ben.birthday != null ? { principal: BEN, field: "a:birthday", value: ben.birthday, rung: "public" } : null,
        { principal: BEN, field: "a:familyName", value: ben.family, rung: "public" },
        ben.email != null ? { principal: BEN, field: "a:email", value: ben.email, rung: "public" } : null,
      ].filter(Boolean);
      return new Response(JSON.stringify({ principal: BEN, fields, skills: [], photoUrl: null }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/base/find-by-attribute")) {
      if (FIND.fail) return new Response("{}", { status: 503 });
      return new Response(JSON.stringify({ count: FIND.ids.length, ids: FIND.ids }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const readOf = FIND.ids.find((id) => url.endsWith(`/lws/r/${id.slice(id.lastIndexOf("/") + 1)}`));
    if (readOf) {
      return new Response(JSON.stringify({ "@id": readOf, "@type": "t:Person", name: "Bo", sameAs: { "@id": BEN } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("audience-rung/members")) {
      CIRCLES.requests += 1;
      if (CIRCLES.hold) await CIRCLES.hold;
      // The route's real shape; Ben is in Ann's Personal Inner Circle, Cy is not.
      return new Response(
        JSON.stringify({
          holder: ANN,
          vaultId: OWN,
          sets: [{ context: "personal", depth: "close-circle", rungTerm: "t:x", setUri: "https://x.example.test/personal-close-circle", members: CIRCLES.alsoSelf ? [BEN, ANN] : [BEN] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
  });
}

// ── the hosts ────────────────────────────────────────────────────────────────────────────

export const headerHost: StakeholderContactHeaderHost = {
  discoverVaultProfilePhoto: async () => ({ photoRef: null }),
  loadPhotoObjectUrl: async () => null,
  loadGranteeFace: async () => null,
  useHolderOriginLine: () => ({ origin: null, loading: false }),
  useContactLabels: () => ({
    chips: [],
    offered: { circleLabel: [], relationshipKind: [] },
    offersLoading: false,
    catalogueNote: null,
    actError: null,
    add: async () => true,
    entryPredicates: new Map(),
  }),
  useRelations: () => ({ data: [] }),
};

export const oneCardHost: OneCardHost = {
  isGeoEntityId: () => false,
  listPlaceClaimsInVault: async () => [],
  claimsAbout: () => [],
  claimFieldText: () => "",
  loadPlaceNames: async () => [],
  placeClaimsKey: (vaultId: string) => ["fake", "place-claims", vaultId],
  placeClaimsStaleMs: 60_000,
};

export interface Fake {
  host: OnlineStakeholderCardHost;
  /** What the shell answers; set it before the draw. */
  shell: OnlineStakeholderCardShell;
  refreshed: { n: number };
}

export function fakeHost(over: Partial<OnlineStakeholderCardHost> = {}, shellOver: Partial<OnlineStakeholderCardShell> = {}): Fake {
  const shell: OnlineStakeholderCardShell = {
    session: { principal: ANN, vault: { entity: own.entity } },
    // The holder's own vault is NOT the first, so "the first vault" is not "own"; nor the last.
    vaults: [team, own, side],
    contentScope: { reach: null },
    openRecordFromList: (id: string) => {
      LOG.push(`open:${id}`);
      M.opened.push(id);
    },
    ...shellOver,
  };
  const refreshed = { n: 0 };
  const host: OnlineStakeholderCardHost = {
    useShell: () => {
      LOG.push("useShell");
      return shell;
    },
    refreshOnlineStakeholders: () => {
      refreshed.n += 1;
      LOG.push("refresh");
    },
    photoReadKeysSync: () => {
      LOG.push("photoReadKeys");
      return [];
    },
    doors: { requestsSent: () => 0, heldRecordFreshMs: 15_000, heldRecordOf: () => null, useRecordsBeingDeleted: () => new Set<string>() },
    person: { adderCardOf: async () => `${OWN}/e/self`, rememberCreatedIn: () => {} },
    vocabulary: { masterKindReader: () => { throw new Error("the vocabulary query is a fake in these tests"); } },
    ...over,
  };
  return { host, shell, refreshed };
}

export function Providers({ host, qc, children }: { host: OnlineStakeholderCardHost; qc: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      <OnlineStakeholderCardHostContext.Provider value={host}>
        <StakeholderContactHeaderHostContext.Provider value={headerHost}>
          <OneCardHostContext.Provider value={oneCardHost}>{children}</OneCardHostContext.Provider>
        </StakeholderContactHeaderHostContext.Provider>
      </OnlineStakeholderCardHostContext.Provider>
    </QueryClientProvider>
  );
}

export const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** The last drawn card's query client (a test re-reads the circles answer through it). */
export const LAST: { qc: QueryClient | null; fake: Fake | null } = { qc: null, fake: null };

export function draw(mode: "content" | "full" | "actions" = "content", who: string = BEN, fake: Fake = fakeHost()) {
  const qc = newClient();
  LAST.qc = qc;
  LAST.fake = fake;
  const r = render(
    <Providers host={fake.host} qc={qc}>
      <OnlineStakeholderCard principal={who} placementMode={mode} />
    </Providers>,
  );
  return { ...r, qc, fake };
}

export { VOCAB };
