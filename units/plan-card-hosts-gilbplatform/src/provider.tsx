// The provider a developer mounts once: it sets the platform's settings and the session, then mounts the query client and the 14
// host contexts of the Plan cards (in the nesting order the card READMEs use) and the card mode. The four whole cards draw inside it.

import { useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { PlanCardHostContext } from "@kaigilb/gilbplatformcode-plan-card";
import { PlanSourceHostContext } from "@kaigilb/gilbplatformcode-plan-source";
import { RefLabelContext } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PickerQueryContext } from "@kaigilb/gilbplatformcode-record-picker";
import { ValueLinesHostContext } from "@kaigilb/gilbplatformcode-value-line-kit";
import { ValueWriteHostContext } from "@kaigilb/gilbplatformcode-value-card-write";
import { StakeholderLinesHostContext } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import { PlanTagLinksHostContext } from "@kaigilb/gilbplatformcode-plan-tag-links";
import { PlanTagPickerHostContext } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { PlanImpactsHostContext } from "@kaigilb/gilbplatformcode-plan-impacts";
import { DescriptionPartsHostContext } from "@kaigilb/gilbplatformcode-description-parts-view";
import { ProjectLevelsHostContext } from "@kaigilb/gilbplatformcode-project-levels";
import { TermDefinitionContext } from "@kaigilb/gilbplatformcode-type-term-popover";
import { TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import { useSelfSource } from "@kaigilb/gilbplatformcode-plan-self-source";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import type { TypeOption } from "@kaigilb/gilbplatformcode-type-chooser";
import { createPlanCardHosts } from "./hosts";
import type { HostEnv, OpenRecordInVault, PlanCardsCreateDialogProps } from "./env";
import { applyPlatformSetup, applySession, setupKey, type PlanCardsSettings } from "./settings";
import { createUseSessionState } from "./shell";

/** The app's query defaults (src/main.tsx:72-76 of the source): the timing the cards were tuned on. */
export const PLAN_CARDS_QUERY_DEFAULTS = { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } as const;

/** Actions of the page that the cards may use. Each one left out turns its feature off. */
export interface PlanCardsNavigate {
  /** Opens a record in the vault it lives in. Absent: a click on a stakeholder chip opens the record in place. */
  openRecordInVault?: OpenRecordInVault;
  /** Opens a type's page in the ontology. Absent: the Type popovers have no "Open in Ontology" button. */
  openOntologyConcept?: (typeName: string) => void;
}

export interface PlanCardsGilbPlatformProviderProps {
  /** The platform's vault origin (`https://host`, no path). Every vault address and type URI derives from it. Required; a malformed one throws. */
  origin: string;
  /** The origin that serves the ontology's terms (GilbVeda). Required; no default names a host. */
  ontologyOrigin: string;
  /** The bare host names, besides the origin's own family, that may receive the credential (the system vaults). Required. */
  systemVaultHosts: readonly string[];
  /** The first labels of the platform's own hosts on a person vault's apex (`id` for `id.example.test`), for the own-card rule. Required. */
  systemHostLabels: readonly string[];
  /** The signed-in session (`SessionCredential` of the sign-in unit). Every request is signed with it, only for a URL inside the platform's family. */
  session: SessionCredential;
  /** Whether the person may write; read by the card mode. A card saves only when this is true AND the host has its writers (this provider always has). */
  canEdit: boolean;
  /** A query client you own. Absent: the provider makes one with the app's defaults (`staleTime` 30 s, no refetch on focus, `retry` 1). A given one is used as it is: its defaults are yours, and the cards' timing may change. */
  queryClient?: QueryClient;
  /** The person's own card as the source of what they write (`{ "@id" }`), or null. Default: null, so a value is written with no `a:statedBy`. Ignored when `ownCard` is true. Read again on every render. */
  self?: { "@id": string } | null;
  /** True: find the signed-in person's own card from the session (`plan-self-source`) and use it as the source. Fixed at mount. Default: false. */
  ownCard?: boolean;
  /** Page actions; each absent one turns its feature off. Which are present is fixed at mount. */
  navigate?: PlanCardsNavigate;
  /** A component that creates a person (or another record) in a vault, drawn when a line asks for one. Absent: nothing is drawn, and the stakeholder lines are read-only. Fixed at mount whether present. */
  createStakeholderDialog?: ComponentType<PlanCardsCreateDialogProps>;
  /** Draws the icon of a type option in the Type picker. Absent: no icon. Fixed at mount whether present. */
  renderTypeIcon?: (option: TypeOption, className: string) => ReactNode;
  /** The help button of the Description line. Absent: none is drawn. Fixed at mount whether present. */
  HelpButton?: ComponentType<{ label: string; title: string; startAt: string; children: ReactNode }>;
  /** The optional platform settings (see {@link PlanCardsSettings}). */
  settings?: PlanCardsSettings;
  children: ReactNode;
}

export function PlanCardsGilbPlatformProvider(props: PlanCardsGilbPlatformProviderProps) {
  const { session, canEdit, children } = props;

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
  const [own] = useState(() => new QueryClient({ defaultOptions: { queries: { ...PLAN_CARDS_QUERY_DEFAULTS } } }));
  const qc = props.queryClient ?? own;

  // 3. The hosts: made once for this client and session; the changing props are read through a ref at call time.
  const latest = useRef(props);
  latest.current = props;
  const first = useRef(props);
  const hosts = useMemo(() => {
    const at = first.current;
    const openRecordInVault: OpenRecordInVault | undefined = at.navigate?.openRecordInVault
      ? (vaultId, recordId, opts) => latest.current.navigate?.openRecordInVault?.(vaultId, recordId, opts)
      : undefined;
    const openOntologyConcept = at.navigate?.openOntologyConcept
      ? (typeName: string) => latest.current.navigate?.openOntologyConcept?.(typeName)
      : undefined;
    const useSessionState = createUseSessionState(session, openRecordInVault);
    const useShell = () => useSessionState().shell;
    const useSelf = at.ownCard
      ? () => {
          const { shell, sessionVaultEntity } = useSessionState();
          return useSelfSource({ vaults: shell.vaults, contentScope: null, session: { vault: { entity: sessionVaultEntity } } });
        }
      : () => latest.current.self ?? null;
    const Dialog = at.createStakeholderDialog;
    const Help = at.HelpButton;
    const Icon = at.renderTypeIcon;
    const env: HostEnv = {
      qc,
      useShell,
      useSelfSource: useSelf,
      ontologyOrigin: at.ontologyOrigin,
      ...(openRecordInVault ? { openRecordInVault } : {}),
      ...(openOntologyConcept ? { openOntologyConcept } : {}),
      ...(Dialog ? { createDialog: Dialog } : {}),
      ...(Icon ? { renderTypeIcon: (o: TypeOption, c: string) => latest.current.renderTypeIcon?.(o, c) ?? null } : {}),
      ...(Help ? { HelpButton: Help } : {}),
    };
    return createPlanCardHosts(env);
  }, [qc, session, props.ontologyOrigin]);

  // 4. The query client and the 14 contexts, outermost first as the card READMEs nest them, then the card mode.
  const inner = (
    <PlanSourceHostContext.Provider value={hosts.planSource}>
      <RefLabelContext.Provider value={hosts.refLabel}>
        <PickerQueryContext.Provider value={hosts.pickerQuery}>
          <ValueLinesHostContext.Provider value={hosts.valueLines}>
            <ValueWriteHostContext.Provider value={hosts.valueWrite}>
              <StakeholderLinesHostContext.Provider value={hosts.stakeholderLines}>
                <PlanTagLinksHostContext.Provider value={hosts.planTagLinks}>
                  <PlanTagPickerHostContext.Provider value={hosts.planTagPicker}>
                    <PlanImpactsHostContext.Provider value={hosts.planImpacts}>
                      <DescriptionPartsHostContext.Provider value={hosts.descriptionParts}>
                        <ProjectLevelsHostContext.Provider value={hosts.projectLevels}>
                          <TermDefinitionContext.Provider value={hosts.termDefinition}>
                            <TypePictureSourceContext.Provider value={hosts.typePicture}>
                              <PlanCardHostContext.Provider value={hosts.planCard}>
                                <CardModeProvider canEdit={canEdit}>{children}</CardModeProvider>
                              </PlanCardHostContext.Provider>
                            </TypePictureSourceContext.Provider>
                          </TermDefinitionContext.Provider>
                        </ProjectLevelsHostContext.Provider>
                      </DescriptionPartsHostContext.Provider>
                    </PlanImpactsHostContext.Provider>
                  </PlanTagPickerHostContext.Provider>
                </PlanTagLinksHostContext.Provider>
              </StakeholderLinesHostContext.Provider>
            </ValueWriteHostContext.Provider>
          </ValueLinesHostContext.Provider>
        </PickerQueryContext.Provider>
      </RefLabelContext.Provider>
    </PlanSourceHostContext.Provider>
  );
  return <QueryClientProvider client={qc}>{inner}</QueryClientProvider>;
}
