// What a browser run reads: `window.__speedProof.requests` (requests the stand-in received, by route) and
// `window.__speedProof.lastPaint` (the Entries page: ms from its mount to its first rendered row, and where those rows came from).
export type PaintSource = "memory" | "device" | "preview" | "network";
/** `ms` is mount to first rows; `fullMs` is mount to the full list (when `partial` went false), set once. */
export interface LastPaint { page: string; ms: number; source: PaintSource; fullMs?: number }
/** What `speed.start` answered at the last sign-in: for diagnosing a first paint that did not come from the device. */
export interface StartReading { disk: boolean; hydrated: boolean; ms: number; entries: number; at: string }
export interface SpeedProof {
  requests: { records: number; patch: number; other: number };
  /** The requests the stand-in has ANSWERED (`requests` counts those it RECEIVED). */
  answered: { records: number; patch: number };
  log: { route: string; method: string; url: string }[];
  lastPaint: LastPaint | null;
  start: StartReading | null;
}

export const proof: SpeedProof = { requests: { records: 0, patch: 0, other: 0 }, answered: { records: 0, patch: 0 }, log: [], lastPaint: null, start: null };
(globalThis as { __speedProof?: SpeedProof }).__speedProof = proof;

const listeners = new Set<() => void>();
export const subscribePaint = (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getPaint = (): LastPaint | null => proof.lastPaint;
export function setPaint(p: LastPaint | null): void {
  proof.lastPaint = p;
  for (const l of [...listeners]) l();
}

export const getStart = (): StartReading | null => proof.start;
export function setStart(s: StartReading | null): void {
  proof.start = s;
  for (const l of [...listeners]) l();
}
/** `start: disk yes|no, hydrated yes|no, N entries, M ms` */
export const startLine = (s: StartReading): string => `start: disk ${s.disk ? "yes" : "no"}, hydrated ${s.hydrated ? "yes" : "no"}, ${s.entries} entries, ${s.ms} ms`;

/** Test hooks for a browser run, only when the URL carries `proofHooks=1`: `window.__speedProofHooks.clearCache()`. */
export function installProofHooks(search: string, target: object, clearCache: () => void): void {
  if (new URLSearchParams(search).get("proofHooks") !== "1") return;
  (target as { __speedProofHooks?: unknown }).__speedProofHooks = { clearCache };
}
