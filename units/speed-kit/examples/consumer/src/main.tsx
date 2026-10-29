// A new GilbPlatform app wired to the speed units. Nothing here is the app's real data layer: `Client` stands for your own vault client.
import { StrictMode, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { cache, cached, createSpeedKit, hub, jobs as jobsUnit, prefetch as prefetchUnit, updated } from "@kaigilb/gilbplatformcode-speed-kit";
import type { StoreEvent } from "@kaigilb/gilbplatformcode-device-store";
import type { WarmContext } from "@kaigilb/gilbplatformcode-prefetch-registry";

// ---- your own pieces ----
interface Client {
  seeds: { vaults?: unknown; stores: Map<string, unknown> };
  onStore(fn: ((e: StoreEvent) => void) | undefined): void;
  onVaultsListed(fn: (list: never[]) => void): () => void;
  resetAll(): void;
}
declare const client: Client;
declare function loadInbox(ws: string): Promise<{ id: string; title: string }[]>;
interface Ctx extends WarmContext { vault: Client }

// ---- startup: one app name, one kit ----
export const speed = createSpeedKit<Ctx>({
  appName: "myapp",                     // the database is "myapp-cache", the job records "myapp.jobIntents"
  persistResources: ["inbox"],          // only plain-data resources are kept on the device
  jobs: {
    kinds: ["save"],
    failText: (_kind, message) => `Not saved: ${message}. Open the item.`,
    unfinishedText: (label) => `This action did not finish: ${label}. Open the item to check.`,
    cancelledText: "Cancelled: the item was edited again.",
    crashText: "Something went wrong, so nothing more was recorded. Look before you try again.",
  },
});
cache.sessionCache.installFocus(window);                 // once: a tab that regains focus revalidates
hub.registerCache("myapp.vaultClient", () => client.resetAll());   // your own in-memory stores go with the person

// ---- the persistBridge-style glue (Social's persistBridge.ts, in about 25 lines) ----
const WS_KEY = "myapp.persist.ws";
const lastWorkspace = (person: string): string => { try { return (JSON.parse(localStorage.getItem(WS_KEY) ?? "{}") as Record<string, string>)[person] ?? ""; } catch { return ""; } };
export async function signIn(person: string) {
  const got = await speed.start(person, {
    workspace: lastWorkspace(person),
    onHydrated: (h) => { client.seeds = { vaults: h.vaults, stores: new Map(h.stores.map((s) => [s.key, s.snap])) }; },
  });
  client.onStore((e) => speed.currentPersist()?.saveStore(e));
  client.onVaultsListed((list) => speed.currentPersist()?.saveVaults(list));
  return got;                           // { disk, hydrated }: the app paints from memory, then asks the vault behind the screen
}
export async function switchWorkspace(person: string, ws: string) {
  try { localStorage.setItem(WS_KEY, JSON.stringify({ [person]: ws })); } catch { /* storage blocked */ }
  await speed.hydrateWorkspace(ws);
}
export async function signOut() {
  client.onStore(undefined);
  try { localStorage.removeItem(WS_KEY); } catch { /* none */ }
  await speed.end();                    // memory cleared, jobs forgotten, the copy on the device wiped
}

// ---- usePrefetch: warm the next page on idle and on intent ----
speed.prefetch.registerWarm("inbox", ({ ws }) => cache.sessionCache.warm(cache.cacheKey(ws, "inbox"), () => loadInbox(ws)));
const warm = (e: { target: EventTarget | null }) => {
  const id = (e.target as HTMLElement | null)?.closest?.("[data-testid^='nav-']")?.getAttribute("data-testid")?.slice(4);
  if (id) speed.prefetch.prefetchPage(id);
};
const NAV = { onPointerOver: warm, onFocus: warm, onPointerDown: warm, onTouchStart: warm };
export function usePrefetch(vault: Client, ws: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !ws) { speed.prefetch.setWarmContext(null); return; }
    speed.prefetch.setWarmContext({ vault, ws });
    return prefetchUnit.onIdle(speed.prefetch.prefetchAll);
  }, [vault, ws, enabled]);
  return NAV;
}

// ---- useJobs: the jobs, notices, toasts and "did not finish" lines of one workspace ----
interface JobsView { jobs: jobsUnit.Job[]; notices: jobsUnit.Notice[]; toasts: jobsUnit.Toast[]; unfinished: jobsUnit.Unfinished[] }
const EMPTY: JobsView = { jobs: [], notices: [], toasts: [], unfinished: [] };
const views = new Map<string, { version: number; view: JobsView }>();
hub.registerCache("myapp.useJobs", () => views.clear());
function viewOf(ws: string): JobsView {
  const v = speed.jobs.getVersion();
  const hit = views.get(ws);
  if (hit && hit.version === v) return hit.view;
  const view = { jobs: speed.jobs.jobsOf(ws), notices: speed.jobs.noticesOf(ws), toasts: speed.jobs.toastsOf(ws), unfinished: speed.jobs.unfinishedOf(ws) };
  views.set(ws, { version: v, view });
  return view;
}
export const useJobs = (ws: string | null): JobsView => useSyncExternalStore(speed.jobs.subscribe, () => (ws ? viewOf(ws) : EMPTY), () => EMPTY);

// ---- a page: paints from memory, revalidates behind, says so ----
function Inbox({ ws }: { ws: string }) {
  const { data, updating, updatedAt, refresh } = cached.useCached(cache.cacheKey(ws, "inbox"), () => loadInbox(ws));
  const { jobs, notices } = useJobs(ws);
  const nav = usePrefetch(client, ws, true);
  const save = (id: string) => speed.jobs.enqueue({
    key: speed.jobs.jobKey(ws, "save", id), kind: "save", draftId: id, workspace: ws, label: `Save ${id}`,
    run: async () => { await refresh(); return { ok: true, message: "Saved." }; },
  });
  return (
    <div>
      <nav {...nav}><button data-testid="nav-inbox">Inbox</button></nav>
      <updated.UpdatedLine updating={updating} updatedAt={updatedAt} />
      <button onClick={() => void refresh()}>Refresh</button>
      <ul>{(data ?? []).map((r) => <li key={r.id}><button onClick={() => save(r.id)}>{r.title}</button></li>)}</ul>
      {jobs.length > 0 && <p>{jobs.length} job(s)</p>}
      {notices.map((n) => <p key={n.key} role="alert">{n.text}</p>)}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Inbox ws="https://team.example.test/vault" /></StrictMode>);
