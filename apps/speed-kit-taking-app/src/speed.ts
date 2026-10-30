// The app's one speed kit: the README's "Wiring example", adapted. One app name, one kit.
import { cache, createSpeedKit } from "@kaigilb/gilbplatformcode-speed-kit";
import type { WarmContext } from "@kaigilb/gilbplatformcode-prefetch-registry";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { platform as standIn, PEOPLE } from "./fakePlatform";
import { loadEntries, entriesKey } from "./entries";
import { provenance, session } from "./session";

export interface Ctx extends WarmContext { vault: PlatformClient }

export const speed = createSpeedKit<Ctx>({
  appName: "speedkittaking",
  persistResources: ["entries"],
  jobs: {
    kinds: ["rename"],
    failText: (_kind, message) => `Not renamed: ${message}`,
    unfinishedText: (label) => `This did not finish: ${label}. Open the entry to check.`,
    cancelledText: "Cancelled: the entry was edited again.",
    crashText: "Something went wrong, so nothing more was recorded. Look at the entry before you try again.",
  },
});
cache.sessionCache.installFocus(window); // once: a tab that regains focus revalidates

// ---- the persistBridge-style glue (README: about 25 lines) ----
const WS_KEY = "speedkittaking.persist.ws";
const lastWorkspace = (person: string): string => { try { return (JSON.parse(localStorage.getItem(WS_KEY) ?? "{}") as Record<string, string>)[person] ?? ""; } catch { return ""; } };

export async function signIn(person: string) {
  const got = await speed.start(person, {
    workspace: lastWorkspace(person) || person, // the stand-in's workspace is the person's own vault
    onHydrated: (h) => { for (const e of h.entries) provenance.set(e.key, "device"); },
  });
  session.client = standIn.client(person); // after start: start's setPrincipal clears this holder
  return got; // { disk, hydrated }: the app paints from memory, then asks the vault behind the screen
}
export async function switchWorkspace(person: string, ws: string) {
  try { localStorage.setItem(WS_KEY, JSON.stringify({ [person]: ws })); } catch { /* storage blocked */ }
  await speed.hydrateWorkspace(ws);
}
export async function signOut() {
  session.client = null;
  try { localStorage.removeItem(WS_KEY); } catch { /* none */ }
  await speed.end(); // memory cleared, jobs forgotten, the copy on the device wiped
}

export const personOf = (vault: string): string => Object.values(PEOPLE).find((p) => p.vault === vault)?.label ?? vault;

// ---- warmers: "entries" is the only page that loads a list ----
speed.prefetch.registerWarm("entries", ({ ws, vault }) => cache.sessionCache.warm(entriesKey(ws), loadEntries(vault, ws)));
