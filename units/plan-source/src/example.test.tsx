// The README example, run: the providers, a small host, and one source control that commits a person.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---- as in the README ----
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PlanSource, PlanSourceHostContext, type PlanSourceHost } from "./index";

const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};
const client = new QueryClient();
const useRefLabel: UseRefLabel = (ref) => (ref ? "Ann Co" : null);

const host: PlanSourceHost = {
  useShell: () => ({ vaults: [{ vaultId: "https://plan.example.test/vault" }] }),
  heldVaultIds: (vaults) => (vaults as { vaultId: string }[]).map((v) => v.vaultId),
  useStakeholderTypes: () => ({ data: { names: ["Person", "Organization"] } }),
  useVaultFilesMulti: () => ({ data: [], isPending: false, error: null }),
  matchWorkingSetQuery: (items, query) => items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase())),
  findStakeholderRecords: async (_vaults, _names, text) => ({
    hits: text.trim() ? [{ uri: "https://people.example.test/base/e/ann", label: "Ann Co" }] : [],
    complete: true,
    vaultsMissed: false,
  }),
  readRecord: async () => null,
  memberEntityUri: (id, _preferred, namespace) => (id.startsWith("http") ? id : `${namespace}/e/${id}`),
  ConnectedCreateDialog: () => null,
};

function Source({ onCommit }: { onCommit: (next: unknown) => void }) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <RefLabelContext.Provider value={useRefLabel}>
          <PlanSourceHostContext.Provider value={host}>
            <PlanSource
              value={{}}
              editing
              vaultId="https://plan.example.test/vault"
              record={{ id: "fn1", typeUri: "t:Function", facts: {}, opaqueFacts: [], etag: null }}
              inputLabel="Function source"
              onOpen={(id) => console.log("open", id)}
              onCommit={onCommit}
            />
          </PlanSourceHostContext.Provider>
        </RefLabelContext.Provider>
      </PickerQueryContext.Provider>
    </QueryClientProvider>
  );
}
// ---- end ----

afterEach(cleanup);

describe("README example", () => {
  it("finds a person and commits it as statedBy", async () => {
    const onCommit = vi.fn();
    render(<Source onCommit={onCommit} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Function source" }), "ann");
    await user.click(await screen.findByRole("button", { name: /Ann Co/ }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith({ statedBy: "https://people.example.test/base/e/ann" }));
  });
});
