// What a browser run reads: `window.__speedProof.requests` (requests the stand-in received, by route) and
// `window.__speedProof.lastPaint` (the Entries page: ms from its mount to its first rendered row, and where those rows came from).
export type PaintSource = "memory" | "device" | "network";
export interface LastPaint { page: string; ms: number; source: PaintSource }
export interface SpeedProof {
  requests: { records: number; patch: number; other: number };
  log: { route: string; method: string; url: string }[];
  lastPaint: LastPaint | null;
}

export const proof: SpeedProof = { requests: { records: 0, patch: 0, other: 0 }, log: [], lastPaint: null };
(globalThis as { __speedProof?: SpeedProof }).__speedProof = proof;

const listeners = new Set<() => void>();
export const subscribePaint = (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getPaint = (): LastPaint | null => proof.lastPaint;
export function setPaint(p: LastPaint | null): void {
  proof.lastPaint = p;
  for (const l of [...listeners]) l();
}
