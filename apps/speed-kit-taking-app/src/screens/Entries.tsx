// The Entries list: from memory at once, from the device after a reload, the first page early from the network, refreshed behind the screen.
import { useEffect, useRef, useState } from "react";
import { cached, updated } from "@kaigilb/gilbplatformcode-speed-kit";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { entriesKey, loadEntries } from "../entries";
import { setPaint, type PaintSource } from "../proof";
import { provenance } from "../session";
import { decideSource } from "../source";

export function Entries({ ws, client, onOpen, expired, onSignInAgain }: { ws: string; client: PlatformClient; onOpen: (id: string) => void; expired?: (error: unknown) => boolean; onSignInAgain?: () => void }) {
  const key = entriesKey(ws);
  const { data, updating, updatedAt, error, partial, refresh } = cached.useCached(key, loadEntries(client, ws));

  const lapsed = error !== undefined && expired?.(error) === true; // live mode: the sign-in ran out
  const n = data?.length ?? 0;

  // The meter: t0 at the mount; the source is decided when the first rows are SEEN (a device copy can arrive late); `fullMs` when `partial` ends.
  const [mount] = useState(() => ({ t0: performance.now(), hadRowsAtMount: (data?.length ?? 0) > 0 }));
  const measured = useRef<{ ms: number; source: PaintSource; fullMs?: number } | null>(null);
  useEffect(() => { setPaint(null); }, []); // a fresh mount starts with no reading
  useEffect(() => {
    if (!n) return;
    const now = performance.now() - mount.t0;
    measured.current ??= { ms: now, source: decideSource({ hadRowsAtMount: mount.hadRowsAtMount, partial: partial === true, fromDevice: provenance.get(key) === "device" }) };
    if (!partial && measured.current.fullMs === undefined) measured.current.fullMs = now;
    setPaint({ page: "entries", ...measured.current });
  }, [n, partial, mount, key]);

  const labels = partial ? { updating: `Updating… showing at least ${n} entries so far` } : undefined;
  return (
    <section>
      <h2>Entries</h2>
      <updated.UpdatedLine updating={updating} updatedAt={updatedAt} className="line" labels={labels} />{" "}
      <button data-testid="refresh" onClick={() => void refresh()}>Refresh</button>
      {lapsed && (
        <p role="alert" data-testid="expired">Your sign-in has run out; sign in again. <button data-testid="sign-in-again" onClick={onSignInAgain}>Sign in again</button></p>
      )}
      {partial && error !== undefined && !lapsed && (
        <p role="alert" data-testid="partial-error">Showing at least {n} entries; could not load the rest: {updated.plainWhy(error)}</p>
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
