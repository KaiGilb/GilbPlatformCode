// The place for the project's records. The starter has none, so this screen only says which vault is open.
// A new app replaces it with its screens to list, add, change and delete one kind of record (see the README, "Add your records").
import type { StarterContext } from "@kaigilb/gilbplatformcode-starter-app";

export function RecordsHome({ ctx }: { ctx: StarterContext }) {
  const { vault } = ctx;
  return (
    <div className="app-home" data-testid="records-home">
      <h1>{vault.yours ? "Your vault is ready" : `You are in ${vault.label}`}</h1>
      <p>
        {vault.yours
          ? "Everything you save in this app is kept in your own vault. You can share it with other people with the Share button."
          : vault.canWrite
            ? "This vault was shared with you. You can add and change records in it."
            : "This vault was shared with you. You can see its records but not change them."}
      </p>
      <p>This app has no records yet.</p>
      <p className="app-home-address" data-testid="vault-address">
        Vault: {vault.vaultId}
      </p>
    </div>
  );
}
