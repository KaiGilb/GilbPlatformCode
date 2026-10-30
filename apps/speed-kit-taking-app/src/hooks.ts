// The README example's usePrefetch and useJobs, for this app's kit.
import { useEffect, useSyncExternalStore } from "react";
import { hub, jobs as jobsUnit, prefetch as prefetchUnit } from "@kaigilb/gilbplatformcode-speed-kit";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { speed } from "./speed";

// ---- usePrefetch: warm the next page on idle and on intent ----
const warm = (e: { target: EventTarget | null }) => {
  const id = (e.target as HTMLElement | null)?.closest?.("[data-testid^='nav-']")?.getAttribute("data-testid")?.slice(4);
  if (id) speed.prefetch.prefetchPage(id);
};
const NAV = { onPointerOver: warm, onFocus: warm, onPointerDown: warm, onTouchStart: warm };
export function usePrefetch(vault: PlatformClient | null, ws: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !ws || !vault) { speed.prefetch.setWarmContext(null); return; }
    speed.prefetch.setWarmContext({ vault, ws });
    return prefetchUnit.onIdle(speed.prefetch.prefetchAll);
  }, [vault, ws, enabled]);
  return NAV;
}

// ---- useJobs: the jobs, notices, toasts and "did not finish" lines of one workspace ----
interface JobsView { jobs: jobsUnit.Job[]; notices: jobsUnit.Notice[]; toasts: jobsUnit.Toast[]; unfinished: jobsUnit.Unfinished[] }
const EMPTY: JobsView = { jobs: [], notices: [], toasts: [], unfinished: [] };
const views = new Map<string, { version: number; view: JobsView }>();
hub.registerCache("speedkittaking.useJobs", () => views.clear());
function viewOf(ws: string): JobsView {
  const v = speed.jobs.getVersion();
  const hit = views.get(ws);
  if (hit && hit.version === v) return hit.view;
  const view = { jobs: speed.jobs.jobsOf(ws), notices: speed.jobs.noticesOf(ws), toasts: speed.jobs.toastsOf(ws), unfinished: speed.jobs.unfinishedOf(ws) };
  views.set(ws, { version: v, view });
  return view;
}
export const useJobs = (ws: string | null): JobsView => useSyncExternalStore(speed.jobs.subscribe, () => (ws ? viewOf(ws) : EMPTY), () => EMPTY);
