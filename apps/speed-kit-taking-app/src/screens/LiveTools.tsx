// Live mode with --allow-write only: add test entries (10, 50, 200 or 500) and end the ones this app made.
import { useState, useSyncExternalStore } from "react";
import { cache } from "@kaigilb/gilbplatformcode-speed-kit";
import { entriesKey } from "../entries";
import { enqueueEnd, enqueueSeed, type JobDeps } from "../live/writeJobs";
import { getProgress, subscribeProgress } from "../live/progress";
import { madeCount, subscribeMade } from "../live/made";
import { SEED_COUNTS } from "../live/writes";

export function LiveTools({ deps }: { deps: JobDeps }) {
  const [count, setCount] = useState<number>(SEED_COUNTS[0]);
  const [runId, setRunId] = useState<string | null>(null);
  const mine = useSyncExternalStore(subscribeMade, () => madeCount(deps.principal, deps.vault), () => 0); // follows the list, no remount
  const progress = useSyncExternalStore(subscribeProgress, getProgress, getProgress);
  // While the list is only a preview, Add is off (its read-back counts the whole list). End works from the made-list, so it stays on.
  const key = entriesKey(deps.vault);
  const partial = useSyncExternalStore((fn) => cache.sessionCache.subscribe(key, fn), () => cache.sessionCache.peek(key).partial === true, () => false);
  const seed = () => {
    const id = Date.now().toString(36);
    setRunId(id);
    void enqueueSeed(deps, count, id);
  };
  const end = () => { void enqueueEnd(deps); };
  return (
    <section data-testid="live-tools">
      <label>Add <select data-testid="seed-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>{SEED_COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}</select> test entries</label>{" "}
      <button data-testid="seed-button" onClick={seed} disabled={partial} title={partial ? "Loading the whole list first" : undefined}>Add test entries</button>{" "}
      <button data-testid="end-button" onClick={end}>End my test entries</button>{" "}
      <span data-testid="made-count">{mine} made by this app</span>
      {runId && <span data-testid="seed-run"> Run id: {runId}.</span>}
      {progress && <span data-testid="seed-progress"> Added {progress.k} of {progress.n}</span>}
    </section>
  );
}
