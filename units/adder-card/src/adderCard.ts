/**
 * The ONE source of "the adder's card": the source of anything a person adds is the person adding it, never the project or another
 * vault, only their personal vault.
 *
 * The source (`a:statedBy`) of anything a person adds, in ANY vault they may write, is THEIR OWN card in THEIR personal (landing)
 * vault. ⛔ Never the card of the vault being written to, nor of its holder, even when that vault has one. `a:statedBy` may point at a
 * card in another vault and grants no access: the audience stays on `a:directReader` (and, for chips, `a:claimSubject` plus the private
 * tier row), none of which this file touches.
 *
 * - {@link adderCardOf}: the signed-in person's card IRI, found by the existing own-card finding (`ownCardFindingQuery`, the package's
 *   `findOwnCard`) read through the React Query cache under the finding's own key, so it is one read per session, shared with
 *   `useOwnCard`. A person with no card yet gets a BASIC one in the landing vault the first time one is needed (named from the sign-in
 *   email when the session has one, else the vault's label). With no landing vault in the list it refuses, before any write.
 * - {@link useAdderCard}: the same for components and hooks: the card as far as it is known (a read, never a write) and `resolve()`,
 *   which a WRITE path calls to get the stater (and to make the basic card when there is none).
 */
import { useCallback } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { ownCardFindingKey, ownCardFindingQuery } from "@kaigilb/gilbplatformcode-plan-self-source";
import { listReachableVaults, vaultsKey } from "@kaigilb/gilbplatformcode-reachable-vaults";
import { vaultLabel } from "@kaigilb/gilbplatformcode-vault-list";
import { ensureVaultSelfCard, vaultRootOf } from "@kaigilb/gilbplatformcode-vault-profile-photo";
import { useAdderCardHost } from "./adderCardHost";

/** Said where a person adds something and has no landing vault in the list. The words are the platform owner's. */
export const NO_OWN_VAULT_SAYS = "Your own vault could not be found, so what you add would have no source. Nothing was saved.";

/** The person has no landing vault in the list: nothing may be written, as it would have no source. */
export class NoOwnVaultError extends Error {
  constructor() {
    super(NO_OWN_VAULT_SAYS);
    this.name = "NoOwnVaultError";
  }
}

/** The person's own vault: the landing vault of the reachable list, or undefined. */
export const landingVaultOf = (vaults: readonly ReachableVault[] | null | undefined): ReachableVault | undefined =>
  (vaults ?? []).find((v) => v.isLandingVault);

/**
 * A name guessed from a sign-in email: `petter.hansen@example.test` is "Petter Hansen", `kai@example.test` is "Kai". The part before
 * the `@` (and before a `+tag`) is split on `.`, `_` and `-`, and each part is capitalised.
 *
 * @param email the sign-in email, or null
 * @returns the guessed name, or null when the email gives none
 */
export function nameFromEmail(email: string | null | undefined): string | null {
  const local = (email ?? "").trim().split("@")[0]?.split("+")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

/** The cards being made: one making per (query client, landing vault), so three adds at once make ONE card. */
const making = new WeakMap<QueryClient, Map<string, Promise<string>>>();

async function readFinding(landing: ReachableVault, qc: QueryClient) {
  try {
    return await qc.fetchQuery(ownCardFindingQuery(landing));
  } catch (e) {
    throw new Error(`Your own card could not be read, so what you add would have no source. Nothing was saved. (${e instanceof Error ? e.message : String(e)})`);
  }
}

async function findOrMake(landing: ReachableVault, qc: QueryClient, email: string | null | undefined): Promise<string> {
  const finding = await readFinding(landing, qc);
  if (finding.cardUri) return finding.cardAtId || finding.cardUri;
  // No card yet: the basic one, in the LANDING vault only (a personal vault's card is a Person), then read back where the door says it is.
  // NAME: the session carries no email today, so no caller passes `email` and the card is named with the vault's label. The sign-up step will supply the name
  // (guessed from the email); `email` and `nameFromEmail` are ready for it. Leave it so until then.
  const root = vaultRootOf(landing.vaultId);
  if (!root) throw new Error("Your own vault could not be addressed, so what you add would have no source. Nothing was saved.");
  let made: { id: string };
  try {
    made = await ensureVaultSelfCard(landing.vaultId, {}, nameFromEmail(email) ?? vaultLabel(landing));
  } catch (e) {
    throw new Error(`Your own card could not be made, so what you add would have no source. Nothing was saved. (${e instanceof Error ? e.message : String(e)})`);
  }
  const back = await readRecord(made.id, `${root.replace(/\/+$/, "")}/e/${made.id}`);
  if (!back?.entityUri) {
    throw new Error("Your own card was made but could not be read back, so what you add would have no source. Nothing was saved.");
  }
  void qc.invalidateQueries({ queryKey: ownCardFindingKey(landing.vaultId) });
  return back.entityUri;
}

/**
 * The signed-in person's own card IRI: the `a:statedBy` of whatever they add, in any vault. Refuses with {@link NoOwnVaultError} when the
 * list holds no landing vault, before anything is written.
 *
 * @param vaults the session's reachable vaults
 * @param qc the query client that holds the own-card finding (one read per session)
 * @param opts `email`: the sign-in email, when the session has one, to name a basic card
 */
export function adderCardOf(vaults: readonly ReachableVault[] | null | undefined, qc: QueryClient, opts: { email?: string | null } = {}): Promise<string> {
  const landing = landingVaultOf(vaults);
  if (!landing) return Promise.reject(new NoOwnVaultError());
  let byVault = making.get(qc);
  if (!byVault) making.set(qc, (byVault = new Map()));
  const running = byVault.get(landing.vaultId);
  if (running) return running;
  const p = findOrMake(landing, qc, opts.email).finally(() => {
    if (byVault!.get(landing.vaultId) === p) byVault!.delete(landing.vaultId);
  });
  byVault.set(landing.vaultId, p);
  return p;
}

/** What a component or hook knows of the adder's card. */
export interface AdderCardState {
  /** The person's own card IRI as far as it is known (a read; null while unread, or when they have none yet). */
  card: string | null;
  /** The reachable list or the card is still being read. */
  pending: boolean;
  /** The list is read and holds no landing vault: what the person adds would have no source (say {@link NO_OWN_VAULT_SAYS}). */
  noOwnVault: boolean;
  /** The card could not be read. */
  error: Error | null;
  /** WRITE paths: the card IRI to state, making the basic card when there is none. Rejects with the sentence to show. */
  resolve: () => Promise<string>;
  /** Read only: the card IRI, or null when there is none yet. Makes nothing (a removal needs no card to find nothing of its own). */
  find: () => Promise<string | null>;
}

const listOptions = (principal: string | undefined) =>
  ({
    queryKey: vaultsKey(principal),
    queryFn: listReachableVaults,
    staleTime: 60_000,
    retry: (failureCount: number, error: Error) => !(error instanceof NotSignedInError) && failureCount < 2,
  }) as const;

/**
 * The adder's card for a component. A read of the own-card finding under its own key (so one read per session, shared with `useOwnCard`),
 * ⛔ never a write: only `resolve()` can make the basic card, and only a write path calls it. The landing vault is taken from the
 * decorated reachable list the shell already holds (the same query key, so no second request).
 *
 * @param enabled false: nothing is read
 */
export function useAdderCard(enabled = true): AdderCardState {
  const qc = useQueryClient();
  // PASSIVE: it sees the session the shell already holds and never fetches or mints one (a card that is not under the shell asks for nothing).
  const host = useAdderCardHost();
  const session = host.useSession({ enabled: false });
  const principal = session.data?.principal;
  const list = useQuery<ReachableVault[], Error>({ ...listOptions(principal), enabled: enabled && !!principal });
  const landing = landingVaultOf(list.data);
  const finding = useQuery({ ...ownCardFindingQuery(landing ?? null), enabled: enabled && !!landing });
  const vaultsNow = useCallback(async () => (await qc.fetchQuery(listOptions(principal))) as ReachableVault[], [qc, principal]);
  const resolve = useCallback(async () => adderCardOf(await vaultsNow(), qc), [vaultsNow, qc]);
  const find = useCallback(async (): Promise<string | null> => {
    const l = landingVaultOf(await vaultsNow());
    if (!l) return null;
    const f = await readFinding(l, qc);
    return f.cardUri ? f.cardAtId || f.cardUri : null;
  }, [vaultsNow, qc]);
  const listPending = !!principal && list.isPending;
  return {
    card: finding.data?.cardUri ? finding.data.cardAtId || finding.data.cardUri : null,
    pending: enabled && (listPending || (!!landing && finding.isPending)),
    // Unknown while the list is out; with the list read (or failed) and no landing vault in it, there is no seat to state from.
    noOwnVault: enabled && !listPending && !!principal && !landing,
    error: finding.isError ? (finding.error as Error) : null,
    resolve,
    find,
  };
}
