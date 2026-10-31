// Test-only. The catalogue as it answers for the flag files (by the slug rule `flag-` + the country's local id), over a `fetchFn` that records every call and its
// RequestInit. A's tests wrote the host into the fixture; here the host is the fake platform's.
import { vi } from "vitest";
import { GEO_ORIGIN } from "./world";

export const SVG_NO = '<svg xmlns="http://www.w3.org/2000/svg" id="flag-icons-no" viewBox="0 0 640 480"><path fill="#ed2939" d="M0 0h640v480H0z"/></svg>';
const SVG_SCRIPT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><script>alert(2)</script><rect width="4" height="3"/></svg>';
const SVG_ONLOAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3" onload="alert(1)"><rect width="4" height="3"/></svg>';
const SVG_HREF = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 4 3"><use xlink:href="https://tracker.example/x.svg#a"/></svg>';

export type FlagMode = "ok" | "404" | "500" | "hang" | "script" | "onload" | "href" | "html";

export function geo(mode: FlagMode, flags: Record<string, { code: string; svg: string }> = { "flag-no": { code: "no", svg: SVG_NO } }) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const m = new RegExp(`^${GEO_ORIGIN.replace(/[.]/g, "\\.")}/(files|base/e)/(flag-[^/?#]+)$`).exec(url);
    const flag = m ? flags[m[2]!] : undefined;
    if (!m || !flag) return Promise.resolve(new Response("{}", { status: 404, headers: { "content-type": "application/json" } }));
    if (mode === "hang") return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    if (mode === "404") return Promise.resolve(new Response('{"error":"not found"}', { status: 404, headers: { "content-type": "application/json" } }));
    if (mode === "500") return Promise.resolve(new Response('{"error":"boom"}', { status: 500, headers: { "content-type": "application/json" } }));
    if (m[1] === "base/e") return Promise.resolve(new Response(JSON.stringify({ "@type": "t:ImageFile", fileTag: ["flag", flag.code] }), { status: 200, headers: { "content-type": "application/ld+json" } }));
    const evil = { script: SVG_SCRIPT, onload: SVG_ONLOAD, href: SVG_HREF } as Record<string, string>;
    if (evil[mode]) return Promise.resolve(new Response(evil[mode], { status: 200, headers: { "content-type": "image/svg+xml" } }));
    if (mode === "html") return Promise.resolve(new Response(flag.svg, { status: 200, headers: { "content-type": "text/html" } }));
    return Promise.resolve(new Response(flag.svg, { status: 200, headers: { "content-type": "image/svg+xml" } }));
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls, flagCalls: () => calls.filter((c) => /\/flag-/.test(c.url)) };
}
