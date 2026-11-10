// The stand-in mode: the in-page platform is the shared `fake-platform` unit (it answers the platform's real routes with the platform's real shapes);
// this file seeds two people and their entries, signs the app's client with `fake.authHost`, and counts each request for the speed meter.
import { createFakePlatform } from "@kaigilb/gilbplatformcode-fake-platform";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { meter } from "./proof";
import { TYPE } from "./catalog";
import { endSession, speed, startSession } from "./speed";

export const PEOPLE = {
  ann: { label: "Ann", vault: "https://ann.example.test/vault", origin: "https://ann.example.test", count: 30, prefix: "e" },
  ben: { label: "Ben", vault: "https://ben.example.test/vault", origin: "https://ben.example.test", count: 5, prefix: "b" },
} as const;
export type PersonKey = keyof typeof PEOPLE;

/** `?latency=<ms>`: the delay of every request (default 600). */
function latencyFromUrl(): number {
  const raw = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("latency");
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 600;
}
/** `?entries=<n>`: Ann's count (default 30, at most 2000). */
function annCountFromUrl(): number {
  const raw = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("entries");
  const n = raw === null ? NaN : Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(2000, n) : PEOPLE.ann.count;
}

export const fake = createFakePlatform({ origin: "https://example.test", domain: "example.test", latencyMs: latencyFromUrl });
const hosts = new Map<string, ReturnType<typeof fake.authHost>>();
for (const p of Object.values(PEOPLE)) {
  const person = fake.seedPerson({ email: `${p.label.toLowerCase()}@example.test`, vaultName: p.label.toLowerCase() });
  const vault = fake.state.vaults.get(person.landingVaultId!)!;
  hosts.set(p.vault, fake.authHost(person));
  const count = p.label === "Ann" ? annCountFromUrl() : p.count;
  // Entry 1 is the newest, so the list is served "Ann entry 1" first. Record ids are unique across the platform, so each person has a prefix (Ann e1, Ben b1).
  for (let n = count; n >= 1; n--) fake.seedRecord(vault, { id: `${p.prefix}${n}`, type: TYPE, facts: { name: `${p.label} entry ${n}`, description: `${p.label}'s description ${n}` } });
}

const routeOf = (method: string, url: string): "records" | "patch" | "other" => {
  const path = new URL(url).pathname;
  if (method === "GET" && /^\/lws\/vault\/[^/]+\/records$/.test(path)) return "records";
  return method === "PATCH" ? "patch" : "other";
};

/** A client for one person's vault: its origin is the vault's own host, every request is signed, the meter counts what was sent and what was answered. */
export function client(vault: string): PlatformClient {
  const host = hosts.get(vault)!;
  return {
    origin: new URL(vault).origin,
    fetch: async (url, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const route = routeOf(method, url);
      meter.countRequest(route, method, url);
      const res = await fake.fetch(url, { ...init, method, headers: { ...(init?.headers as Record<string, string> | undefined), ...(await host.dpopWriteAuth(method, url)) } });
      if (route !== "other") meter.countAnswered(route);
      return res;
    },
  };
}

const WS_KEY = "speedkittaking.persist.ws";
const lastWorkspace = (person: string): string => { try { return (JSON.parse(localStorage.getItem(WS_KEY) ?? "{}") as Record<string, string>)[person] ?? ""; } catch { return ""; } };

export const signIn = (person: string) => startSession(person, lastWorkspace(person) || person, client(person)); // the stand-in's workspace is the person's own vault
export async function switchWorkspace(person: string, ws: string) {
  try { localStorage.setItem(WS_KEY, JSON.stringify({ [person]: ws })); } catch { /* storage blocked */ }
  await speed.hydrateWorkspace(ws);
}
export async function signOut() {
  try { localStorage.removeItem(WS_KEY); } catch { /* none */ }
  await endSession();
}
export const personOf = (vault: string): string => Object.values(PEOPLE).find((p) => p.vault === vault)?.label ?? vault;
