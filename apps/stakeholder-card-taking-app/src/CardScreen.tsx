import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OnlineStakeholderCard } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { StakeholderCardGilbPlatformProvider } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { sessionConnections } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";
import { displayPlacements, placementLabel } from "@kaigilb/gilbplatformcode-person-connections";
import { useVaults } from "@kaigilb/gilbplatformcode-reachable-vaults";
import { ownVaultIdOf } from "@kaigilb/gilbplatformcode-plan-self-source";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { providerSettings, type AppSettings } from "./settings";

export const PLACEMENT_MODES = ["content", "full", "actions"] as const;
export type PlacementMode = (typeof PLACEMENT_MODES)[number];

/**
 * "People in your circles": the unit's own read of the holder's circles (`sessionConnections` of `stakeholder-list-doors`, which the card
 * itself shares), listed one button per person. It reads the holder's own vault the way the card does (`useVaults`, `ownVaultIdOf`).
 */
function CirclesList({ session, onPick }: { session: SessionCredential; onPick: (principal: string) => void }) {
  const qc = useQueryClient();
  const who = useQuery({ queryKey: ["taking-app", "session"], queryFn: () => session.getSession(), retry: false });
  const { vaults, isPending: vaultsPending, error: vaultsError } = useVaults(who.data);
  const holder = who.data?.principal ?? null;
  const ownVaultId = ownVaultIdOf({ reach: null, vaults, sessionVaultEntity: who.data?.vault?.entity ?? null });
  const ownVault = vaults.find((v) => v.vaultId === ownVaultId);
  const ownVaultName = ownVault?.name ?? ownVaultId;
  const circles = useQuery({
    queryKey: ["taking-app", "circles", holder, ownVaultId],
    queryFn: () => sessionConnections(qc, holder!, ownVaultId!),
    enabled: !!holder && !!ownVaultId,
    retry: false,
  });
  return (
    <section aria-label="People in your circles">
      <h2>People in your circles</h2>
      {who.isError && <p role="alert">Your session could not be read.</p>}
      {!who.isError && !ownVaultId && (who.isPending || vaultsPending) && <p>Reading your vaults.</p>}
      {!who.isError && !ownVaultId && !who.isPending && !vaultsPending && vaultsError && (
        <p role="alert">
          Your vault list could not be read: {vaultsError.name}: {vaultsError.message}
        </p>
      )}
      {!who.isError && !ownVaultId && !who.isPending && !vaultsPending && !vaultsError && vaults.length === 0 && (
        <p role="alert">The platform answered with no vaults for you.</p>
      )}
      {!who.isError && !ownVaultId && !who.isPending && !vaultsPending && !vaultsError && vaults.length > 0 && (
        <p role="alert">
          None of your {vaults.length} vaults is marked as your own (landing) vault:{" "}
          {vaults.map((v) => `${v.name ?? v.vaultId} (${v.modes.join(", ")})`).join(", ")}
        </p>
      )}
      {ownVaultId && <p>Your own vault: {ownVaultName}.</p>}
      {circles.isError && <p role="alert">Your circles could not be read.</p>}
      {ownVaultId && circles.isPending && !circles.isError && !who.isError && <p>Reading your circles.</p>}
      {circles.data && circles.data.people.length === 0 && <p>No one is in your circles.</p>}
      {circles.data && circles.data.people.length > 0 && (
        <ul>
          {circles.data.people.map((p) => (
            <li key={p.principal}>
              <button type="button" onClick={() => onPick(p.principal)}>
                {p.principal}
              </button>{" "}
              {displayPlacements(p.placements).map(placementLabel).join(", ")}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The person's field, the placement select, the circles list and the card. It is drawn inside the provider, so the list and the card share its client. */
function Panel({ session, openedId }: { session: SessionCredential; openedId: string | null }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<PlacementMode>("content");
  const [shown, setShown] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const principal = text.trim();
    if (principal === "") {
      setShown(null);
      setProblem("Type a person's principal (their WebID).");
      return;
    }
    setProblem(null);
    setShown(principal);
  };
  return (
    <>
      <form onSubmit={submit}>
        <label>
          Person's principal (WebID) <input value={text} onChange={(e) => setText(e.target.value)} size={64} />
        </label>{" "}
        <label>
          Placement{" "}
          <select value={mode} onChange={(e) => setMode(e.target.value as PlacementMode)}>
            {PLACEMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>{" "}
        <button type="submit">Show card</button>
      </form>
      {problem && <p role="alert">{problem}</p>}
      <CirclesList session={session} onPick={setText} />
      {openedId && <p role="status">The card opened the record {openedId}. This app has no record view.</p>}
      {shown && <OnlineStakeholderCard key={`${shown}|${mode}`} principal={shown} placementMode={mode} />}
    </>
  );
}

export function CardScreen({ settings, session }: { settings: AppSettings; session: SessionCredential }) {
  const [openedId, setOpenedId] = useState<string | null>(null);
  return (
    <section aria-label="Card">
      <StakeholderCardGilbPlatformProvider {...providerSettings(settings)} session={session} onOpenRecord={setOpenedId}>
        <Panel session={session} openedId={openedId} />
      </StakeholderCardGilbPlatformProvider>
    </section>
  );
}
