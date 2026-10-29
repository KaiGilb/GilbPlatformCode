// The provider a developer mounts once: it sets the platform's settings and the session, then mounts the query client and the three host
// contexts of the online stakeholder card (the card's own, the contact header's and the one card's). The card draws, reads and adds inside it.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnlineStakeholderCardHostContext, type OnlineStakeholderCardHost } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { StakeholderContactHeaderHostContext } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import { OneCardHostContext } from "@kaigilb/gilbplatformcode-one-card";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import type { StakeholderContactHeaderHost } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import type { OneCardHost } from "@kaigilb/gilbplatformcode-one-card";
import { createOneCardHost, createOnlineStakeholderCardHost, createStakeholderContactHeaderHost } from "./hosts";
import {
  defaultClaimFieldText,
  defaultClaimsAbout,
  defaultDiscoverVaultProfilePhoto,
  defaultListPlaceClaimsInVault,
  defaultLoadGranteeFace,
  defaultLoadPhotoObjectUrl,
  defaultLoadPlaceNames,
} from "./defaults";
import { photoReadKeysSyncOf, photoTermResolverFor } from "./photoTerm";
import { applyPlatformSetup, applySession, setupKey, type StakeholderCardSettings } from "./settings";
import { createUseShell } from "./shell";

/** The app's query defaults (main.tsx:72-76 of GilbApp, the same as the Plan-card provider's): the timing the cards were tuned on. */
export const STAKEHOLDER_CARD_QUERY_DEFAULTS = { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } as const;

export interface StakeholderCardGilbPlatformProviderProps {
  /** The platform's vault origin (`https://host`, no path). Every vault address and type URI derives from it; the photo term is read from it. Required; a malformed one throws. */
  origin: string;
  /** The origin that serves the ontology's terms (GilbVeda). Required; no default names a host. */
  ontologyOrigin: string;
  /** The bare host names, besides the origin's own family, that may be read at their own address (the system vaults). Required. */
  systemVaultHosts: readonly string[];
  /** The first labels of the platform's own hosts on a person vault's apex (`id` for `id.example.test`), for the own-card rule. Required. */
  systemHostLabels: readonly string[];
  /** The signed-in session (`SessionCredential` of the sign-in unit). Every request is signed with it, only for a URL inside the platform's family. */
  session: SessionCredential;
  /** The origin of the shared world catalogue (the GilbGeo vault): an address under its `/base/e/` is a catalogue row. Required. */
  geoOrigin: string;
  /** The vault the screen is showing. It is the content scope's `readVaultId`; the card does not read it. Default: null. Read at each render. */
  viewedVaultId?: string | null;
  /** Asks the online stakeholder lists of your page to draw again; the card calls it before it opens a record. Default: nothing. Read at each call. */
  refreshOnlineStakeholders?: () => void;
  /** Opens a record of the holder's by its id, in your page (GilbApp's `openRecordFromList`). Default: nothing, so after "+ Add your own" the card stays in place. Read at each call. */
  onOpenRecord?: (id: string) => void;
  /** A query client you own. Absent: the provider makes one with the app's defaults (`staleTime` 30 s, no refetch on focus, `retry` 1). A given one is used as it is. */
  queryClient?: QueryClient;
  /** Whether the card vocabulary is kept on this device. Absent: it is kept, as GilbApp does outside a test. Passed through to the card vocabulary host. */
  persistVocabulary?: () => boolean;
  /** Finds the photo of a vault's profile (GilbApp code that is in no unit). Default: none found, so the holder's face shows initials. Read at each call. */
  discoverVaultProfilePhoto?: StakeholderContactHeaderHost["discoverVaultProfilePhoto"];
  /** Loads a photo as an object URL. Default: null. Read at each call. */
  loadPhotoObjectUrl?: StakeholderContactHeaderHost["loadPhotoObjectUrl"];
  /** Loads the face of a person who shares one with the viewer. Default: null, so their photo is not drawn. Read at each call. */
  loadGranteeFace?: StakeholderContactHeaderHost["loadGranteeFace"];
  /** A HOOK: the held-note line ("Where / How we met") of a placed person. Default: none. Fixed at mount. */
  useHolderOriginLine?: StakeholderContactHeaderHost["useHolderOriginLine"];
  /** A HOOK: the kind chips of a contact. Default: none. Fixed at mount. */
  useContactLabels?: StakeholderContactHeaderHost["useContactLabels"];
  /** The four place members of the one card. The online stakeholder card never calls them; a default answers nothing. Read at each call. */
  listPlaceClaimsInVault?: OneCardHost["listPlaceClaimsInVault"];
  claimsAbout?: OneCardHost["claimsAbout"];
  claimFieldText?: OneCardHost["claimFieldText"];
  loadPlaceNames?: OneCardHost["loadPlaceNames"];
  /** The optional platform settings (see {@link StakeholderCardSettings}). */
  settings?: StakeholderCardSettings;
  children: ReactNode;
}

export function StakeholderCardGilbPlatformProvider(props: StakeholderCardGilbPlatformProviderProps) {
  const { session, children } = props;

  // 1. Settings and session, in render, before any child renders. A re-render with the same values sets nothing again.
  const setup = {
    origin: props.origin,
    ontologyOrigin: props.ontologyOrigin,
    systemVaultHosts: props.systemVaultHosts,
    systemHostLabels: props.systemHostLabels,
    settings: props.settings,
  };
  const key = setupKey(setup);
  const appliedSetup = useRef<string | null>(null);
  if (appliedSetup.current !== key) {
    applyPlatformSetup(setup);
    appliedSetup.current = key;
  }
  const appliedSession = useRef<SessionCredential | null>(null);
  if (appliedSession.current !== session) {
    applySession(session);
    appliedSession.current = session;
  }

  // 2. The query client: given, or one of our own with the app's defaults.
  const [own] = useState(() => new QueryClient({ defaultOptions: { queries: { ...STAKEHOLDER_CARD_QUERY_DEFAULTS } } }));
  const qc = props.queryClient ?? own;

  // 3. The photo term: asked once when the provider mounts, so the read keys the card hides the photo group by are the master's.
  const resolver = photoTermResolverFor(props.origin);
  useEffect(() => {
    void resolver.get().catch(() => undefined);
  }, [resolver]);

  // 4. The hosts: made once for this client, session and origin; the changing props are read through a ref at call time.
  const latest = useRef(props);
  latest.current = props;
  const first = useRef(props);
  const hosts = useMemo(() => {
    const at = first.current;
    const useShell = createUseShell(session, {
      viewedVaultId: () => latest.current.viewedVaultId ?? null,
      openRecordFromList: (id) => latest.current.onOpenRecord?.(id),
    });
    const card: OnlineStakeholderCardHost = createOnlineStakeholderCardHost({
      useShell,
      refreshOnlineStakeholders: () => latest.current.refreshOnlineStakeholders?.(),
      photoReadKeysSync: photoReadKeysSyncOf(resolver),
      ...(at.persistVocabulary ? { persistVocabulary: () => latest.current.persistVocabulary?.() ?? true } : {}),
    });
    const header: StakeholderContactHeaderHost = createStakeholderContactHeaderHost({
      discoverVaultProfilePhoto: (...a) => (latest.current.discoverVaultProfilePhoto ?? defaultDiscoverVaultProfilePhoto)(...a),
      loadPhotoObjectUrl: (...a) => (latest.current.loadPhotoObjectUrl ?? defaultLoadPhotoObjectUrl)(...a),
      loadGranteeFace: (...a) => (latest.current.loadGranteeFace ?? defaultLoadGranteeFace)(...a),
      ...(at.useHolderOriginLine ? { useHolderOriginLine: at.useHolderOriginLine } : {}),
      ...(at.useContactLabels ? { useContactLabels: at.useContactLabels } : {}),
    });
    const oneCard: OneCardHost = createOneCardHost({
      geoOrigin: props.geoOrigin,
      listPlaceClaimsInVault: (...a) => (latest.current.listPlaceClaimsInVault ?? defaultListPlaceClaimsInVault)(...a),
      claimsAbout: (...a) => (latest.current.claimsAbout ?? defaultClaimsAbout)(...a),
      claimFieldText: (...a) => (latest.current.claimFieldText ?? defaultClaimFieldText)(...a),
      loadPlaceNames: (...a) => (latest.current.loadPlaceNames ?? defaultLoadPlaceNames)(...a),
    });
    return { card, header, oneCard };
  }, [qc, session, props.origin, props.geoOrigin]);

  // 5. The query client and the three contexts.
  return (
    <QueryClientProvider client={qc}>
      <OnlineStakeholderCardHostContext.Provider value={hosts.card}>
        <StakeholderContactHeaderHostContext.Provider value={hosts.header}>
          <OneCardHostContext.Provider value={hosts.oneCard}>{children}</OneCardHostContext.Provider>
        </StakeholderContactHeaderHostContext.Provider>
      </OnlineStakeholderCardHostContext.Provider>
    </QueryClientProvider>
  );
}
