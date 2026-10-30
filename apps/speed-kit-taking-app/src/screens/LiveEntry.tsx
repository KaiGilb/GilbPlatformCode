// One entry in live mode: read only. Rename comes in the next batch, so there is no write code here.
import { cached } from "@kaigilb/gilbplatformcode-speed-kit";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { entriesKey, loadEntries } from "../entries";

export function LiveEntryPage({ ws, client, id, onBack }: { ws: string; client: PlatformClient; id: string; onBack: () => void }) {
  const { data } = cached.useCached(entriesKey(ws), loadEntries(client, ws));
  const entry = data?.find((e) => e.id === id);
  return (
    <section>
      <button data-testid="back" onClick={onBack}>Back</button>
      {entry === undefined ? <p>Loading...</p> : (
        <>
          <h2 data-testid="entry-name">{entry.name}</h2>
          <p data-testid="entry-description">{entry.description}</p>
          <p data-testid="rename-absent">Rename is not in this build</p>
        </>
      )}
    </section>
  );
}
