// Test-only: draws the header over the fake host, with the props a test overrides.
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import type { OnlineCardController, OnlineCardState } from "@kaigilb/gilbplatformcode-online-card";
import type { PersonCard } from "@kaigilb/gilbplatformcode-person-connections";
import { StakeholderContactHeader, type StakeholderContactHeaderProps } from "../src/StakeholderContactHeader";
import { fakeHost, newClient, OWN, vaultOf, Wrap } from "./fakeHost";

export const TYPE = "https://ontology.example.test/base/t/Person";
export const REC = { id: "06gkrecann", entityUri: "https://holder.example.test/base/e/06gkrecann", typeUri: TYPE };
export const VIEWER = "https://id.example.test/base/p/holder";

export function controllerOf(state: Partial<OnlineCardState>): OnlineCardController & { load: ReturnType<typeof vi.fn> } {
  const full: OnlineCardState = {
    link: { state: "none" },
    online: { status: "idle" },
    find: { status: "closed" },
    busy: null,
    error: null,
    ...state,
  };
  return { subscribe: () => () => {}, getState: () => full, load: vi.fn(async () => {}) } as unknown as OnlineCardController & { load: ReturnType<typeof vi.fn> };
}

export function readyCard(over: { given?: string; family?: string; photoUrl?: string | null; principal?: string } = {}): Partial<OnlineCardState> {
  const field = (predicate: string, value: string) => ({ predicate, value, rung: "t:Public", sourceEntity: null });
  const fields = [over.given ? field("a:givenName", over.given) : null, over.family ? field("a:familyName", over.family) : null].filter(Boolean);
  const principal = over.principal ?? "https://id.example.test/base/p/bea";
  return {
    link: { state: "linked", target: principal },
    online: { status: "ready", party: principal, card: { principal, fields, skills: [], photoUrl: over.photoUrl === undefined ? null : over.photoUrl } as never },
  };
}

export function personCardOf(over: Partial<PersonCard> = {}): PersonCard {
  return { party: null, how: "none", placements: [], link: { state: "none" }, anchor: null, connections: "not-read", ...over };
}

export type DrawOver = Partial<StakeholderContactHeaderProps>;

export function drawHeader(over: DrawOver = {}, parts: { fake?: ReturnType<typeof fakeHost>; qc?: QueryClient } = {}) {
  const fake = parts.fake ?? fakeHost();
  const qc = parts.qc ?? newClient();
  const props: StakeholderContactHeaderProps = {
    holderVault: vaultOf(),
    ownVaultId: OWN,
    viewer: VIEWER,
    principal: VIEWER,
    canEdit: true,
    record: REC,
    ownName: "Ann Larsen",
    kind: { kind: TYPE, ancestors: [] },
    kindLabel: "Person",
    personCard: null,
    onlineCard: null,
    ownPicture: null,
    ...over,
  };
  const view = render(
    <Wrap host={fake.host} qc={qc}>
      <StakeholderContactHeader {...props} />
    </Wrap>,
  );
  return { ...view, fake, qc, props };
}
