import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { OneCardHostContext, type OneCardHost } from "@kaigilb/gilbplatformcode-one-card";
import { StakeholderContactHeaderHostContext, type StakeholderContactHeaderHost } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import { OnlineStakeholderCard, OnlineStakeholderCardHostContext, type OnlineStakeholderCardHost, type OnlineStakeholderCardShell } from "../src";

// Once, at start-up and sign-in.
setBaseOrigin("https://platform.example.test");
setTermOrigin("https://ontology.example.test");
setLwsAuth({
  bearerHeaderFor: async () => ({}), // your sign-in: see `lws-session-bridge`
  dpopReadAuth: async () => ({}),
  dpopWriteAuth: async () => ({}),
  invalidateDpop: () => {},
  tokenManager: { getSession: async () => ({ principal: "https://ann.platform.example.test/vault", vault: null, vaults: [] }), invalidate: () => {} },
});

// 1. Your app shell, as a hook (the card calls it first, on every render).
const useYourShell = (): OnlineStakeholderCardShell => ({
  session: { principal: "https://ann.platform.example.test/vault", vault: { entity: "https://ann.platform.example.test/vault/e/self" } },
  vaults: [], // every vault the holder can reach (`ReachableVault`)
  contentScope: { reach: null }, // the holder's own vault's row, when you have it
  openRecordFromList: (id) => void window.history.pushState(null, "", `/records/${id}`),
});

// 2. The card's own host: the shell, the list refresh, the photo term, and the three hosts the card passes to its peers.
const cardHost: OnlineStakeholderCardHost = {
  useShell: useYourShell,
  refreshOnlineStakeholders: () => {}, // draw your online list again
  photoReadKeysSync: () => [], // the photo term's read keys now, each with its `a:` prefix
  rememberVaultOf: () => {}, // OPTIONAL: remember the vault of an existing record just before openRecordFromList(id), so your page can pass it on as the record's door
  doors: { requestsSent: () => 0, heldRecordFreshMs: 15_000, heldRecordOf: () => null, useRecordsBeingDeleted: () => new Set<string>() }, // `stakeholder-list-doors`
  person: { adderCardOf: async () => "https://ann.platform.example.test/vault/e/self", rememberCreatedIn: () => {} }, // `person-create`
  vocabulary: { masterKindReader: () => { throw new Error("give the page's kind reader"); } }, // `stakeholder-card-vocabulary`
};

// 3. The hosts of the two peers that read theirs from a context.
const headerHost: StakeholderContactHeaderHost = {
  discoverVaultProfilePhoto: async () => ({ photoRef: null }),
  loadPhotoObjectUrl: async () => null,
  loadGranteeFace: async () => null,
  useHolderOriginLine: () => ({ origin: null, loading: false }),
  useContactLabels: () => ({ chips: [], offered: { circleLabel: [], relationshipKind: [] }, offersLoading: false, catalogueNote: null, actError: null, add: async () => true, entryPredicates: new Map() }),
  useRelations: () => ({ data: [] }),
};
const oneCardHost: OneCardHost = {
  isGeoEntityId: () => false,
  listPlaceClaimsInVault: async () => [],
  claimsAbout: () => [],
  claimFieldText: () => "",
  loadPlaceNames: async () => [],
  placeClaimsKey: (vaultId) => ["place-claims", vaultId],
  placeClaimsStaleMs: 60_000,
};

const queryClient = new QueryClient();

export const OnlineCard = ({ principal }: { principal: string }) => (
  <QueryClientProvider client={queryClient}>
    <OnlineStakeholderCardHostContext.Provider value={cardHost}>
      <StakeholderContactHeaderHostContext.Provider value={headerHost}>
        <OneCardHostContext.Provider value={oneCardHost}>
          <OnlineStakeholderCard principal={principal} placementMode="content" />
        </OneCardHostContext.Provider>
      </StakeholderContactHeaderHostContext.Provider>
    </OnlineStakeholderCardHostContext.Provider>
  </QueryClientProvider>
);
