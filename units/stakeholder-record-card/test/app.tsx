// The page around the record card in these tests, standing where GilbApp's shell stood: a `ShellContext` the tests fill, a `RecordDetail` that draws the
// card for the record the shell selects, and every host the card's peers ask for, over the provider alone. Not shipped (the package files are `src` only).
import { createContext, useContext, useMemo, type ReactNode } from "react";
import "@testing-library/jest-dom/vitest";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StakeholderCardGilbPlatformProvider, createCardReferencesHost, createCardVocabularyHost } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { createPhotoTermResolver } from "@kaigilb/gilbplatformcode-photo-term";
import { ContactRowsHostProvider } from "@kaigilb/gilbplatformcode-contact-rows";
import { StakeholderSetFieldsHostProvider } from "@kaigilb/gilbplatformcode-stakeholder-set-fields";
import { OtherLinkedRecordsHostContext } from "@kaigilb/gilbplatformcode-other-linked-records";
import { AddedByHostContext, AddedByLine, HeldVisibilitySwitch } from "@kaigilb/gilbplatformcode-added-by";
import { AdderCardHostProvider } from "@kaigilb/gilbplatformcode-adder-card";
import { useContactLabels } from "@kaigilb/gilbplatformcode-contact-labels";
import { useHolderOriginLine } from "@kaigilb/gilbplatformcode-contact-card-slots";
import { PhoneValue } from "@kaigilb/gilbplatformcode-phone-value";
import { SkillDepthNote, SkillPickerSheet } from "@kaigilb/gilbplatformcode-skill-picker-sheet";
import { SocialLogo, socialPlatformName } from "@kaigilb/gilbplatformcode-social-logo";
import { noteServedVersion, saveRecordSidecar } from "@kaigilb/gilbplatformcode-record-sidecar-save";
import { recordsKey } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { useRecords } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { refDisplayName, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { needsMainTag, useMainTag } from "@kaigilb/gilbplatformcode-main-tag";
import type { CardSlots } from "@kaigilb/gilbplatformcode-card-group";
import { StakeholderRecordCard, StakeholderRecordCardHostContext, type StakeholderRecordCardHost } from "../src";
import { fakeSession } from "./fakeSession";
import { MYNET_PROFILE_URL, resolvers, resetResolvers, seam } from "./seam";
export { MYNET_PROFILE_URL, resetResolvers, seam };
import { ID } from "./fixtureMaster";

export { recordsKey };

/** The key of a multi-vault list snapshot, as the app's merged list keeps them (the harness's own layout; only `holdingVaultOf` below reads it). */
export const SNAPSHOT_HEAD = ["test-app", "records", "snapshot"] as const;
export function recordsSnapshotKey(vaultId: string, lifecycle: "live" | "ended", choiceKey: string) {
  return [...SNAPSHOT_HEAD, vaultId, lifecycle, choiceKey, "to-end"] as const;
}

/**
 * The vault the merged list attributes a record to, as the app's `holdingVaultOf` answers it: a row in a vault's snapshot counts for that vault, unless
 * that snapshot says it also scanned a vault that holds the same row (a nested vault's record is listed under its parent too; the nested vault wins).
 * Two vaults left, or none: not known (null), and then the vault a create in this session wrote it into.
 */
export function harnessHoldingVaultOf(qc: import("@tanstack/react-query").QueryClient, recordId: string): string | null {
  type Snap = { records: readonly { id: string; sourceVaultId?: string }[]; scannedVaults?: readonly string[] };
  const entries = qc.getQueriesData<Snap>({ queryKey: SNAPSHOT_HEAD }).flatMap(([key, data]) => (data && Array.isArray(data.records) ? [{ vault: String(key[SNAPSHOT_HEAD.length]), data }] : []));
  const holding = entries.filter((e) => e.data.records.some((r) => r.id === recordId));
  const kept = holding.filter((e) => !(e.data.scannedVaults ?? []).some((u) => holding.some((o) => o.vault === u)));
  const vaults = new Set(kept.map((e) => e.data.records.find((r) => r.id === recordId)?.sourceVaultId ?? e.vault));
  if (vaults.size === 1) return [...vaults][0]!;
  if (vaults.size > 1) return null;
  return (qc.getQueryData(["created-in-vault", recordId]) as string | undefined) ?? null;
}
export const BASE = "https://gilb.test";
export const GEO = "https://geo.gilb.test";

/** What the tests put in the shell (GilbApp's `ShellContextValue`, the members the card reads). */
export interface ShellContextValue {
  contentScope: { readVaultId: string; readVault?: unknown; vault?: unknown; reach?: { vaultId: string; entity?: string } | null; vaultTargeted?: boolean };
  writeGuard: { allowed: boolean; reason: string | null };
  selectedRecordId: string | null;
  selectRecord: (id: string | null) => void;
  openRecordFromList: (id: string) => void;
  session: { principal: string; vault?: { entity?: string | null; shortWebId?: string | null } | null } | undefined;
  vaults: readonly unknown[];
  [k: string]: unknown;
}
export const ShellContext = createContext<ShellContextValue | null>(null);



function useShell() {
  const v = useContext(ShellContext);
  if (!v) throw new Error("test: no ShellContext");
  return useMemo(
    () => ({
      session: v.session,
      vaults: v.vaults as never,
      contentScope: { reach: (v.contentScope.reach as { vaultId: string } | null | undefined) ?? null },
      writeGuard: v.writeGuard,
      openRecordFromList: v.openRecordFromList,
    }),
    [v],
  );
}

function Hosts({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const shell = useContext(ShellContext)!;
  const resolver = resolverFor(BASE);
  const session = useMemo(() => fakeSession({ principal: shell.session?.principal ?? "p", vault: null, vaults: [] } as never).session, [shell.session?.principal]);
  const recordHost: StakeholderRecordCardHost = useMemo(
    () => ({
      useShell: () => {
        seam.useShellCalls += 1;
        return useShell();
      },
      photoReadKeys: async () => (await resolver.get().catch(() => ({ readKeys: [] as string[] }))).readKeys,
      photoReadKeysSync: () => resolver.peek()?.readKeys ?? [],
      vocabulary: createCardVocabularyHost(),
      useRefLabel: useResolvedRefLabel,
      get holdingVaultOf() {
        return seam.omitHolding ? undefined : (q: import("@tanstack/react-query").QueryClient, id: string) => (seam.holdingVaultOf ?? harnessHoldingVaultOf)(q, id);
      },
      get renderRecordPicture() {
        return seam.recordPicture;
      },
      get renderAttachments() {
        return seam.attachments;
      },
      get renderAddress() {
        return seam.address;
      },
      get renderEmployment() {
        return seam.employment;
      },
      get renderLanguages() {
        return seam.languages;
      },
      get renderSkillsAndInterests() {
        return seam.skillsAndInterests;
      },
      get renderBandIcon() {
        return seam.bandIcon;
      },
      get renderTypeDescription() {
        return seam.typeDescription;
      },
    }),
    [resolver],
  );
  const rowsHost = useMemo(
    () => ({
      useHomeDial: () => "",
      saveRecordSidecar,
      noteServedVersion,
      PhoneValue,
      SkillPickerSheet,
      SkillDepthNote,
      SocialLogo,
      socialPlatformName,
      HeldVisibilitySwitch,
      AddedByLine,
    }),
    [],
  );
  return (
    <StakeholderCardGilbPlatformProvider
      origin={BASE}
      ontologyOrigin={ID}
      systemVaultHosts={["ontology.platform.example.test"]}
      systemHostLabels={["id", "ontology"]}
      session={session}
      geoOrigin={GEO}
      queryClient={qc}
      useContactLabels={useContactLabels as never}
      useHolderOriginLine={useHolderOriginLine as never}
      loadPhotoObjectUrl={async () => null}
      discoverVaultProfilePhoto={(...a) => (seam.discover ?? (async () => ({ profileId: null, photoRef: null })))(...(a as unknown as never[])) as never}
    >
      <AdderCardHostProvider value={{ useSession: () => ({ data: { principal: shell.session?.principal } }) }}>
        <AddedByHostContext.Provider value={{ useShell: () => ({ openRecordFromList: shell.openRecordFromList }) }}>
          <OtherLinkedRecordsHostContext.Provider value={{ useShell: () => ({ vaults: shell.vaults as never }) }}>
            <StakeholderSetFieldsHostProvider host={createCardReferencesHost()}>
              <ContactRowsHostProvider host={rowsHost as never}>
                <StakeholderRecordCardHostContext.Provider value={recordHost}>{children}</StakeholderRecordCardHostContext.Provider>
              </ContactRowsHostProvider>
            </StakeholderSetFieldsHostProvider>
          </OtherLinkedRecordsHostContext.Provider>
        </AddedByHostContext.Provider>
      </AdderCardHostProvider>
    </StakeholderCardGilbPlatformProvider>
  );
}

/** GilbApp's `<RecordDetail />`: the card of the record the shell selects, in the Card view's centre. */
export function RecordDetail(props: { placementMode?: string; slots?: CardSlots } = {}) {
  const shell = useContext(ShellContext)!;
  return (
    <Hosts>
      <StakeholderRecordCard recordId={shell.selectedRecordId!} vaultId={shell.contentScope.readVaultId} {...(props.slots ? { slots: props.slots } : {})} />
    </Hosts>
  );
}


/** GilbApp `formatShortDate` (src/lib/format.ts): the date a linked record is listed with. */
export function formatShortDate(ms: number | null | undefined, now: Date = new Date()): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${String(d.getFullYear() % 100).padStart(2, "0")}`;
}

function resolverFor(origin: string) {
  let r = resolvers.get(origin);
  if (!r) resolvers.set(origin, (r = createPhotoTermResolver({ vedaOrigin: origin })));
  return r;
}

/** The host's `useRefLabel`: the name of the record an address in a field points at, from the loaded list, else one read (GilbApp's `useResolvedRefLabel`). */
const useResolvedRefLabel: UseRefLabel = (ref, vaultId) => {
  const list = useRecords(vaultId);
  const fromList = ref ? (list.data ?? []).find((r) => r.id === ref.id || r.entityUri === ref.uri) : undefined;
  const cached = fromList ? refDisplayName(fromList.facts, fromList.entityUri) : null;
  const q = useQuery({
    queryKey: ["base", "record", ref?.id ?? "", vaultOriginOf(ref?.uri ?? null)],
    queryFn: () => readRecord(ref!.id, ref!.uri),
    enabled: !!ref && !cached,
    staleTime: 30_000,
  });
  const facts = fromList?.facts ?? q.data?.facts;
  const main = useMainTag(ref && facts && needsMainTag(facts) ? ref.uri : null);
  const mainTag = main.data?.known ? main.data.tag : null;
  if (fromList) return refDisplayName(fromList.facts, fromList.entityUri, mainTag);
  if (q.isPending) return null;
  if (q.data) return refDisplayName(q.data.facts, q.data.entityUri || ref?.uri, mainTag);
  return ref ? refDisplayName(null, ref.uri) : null;
};
