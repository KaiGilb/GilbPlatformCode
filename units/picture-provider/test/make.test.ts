// The one make-picture flow (src/make.ts): the order config → gate → attempt → call → store → ONE finish, and what is
// written or called when a step fails. MOCK: a fake service behind the REAL egress, a fake host that records each call.
import { describe, expect, test } from "vitest";
import { makePicture, type PictureHost } from "../src/make.js";
import { redactSecrets } from "../src/redact.js";
import { BASE, completed, image, KEY, OUT_HOST, PNG, service } from "./rig.js";

const MODEL = "wavespeed-ai/flux-schnell";
const ENV = {
  WAVESPEED_API_BASE: BASE, WAVESPEED_API_KEY: KEY, PICTURE_OUTPUT_HOSTS: OUT_HOST,
  PICTURE_PRICES: JSON.stringify({ [MODEL]: { amount: "0.003", currency: "USD" } }),
};
const ASK = { modelId: MODEL, prompt: "a cream lamp", size: "320*320", outputFormat: "png" as const };

function host(over: Partial<PictureHost> = {}) {
  const steps: string[] = [];
  const h: PictureHost = {
    reserve: async () => { steps.push("reserve"); return { ok: true }; },
    writeAttempt: async (o) => { steps.push(`attempt:${o.prompt}:${o.price.amount}`); return "https://v.example.test/e/a1"; },
    store: async (o) => { steps.push(`store:${o.contentType}:${o.bytes.length}`); return { file: "https://v.example.test/e/f1" }; },
    finish: async (o) => { steps.push(`finish:${o.outcome}:${o.file ?? "-"}:${o.notBilled}`); },
    ...over,
  };
  return { h, steps };
}
const run = (svc: ReturnType<typeof service>, h: PictureHost, env: Record<string, string> = ENV) =>
  makePicture({ host: h, env, fetch: svc.inner, sleep: async () => {}, clock: () => 0 }, ASK);

describe("the order", () => {
  test("Made: gate, attempt BEFORE the call, one POST asking for png at 320*320, store, ONE finish with the file", async () => {
    const svc = service({});
    const { h, steps } = host();
    const r = await run(svc, h);
    expect(r).toMatchObject({ attempt: "https://v.example.test/e/a1", outcome: "Made", file: "https://v.example.test/e/f1", patched: true });
    expect(steps).toEqual(["reserve", "attempt:a cream lamp:0.003", `store:image/png:${PNG.length}`, "finish:Made:https://v.example.test/e/f1:false"]);
    const posts = svc.seen.filter((s) => s.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]!.body!)).toEqual({ prompt: "a cream lamp", size: "320*320", output_format: "png", enable_sync_mode: true });
  });
});

describe("nothing written, nothing called", () => {
  test("Off: no key → no gate, no attempt, no call; the reason names the setting, never a key", async () => {
    const svc = service({});
    const { h, steps } = host();
    const r = await run(svc, h, { ...ENV, WAVESPEED_API_KEY: "" });
    expect(r).toEqual({ failure: "Off", reason: "WAVESPEED_API_KEY is not set: pictures are off" });
    expect(steps).toEqual([]);
    expect(svc.seen).toHaveLength(0);
  });
  test("a base off the pinned host → Off, no call", async () => {
    const svc = service({});
    const { h, steps } = host();
    expect(await run(svc, h, { ...ENV, WAVESPEED_API_BASE: "https://wavespeed.example.net" })).toMatchObject({ failure: "Off" });
    expect(steps).toEqual([]);
  });
  test("no price for the model → Off, no call", async () => {
    const svc = service({});
    const { h, steps } = host();
    const r = await run(svc, h, { ...ENV, PICTURE_PRICES: "{}" });
    expect(r).toMatchObject({ failure: "Off" });
    expect(steps).toEqual([]);
    expect(svc.seen).toHaveLength(0);
  });
  test("the gate refuses (a spend ceiling) → no attempt, no call", async () => {
    const svc = service({});
    const { h, steps } = host({ reserve: async () => ({ ok: false, failure: "CapReached", reason: "the day's ceiling is reached" }) });
    expect(await run(svc, h)).toEqual({ failure: "CapReached", reason: "the day's ceiling is reached" });
    expect(steps).toEqual([]);
    expect(svc.seen).toHaveLength(0);
  });
  test("the attempt cannot be written → no call", async () => {
    const svc = service({});
    const { h } = host({ writeAttempt: async () => { throw new Error(`vault down; Authorization: Bearer ${KEY}`); } });
    const r = await run(svc, h);
    expect(r).toMatchObject({ failure: "AttemptNotWritten" });
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(svc.seen).toHaveLength(0);
  });
});

describe("after the call", () => {
  test("the host refuses the bytes (a check failed) → Not stored, with the host's reason, ONE finish", async () => {
    const svc = service({});
    const { h, steps } = host({ store: async () => ({ notStored: "a corner is not clear" }) });
    const r = await run(svc, h);
    expect(r).toMatchObject({ outcome: "Not stored", reason: "a corner is not clear", patched: true });
    expect(steps.at(-1)).toBe("finish:Not stored:-:false");
  });
  test("the submit is refused with a 4xx → Failed and notBilled true", async () => {
    const svc = service({ submit: () => new Response("{}", { status: 401 }) });
    const { h, steps } = host();
    expect(await run(svc, h)).toMatchObject({ outcome: "Failed", patched: true });
    expect(steps.at(-1)).toBe("finish:Failed:-:true");
  });
  test("a 5xx on the submit → Unknown (may be billed), notBilled false, never a second POST", async () => {
    const svc = service({ submit: () => new Response("{}", { status: 503 }) });
    const { h, steps } = host();
    expect(await run(svc, h)).toMatchObject({ outcome: "Unknown" });
    expect(steps.at(-1)).toBe("finish:Unknown:-:false");
    expect(svc.seen.filter((s) => s.method === "POST")).toHaveLength(1);
  });
  test("the finish fails → patched false, the reason redacted", async () => {
    const svc = service({ submit: () => completed("p2"), output: () => image() });
    const { h } = host({ finish: async () => { throw new Error(`token=${KEY}`); } });
    const r = await run(svc, h);
    expect(r).toMatchObject({ outcome: "Made", patched: false });
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
});

describe("the redactor", () => {
  test("removes the known key, Bearer values and key-shaped strings", () => {
    expect(redactSecrets(`x ${KEY} y`, [KEY])).toBe("x [redacted] y");
    expect(redactSecrets("Authorization: Bearer abcdefgh12345678")).toBe("Authorization: [redacted]");
    expect(redactSecrets("api_key=sk_live_0123456789abcdef")).toBe("api_key=[redacted]");
  });
});
