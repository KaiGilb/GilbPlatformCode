/**
 * Cycle214 SB1b-2 — TEST SEAM ONLY, ⛔ never imported by product code. Stands in for the platform's `GET /base/source-name?items=…` on `globalThis.fetch`:
 * every other URL goes through to the fetch that was there. Records each call's decoded item list, so a test counts requests and the addresses they carried.
 *
 *     const rig = installSourceName((items) => ({ [items[0]]: { statedBy: CARD, name: "Anna Berg" } }));   // an object: 200 { items }, the rest null/null
 *     const rig = installSourceName(() => 404);                                                            // a number: that status (an older platform)
 */
import { vi } from "vitest";

export type SourceNameAnswer = Record<string, { statedBy: string | null; name: string | null }>;

export interface SourceNameRig {
  /** The decoded item list of each call to the route, in order. */
  calls: string[][];
  /** The full URL of each call. */
  urls: string[];
  restore: () => void;
}

export function installSourceName(answer: (items: string[]) => SourceNameAnswer | number): SourceNameRig {
  const before = globalThis.fetch;
  const rig: SourceNameRig = { calls: [], urls: [], restore: () => void (globalThis.fetch = before) };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!/\/base\/source-name\?/.test(url)) return before(input, init);
    const q = url.slice(url.indexOf("?") + 1);
    // The route splits on commas AFTER decoding; each address was encoded on its own, so splitting the raw text first is the same thing here.
    const items = q.replace(/^items=/, "").split(",").map((p) => decodeURIComponent(p));
    rig.urls.push(url);
    rig.calls.push(items);
    const got = answer(items);
    if (typeof got === "number") return new Response("no", { status: got });
    const out: SourceNameAnswer = {};
    for (const a of items) out[a] = got[a] ?? { statedBy: null, name: null };
    return new Response(JSON.stringify({ items: out }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return rig;
}
