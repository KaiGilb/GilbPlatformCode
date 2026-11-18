// The WaveSpeed picture client. One picture: submit, wait, fetch the bytes. Nothing here writes a record or counts.
//
// The shapes, from WaveSpeed's model page for wavespeed-ai/flux-schnell
// (https://wavespeed.ai/docs/docs-api/wavespeed-ai/flux-schnell, read 2026-11-18):
//   submit   POST {base}/api/v3/{modelId}   Authorization: Bearer <key>   JSON {prompt, size, output_format?, seed?, enable_sync_mode: true}
//            size is "<width>*<height>", range 256 to 1536, default 1024*1024; output_format jpeg (default) | png | webp
//   answer   {code, message, data: {id, model, outputs: string[], status, created_at, error?, urls?: {get}}}
//   status   created | processing | completed ; terminal failures failed | cancelled | timeout | deleted
//   poll     GET {base}/api/v3/predictions/{id}/result
//
// Rules this file keeps:
//   - The submit POST is sent ONCE and never repeated (a lost answer may be a billed picture). Only the poll GET is repeated.
//   - What cannot be told is Unknown, never Failed: a POST whose answer was lost, a 5xx or a redirect on the POST, a
//     wait that ran out, a poll that cannot be asked.
//   - Failed means the service said no, or the picture could not be taken: a 4xx on the POST, a terminal status, an
//     output address on a host not listed, bytes too large or not png/jpeg/webp.
//   - The key is only ever put in the Authorization header of a call through the `api` fetch. The picture itself is
//     fetched through the `output` fetch, with no credential. Every reason leaving this file is redacted with the key.
import { PICTURE_BYTES_MAX, PICTURE_TYPES, type PictureType } from "./bytes.js";
import { EgressRefused, hostKey } from "./egress.js";

/** The longest one picture may take, from the submit to the last poll (120 s). Past it the outcome is Unknown. */
export const PICTURE_WAIT_MS = 120_000;
/** The longest prompt sent, in characters. */
export const PICTURE_PROMPT_CHARS = 4000;

export interface WaveSpeedDeps {
  /** The validated base (https, no trailing slash). */
  apiBase: string;
  /** The key. Only ever sent as `Authorization: Bearer`. */
  apiKey: string;
  /** pictureEgress(...).api: reaches only the API origin. */
  api: typeof fetch;
  /** pictureEgress(...).output: reaches only the output hosts. */
  output: typeof fetch;
  /** The output hosts (host or host:port); an output address on any other host is refused before a fetch. */
  outputHosts: string[];
  /** The wait between polls. Default: a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** The clock in ms. Default Date.now. */
  now?: () => number;
  /** The longest the whole call may take (default {@link PICTURE_WAIT_MS}). */
  waitMs?: number;
  /** Removes further secrets from text. The key itself is always removed too. */
  redact?: (s: string) => string;
  /** One line per step, redacted. Never carries the key, a prompt or bytes. */
  log?: (line: string) => void;
}

/**
 * One request. `seed` is sent only when present (an integer; -1 means random to the service). `outputFormat` is sent
 * as `output_format` only when present; the service's own default is jpeg.
 */
export interface PictureRequest { modelId: string; prompt: string; size: string; seed?: number; outputFormat?: "png" | "jpeg" | "webp" }

export type PictureResult =
  | { outcome: "Made"; bytes: Uint8Array; contentType: PictureType; predictionId: string }
  /**
   * `submitRefused` is true ONLY when the submit itself was answered with a 4xx: the service accepted nothing, so
   * nothing was billed. Every other Failed leaves it off: it cannot be told that nothing was billed.
   */
  | { outcome: "Failed" | "Unknown"; reason: string; cause: PictureFailureCause; predictionId?: string; submitRefused?: true };

/**
 * WHY a picture was not made, so a host can tell a term's own failure from a fault of the whole service:
 *   bad-request  the request could not be sent as asked (the prompt, the size): this term's own
 *   refused      the service refused this request (a 4xx that is not auth or rate): this term's own
 *   ended        the service ended this picture (failed, cancelled, timeout, deleted): this term's own
 *   auth         the service refused the key (401, 403): the whole service, until the key is fixed
 *   rate         the service is busy (429): the whole service, for a while
 *   not-sent     the request never reached the service (refused by the egress guard, the name did not resolve, the
 *                connection was not made): the whole service or the network; nothing was billed
 *   service      a 5xx, no answer, an answer that cannot be read, a wait that ran out: the whole service; may be billed
 *   output       the picture was made but could not be fetched from its output host: the output host; billed
 */
export type PictureFailureCause = "bad-request" | "refused" | "ended" | "auth" | "rate" | "not-sent" | "service" | "output";

/** The causes that say nothing about the term: the host should put the term back to wait, not end it. */
export const TRANSIENT_CAUSES: ReadonlySet<PictureFailureCause> = new Set(["auth", "rate", "not-sent", "service", "output"]);

/** Error codes a runtime gives when a connection was never made (so nothing was sent). */
const NOT_CONNECTED = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_NONAME", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT"]);
/** True when a thrown fetch error proves the request never reached the service. */
function neverConnected(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 4; x = (x as { cause?: unknown }).cause, i++) {
    const code = (x as { code?: unknown }).code;
    if (typeof code === "string" && NOT_CONNECTED.has(code)) return true;
  }
  return false;
}

/** The wait before the first poll; each wait is half as long again, never over POLL_MAX_MS. */
export const POLL_FIRST_MS = 1_500;
const POLL_MAX_MS = 10_000;
/** One poll, and the fetch of the picture, may take this long at most. */
const CALL_MS = 30_000;
/** The no-retry guard: the submit POST is tried ONCE; only the poll GET is tried again. */
const SUBMIT_TRIES = 1;
const POLL_TRIES = 3;

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*){0,3}$/;
const SIZE = /^[0-9A-Za-z*x:._-]{1,20}$/;
const PREDICTION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const TERMINAL_FAILURES = new Set(["failed", "cancelled", "timeout", "deleted"]);
const FORMATS = new Set(["png", "jpeg", "webp"]);

const asRec = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * Why a request cannot be sent (so a caller can refuse it BEFORE it counts the picture), or null when it can.
 *
 * @param req the request
 */
export function requestProblem(req: PictureRequest): string | null {
  if (typeof req.modelId !== "string" || !MODEL_ID.test(req.modelId) || req.modelId.length > 120) return "the model id is not one the client sends";
  if (typeof req.prompt !== "string" || !req.prompt.trim() || req.prompt.length > PICTURE_PROMPT_CHARS) return `the prompt is empty or longer than ${PICTURE_PROMPT_CHARS} characters`;
  if (typeof req.size !== "string" || !SIZE.test(req.size)) return "the size is not one the client sends";
  if (req.seed !== undefined && !(Number.isSafeInteger(req.seed) && req.seed >= 0 && req.seed <= 0x7fffffff)) return "the seed is not a whole number from 0 to 2147483647";
  if (req.outputFormat !== undefined && !FORMATS.has(req.outputFormat)) return "the output format is not png, jpeg or webp";
  return null;
}

type Reading =
  | { kind: "completed"; id: string; outputs: unknown[] }
  | { kind: "pending"; id: string }
  | { kind: "failed"; id: string | null; why: string; code?: number }
  | { kind: "unclear"; why: string };

function read(body: unknown): Reading {
  const env = asRec(body);
  const data = asRec(env?.["data"]);
  if (!data) {
    const code = typeof env?.["code"] === "number" ? (env["code"] as number) : null;
    return code !== null && code >= 400 && code < 500 ? { kind: "failed", id: null, why: `the service answered code ${code}`, code } : { kind: "unclear", why: "the answer has no data" };
  }
  const id = typeof data["id"] === "string" && PREDICTION_ID.test(data["id"]) ? data["id"] : null;
  const status = typeof data["status"] === "string" ? data["status"].toLowerCase() : "";
  if (status === "completed") return id ? { kind: "completed", id, outputs: Array.isArray(data["outputs"]) ? data["outputs"] : [] } : { kind: "unclear", why: "a completed picture with no usable id" };
  if (TERMINAL_FAILURES.has(status)) return { kind: "failed", id, why: `the service ended the picture as ${status}${typeof data["error"] === "string" && data["error"] ? `: ${data["error"]}` : ""}` };
  if (status === "created" || status === "processing") return id ? { kind: "pending", id } : { kind: "unclear", why: "a picture in progress with no usable id" };
  return { kind: "unclear", why: "the answer's status is not one the client knows" };
}

/**
 * Makes one picture. Never throws: every outcome is a returned value.
 *
 * @param deps the guarded fetches, the key and the output hosts
 * @param req the model id, the prompt, the size (the service's own text, e.g. "320*320") and the optional seed and format
 */
export async function makeWaveSpeedPicture(deps: WaveSpeedDeps, req: PictureRequest): Promise<PictureResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const waitMs = deps.waitMs ?? PICTURE_WAIT_MS;
  const safe = (s: string): string => {
    let t = deps.apiKey ? s.split(deps.apiKey).join("[redacted]") : s;
    if (deps.redact) t = deps.redact(t);
    return t.replace(/[^\x20-\x7e]/g, " ").slice(0, 200);
  };
  const say = (line: string) => { try { deps.log?.(safe(`pictures: ${line}`)); } catch { /* a logger must not stop a picture */ } };
  const failed = (reason: string, cause: PictureFailureCause, predictionId?: string): PictureResult => ({ outcome: "Failed", reason: safe(reason), cause, ...(predictionId ? { predictionId } : {}) });
  const unknown = (reason: string, cause: PictureFailureCause, predictionId?: string): PictureResult => ({ outcome: "Unknown", reason: safe(reason), cause, ...(predictionId ? { predictionId } : {}) });

  const problem = requestProblem(req);
  if (problem) return failed(`${problem}; nothing was sent`, "bad-request");

  const started = now();
  const deadline = started + waitMs;
  /** One call through the API fetch, tried up to `tries` times (a network error, 429 or 5xx). A refused call is never repeated. */
  const call = async (url: string, init: RequestInit, tries: number): Promise<Response> => {
    for (let n = 1; ; n++) {
      try {
        const res = await deps.api(url, init);
        if (!(res.status === 429 || res.status >= 500) || n >= tries) return res;
        void res.body?.cancel().catch(() => undefined);
      } catch (e) {
        if (e instanceof EgressRefused || n >= tries) throw e;
      }
      await sleep(Math.max(0, Math.min(500 * n, deadline - now())));
    }
  };
  const auth = { authorization: `Bearer ${deps.apiKey}`, accept: "application/json" };

  // submit: ONE POST, never repeated
  let reading: Reading;
  try {
    const res = await call(`${deps.apiBase}/api/v3/${req.modelId.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        prompt: req.prompt, size: req.size,
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
        ...(req.outputFormat !== undefined ? { output_format: req.outputFormat } : {}),
        enable_sync_mode: true,
      }),
      signal: AbortSignal.timeout(waitMs),
    }, SUBMIT_TRIES);
    say(`submit answered HTTP ${res.status}`);
    if (res.status >= 400 && res.status < 500) {
      void res.body?.cancel().catch(() => undefined);
      const cause: PictureFailureCause = res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate" : "refused";
      return { outcome: "Failed", reason: safe(`the service refused the request (HTTP ${res.status})`), cause, submitRefused: true };
    }
    if (res.status < 200 || res.status >= 300) {
      void res.body?.cancel().catch(() => undefined);
      return unknown(`the service answered HTTP ${res.status} to the request, so a picture may have been made and billed`, "service");
    }
    reading = read(await res.json().catch(() => null));
    if (reading.kind === "unclear") return unknown(`${reading.why}, so a picture may have been made and billed`, "service");
    // QA L1: a 200 whose envelope carries a 4xx code and no data accepted nothing (not billed). Its code says why:
    // 401/403 the key (auth), 429 busy (rate), any other this request (refused).
    if (reading.kind === "failed" && reading.id === null && reading.code !== undefined) {
      const c = reading.code;
      return { outcome: "Failed", reason: safe(reading.why), cause: c === 401 || c === 403 ? "auth" : c === 429 ? "rate" : "refused", submitRefused: true };
    }
  } catch (e) {
    if (e instanceof EgressRefused) return failed("the request was refused before it was sent", "not-sent");
    if (neverConnected(e)) return failed("the request never reached the service (no connection was made); nothing was billed", "not-sent");
    say("submit got no answer");
    return unknown("the request got no answer, so a picture may have been made and billed", "service");
  }

  // wait: poll the result (the only repeated call)
  let delay = POLL_FIRST_MS;
  while (reading.kind === "pending") {
    const id = reading.id;
    if (now() >= deadline) return unknown("the wait ran out before the picture was ready; it may still be made and billed", "service", id);
    await sleep(Math.min(delay, Math.max(0, deadline - now())));
    delay = Math.min(Math.round(delay * 1.5), POLL_MAX_MS);
    try {
      const res = await call(`${deps.apiBase}/api/v3/predictions/${encodeURIComponent(id)}/result`, {
        method: "GET", headers: auth, signal: AbortSignal.timeout(Math.max(1_000, Math.min(CALL_MS, deadline - now()))),
      }, POLL_TRIES);
      say(`poll answered HTTP ${res.status}`);
      if (res.status === 429 || res.status >= 500) { void res.body?.cancel().catch(() => undefined); continue; }
      if (res.status !== 200) { void res.body?.cancel().catch(() => undefined); return unknown(`the result could not be read (HTTP ${res.status})`, "service", id); }
      const r = read(await res.json().catch(() => null));
      if (r.kind === "unclear") continue;
      reading = r;
    } catch (e) {
      if (e instanceof EgressRefused) return unknown("the result request was refused before it was sent", "service", id);
      say("poll got no answer");
    }
  }
  if (reading.kind === "failed") return failed(reading.why, reading.id === null ? "refused" : "ended", reading.id ?? undefined);
  if (reading.kind !== "completed") return unknown("the answer could not be read, so a picture may have been made and billed", "service");

  // fetch the picture: the first output, from a listed host only
  const { id } = reading;
  const first = reading.outputs.find((o): o is string => typeof o === "string" && o.length > 0);
  if (!first) return failed("the picture was completed but names no output", "output", id);
  let u: URL;
  try { u = new URL(first); } catch { return failed("the output address is not an address", "output", id); }
  const allowed = new Set(deps.outputHosts.map(hostKey));
  if (u.protocol !== "https:" || u.username || u.password) return failed("the output address is not a plain https address", "output", id);
  if (!allowed.has(hostKey(u.host))) return failed(`the output is on a host (${u.hostname.slice(0, 80)}) that is not listed; it was not fetched`, "output", id);
  try {
    const res = await deps.output(u.href, { method: "GET", headers: { accept: "image/png,image/jpeg,image/webp" }, signal: AbortSignal.timeout(CALL_MS) });
    if (res.status !== 200) { void res.body?.cancel().catch(() => undefined); return failed(`the picture could not be fetched (HTTP ${res.status})`, "output", id); }
    const contentType = (res.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
    if (!(PICTURE_TYPES as readonly string[]).includes(contentType)) { void res.body?.cancel().catch(() => undefined); return failed("the picture is not png, jpeg or webp", "output", id); }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > PICTURE_BYTES_MAX) { void res.body?.cancel().catch(() => undefined); return failed(`the picture is larger than ${PICTURE_BYTES_MAX} bytes`, "output", id); }
    const reader = res.body?.getReader();
    if (!reader) return failed("the picture came with no body", "output", id);
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > PICTURE_BYTES_MAX) { await reader.cancel().catch(() => undefined); return failed(`the picture is larger than ${PICTURE_BYTES_MAX} bytes`, "output", id); }
      chunks.push(value);
    }
    if (total === 0) return failed("the picture came empty", "output", id);
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
    say(`picture fetched (${total} bytes)`);
    return { outcome: "Made", bytes, contentType: contentType as PictureType, predictionId: id };
  } catch (e) {
    return failed(e instanceof EgressRefused ? "the output address was refused before it was fetched" : "the picture could not be fetched", "output", id);
  }
}
