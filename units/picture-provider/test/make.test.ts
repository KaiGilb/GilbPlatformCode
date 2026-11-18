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

describe("the cause of a failure, and what is billed (QA F10)", () => {
  const causeOf = async (svc: ReturnType<typeof service>, extra: Partial<Parameters<typeof makePicture>[0]> = {}) => {
    const { h, steps } = host();
    const r = await makePicture({ host: h, env: ENV, fetch: svc.inner, sleep: async () => {}, clock: () => 0, ...extra }, ASK);
    return { r, steps };
  };
  test.each([[401, "auth"], [403, "auth"], [429, "rate"], [400, "refused"]] as const)("a %i on the submit is cause %s and not billed", async (status, cause) => {
    const { r, steps } = await causeOf(service({ submit: () => new Response("{}", { status }) }));
    expect(r).toMatchObject({ outcome: "Failed", cause });
    expect(steps.at(-1)).toBe("finish:Failed:-:true");
  });
  test("a 5xx is cause service and may be billed", async () => {
    const { r, steps } = await causeOf(service({ submit: () => new Response("{}", { status: 502 }) }));
    expect(r).toMatchObject({ outcome: "Unknown", cause: "service" });
    expect(steps.at(-1)).toBe("finish:Unknown:-:false");
  });
  test("a name that does not resolve (the runtime's ENOTFOUND) is cause not-sent and not billed", async () => {
    const dead = (async () => { throw new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }) }); }) as unknown as typeof fetch;
    const { h, steps } = host();
    const r = await makePicture({ host: h, env: ENV, fetch: dead, sleep: async () => {}, clock: () => 0 }, ASK);
    expect(r).toMatchObject({ outcome: "Failed", cause: "not-sent" });
    expect(steps.at(-1)).toBe("finish:Failed:-:true");
  });
  test("the host's DNS check refusing the API host is cause not-sent and not billed", async () => {
    const svc = service({});
    const { r, steps } = await causeOf(svc, { hostCheck: async () => "could not be resolved" });
    expect(r).toMatchObject({ outcome: "Failed", cause: "not-sent" });
    expect(steps.at(-1)).toBe("finish:Failed:-:true");
    expect(svc.seen).toHaveLength(0);
  });
  test("the service ends the picture as failed: cause ended (this request's own)", async () => {
    const { r } = await causeOf(service({ submit: () => new Response(JSON.stringify({ code: 200, data: { id: "p9", status: "failed", error: "nsfw" } }), { status: 200 }) }));
    expect(r).toMatchObject({ outcome: "Failed", cause: "ended" });
  });
  test("the output host answers 503: cause output", async () => {
    const { r } = await causeOf(service({ output: () => new Response("", { status: 503 }) }));
    expect(r).toMatchObject({ outcome: "Failed", cause: "output" });
  });
});

describe("QA L1 — a 200 whose envelope carries the refusal", () => {
  test.each([[401, "auth"], [403, "auth"], [429, "rate"], [400, "refused"]] as const)("envelope code %i, no data: cause %s, not billed", async (code, cause) => {
    const svc = service({ submit: () => new Response(JSON.stringify({ code, message: "no" }), { status: 200 }) });
    const { h, steps } = host();
    const r = await makePicture({ host: h, env: ENV, fetch: svc.inner, sleep: async () => {}, clock: () => 0 }, ASK);
    expect(r).toMatchObject({ outcome: "Failed", cause });
    expect(steps.at(-1)).toBe("finish:Failed:-:true");
  });
});

describe("the redactor removes fragments and encodings of the key (Agent.Hacker L2)", () => {
  test("a 27-character slice, an 8-character slice, base64, base64url and URL-encoded forms are removed; 7 characters are not", () => {
    const k = KEY;
    expect(redactSecrets(`echo ${k.slice(3, 30)} end`, [k])).toBe("echo [redacted] end");
    expect(redactSecrets(`echo ${k.slice(10, 18)} end`, [k])).toBe("echo [redacted] end");
    expect(redactSecrets(`echo ${k.slice(10, 17)} end`, [k])).toBe(`echo ${k.slice(10, 17)} end`);
    expect(redactSecrets(`b64 ${btoa(k)}`, [k])).toBe("b64 [redacted]");
    expect(redactSecrets(`url ${encodeURIComponent(k).toUpperCase()}`, [k])).toBe("url [redacted]");
    expect(redactSecrets("an ordinary sentence about a lamp", [k])).toBe("an ordinary sentence about a lamp");
  });
});

describe("the redactor: hex and split forms of the key (QA R5 lead)", () => {
  test("hex, spaced and line-split forms are removed", () => {
    const hex = [...new TextEncoder().encode(KEY)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(redactSecrets(`hex ${hex}`, [KEY])).toBe("hex [redacted]");
    expect(redactSecrets(`spaced ${KEY.slice(0, 16).split("").join(" ")} end`, [KEY])).toBe("spaced [redacted] end");
    expect(redactSecrets(`split ${KEY.slice(0, 12)}\n${KEY.slice(12, 24)} end`, [KEY])).toBe("split [redacted] end");
    expect(redactSecrets("a cream lamp on a small round base", [KEY])).toBe("a cream lamp on a small round base");
  });
});
