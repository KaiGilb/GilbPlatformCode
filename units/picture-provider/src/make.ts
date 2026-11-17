// One picture, in this order. The algorithm is here once; the host app supplies where records go and how bytes are kept.
//   (a) the config check: base, key, output host, a listed price for the model, and a request the client can send.
//       Not met → Off; nothing is written, nothing is called.
//   (b) the host's gate (`reserve`): a count, a spend ceiling. Refused → nothing is written, nothing is called.
//   (c) the host writes the attempt record BEFORE the call, with the model, the prompt and the listed price.
//       It cannot be written → no call.
//   (d) the call (wavespeed.ts; the submit is never repeated).
//   (e) on Made, the host keeps the bytes (`store`). It may refuse them (a check failed, the upload failed): the outcome
//       is then "Not stored" and the host's reason.
//   (f) ONE finishing write of the attempt (`finish`): its outcome and, when stored, the file. When the submit itself
//       was refused with a 4xx, `notBilled` is true (nothing was billed).
// Every step's failure is a returned value, never a throw past makePicture and never silent.
import { pictureConfig, type PictureEnv, type PicturePrice } from "./config.js";
import { pictureEgress, type EgressLog, type ExtraGuard } from "./egress.js";
import { makeWaveSpeedPicture, requestProblem, type PictureRequest } from "./wavespeed.js";
import type { PictureType } from "./bytes.js";

/** The four outcomes an attempt ends with. "Not stored": the picture was made but the host did not keep it. */
export type PictureOutcome = "Made" | "Failed" | "Unknown" | "Not stored";

/** What the host app supplies. Each method may throw; makePicture turns a throw into a returned failure. */
export interface PictureHost {
  /** The gate before anything is written. `ok: false` stops the picture with the host's reason. */
  reserve(ask: { modelId: string; price: PicturePrice }): Promise<{ ok: true } | { ok: false; failure: "CapReached" | "CountUnavailable"; reason: string }>;
  /** Writes the attempt BEFORE the call; returns its address. */
  writeAttempt(o: { modelId: string; prompt: string; price: PicturePrice }): Promise<string>;
  /** Keeps a made picture; returns the stored file's address, or why it was not kept. */
  store(o: { attempt: string; bytes: Uint8Array; contentType: PictureType }): Promise<{ file: string } | { notStored: string }>;
  /** The ONE finishing write of the attempt. */
  finish(o: { attempt: string; outcome: PictureOutcome; file?: string; notBilled: boolean; price: PicturePrice }): Promise<void>;
}

export interface MakePictureDeps {
  host: PictureHost;
  /** The configuration (WAVESPEED_API_BASE, WAVESPEED_API_KEY, PICTURE_OUTPUT_HOSTS, PICTURE_PRICES). */
  env: PictureEnv;
  /** The runtime fetch. makePicture holds it to the picture egress itself. */
  fetch: typeof fetch;
  /** The host app's own extra egress rule (a deny list, a public-address rule). */
  extraGuard?: ExtraGuard;
  egressLog?: EgressLog;
  redact?: (s: string) => string;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  waitMs?: number;
}

export type MakePictureFailure = "Off" | "BadInput" | "CapReached" | "CountUnavailable" | "AttemptNotWritten";

export type MakePictureResult =
  /** Nothing was called. For AttemptNotWritten the host's gate was passed (a count may be spent). */
  | { failure: MakePictureFailure; reason: string }
  | {
    attempt: string;
    outcome: PictureOutcome;
    file?: string;
    reason?: string;
    predictionId?: string;
    /** False when the finishing write failed: the attempt then has no outcome (read as "cannot tell"). */
    patched: boolean;
    patchError?: string;
  };

const whyOf = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/**
 * Makes one picture and records it through the host. Never throws.
 *
 * @param deps the host, the configuration and the fetch
 * @param ask the model, the prompt, the size, and the optional seed and output format
 */
export async function makePicture(deps: MakePictureDeps, ask: PictureRequest): Promise<MakePictureResult> {
  const cfg = pictureConfig(deps.env, ask.modelId);
  const keyless = (s: string) => {
    let t = cfg.on && cfg.apiKey ? s.split(cfg.apiKey).join("[redacted]") : s;
    if (deps.redact) t = deps.redact(t);
    return t;
  };
  const say = (line: string) => { try { deps.log?.(keyless(`pictures: ${line}`)); } catch { /* a logger must not stop a picture */ } };

  // (a)
  if (!cfg.on) { say(cfg.why); return { failure: "Off", reason: cfg.why }; }
  const bad = requestProblem(ask);
  if (bad) return { failure: "BadInput", reason: bad };

  // (b)
  try {
    const gate = await deps.host.reserve({ modelId: ask.modelId, price: cfg.price });
    if (!gate.ok) { say(gate.reason); return { failure: gate.failure, reason: keyless(gate.reason) }; }
  } catch (e) {
    const why = keyless(`the gate could not be read (${whyOf(e)}), so no picture was made`);
    say(why);
    return { failure: "CountUnavailable", reason: why };
  }

  // (c)
  let attempt = "";
  try {
    attempt = await deps.host.writeAttempt({ modelId: ask.modelId, prompt: ask.prompt, price: cfg.price });
  } catch (e) {
    const why = keyless(`the attempt could not be written (${whyOf(e)}), so no picture was made`);
    say(why);
    return { failure: "AttemptNotWritten", reason: why };
  }
  if (!attempt) return { failure: "AttemptNotWritten", reason: "the host named no address for the attempt, so no picture was made" };

  // (d)
  const eg = pictureEgress(cfg.apiBase, cfg.outputHosts, deps.fetch, {
    ...(deps.egressLog ? { log: deps.egressLog } : {}), ...(deps.extraGuard ? { extraGuard: deps.extraGuard } : {}),
  });
  let made: Awaited<ReturnType<typeof makeWaveSpeedPicture>>;
  try {
    made = await makeWaveSpeedPicture({
      apiBase: cfg.apiBase, apiKey: cfg.apiKey, api: eg.api, output: eg.output, outputHosts: cfg.outputHosts,
      ...(deps.sleep ? { sleep: deps.sleep } : {}), ...(deps.clock ? { now: deps.clock } : {}),
      ...(deps.waitMs !== undefined ? { waitMs: deps.waitMs } : {}),
      ...(deps.redact ? { redact: deps.redact } : {}), ...(deps.log ? { log: deps.log } : {}),
    }, ask);
  } catch {
    made = { outcome: "Unknown", reason: "the picture client stopped unexpectedly, so a picture may have been made and billed" };
  }

  // (e)
  let outcome: PictureOutcome = made.outcome;
  let reason = made.outcome === "Made" ? undefined : made.reason;
  let file: string | undefined;
  if (made.outcome === "Made") {
    try {
      const kept = await deps.host.store({ attempt, bytes: made.bytes, contentType: made.contentType });
      if ("file" in kept) file = kept.file;
      else { outcome = "Not stored"; reason = keyless(kept.notStored); }
    } catch (e) {
      outcome = "Not stored";
      reason = keyless(`the picture was made but could not be stored (${whyOf(e)})`);
    }
    if (reason) say(reason);
  }
  const notBilled = made.outcome === "Failed" && made.submitRefused === true;
  const predictionId = made.predictionId;

  // (f)
  const out = { attempt, outcome, ...(file ? { file } : {}), ...(reason ? { reason } : {}), ...(predictionId ? { predictionId } : {}) };
  try {
    await deps.host.finish({ attempt, outcome, ...(file ? { file } : {}), notBilled, price: cfg.price });
    return { ...out, patched: true };
  } catch (e) {
    const patchError = keyless(`the attempt's outcome could not be written (${whyOf(e)})`);
    say(patchError);
    return { ...out, patched: false, patchError };
  }
}

/** Did an Unknown outcome come from the wait running out? Any other Unknown is an error answer or an unreadable one. */
export const timedOut = (reason: string | undefined): boolean => /^the wait ran out/.test(reason ?? "");
