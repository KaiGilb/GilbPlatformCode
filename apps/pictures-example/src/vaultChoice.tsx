import type { ReactNode } from "react";
import { canReadVault, canWriteVault, writableVaults, type VaultListItem } from "@kaigilb/gilbplatformcode-vault-list";

/** The name a person types in ?vault=: the first label of the vault's host (testflowerpower.gilb.com -> testflowerpower). */
export function vaultShortName(vaultId: string): string {
  try {
    return new URL(vaultId).hostname.split(".")[0] ?? vaultId;
  } catch {
    return vaultId;
  }
}

export type VaultChoice =
  | { kind: "chosen"; vault: VaultListItem; name: string }
  | { kind: "none"; asked: string | null; writable: VaultListItem[] };

/** Pick the writable vault the owner named by ?vault= (short name or full vaultId). No match writes nowhere. */
export function chooseVault(vaults: readonly VaultListItem[] | null | undefined, search: string): VaultChoice {
  const writable = writableVaults(vaults).sort((a, b) => vaultShortName(a.vaultId).localeCompare(vaultShortName(b.vaultId)));
  const asked = new URLSearchParams(search).get("vault")?.trim() || null;
  if (asked) {
    const wanted = asked.toLowerCase();
    const hit =
      writable.find((v) => v.vaultId === asked) ??
      writable.find((v) => vaultShortName(v.vaultId).toLowerCase() === wanted);
    if (hit) return { kind: "chosen", vault: hit, name: vaultShortName(hit.vaultId) };
  }
  return { kind: "none", asked, writable };
}

/** Reachable vaults the person can read and cannot write. */
function readOnlyReachable(vaults: readonly VaultListItem[] | null | undefined): number {
  let n = 0;
  for (const v of vaults ?? []) {
    if (canReadVault(v) && !canWriteVault(v)) n++;
  }
  return n;
}

/** Shows the chosen vault's app, or only the chooser: no engine, no add buttons, nothing can be written. */
export function VaultGate({
  vaults,
  search,
  onSignOut,
  children,
  problem,
}: {
  vaults: readonly VaultListItem[] | null | undefined;
  search: string;
  onSignOut: () => void;
  children: (vault: VaultListItem, name: string) => ReactNode;
  /** Set when the vault list could not be read, or is only partial. */
  problem?: string;
}) {
  const problemLine = problem ? <p role="alert" data-testid="vaults-problem">{problem}</p> : null;
  const choice = chooseVault(vaults, search);
  if (choice.kind === "chosen") return <>{problemLine}{children(choice.vault, choice.name)}</>;
  const reached = vaults?.length ?? 0;
  return (
    <div className="page" data-testid="vault-chooser">
      <header className="top">
        <h1>Pictures</h1>
        <button type="button" className="btn secondary" onClick={onSignOut}>
          Sign out
        </button>
      </header>
      {problemLine}
      {choice.asked ? <p role="alert">No writable vault named {choice.asked}.</p> : null}
      <p>Choose the vault to use:</p>
      {choice.writable.length === 0 ? (
        <p className="hint">
          {reached > 0
            ? `You can read ${readOnlyReachable(vaults)} vault(s) but write to none.`
            : "This person has no vault they can write to."}
        </p>
      ) : null}
      <ul>
        {choice.writable.map((v) => {
          const n = vaultShortName(v.vaultId);
          return (
            <li key={v.vaultId}>
              <a href={`?vault=${encodeURIComponent(n)}`}>{n}</a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
