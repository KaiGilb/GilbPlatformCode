// A fake PlanSourceHost for the tests. Every call is logged in order; every answer is set from the test. Hosts and people are example.test / Ann / Ben.
import { vi } from "vitest";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import {
  PlanSourceHostContext,
  type PlanSourceCreateDialogProps,
  type PlanSourceFile,
  type PlanSourceHost,
  type PlanSourceShell,
  type PlanSourceStakeholderFind,
} from "../src/index";

export const VAULT = "https://p.example.test/vault";
export const ANN = "https://h.example.test/base/e/ann";
export const BEN = "https://h.example.test/vault/e/ben";
export const DOC = "https://h.example.test/base/e/plan-doc";

export const whole = (hits: PlanSourceStakeholderFind["hits"] = []): PlanSourceStakeholderFind => ({ hits, complete: true, vaultsMissed: false });

export function file(id: string, name: string, more: Partial<PlanSourceFile> = {}): PlanSourceFile {
  return { id, name, sourceVaultId: VAULT, typeUri: "t:File", updatedAt: 1, entityUri: `https://h.example.test/base/e/${id}`, ...more };
}

export type DialogProps = PlanSourceCreateDialogProps;

export function makeHost() {
  const log: string[] = [];
  const state = {
    shell: { vaults: [{ vaultId: VAULT, held: true }], openRecordInVault: undefined } as PlanSourceShell & { vaults: { vaultId: string; held: boolean }[] },
    kinds: { data: { names: ["Person"] } } as { data?: { names: readonly string[] } },
    files: { data: [] as readonly PlanSourceFile[], isPending: false, error: null as unknown },
    dialogProps: [] as DialogProps[],
  };
  const find = vi.fn<(vaultIds: readonly string[], names: readonly string[], text: string) => Promise<PlanSourceStakeholderFind>>(async () => whole());
  const readRecord = vi.fn<(id: string, at: string | null) => Promise<BaseRecord | null>>(async () => null);
  const memberEntityUri = vi.fn((idOrUri: string, preferredUri?: string | null, ns?: string | null) => {
    if (preferredUri?.startsWith("http")) return preferredUri;
    if (idOrUri.startsWith("http")) return idOrUri;
    return `${(ns ?? "").replace(/\/$/, "")}/e/${idOrUri}`;
  });
  const host: PlanSourceHost = {
    useShell() {
      log.push("useShell");
      return state.shell;
    },
    heldVaultIds(vaults) {
      log.push("heldVaultIds");
      return (vaults as { vaultId: string; held: boolean }[]).filter((v) => v.held).map((v) => v.vaultId);
    },
    useStakeholderTypes(enabled) {
      log.push(`useStakeholderTypes ${enabled}`);
      return state.kinds;
    },
    useVaultFilesMulti(ids, lifecycle) {
      log.push(`useVaultFilesMulti ${JSON.stringify(ids)} ${lifecycle}`);
      return state.files;
    },
    matchWorkingSetQuery(items, query) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return items.filter((i) => i.name.toLowerCase().includes(q));
    },
    findStakeholderRecords: (vaults, names, text) => find(vaults, names, text),
    readRecord: (id, at) => readRecord(id, at),
    memberEntityUri: (a, b, c) => memberEntityUri(a, b, c),
    ConnectedCreateDialog(props) {
      state.dialogProps.push(props);
      return (
        <div data-testid="create-dialog">
          <button onClick={props.onClose}>Close dialog</button>
          <button onClick={() => props.onCreated("new-ann")}>Created bare id</button>
          <button onClick={() => props.onCreated("https://h.example.test/base/e/new-ben")}>Created address</button>
        </div>
      );
    },
  };
  return { host, state, log, find, readRecord, memberEntityUri };
}

// The picker's query hook, with the real query library (the options the picker's own call used).
const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};

/** The label of a referenced record, by address. */
export const labels: Record<string, string> = { [ANN]: "Ann Co", [BEN]: "Ben Co", [DOC]: "Plan document" };
const useRefLabel: UseRefLabel = (ref) => (ref ? labels[ref.uri] ?? null : null);

export const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

export function Frame({ host, client, children }: { host: PlanSourceHost | null; client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <RefLabelContext.Provider value={useRefLabel}>
          <PlanSourceHostContext.Provider value={host}>{children}</PlanSourceHostContext.Provider>
        </RefLabelContext.Provider>
      </PickerQueryContext.Provider>
    </QueryClientProvider>
  );
}
