// The README example, run: the providers, a host over a small in-memory plan vault, and the picker choosing a record or
// asking to create one.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---- as in the README ----
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { PlanTagPicker, PlanTagPickerHostContext, type PlanTagPickerHost } from "./index";

const client = new QueryClient();
const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};
const useRefLabel: UseRefLabel = (ref) => ref?.id ?? null;

// The plan vault, here a list in memory; a real host searches its vault.
const planVault = "https://plan.example.test/vault";
const records: BaseRecord[] = ["Door.Open", "Door.Close"].map((tag) => ({
  id: tag.toLowerCase(),
  entityUri: `${planVault}/e/${tag.toLowerCase()}`,
  typeUri: "t:Function",
  facts: { unitTag: tag },
  opaqueFacts: [],
  etag: null,
}));

const host: PlanTagPickerHost = {
  findPlanRecords: async (_vault, text, _typeNames) => ({
    hits: records
      .filter((r) => r.facts.unitTag!.toLowerCase().includes(text.trim().toLowerCase()))
      .map((r) => ({ uri: r.entityUri!, label: r.facts.unitTag!, row: r })),
    complete: true,
  }),
  tagUsed: async (_vault, tag) => records.some((r) => r.facts.unitTag === tag),
  invalidateSearch: (key) => client.invalidateQueries({ queryKey: key }),
};

function Card({ onChoose, onCreate }: { onChoose: (row: unknown) => void; onCreate: (tag: string) => void }) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <RefLabelContext.Provider value={useRefLabel}>
          <PlanTagPickerHostContext.Provider value={host}>
            <PlanTagPicker
              vaultId={planVault}
              ariaLabel="Part of"
              placeholder="Search by tag"
              kindLabel="Function"
              pool={[]}
              typeName="Function"
              excluded={new Set()}
              busy={false}
              onChoose={onChoose}
              onCreate={onCreate}
            />
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
  it("chooses a found record, and offers to create a free tag", async () => {
    const onChoose = vi.fn();
    const onCreate = vi.fn();
    render(<Card onChoose={onChoose} onCreate={onCreate} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Part of" }), "Door.Op");
    await user.click(await screen.findByText("Door.Open"));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: "door.open" }));

    await user.clear(screen.getByRole("textbox", { name: "Part of" }));
    await user.type(screen.getByRole("textbox", { name: "Part of" }), "Window");
    await user.click(await screen.findByTestId("plan-link-create"));
    expect(onCreate).toHaveBeenCalledWith("Window");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Part of" })).toBeTruthy());
  });
});
