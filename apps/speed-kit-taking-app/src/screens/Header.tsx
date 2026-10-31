// The header: who is signed in, Sign out, and the nav. A pointer over, a focus, a press or a touch on a nav item warms its page.
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { usePrefetch } from "../hooks";

export function Header({ ws, label, client, onNav, onSignOut }: { ws: string; label: string; client: PlatformClient | null; onNav: (page: "entries") => void; onSignOut: () => void }) {
  const nav = usePrefetch(client, ws, true);
  return (
    <header>
      <strong data-testid="who">Signed in as {label}</strong>{" "}
      <nav {...nav} style={{ display: "inline" }}>
        <button data-testid="nav-entries" onClick={() => onNav("entries")}>Entries</button>
      </nav>{" "}
      <button data-testid="signout" onClick={onSignOut}>Sign out</button>
    </header>
  );
}
