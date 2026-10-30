// One entry in live mode. Reading is always on; the rename field exists only with --allow-write (a background job: fresh read, If-Match, read-back).
import { useState } from "react";
import { cached } from "@kaigilb/gilbplatformcode-speed-kit";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { entriesKey, loadEntries } from "../entries";
import { enqueueRename, type JobDeps } from "../live/writeJobs";

export function LiveEntryPage({ ws, client, id, onBack, deps }: { ws: string; client: PlatformClient; id: string; onBack: () => void; deps: JobDeps | null }) {
  const { data } = cached.useCached(entriesKey(ws), loadEntries(client, ws));
  const entry = data?.find((e) => e.id === id);
  const [value, setValue] = useState("");
  const [began, setBegan] = useState<string | null>(null); // the name when the edit began
  const rename = () => {
    const next = value.trim();
    if (!deps || !entry || next === "") return;
    void enqueueRename(deps, id, began ?? entry.name, next);
    setValue(""); setBegan(null);
  };
  return (
    <section>
      <button data-testid="back" onClick={onBack}>Back</button>
      {entry === undefined ? <p>Loading...</p> : (
        <>
          <h2 data-testid="entry-name">{entry.name}</h2>
          <p data-testid="entry-description">{entry.description}</p>
          {deps === null ? <p data-testid="rename-absent">Rename is not in this build</p> : (
            <>
              <label>New name <input data-testid="rename-input" value={value} onChange={(e) => { if (began === null) setBegan(entry.name); setValue(e.target.value); }} /></label>{" "}
              <button data-testid="rename-button" onClick={rename}>Rename</button>
            </>
          )}
        </>
      )}
    </section>
  );
}
