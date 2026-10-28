// What the lines need from the app, as stand-ins for the tests: the host of the source control, the label of a record, the picker's query
// hook, the host of the lines and the term origin; a card that keeps the data in state and passes onChange; small builders for the data.
// This file is the same in every unit of the Value lines except the one line that imports the kit.
import { afterEach, beforeEach, vi } from "vitest";
import { render as rtlRender, type RenderResult } from "@testing-library/react";
import { useEffect, useState, type ComponentType, type ReactElement, type ReactNode } from "react";
import { PlanSourceHostContext, type PlanSourceHost } from "@kaigilb/gilbplatformcode-plan-source";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PickerQueryContext, type PickerQueryArgs, type PickerQueryResult } from "@kaigilb/gilbplatformcode-record-picker";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { emptyValueCard, type EndpointPart, type ValueCardData, type ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";
import { ValueLinesHostContext, type ValueLineProps, type ValueLinesHost } from "../src/index";

export const VAULT = "https://v.example.test/vault";
export const ANN = "https://h.example.test/base/e/ann";
export const TERMS = "https://ontology.example.test";

/** The label of a linked record, by address. */
export const labels: Record<string, string> = { [ANN]: "Ann Co" };

export const record: BaseRecord = { id: "rec1", typeUri: `${TERMS}/base/t/Value`, facts: { title: "A Value" }, opaqueFacts: [], etag: null };

/** The calls the host of the lines got. */
export const hostCalls = { useLinkLabel: [] as string[], openOntologyConcept: [] as string[], searched: [] as string[] };

export function makeHost(over: Partial<ValueLinesHost> = {}): ValueLinesHost {
  return {
    useLinkLabel: (uri) => {
      hostCalls.useLinkLabel.push(String(uri));
      return uri ? (labels[uri] ?? null) : null;
    },
    openOntologyConcept: (name) => hostCalls.openOntologyConcept.push(name),
    searchTypes: async (query) => {
      hostCalls.searched.push(query);
      return { options: [], reach: "Searched the example ontology.", degraded: false };
    },
    blankReach: "Type to search the example ontology.",
    ...over,
  };
}

const sourceHost: PlanSourceHost = {
  useShell: () => ({ vaults: [] }),
  heldVaultIds: () => [],
  useStakeholderTypes: () => ({ data: { names: ["Person"] } }),
  useVaultFilesMulti: () => ({ data: [], isPending: false, error: null }),
  matchWorkingSetQuery: () => [],
  findStakeholderRecords: async () => ({ hits: [], complete: true, vaultsMissed: false }),
  readRecord: async () => null,
  memberEntityUri: (id) => id,
  ConnectedCreateDialog: () => null,
};
const useRefLabel: UseRefLabel = (ref) => (ref ? (labels[ref.uri] ?? null) : null);
// The picker's query hook, without a query library: run once for a key, hold the answer.
function usePickerQuery({ key, run, enabled }: PickerQueryArgs): PickerQueryResult {
  const k = JSON.stringify(key);
  const [state, setState] = useState<PickerQueryResult>({ isFetching: false, isError: false, isSuccess: false });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState((s) => ({ ...s, isFetching: true }));
    run().then(
      (data) => live && setState({ data, isFetching: false, isError: false, isSuccess: true }),
      () => live && setState({ isFetching: false, isError: true, isSuccess: false }),
    );
    return () => {
      live = false;
    };
  }, [k, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

beforeEach(() => {
  setTermOrigin(TERMS);
  hostCalls.useLinkLabel = [];
  hostCalls.openOntologyConcept = [];
  hostCalls.searched = [];
});
afterEach(() => resetTermOrigin());

export function Frame({ host, children }: { host?: ValueLinesHost | null; children: ReactNode }) {
  const h = host === undefined ? makeHost() : host;
  return (
    <PlanSourceHostContext.Provider value={sourceHost}>
      <RefLabelContext.Provider value={useRefLabel}>
        <PickerQueryContext.Provider value={usePickerQuery}>
          <ValueLinesHostContext.Provider value={h}>{children}</ValueLinesHostContext.Provider>
        </PickerQueryContext.Provider>
      </RefLabelContext.Provider>
    </PlanSourceHostContext.Provider>
  );
}

export function render(ui: ReactElement, host?: ValueLinesHost | null): RenderResult {
  return rtlRender(ui, { wrapper: ({ children }) => <Frame host={host}>{children}</Frame> });
}

// ---- data builders

export const part = (typeLabel = "", words = "", typeName = typeLabel): EndpointPart => ({ typeIri: typeName ? `${TERMS}/base/t/${typeName}` : "", typeLabel, words });
export const level = (kind: string, value: number | null = null, more: { when?: string; variables?: ValueLevel["qualifier"]["variables"]; conditions?: string[]; side?: "" | "low" | "high"; note?: string; source?: ValueLevel["source"]; valueText?: string } = {}): ValueLevel => ({
  kind,
  value,
  ...(more.valueText !== undefined ? { valueText: more.valueText } : {}),
  qualifier: { when: more.when ?? "", variables: more.variables ?? {}, conditions: more.conditions ?? [], side: more.side ?? "" },
  source: more.source ?? {},
  note: more.note ?? "",
});
/** A card with the parts you give; the rest is empty. */
export function card(parts: Partial<ValueCardData> = {}): ValueCardData {
  return { ...emptyValueCard(), ...parts };
}

// ---- the card: holds the data in state, passes onChange

export type Props = Partial<Omit<ValueLineProps, "data" | "onChange">>;
export const changes: ValueCardData[] = [];
beforeEach(() => {
  changes.length = 0;
});

/** The data of the latest change. */
export const lastChange = (): ValueCardData => {
  const c = changes[changes.length - 1];
  if (!c) throw new Error("onChange was not called");
  return c;
};

export function Card({ Body, start, props = {}, onChange }: { Body: ComponentType<ValueLineProps>; start: ValueCardData; props?: Props; onChange?: (next: ValueCardData) => void }) {
  const [data, setData] = useState(start);
  return (
    <Body
      editing={false}
      canEdit={false}
      vaultId={VAULT}
      record={record}
      onOpen={() => {}}
      selfId={null}
      {...props}
      data={data}
      onChange={(next) => {
        changes.push(next);
        onChange?.(next);
        setData(next);
      }}
    />
  );
}
export { vi };
