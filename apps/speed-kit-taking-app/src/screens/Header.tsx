// The header: who is signed in, Sign out, and the nav. A pointer over, a focus, a press or a touch on a nav item warms its page.
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { usePrefetch } from "../hooks";
import { personOf } from "../speed";

export function Header({ ws, client, onNav, onSignOut }: { ws: string; client: PlatformClient | null; onNav: (page: "entries") => void; onSignOut: () => void }) {
  const nav = usePrefetch(client, ws, true);
  return (
    <header>
      <strong data-testid="who">Signed in as {personOf(ws)}</strong>{" "}
      <nav {...nav} style={{ display: "inline" }}>
        <button data-testid="nav-entries" onClick={() => onNav("entries")}>Entries</button>
      </nav>{" "}
      <button data-testid="signout" onClick={onSignOut}>Sign out</button>
    </header>
  );
}
