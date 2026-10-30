// The Entries list: from memory at once, from the device after a reload, refreshed behind the screen.
import { useEffect, useRef, useState } from "react";
import { cached, updated } from "@kaigilb/gilbplatformcode-speed-kit";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { entriesKey, loadEntries } from "../entries";
import { setPaint, type PaintSource } from "../proof";
import { provenance } from "../session";

export function Entries({ ws, client, onOpen, expired, onSignInAgain }: { ws: string; client: PlatformClient; onOpen: (id: string) => void; expired?: (error: unknown) => boolean; onSignInAgain?: () => void }) {
  const key = entriesKey(ws);
  const { data, updating, updatedAt, error, refresh } = cached.useCached(key, loadEntries(client, ws));

  const lapsed = error !== undefined && expired?.(error) === true; // live mode: the sign-in ran out

  // The meter: taken at the mount (first render), read in the first effect that sees rows. `from` is what the FIRST render already held.
  const [mount] = useState(() => ({ t0: performance.now(), from: (data?.length ? (provenance.get(key) === "device" ? "device" : "memory") : null) as PaintSource | null }));
  const measured = useRef<{ ms: number; source: PaintSource } | null>(null);
  useEffect(() => { setPaint(null); }, []); // a fresh mount starts with no reading
  useEffect(() => {
    if (!data?.length) return;
    measured.current ??= { ms: performance.now() - mount.t0, source: mount.from ?? "network" };
    setPaint({ page: "entries", ...measured.current });
  }, [data, mount]);

  return (
    <section>
      <h2>Entries</h2>
      <updated.UpdatedLine updating={updating} updatedAt={updatedAt} className="line" />{" "}
      <button data-testid="refresh" onClick={() => void refresh()}>Refresh</button>
      {lapsed && (
        <p role="alert" data-testid="expired">Your sign-in has run out; sign in again. <button data-testid="sign-in-again" onClick={onSignInAgain}>Sign in again</button></p>
      )}
      {data === undefined ? (lapsed ? null : <p>Loading...</p>) : (
        <ul>
          {data.map((e) => (
            <li key={e.id} data-testid={`entry-${e.id}`}>
              <button data-testid={`nav-entry-${e.id}`} onClick={() => onOpen(e.id)}>{e.name}</button> <span>{e.description}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
