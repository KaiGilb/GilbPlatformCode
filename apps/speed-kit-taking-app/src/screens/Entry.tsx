// One entry, with a Rename field. Rename is a background job: `recheck` reads the list fresh; `run` writes, then refreshes the list.
import { useState } from "react";
import { cache, cached, sync, updated } from "@kaigilb/gilbplatformcode-speed-kit";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { entriesKey, loadEntries } from "../entries";
import { speed } from "../speed";

export function EntryPage({ ws, client, id, onBack }: { ws: string; client: PlatformClient; id: string; onBack: () => void }) {
  const { data, refresh } = cached.useCached(entriesKey(ws), loadEntries(client, ws));
  const entry = data?.find((e) => e.id === id);
  const [value, setValue] = useState("");
  const [began, setBegan] = useState<string | null>(null); // the name when the edit began

  const rename = () => {
    const newName = value.trim();
    if (!entry || newName === "") return;
    const shown = began ?? entry.name;
    const key = entriesKey(ws);
    const loader = loadEntries(client, ws);
    speed.jobs.enqueue({
      key: speed.jobs.jobKey(ws, "rename", id), kind: "rename", draftId: id, workspace: ws, label: "Rename an entry",
      // A fresh read (refresh, never memory): the name must still be the one the person saw when the edit began.
      recheck: async () => ((await cache.sessionCache.refresh(key, loader)).find((e) => e.id === id)?.name === shown ? null : "the name changed since you started editing. Look again."),
      run: async () => {
        try {
          const url = sync.routeUrl(client, `lws/vault/${sync.vaultSegment(ws)}/records/${encodeURIComponent(id)}`); // the stand-in's route form
          const answer = await sync.request(client, "PATCH", url, { name: newName });
          if (answer.status !== 200) return { ok: false, message: `the platform answered ${answer.status}: ${String(answer.json?.message ?? "no reason given")}` };
        } catch (e) {
          return { ok: false, message: updated.plainWhy(e, "the platform did not answer") };
        }
        await refresh();
        return { ok: true, message: "Renamed." };
      },
    });
    setValue("");
    setBegan(null);
  };

  return (
    <section>
      <button data-testid="back" onClick={onBack}>Back</button>
      {entry === undefined ? <p>Loading...</p> : (
        <>
          <h2 data-testid="entry-name">{entry.name}</h2>
          <p data-testid="entry-description">{entry.description}</p>
          <label>New name <input data-testid="rename-input" value={value} onChange={(e) => { if (began === null && entry) setBegan(entry.name); setValue(e.target.value); }} /></label>{" "}
          <button data-testid="rename-button" onClick={rename}>Rename</button>
        </>
      )}
    </section>
  );
}
