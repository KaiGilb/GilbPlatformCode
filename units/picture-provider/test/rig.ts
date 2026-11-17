// Test helpers lifted from Social p114-rig.ts: a fake WaveSpeed behind the REAL picture egress, and a clock the test drives. Nothing leaves the process.
import { pictureEgress, type EgressLog } from "../src/egress.js";
import type { WaveSpeedDeps } from "../src/wavespeed.js";

export const BASE = "https://api.wavespeed.ai";
export const OUT_HOST = "cdn.wavespeed.ai";
export const KEY = "ws_fake_0123456789abcdef0123456789abcdef";
export const MODEL = "wavespeed-ai/flux-dev";
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);

export type Handler = (n: number, req: { url: string; init: RequestInit }) => Response | Promise<Response>;
export interface Seen { method: string; url: string; headers: Record<string, string>; body?: string }

/** A completed envelope as WaveSpeed's docs show it. */
export const completed = (id = "p1", outputs: string[] = [`https://${OUT_HOST}/${id}.png`]) => new Response(JSON.stringify({ code: 200, message: "success", data: { id, model: MODEL, outputs, status: "completed", created_at: "2026-10-25T10:00:00Z" } }), { status: 200 });
/** A sync wait that ran out: 200, status processing, data.code 5004. */
export const processing = (id = "p1") => new Response(JSON.stringify({ code: 200, message: "success", data: { id, model: MODEL, outputs: [], status: "processing", code: 5004, created_at: "2026-10-25T10:00:00Z" } }), { status: 200 });
export const withStatus = (status: string, id = "p1", error?: string) => new Response(JSON.stringify({ code: 200, message: "success", data: { id, model: MODEL, outputs: [], status, ...(error ? { error } : {}) } }), { status: 200 });
export const image = (bytes: Uint8Array = PNG, type = "image/png", extra: Record<string, string> = {}) => new Response(bytes as BodyInit, { status: 200, headers: { "content-type": type, ...extra } });

export function service(h: { submit?: Handler; poll?: Handler; output?: Handler }) {
  const seen: Seen[] = [];
  const counts = { submit: 0, poll: 0, output: 0, other: 0 };
  const inner = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url);
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    seen.push({ method: init.method ?? "GET", url, headers, ...(typeof init.body === "string" ? { body: init.body } : {}) });
    if (u.host === "api.wavespeed.ai" && init.method === "POST" && u.pathname.startsWith("/api/v3/") && !u.pathname.includes("/predictions/")) return (h.submit ?? (() => completed()))(++counts.submit, { url, init });
    if (u.host === "api.wavespeed.ai" && (init.method ?? "GET") === "GET" && /^\/api\/v3\/predictions\/[^/]+\/result$/.test(u.pathname)) return (h.poll ?? (() => completed()))(++counts.poll, { url, init });
    if (u.host === OUT_HOST) return (h.output ?? (() => image()))(++counts.output, { url, init });
    counts.other++;
    throw new Error(`the fake service was reached at ${url}`);
  }) as unknown as typeof fetch;
  return { inner, seen, counts };
}

/** A clock: sleep advances it. */
export function clock() {
  const c = { t: 0, sleeps: [] as number[] };
  return { c, now: () => c.t, sleep: async (ms: number) => { c.sleeps.push(ms); c.t += ms; } };
}

/** The deps of one wavespeed call, over the real egress and a fake service. */
export function wsDeps(svc: ReturnType<typeof service>, over: Partial<WaveSpeedDeps> = {}, log: EgressLog = { allowed: [], refused: [] }) {
  const k = clock();
  const eg = pictureEgress(BASE, [OUT_HOST], svc.inner, { log });
  const deps: WaveSpeedDeps = { apiBase: BASE, apiKey: KEY, api: eg.api, output: eg.output, outputHosts: [OUT_HOST], sleep: k.sleep, now: k.now, ...over };
  return { deps, clock: k, egressLog: log };
}
