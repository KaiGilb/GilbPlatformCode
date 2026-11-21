// The place for the project's records. The starter has none, so this screen says what the starter is and which vault is open.
// A new app replaces it with its screens to list, add, change and delete one kind of record (see the README, "Add your records").
import type { StarterContext } from "@kaigilb/gilbplatformcode-starter-app";

export function RecordsHome({ ctx }: { ctx: StarterContext }) {
  const { vault } = ctx;
  // A vault another person shared: the screen says whose vault this is and what the person may do in it.
  if (!vault.yours) {
    return (
      <div className="app-home" data-testid="records-home">
        <h1>{`You are in ${vault.label}`}</h1>
        <p>{vault.canWrite ? "This vault was shared with you. You can add and change records in it." : "This vault was shared with you. You can see its records but not change them."}</p>
        <p>This app has no records yet.</p>
        <p className="app-home-address" data-testid="vault-address">
          Vault: {vault.vaultId}
        </p>
      </div>
    );
  }
  // The person's own vault. The words are Kai's, 2026-11-21: change none of them here without his word.
  return (
    <div className="app-home" data-testid="records-home">
      <h1>Your app, your users' data</h1>
      <p>GilbPlatform keeps the app you build apart from your users' data.</p>
      <p>When a user signs in to your app, a vault is made for them. There they keep, own and control their own data.</p>
      <p>Your app reads and writes its records in that user's vault.</p>
      <p>A user can share their vault with other users. Those users sign in to your app and see the records shared with them.</p>
      <h2>This is only the beginning</h2>
      <p>What you see now is our default starting point for an app: sign-in, a vault for each user, and sharing. We shape the rest to your needs.</p>
      <p>How your finished app looks, what it does and how good it is are built after we have carefully understood what each of your stakeholders needs.</p>
      <p className="app-home-close">This app has no records yet.</p>
      <p className="app-home-address" data-testid="vault-address">
        Your vault: {vault.vaultId}
      </p>
    </div>
  );
}
