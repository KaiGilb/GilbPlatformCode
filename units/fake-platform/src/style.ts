// POST /base/style/extract: a signed-in developer names a public https site; the platform reads it and answers its colours and fonts.
// The fake reads no site. It answers what the test seeded for that address (`seedStyle`), or a stub that depends only on the address.
// Read at GilbPlatform origin/main 0d602ce8995dc672f241aff5e276f03b98dbad1b (the route is newer than PLATFORM_SHA): src/routes/style-extract.ts, src/style/fetch-site.ts, src/style/limit.ts.
import type { Caller } from "./auth";
import { failure, json, schemaRefusal, type Core, type Req } from "./http";
import type { StyleExtractResult } from "./types";

/** src/routes/style-extract.ts:40 (`bodyLimit: 4096`). */
export const STYLE_BODY_LIMIT = 4096;
/** src/routes/style-extract.ts:29: `createLimiter(10, 60_000, now)`, per principal. */
export const STYLE_RATE = { max: 10, windowMs: 60_000 } as const;
/** src/routes/style-extract.ts:18-23: `url` is a string of 1 to 2048 characters; no other key. */
const MAX_URL_LENGTH = 2048;

export interface StyleState {
  /** address as sent to what the platform would have read from it. */
  seeds: Map<string, StyleExtractResult>;
  /** principal to the times (ms) of its calls inside the window. */
  hits: Map<string, number[]>;
}
export const newStyleState = (): StyleState => ({ seeds: new Map(), hits: new Map() });

const FONTS = ["Inter", "Lora", "DM Sans", "Fraunces", "IBM Plex Mono", "Work Sans"];

/** Colours and fonts that depend on the address alone (FNV-1a), so the same address always answers the same. */
export function stubStyle(url: string): StyleExtractResult {
  let h = 0x811c9dc5;
  for (const ch of url) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0;
  const colors = [0, 1, 2].map((i) => `#${((Math.imul(h, i + 1) >>> 0) & 0xffffff).toString(16).padStart(6, "0")}`);
  return { colors, fonts: [FONTS[h % FONTS.length]!] };
}

/** src/style/limit.ts:15-34, with the fake's clock. */
function hit(core: Core, key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const t = core.o.now();
  const recent = (core.s.style.hits.get(key) ?? []).filter((x) => t - x < STYLE_RATE.windowMs);
  if (recent.length >= STYLE_RATE.max) {
    core.s.style.hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0]! + STYLE_RATE.windowMs - t) / 1000)) };
  }
  recent.push(t);
  core.s.style.hits.set(key, recent);
  return { ok: true };
}

/** An IPv4 literal in a range no public site lives in (loopback, private, link-local, shared, reserved, multicast). */
function privateV4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}

/** The platform's egress guard (src/net/safe-fetch.ts) resolves the name; the fake has no DNS, so it refuses by the name's own form. */
export function addressNotAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[")) {
    const v6 = host.slice(1, -1);
    return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("::ffff:");
  }
  if (privateV4(host)) return true;
  if (!host.includes(".")) return true; // localhost, an intranet name
  return host === "localhost" || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host);
}

/**
 * Rows of src/routes/style-extract.ts:38-80. The credential is checked first (the dispatcher, auth "strict": 401 before anything of the body
 * is read, `:33-36`), then the 4096-byte limit, the schema, the rate limit (429 `rate_limited`), then the address.
 */
export function styleExtract(core: Core, req: Req, caller: Caller | null): Response {
  if (caller === null) return json(401, { error: "Unauthenticated" }); // style-extract.ts:44-48
  if ((req.bodyBytes?.length ?? 0) > STYLE_BODY_LIMIT) return failure(413, "Payload Too Large", `Request body is larger than ${STYLE_BODY_LIMIT} bytes`); // bodyLimit; Fastify's own body is unverified
  let body: unknown;
  try {
    body = req.bodyText === null || req.bodyText === "" ? undefined : JSON.parse(req.bodyText);
  } catch {
    return schemaRefusal("body is not valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return schemaRefusal("body must be object");
  const keys = Object.keys(body);
  const url = (body as { url?: unknown }).url;
  if (typeof url !== "string" || url.length < 1 || url.length > MAX_URL_LENGTH || keys.some((k) => k !== "url")) return schemaRefusal("body must be {url: string (1 to 2048 characters)}, nothing else");

  const gate = hit(core, caller.principal);
  if (!gate.ok) return json(429, { error: "rate_limited", retryAfterSec: gate.retryAfterSec }, { "retry-after": String(gate.retryAfterSec) }); // :59-64

  // src/style/fetch-site.ts:46-58: https only, no credentials, port empty or 443, else 400 bad_url.
  let u: URL | null = null;
  try {
    u = new URL(url);
  } catch {
    /* bad_url */
  }
  if (u === null || u.protocol !== "https:" || u.username !== "" || u.password !== "" || (u.port !== "" && u.port !== "443")) return json(400, { error: "bad_url" });
  // src/style/fetch-site.ts:191: the egress guard refused the address.
  if (addressNotAllowed(u.hostname)) return json(400, { error: "address_not_allowed" });
  return json(200, core.s.style.seeds.get(url) ?? stubStyle(url));
}
