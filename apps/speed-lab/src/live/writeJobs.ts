// The three live writes as background jobs (RuleAppspeedInstantAction): rename one entry, add test entries, end this app's test entries.
// Each says "done" only after a read-back shows the new state. No request is made here directly: every one goes through the writer's gate.
import { cache, updated } from "@kaigilb/gilbplatformcode-speed-kit";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { entriesKey, loadEntries, type Entry } from "../entries";
import { speed } from "../speed";
import { addMade, readMade, removeMade } from "./made";
import { setProgress } from "./progress";
import { MAX_IN_FLIGHT, NAME_PREFIX, WriteFailed, type Writer } from "./writes";

export interface JobDeps { writer: Writer; client: PlatformClient; principal: string; vault: string }

const refreshList = (d: JobDeps): Promise<Entry[]> => cache.sessionCache.refresh(entriesKey(d.vault), loadEntries(d.client, d.vault));

/** Reloads the list after a write that is already done and read back. A failed reload never turns that write into a failure: the caller gets the reason (or null). */
const reloadAfterWrite = (d: JobDeps): Promise<unknown | null> => refreshList(d).then(() => null, (e: unknown) => e ?? new Error("the list did not load"));
const PRESS_REFRESH = " The list could not be reloaded; press Refresh.";

/** Runs `worker` over `items` with at most `limit` in flight. After the first failure nothing new is started; those in flight finish. */
export async function runPool<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<string | null> {
  let next = 0;
  let failure: string | null = null;
  const lane = async () => {
    while (failure === null && next < items.length) {
      const item = items[next++]!;
      try { await worker(item); } catch (e) { failure ??= e instanceof Error ? e.message : String(e); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return failure;
}

/** 1. Rename one entry. `recheck` reads THAT record fresh and refuses if its name is no longer the one shown; `run` patches with that read's ETag. */
export function enqueueRename(d: JobDeps, id: string, shown: string, newName: string) {
  let etag: string | null = null;
  return speed.jobs.enqueue({
    key: speed.jobs.jobKey(d.vault, "rename", id), kind: "rename", draftId: id, workspace: d.vault, label: "Rename an entry",
    recheck: async () => {
      const r = await d.writer.read(id);
      if (r.state !== "live") return "This entry has been ended."; // ended (served as such) or gone: nothing is written
      const fresh = r.entity;
      if (fresh.name !== shown) return "the name changed since you started editing. Look again.";
      etag = fresh.etag;
      return etag ? null : "the platform sent no version (ETag) for this entry, so nothing was changed.";
    },
    run: async () => {
      try { await d.writer.rename(id, newName, etag!); } catch (e) {
        if (e instanceof WriteFailed && e.status === 412) return { ok: false, message: "Someone changed it; look again" }; // no retry
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
      const back = await d.writer.read(id); // read-back before "renamed"
      const backName = back.state === "live" ? back.entity.name : null;
      if (backName !== newName) return { ok: false, message: `the platform accepted the change but reads the name back as ${JSON.stringify(backName)}` };
      const late = await reloadAfterWrite(d);
      return { ok: true, message: late === null ? "Renamed." : `Renamed.${PRESS_REFRESH}` };
    },
  });
}

/** 2. Add `count` test entries, at most 4 in flight, each create with its own stable `Idempotency-Key`. */
export function enqueueSeed(d: JobDeps, count: number, runId: string) {
  return speed.jobs.enqueue({
    key: speed.jobs.jobKey(d.vault, "seed", runId), kind: "seed", draftId: runId, workspace: d.vault, label: `Add ${count} test entries`,
    run: async () => {
      const made: string[] = [];
      setProgress({ runId, k: 0, n: count });
      const failure = await runPool(Array.from({ length: count }, (_, i) => i + 1), MAX_IN_FLIGHT, async (n) => {
        const id = await d.writer.create(`speedkit-proof.${runId}.${n}`, `${NAME_PREFIX}${runId} ${n}`); // the same key on a re-run
        made.push(id);
        addMade(d.principal, d.vault, id); // kept at once, so End knows it even if the run stops later
        setProgress({ runId, k: made.length, n: count });
      });
      if (failure !== null) return { ok: false, message: `${made.length} made of ${count}; stopped: ${failure}`, data: { ids: made } };
      // The create answers are the only per-entry check; the list is the seed's read-back. If it cannot be read, say so plainly: not a crash, and not "done".
      let list: Entry[];
      try { list = await refreshList(d); } catch (e) { return { ok: false, message: `Added ${made.length} of ${count}; could not check them in the list: ${updated.plainWhy(e, "the list did not load")}`, data: { ids: made } }; }
      const seen = list.filter((e) => e.name.startsWith(`${NAME_PREFIX}${runId} `)).length;
      if (seen !== count) return { ok: false, message: `${made.length} made, but the list shows ${seen} with run id ${runId}`, data: { ids: made } };
      return { ok: true, message: `Added ${made.length} of ${count}; the list shows ${seen} with run id ${runId}.`, data: { ids: made } };
    },
  });
}

/** 3. End ONLY the records this app made (the list in localStorage) whose name, read fresh, still starts with the prefix. Each is read back as ended. */
export function enqueueEnd(d: JobDeps) {
  return speed.jobs.enqueue({
    key: speed.jobs.jobKey(d.vault, "end", "mine"), kind: "end", draftId: "mine", workspace: d.vault, label: "End my test entries",
    run: async () => {
      const mine = readMade(d.principal, d.vault);
      if (mine.length === 0) return { ok: true, message: "This app has made no test entries to end.", data: { ids: [] } };
      const ended: string[] = [];
      const gone: string[] = [];
      let skipped = 0;
      const failure = await runPool(mine, MAX_IN_FLIGHT, async (id) => {
        const r = await d.writer.read(id);
        if (r.state !== "live") { gone.push(id); return; } // already ended (or gone): no request is sent
        const fresh = r.entity;
        if (!fresh.name.startsWith(NAME_PREFIX)) { skipped += 1; return; } // renamed away from the prefix: not ours to end
        await d.writer.end(id, fresh.etag);
        const after = await d.writer.read(id); // read-back: an ended record is served as ended (or reads as gone); anything else is a failure
        if (after.state === "live") throw new Error(`${id} still reads as live after the end (name ${JSON.stringify(after.entity.name)})`);
        ended.push(id);
      });
      removeMade(d.principal, d.vault, [...ended, ...gone]);
      if (failure !== null) { await refreshList(d).catch(() => undefined); return { ok: false, message: `${ended.length} ended; stopped: ${failure}`, data: { ids: ended } }; }
      const late = await reloadAfterWrite(d);
      return { ok: true, message: `Ended ${ended.length} test entries${skipped ? ` (${skipped} left alone: renamed away from the prefix)` : ""}${gone.length ? ` (${gone.length} were already ended)` : ""}.${late === null ? "" : PRESS_REFRESH}`, data: { ids: ended } };
    },
  });
}
