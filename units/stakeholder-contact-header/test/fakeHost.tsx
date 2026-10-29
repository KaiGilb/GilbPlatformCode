// Test-only: the host of the unit as a recording fake. The hooks are plain functions over data the test sets (the app's own hooks read
// the held notes and the vault); `useRelations` is a real query over the rows the test sets, with the app's options.
import type { ReactNode } from "react";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { CatalogueEntry, ContactChip } from "@kaigilb/gilbplatformcode-contact-kind-model";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import {
  StakeholderContactHeaderHostContext,
  type ContactLabelsArgs,
  type ContactLabelsState,
  type HolderOriginLineArgs,
  type StakeholderContactHeaderHost,
} from "../src/stakeholderContactHeaderHost";

export const OWN = "https://holder.example.test/vault";
export const OTHER = "https://acme.example.test/vault";

export const vaultOf = (over: Partial<ReachableVault> = {}): ReachableVault =>
  ({
    vaultId: OWN,
    entity: "https://holder.example.test/base/e/vault-holder",
    name: "Cy Holder",
    parent: null,
    represents: "https://ontology.example.test/base/t/Person",
    isLandingVault: true,
    ...over,
  }) as unknown as ReachableVault;

export interface LabelsData {
  chips: ContactChip[];
  preds: Record<string, string | null>;
}

export function fakeHost(over: Partial<StakeholderContactHeaderHost> = {}) {
  const state = {
    labels: {} as Record<string, LabelsData>,
    /** When set, answered for every subject, even the empty one (a host that ignores `enabled`). */
    labelsForAny: null as LabelsData | null,
    offered: { circleLabel: [], relationshipKind: [] } as Record<"circleLabel" | "relationshipKind", CatalogueEntry[]>,
    rows: {} as Record<string, RecordRelation[]>,
    origin: { origin: null, loading: false } as { origin: string | null; loading: boolean },
    labelsCalls: [] as ContactLabelsArgs[],
    originCalls: [] as HolderOriginLineArgs[],
    relationsCalls: [] as { id: string | null; at: string | null }[],
    add: vi.fn(async (_entry: CatalogueEntry) => true),
    actError: null as string | null,
    catalogueNote: null as string | null,
    offersLoading: false,
  };
  const host: StakeholderContactHeaderHost = {
    discoverVaultProfilePhoto: vi.fn(async () => ({ photoRef: null })),
    loadPhotoObjectUrl: vi.fn(async (ref: string) => `blob:${ref}`),
    loadGranteeFace: vi.fn(async () => null),
    useHolderOriginLine: (args) => {
      state.originCalls.push(args);
      return state.origin;
    },
    useContactLabels: (args): ContactLabelsState => {
      state.labelsCalls.push(args);
      const r = state.labelsForAny ?? state.labels[args.subject] ?? { chips: [], preds: {} };
      return {
        chips: r.chips,
        entryPredicates: new Map(Object.entries(r.preds)),
        offered: state.offered,
        offersLoading: state.offersLoading,
        catalogueNote: state.catalogueNote,
        actError: state.actError,
        add: state.add,
      };
    },
    useRelations: (id, at) => {
      state.relationsCalls.push({ id, at });
      return useQuery<RecordRelation[], Error>({
        queryKey: ["fake-relations", id, at],
        queryFn: async () => state.rows[id!] ?? [],
        enabled: !!id,
        staleTime: 15_000,
      });
    },
    ...over,
  };
  return { host, state };
}

export const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

export function Wrap({ host, qc, children }: { host: StakeholderContactHeaderHost; qc: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      <StakeholderContactHeaderHostContext.Provider value={host}>{children}</StakeholderContactHeaderHostContext.Provider>
    </QueryClientProvider>
  );
}
