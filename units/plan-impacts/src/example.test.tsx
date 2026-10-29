// The README example, run: the providers, a host over a small relation store in memory, and the Impacts table showing a saved
// impact and rewriting its numbers in place.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---- as in the README ----
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PlanTagPickerHostContext, type PlanTagPickerHost } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { PlanSourceHostContext, type PlanSourceHost } from "@kaigilb/gilbplatformcode-plan-source";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { PlanImpacts, PlanImpactsHostContext, type PlanImpactsHost } from "./index";

const client = new QueryClient();
const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};
const useRefLabel: UseRefLabel = (ref) => ref?.id ?? null;

// The vault, here a few records and one impact relation in memory; a real host reads and writes its vault.
const planVault = "https://plan.example.test/vault";
const at = (id: string) => `${planVault}/e/${id}`;
const solution: BaseRecord = { id: "fix", entityUri: at("fix"), typeUri: "t:Solution", facts: { unitTag: "Fix" }, opaqueFacts: [], etag: '"e1"' };
const speed: GridRecord = { id: "speed", entityUri: at("speed"), typeUri: "t:Value", facts: { unitTag: "Speed" }, opaqueFacts: [], etag: '"e1"', updatedAt: 1 };
let relations: RecordRelation[] = [{ relation: "relA", role: "role:solution", type: "t:ImpactOn", members: [{ member: at("speed"), role: "role:value" }] }];
let extras: Record<string, unknown> = { "a:valueEstimate": "3 → 0.2", "a:unit": "s", "a:impactBasis": "estimate" };

const pickerHost: PlanTagPickerHost = {
  findPlanRecords: async () => ({ hits: [], complete: true }),
  tagUsed: async () => false,
  invalidateSearch: (key) => client.invalidateQueries({ queryKey: key }),
};
const sourceHost: PlanSourceHost = {
  useShell: () => ({ vaults: [] }),
  heldVaultIds: () => [planVault],
  useStakeholderTypes: () => ({ data: { names: ["Person"] } }),
  useVaultFilesMulti: () => ({ data: [], isPending: false, error: null }),
  matchWorkingSetQuery: () => [],
  findStakeholderRecords: async () => ({ hits: [], complete: true, vaultsMissed: false }),
  readRecord: async () => null,
  memberEntityUri: (id) => at(id),
  ConnectedCreateDialog: () => null,
};

const host: PlanImpactsHost = {
  // reads and caches
  useRecords: () => ({ data: [speed] }),
  useRelations: () => ({ isPending: false, isError: false, data: relations }),
  useSelfSource: () => null,
  useMainTagsForRows: () => new Map<string, string>(),
  useRelationDoc: () => ({ data: { extras } }),
  resolveType: (kind) => ({ id: kind }),
  invalidatePlanSearch: (vault) => void client.invalidateQueries({ queryKey: ["plan-search", vault] }),
  getRecordPages: () => undefined,
  setRecordPages: () => {},
  setRelations: (_id, _at, next) => {
    relations = typeof next === "function" ? next(relations) : next;
  },
  // writers: leave these out and the table is read-only
  useCreateRecord: () => ({ mutateAsync: async () => ({ id: "new", etag: null, tempId: "" }) }),
  writePairRelation: async ({ relationId, extraFacts }) => {
    extras = extraFacts;
    return { id: relationId ?? "relB" };
  },
  endRelation: async (relation) => {
    relations = relations.filter((r) => r.relation !== relation);
  },
};

function Card({ onNotice }: { onNotice: (notice: string | null) => void }) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <RefLabelContext.Provider value={useRefLabel}>
          <PlanTagPickerHostContext.Provider value={pickerHost}>
            <PlanSourceHostContext.Provider value={sourceHost}>
              <PlanImpactsHostContext.Provider value={host}>
                <CardModeProvider canEdit>
                  <PlanImpacts record={solution} vaultId={planVault} canEdit onOpen={() => {}} onNotice={onNotice} />
                </CardModeProvider>
              </PlanImpactsHostContext.Provider>
            </PlanSourceHostContext.Provider>
          </PlanTagPickerHostContext.Provider>
        </RefLabelContext.Provider>
      </PickerQueryContext.Provider>
    </QueryClientProvider>
  );
}
// ---- end ----

afterEach(() => {
  cleanup();
  client.clear();
});

describe("README example", () => {
  it("shows the saved impact and rewrites its numbers in place", async () => {
    const onNotice = vi.fn();
    render(<Card onNotice={onNotice} />);
    const row = document.querySelector('[data-impact-row="Speed"]') as HTMLElement;
    const user = userEvent.setup();
    await user.click(within(row).getByRole("button", { name: "3 → 0.2 s" }));
    await user.clear(screen.getByLabelText("Expected"));
    await user.type(screen.getByLabelText("Expected"), "0.5{Enter}");
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith(null));
    expect(extras["a:valueEstimate"]).toBe("3 → 0.5");
    expect(within(row).getByText("3 → 0.5 s")).toBeTruthy();
    expect(screen.getByTestId("plan-impacts").getAttribute("data-impact-rev")).toBe("1");
  });
});
