// The app's one speed kit: the README's "Wiring example", adapted. One app name, one kit.
import { cache, createSpeedKit } from "@kaigilb/gilbplatformcode-speed-kit";
import type { WarmContext } from "@kaigilb/gilbplatformcode-prefetch-registry";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { loadEntries, entriesKey } from "./entries";
import { isLive } from "./mode";
import { provenance, session } from "./session";

export interface Ctx extends WarmContext { vault: PlatformClient }

export const speed = createSpeedKit<Ctx>({
  // A stand-in copy and a live copy must never meet: the database is `<appName>-cache`.
  appName: isLive() ? "speedkittaking-live" : "speedkittaking",
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

// ---- start and end of a session, for either mode ----
/** Sign-in or a change of person: the hub, the job store and the device copy of `person`, then the client the loaders use (set after `start`, whose hub change clears it). */
export async function startSession(person: string, workspace: string, client: PlatformClient) {
  const got = await speed.start(person, {
    workspace,
    onHydrated: (h) => { for (const e of h.entries) provenance.set(e.key, "device"); },
  });
  session.client = client;
  return got; // { disk, hydrated }: the app paints from memory, then asks the vault behind the screen
}
export async function endSession() {
  session.client = null;
  await speed.end(); // memory cleared, jobs forgotten, the copy on the device wiped
}

// ---- warmers: "entries" is the only page that loads a list ----
speed.prefetch.registerWarm("entries", ({ ws, vault }) => cache.sessionCache.warm(entriesKey(ws), loadEntries(vault, ws)));
