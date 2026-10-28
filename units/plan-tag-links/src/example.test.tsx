// The README example, run: the providers, a host over a small plan vault in memory, and the Part of line linking a record.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---- as in the README ----
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PlanTagPickerHostContext, type PlanTagPickerHost } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { PlanPartOf, PlanTagLinksHostContext, type PlanTagLinksHost } from "./index";

const client = new QueryClient();
const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};
const useRefLabel: UseRefLabel = (ref) => ref?.id ?? null;

// The plan vault, here a map in memory; a real host reads and writes its vault.
const planVault = "https://plan.example.test/vault";
const rows = new Map<string, GridRecord>();
for (const [id, tag] of [["door", "Door"], ["door-close", "Door.Close"]] as const) {
  rows.set(id, { id, entityUri: `${planVault}/e/${id}`, typeUri: "t:Function", facts: { unitTag: tag }, opaqueFacts: [], etag: '"e1"', updatedAt: 1 });
}

const pickerHost: PlanTagPickerHost = {
  findPlanRecords: async (_vault, text) => ({
    hits: [...rows.values()]
      .filter((r) => r.facts.unitTag!.toLowerCase().includes(text.trim().toLowerCase()))
      .map((r) => ({ uri: r.entityUri!, label: r.facts.unitTag!, row: r })),
    complete: true,
  }),
  tagUsed: async (_vault, tag) => [...rows.values()].some((r) => r.facts.unitTag === tag),
  invalidateSearch: (key) => client.invalidateQueries({ queryKey: key }),
};

const host: PlanTagLinksHost = {
  // reads: the lists, the relations, the finds, the row cache
  useRecords: () => ({ data: [...rows.values()] }),
  useRelations: () => ({ isPending: false, isError: false, data: [] }),
  usePlanFind: () => ({ isError: false }),
  invalidatePlanFind: () => {},
  invalidatePlanSearch: (vault) => void client.invalidateQueries({ queryKey: ["plan-search", vault] }),
  liveRow: (_vault, id, fallback) => rows.get(id) ?? { updatedAt: 0, ...fallback },
  ensureEtagUnchanged: async (_vault, row) => ({ row }),
  applyPatch: (row, patch, etag) => {
    const facts = { ...row.facts };
    for (const [slug, value] of Object.entries(patch)) {
      if (value === null) delete facts[slug];
      else if (!Array.isArray(value)) facts[slug] = value["@id"];
    }
    return { ...row, facts, etag };
  },
  storePlanRow: (_vault, row) => void rows.set(row.id, row as GridRecord),
  setPlanRecord: () => {},
  dropPlanFind: () => {},
  prependPlanFind: () => {},
  putRecordInCaches: () => {},
  getRelations: () => undefined,
  setRelations: () => {},
  resolveType: (id) => ({ id }),
  typeUriForVaultNamespace: (typeName) => `t:${typeName}`,
  memberEntityUri: (id, _preferred, namespace) => `${namespace}/e/${id}`,
  readRecord: async (id) => rows.get(id) ?? null,
  // writers: leave these out and every line is read-only
  patchRecord: async (id, patch, _at, _source, precondition) => {
    const row = rows.get(id)!;
    if (row.etag !== precondition?.ifMatch) throw new Error("The record changed.");
    return { etag: '"e2"' };
  },
  useCreateRecord: () => ({
    mutateAsync: async ({ facts }) => {
      const id = facts.unitTag!.toLowerCase();
      const entityUri = `${planVault}/e/${id}`;
      rows.set(id, { id, entityUri, typeUri: "t:Function", facts, opaqueFacts: [], etag: '"e1"', updatedAt: Date.now() });
      return { id, etag: '"e1"', entityUri, tempId: "" };
    },
  }),
};

function Card({ onNotice }: { onNotice: (notice: string | null) => void }) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <RefLabelContext.Provider value={useRefLabel}>
          <PlanTagPickerHostContext.Provider value={pickerHost}>
            <PlanTagLinksHostContext.Provider value={host}>
              <CardModeProvider canEdit startEditing>
                <PlanPartOf record={rows.get("door")!} vaultId={planVault} canEdit onOpen={() => {}} onNotice={onNotice} />
              </CardModeProvider>
            </PlanTagLinksHostContext.Provider>
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
  it("links a found record as the parent, and makes and links a free tag", async () => {
    const onNotice = vi.fn();
    render(<Card onNotice={onNotice} />);
    const user = userEvent.setup();
    const box = () => screen.getByRole("textbox", { name: "Part of" });
    await user.type(box(), "Door.Cl");
    await user.click(await within(await screen.findByTestId("plan-link-hits")).findByText("Door.Close"));
    await waitFor(() => expect(rows.get("door")!.facts.fvParent).toBe(`${planVault}/e/door-close`));
    expect(rows.get("door")!.etag).toBe('"e2"');
    expect(onNotice).toHaveBeenLastCalledWith(null);

    await user.clear(box());
    await user.type(box(), "Window");
    await user.click(await screen.findByTestId("plan-link-create"));
    await waitFor(() => expect(rows.get("door")!.facts.fvParent).toBe(`${planVault}/e/window`));
    expect(rows.get("window")!.facts.unitTag).toBe("Window");
  });
});
