// The page around a card in these tests: the provider with a fake session, a screen that holds the card's record the way the app's record
// screen does (the card relies on `record` changing when it stores a saved row), and the group list of what the card drew.
import { useState, type ComponentType, type ReactNode } from "react";
import { render } from "@testing-library/react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { planRecordKey } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { PlanCardsGilbPlatformProvider, type PlanCardsGilbPlatformProviderProps } from "../src";
import { fakeSession } from "./fakeSession";
import { ONTOLOGY, ORIGIN, VAULT, createFakeVault } from "./fakeVault";

export type FakeVault = ReturnType<typeof createFakeVault>;

/** The hosts besides the origin's own family that may receive a credential: the ontology's and a second system vault outside the family. */
export const SYSTEM_VAULT_HOSTS = ["ontology.platform.example.test", "vedas.example.test"];

type CardProps = { record: BaseRecord; vaultId: string; canEdit: boolean; onOpen: (id: string) => void; onNotice: (n: string | null) => void };

/** Holds the record of a card, and takes the row the card stores (`setRecordRead`) as the new record. The record is read from the fake vault when the screen first renders, which is after the provider has set the origin. */
export function Screen({ Card, vault, id, canEdit = true, onNotice = () => {} }: { Card: ComponentType<CardProps>; vault: FakeVault; id: string; canEdit?: boolean; onNotice?: (n: string | null) => void }) {
  const [record] = useState(() => vault.recordOf(id));
  const q = useQuery({ queryKey: planRecordKey(record.id, record.entityUri ?? null), queryFn: async () => record, initialData: record, staleTime: Infinity });
  return <Card record={q.data ?? record} vaultId={VAULT} canEdit={canEdit} onOpen={() => {}} onNotice={onNotice} />;
}

export type ProviderOverrides = Partial<Omit<PlanCardsGilbPlatformProviderProps, "children" | "session">>;

/** A fresh fake session that reaches the test vault with read and write. */
export function newSession() {
  return fakeSession({ vaults: [{ vaultId: VAULT, modes: ["read", "write"] }] });
}

export function providerProps(session: ReturnType<typeof newSession>, over: ProviderOverrides = {}) {
  return {
    origin: ORIGIN,
    ontologyOrigin: ONTOLOGY,
    systemVaultHosts: SYSTEM_VAULT_HOSTS,
    systemHostLabels: ["id", "ontology"],
    session: session.session,
    canEdit: true,
    ...over,
  };
}

/** Mount `children` inside the provider alone. */
export function mountInProvider(session: ReturnType<typeof newSession>, children: ReactNode, over: ProviderOverrides = {}) {
  const props = providerProps(session, over);
  const ui = (kids: ReactNode, next: ProviderOverrides = {}) => <PlanCardsGilbPlatformProvider {...props} {...next}>{kids}</PlanCardsGilbPlatformProvider>;
  const view = render(ui(children));
  return { ...view, rerenderWith: (kids: ReactNode, next: ProviderOverrides = {}) => view.rerender(ui(kids, next)) };
}

/** The `data-group` of every Plan group on the page, in page order. */
export function planGroups(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="card-group"]')]
    .map((el) => el.getAttribute("data-group") ?? "")
    .filter((g) => g.startsWith("plan-"));
}

export type { QueryClient };
