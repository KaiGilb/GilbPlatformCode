// A fake PlanTagPickerHost for the tests: every call is logged and every answer is set from the test. Hosts and people are example.test / Ann / Ben.
import { vi } from "vitest";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { PlanTagPickerHostContext, type PlanTagHit, type PlanTagPage, type PlanTagPickerHost } from "../src/index";

export const VAULT = "https://p.example.test/vault";
export const uri = (id: string) => `https://h.example.test/base/e/${id}`;

export function row(id: string, tag: string, more: Partial<BaseRecord> = {}): BaseRecord {
  return { id, entityUri: uri(id), typeUri: "t:Function", facts: { unitTag: tag }, opaqueFacts: [], etag: '"e"', ...more };
}
export function gridRow(id: string, tag: string): GridRecord {
  return { ...row(id, tag), updatedAt: 1 };
}
export function hit(id: string, tag: string, label = tag): PlanTagHit {
  return { uri: uri(id), label, row: row(id, tag) };
}
export const page = (hits: PlanTagHit[] = [], complete = true): PlanTagPage => ({ hits, complete });

export function makeHost(client?: QueryClient) {
  const find = vi.fn<(planVault: string, text: string, names: readonly string[]) => Promise<PlanTagPage>>(async () => page());
  const tagUsed = vi.fn<(planVault: string, tag: string) => Promise<boolean>>(async () => false);
  const invalidate = vi.fn<(key: readonly unknown[]) => void>((key) => {
    if (client) void client.invalidateQueries({ queryKey: key });
  });
  const host: PlanTagPickerHost = {
    findPlanRecords: (v, t, n) => find(v, t, n),
    tagUsed: (v, t) => tagUsed(v, t),
    invalidateSearch: (k) => invalidate(k),
  };
  return { host, find, tagUsed, invalidate };
}

// The picker's query hook, with the real query library (the options the picker's own call used).
const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};

export const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** What the label hook answers for an address; change it between renders to see a live label. */
export const labels: Record<string, string> = {};
const useRefLabel: UseRefLabel = (ref) => (ref ? labels[ref.uri] ?? null : null);

export function Frame({ host, client, children }: { host: PlanTagPickerHost | null; client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <RefLabelContext.Provider value={useRefLabel}>
          <PlanTagPickerHostContext.Provider value={host}>{children}</PlanTagPickerHostContext.Provider>
        </RefLabelContext.Provider>
      </PickerQueryContext.Provider>
    </QueryClientProvider>
  );
}
