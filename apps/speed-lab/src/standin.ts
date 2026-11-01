// The stand-in mode's sign-in glue: two buttons, the in-page stand-in platform. (The README's persistBridge-style glue.)
import { platform as standIn, PEOPLE } from "./fakePlatform";
import { endSession, speed, startSession } from "./speed";

const WS_KEY = "speedkittaking.persist.ws";
const lastWorkspace = (person: string): string => { try { return (JSON.parse(localStorage.getItem(WS_KEY) ?? "{}") as Record<string, string>)[person] ?? ""; } catch { return ""; } };

export const signIn = (person: string) => startSession(person, lastWorkspace(person) || person, standIn.client(person)); // the stand-in's workspace is the person's own vault
export async function switchWorkspace(person: string, ws: string) {
  try { localStorage.setItem(WS_KEY, JSON.stringify({ [person]: ws })); } catch { /* storage blocked */ }
  await speed.hydrateWorkspace(ws);
}
export async function signOut() {
  try { localStorage.removeItem(WS_KEY); } catch { /* none */ }
  await endSession();
}
export const personOf = (vault: string): string => Object.values(PEOPLE).find((p) => p.vault === vault)?.label ?? vault;
