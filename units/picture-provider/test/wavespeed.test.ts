// Lifted from Social p114-wavespeed.test.ts. The WaveSpeed client (src/wavespeed.ts) and the picture egress (src/egress.ts). MOCK: a fake service behind the REAL egress; a clock the test drives.
// The API shapes are WaveSpeed's docs as Kai-Zen read them 2026-10-25, UNVERIFIED as facts: these tests prove the client against the fake, not against the service.
import { describe, expect, test } from "vitest";
import { PICTURE_BYTES_MAX } from "../src/bytes.js";
import { PICTURE_PROMPT_CHARS, PICTURE_WAIT_MS } from "../src/wavespeed.js";
import { redactSecrets } from "../src/redact.js";
import { EgressRefused, pictureEgress } from "../src/egress.js";
import { makeWaveSpeedPicture } from "../src/wavespeed.js";
import { BASE, completed, image, KEY, MODEL, OUT_HOST, PNG, processing, service, withStatus, wsDeps } from "./rig.js";

const REQ = { modelId: MODEL, prompt: "a lighthouse at dusk", size: "1024*1024" };
const posts = (svc: ReturnType<typeof service>) => svc.seen.filter((s) => s.method === "POST");
const gets = (svc: ReturnType<typeof service>) => svc.seen.filter((s) => s.method === "GET" && s.url.includes("/predictions/"));

describe("a picture made at once (sync completed)", () => {
  test("Made: the bytes, the type and the prediction id; ONE POST with the key as Bearer and the documented body; the output is fetched with NO credential", async () => {
    const svc = service({});
    const { deps } = wsDeps(svc);
    const r = await makeWaveSpeedPicture(deps, REQ);
    expect(r).toEqual({ outcome: "Made", bytes: PNG, contentType: "image/png", predictionId: "p1" });
    expect(posts(svc)).toHaveLength(1);
    const p = posts(svc)[0]!;
    expect(p.url).toBe(`${BASE}/api/v3/wavespeed-ai/flux-dev`);
    expect(p.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(p.body!)).toEqual({ prompt: REQ.prompt, size: REQ.size, enable_sync_mode: true });
    const out = svc.seen.find((s) => s.url.startsWith(`https://${OUT_HOST}`))!;
    expect(out.method).toBe("GET");
    expect(JSON.stringify(out.headers)).not.toContain(KEY);
    expect(out.headers.authorization).toBeUndefined();
  });

  test("jpeg and webp are taken too; a content type with parameters is read as its type", async () => {
    for (const [type, want] of [["image/jpeg", "image/jpeg"], ["image/webp", "image/webp"], ["IMAGE/PNG; charset=binary", "image/png"]] as const) {
      const svc = service({ output: () => image(PNG, type) });
      const r = await makeWaveSpeedPicture(wsDeps(svc).deps, REQ);
      expect(r).toMatchObject({ outcome: "Made", contentType: want });
    }
  });
});

describe("a sync wait that ran out (200, processing, 5004) is not a failure", () => {
  test("polls GET /predictions/{id}/result from 2 s, growing, until completed", async () => {
    const svc = service({ submit: () => processing("p7"), poll: (n) => (n < 3 ? withStatus("processing", "p7") : completed("p7")), output: () => image() });
    const { deps, clock } = wsDeps(svc);
    const r = await makeWaveSpeedPicture(deps, REQ);
    expect(r).toMatchObject({ outcome: "Made", predictionId: "p7" });
    expect(posts(svc)).toHaveLength(1);
    expect(gets(svc)).toHaveLength(3);
    expect(gets(svc)[0]!.url).toBe(`${BASE}/api/v3/predictions/p7/result`);
    expect(gets(svc)[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(clock.c.sleeps).toEqual([1500, 2250, 3375]); // p153 S8: 1.5 s first (was 2 s)
  });

  test("created is waited for like processing", async () => {
    const svc = service({ submit: () => withStatus("created", "p8"), poll: () => completed("p8") });
    expect(await makeWaveSpeedPicture(wsDeps(svc).deps, REQ)).toMatchObject({ outcome: "Made", predictionId: "p8" });
  });
});

describe("Failed: the service said no", () => {
  test.each(["failed", "cancelled", "timeout", "deleted"])("terminal status %s on the first answer", async (status) => {
    const svc = service({ submit: () => withStatus(status, "p2", "the prompt was refused") });
    const r = await makeWaveSpeedPicture(wsDeps(svc).deps, REQ);
    expect(r).toMatchObject({ outcome: "Failed", predictionId: "p2" });
    expect((r as { reason: string }).reason).toContain(status);
    expect(svc.counts.output).toBe(0);
  });

  test.each(["failed", "cancelled", "timeout", "deleted"])("terminal status %s found while polling", async (status) => {
    const svc = service({ submit: () => processing("p3"), poll: () => withStatus(status, "p3") });
    const r = await makeWaveSpeedPicture(wsDeps(svc).deps, REQ);
    expect(r).toMatchObject({ outcome: "Failed", predictionId: "p3" });
    expect(posts(svc)).toHaveLength(1);
  });

  test.each([[400], [401], [402], [403], [404], [422], [429]])("HTTP %i on the POST is Failed, the POST is not repeated", async (status) => {
    const svc = service({ submit: () => new Response("{}", { status }) });
    const r = await makeWaveSpeedPicture(wsDeps(svc).deps, REQ);
    expect(r.outcome).toBe("Failed");
    expect(r).toHaveProperty("submitRefused", true);
    expect(posts(svc)).toHaveLength(1);
  });

  test.each([["failed"], ["cancelled"], ["timeout"], ["deleted"]])("a terminal %s AFTER an accepted submit is Failed but NOT submitRefused (we cannot tell it was not billed)", async (status) => {
    const r = await makeWaveSpeedPicture(wsDeps(service({ submit: () => withStatus(status, "p1", "no") })).deps, REQ);
    expect(r.outcome).toBe("Failed");
    expect(r).not.toHaveProperty("submitRefused");
  });

  test("a completed answer with no output is Failed", async () => {
    const svc = service({ submit: () => completed("p1", []) });
    expect(await makeWaveSpeedPicture(wsDeps(svc).deps, REQ)).toMatchObject({ outcome: "Failed" });
  });

  test("a request the client cannot send (model id, prompt, size) sends nothing", async () => {
    for (const bad of [{ ...REQ, modelId: "../x" }, { ...REQ, modelId: "a b" }, { ...REQ, prompt: "  " }, { ...REQ, prompt: "x".repeat(PICTURE_PROMPT_CHARS + 1) }, { ...REQ, size: "big picture please" }]) {
      const svc = service({});
      expect((await makeWaveSpeedPicture(wsDeps(svc).deps, bad)).outcome).toBe("Failed");
      expect(svc.seen).toHaveLength(0);
    }
  });
});

describe("Unknown: we cannot tell whether a picture was made, and the POST is NEVER repeated", () => {
  test("the POST's answer is lost (a network error): Unknown, exactly ONE POST, no poll, no output fetch", async () => {
    const svc = service({ submit: () => { throw new TypeError("network"); } });
    const { deps, clock } = wsDeps(svc);
    const r = await makeWaveSpeedPicture(deps, REQ);
    expect(r.outcome).toBe("Unknown");
    expect(posts(svc)).toHaveLength(1);
    expect(svc.counts.submit).toBe(1);
    expect(gets(svc)).toHaveLength(0);
    expect(clock.c.sleeps).toEqual([]);
  });

  test.each([[500], [502], [503], [504]])("HTTP %i on the POST is Unknown (it may have been made and billed), exactly one POST", async (status) => {
    const svc = service({ submit: () => new Response("", { status }) });
    const r = await makeWaveSpeedPicture(wsDeps(svc).deps, REQ);
    expect(r.outcome).toBe("Unknown");
    expect(posts(svc)).toHaveLength(1);
  });

  test("an answer that is not JSON, or has no usable shape, is Unknown, one POST", async () => {
    for (const body of ["<html>", "{}", JSON.stringify({ code: 200, data: { status: "wat", id: "x" } }), JSON.stringify({ code: 200, data: { status: "processing" } })]) {
      const svc = service({ submit: () => new Response(body, { status: 200 }) });
      expect((await makeWaveSpeedPicture(wsDeps(svc).deps, REQ)).outcome).toBe("Unknown");
      expect(posts(svc)).toHaveLength(1);
    }
  });

  test("a redirect answer to the POST is Unknown, and is not followed", async () => {
    const svc = service({ submit: () => new Response("", { status: 302, headers: { location: "https://evil.example.com/" } }) });
    const r = await makeWaveSpeedPicture(wsDeps(svc).deps, REQ);
    expect(r.outcome).toBe("Unknown");
    expect(svc.seen.filter((s) => s.url.includes("evil"))).toHaveLength(0);
    expect(posts(svc)).toHaveLength(1);
  });

  test("the wait runs out: Unknown with the prediction id, after PICTURE_WAIT_MS (120 s), still ONE POST", async () => {
    const svc = service({ submit: () => processing("p9"), poll: () => withStatus("processing", "p9") });
    const { deps, clock } = wsDeps(svc);
    const r = await makeWaveSpeedPicture(deps, REQ);
    expect(r).toMatchObject({ outcome: "Unknown", predictionId: "p9" });
    expect(PICTURE_WAIT_MS).toBe(120_000);
    expect(clock.c.t).toBeGreaterThanOrEqual(PICTURE_WAIT_MS);
    expect(clock.c.t).toBeLessThanOrEqual(PICTURE_WAIT_MS + 10_000);
    expect(clock.c.sleeps[0]).toBe(1500);
    expect(Math.max(...clock.c.sleeps)).toBeLessThanOrEqual(10_000);
    expect(posts(svc)).toHaveLength(1);
    expect(svc.counts.output).toBe(0);
  });

  test("a poll that cannot be read (404, 403) is Unknown with the id", async () => {
    for (const status of [404, 403, 401]) {
      const svc = service({ submit: () => processing("p5"), poll: () => new Response("{}", { status }) });
      expect(await makeWaveSpeedPicture(wsDeps(svc).deps, REQ)).toMatchObject({ outcome: "Unknown", predictionId: "p5" });
    }
  });
});

describe("only the poll GET is retried", () => {
  test("a poll that throws, then answers 503, then completes, is Made (3 GETs, 1 POST)", async () => {
    const svc = service({ submit: () => processing("p4"), poll: (n) => { if (n === 1) throw new TypeError("network"); if (n === 2) return new Response("", { status: 503 }); return completed("p4"); } });
    const r = await makeWaveSpeedPicture(wsDeps(svc).deps, REQ);
    expect(r).toMatchObject({ outcome: "Made", predictionId: "p4" });
    expect(gets(svc)).toHaveLength(3);
    expect(posts(svc)).toHaveLength(1);
  });

  test("polls that keep failing are asked again at the next turn and end Unknown at the bound", async () => {
    const svc = service({ submit: () => processing("p6"), poll: () => { throw new TypeError("network"); } });
    const { deps, clock } = wsDeps(svc);
    const r = await makeWaveSpeedPicture(deps, REQ);
    expect(r).toMatchObject({ outcome: "Unknown", predictionId: "p6" });
    expect(gets(svc).length).toBeGreaterThan(3);
    expect(posts(svc)).toHaveLength(1);
    expect(clock.c.t).toBeGreaterThanOrEqual(PICTURE_WAIT_MS);
  });
});

describe("the picture's own address is held to PICTURE_OUTPUT_HOSTS", () => {
  test("an output on a host that is not listed: Failed, and NO fetch of it", async () => {
    const svc = service({ submit: () => completed("p1", ["https://evil.example.com/p1.png"]) });
    const { deps, egressLog } = wsDeps(svc);
    const r = await makeWaveSpeedPicture(deps, REQ);
    expect(r).toMatchObject({ outcome: "Failed", predictionId: "p1" });
    expect(svc.seen.filter((s) => s.url.includes("evil.example.com"))).toHaveLength(0);
    expect(svc.counts.output).toBe(0);
    expect(egressLog.allowed.filter((h) => h.includes("evil"))).toEqual([]);
  });

  test("not https, not an address, or with a user name: Failed, no fetch", async () => {
    for (const out of [`http://${OUT_HOST}/p1.png`, "not an address", `https://u:p@${OUT_HOST}/p1.png`, "data:image/png;base64,AAAA"]) {
      const svc = service({ submit: () => completed("p1", [out]) });
      expect((await makeWaveSpeedPicture(wsDeps(svc).deps, REQ)).outcome).toBe("Failed");
      expect(svc.counts.output).toBe(0);
    }
  });

  test("an empty PICTURE_OUTPUT_HOSTS fetches nothing", async () => {
    const svc = service({});
    const k = wsDeps(svc, { outputHosts: [] });
    expect((await makeWaveSpeedPicture(k.deps, REQ)).outcome).toBe("Failed");
    expect(svc.counts.output).toBe(0);
  });

  test("an output that redirects to a host that is not listed is refused at the hop", async () => {
    const svc = service({ output: () => new Response("", { status: 302, headers: { location: "https://evil.example.com/x.png" } }) });
    const r = await makeWaveSpeedPicture(wsDeps(svc).deps, REQ);
    expect(r.outcome).toBe("Failed");
    expect(svc.seen.filter((s) => s.url.includes("evil.example.com"))).toHaveLength(0);
  });
});

describe("the picture's size and type", () => {
  test("a declared size over the limit: Failed (the body is not read)", async () => {
    const svc = service({ output: () => image(PNG, "image/png", { "content-length": String(PICTURE_BYTES_MAX + 1) }) });
    const r = await makeWaveSpeedPicture(wsDeps(svc).deps, REQ);
    expect(r).toMatchObject({ outcome: "Failed" });
  });

  test("a body that grows past the limit with no declared size is cut off: Failed", async () => {
    const chunk = new Uint8Array(6 * 1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({ pull(c) { if (sent++ < 3) c.enqueue(chunk); else c.close(); } });
    const svc = service({ output: () => new Response(body, { status: 200, headers: { "content-type": "image/png" } }) });
    const r = await makeWaveSpeedPicture(wsDeps(svc).deps, REQ);
    expect(r).toMatchObject({ outcome: "Failed" });
    expect(sent).toBeLessThanOrEqual(3);
  });

  test("exactly the limit is taken", async () => {
    const svc = service({ output: () => image(new Uint8Array(PICTURE_BYTES_MAX)) });
    const r = await makeWaveSpeedPicture(wsDeps(svc).deps, REQ);
    expect(r.outcome).toBe("Made");
  });

  test.each([["image/svg+xml"], ["image/gif"], ["text/html"], ["application/octet-stream"], [""]])("type %j is Failed", async (type) => {
    const svc = service({ output: () => new Response(PNG as BodyInit, { status: 200, headers: type ? { "content-type": type } : {} }) });
    expect((await makeWaveSpeedPicture(wsDeps(svc).deps, REQ)).outcome).toBe("Failed");
  });

  test("an empty body, or a non-200 fetch, is Failed", async () => {
    expect((await makeWaveSpeedPicture(wsDeps(service({ output: () => image(new Uint8Array(0)) })).deps, REQ)).outcome).toBe("Failed");
    expect((await makeWaveSpeedPicture(wsDeps(service({ output: () => new Response("", { status: 404 }) })).deps, REQ)).outcome).toBe("Failed");
    expect((await makeWaveSpeedPicture(wsDeps(service({ output: () => { throw new TypeError("network"); } })).deps, REQ)).outcome).toBe("Failed");
  });
});

describe("the key never appears in a log line, a reason or an error text", () => {
  const redact = ((s: string) => redactSecrets(s, [KEY]));
  const run = async (svc: ReturnType<typeof service>) => {
    const logs: string[] = [];
    const k = wsDeps(svc, { log: (l) => logs.push(l), redact });
    const r = await makeWaveSpeedPicture(k.deps, REQ);
    return { r, logs, egress: k.egressLog };
  };
  const clean = (x: { r: unknown; logs: string[]; egress: { allowed: string[]; refused: string[] } }) => {
    const all = JSON.stringify(x.r) + x.logs.join("\n") + JSON.stringify(x.egress);
    expect(all).not.toContain(KEY);
    expect(all).not.toContain("0123456789abcdef");
  };

  test("a service that echoes the key in its error text", async () => {
    const x = await run(service({ submit: () => withStatus("failed", "p1", `bad key ${KEY} for this account`) }));
    expect(x.r.outcome).toBe("Failed");
    clean(x);
  });
  test("a client with NO redactor still never prints the key a service echoes", async () => {
    const svc = service({ submit: () => withStatus("failed", "p1", `bad key ${KEY}`) });
    const r = await makeWaveSpeedPicture(wsDeps(svc).deps, REQ);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
  test("a fetch that throws an error whose text holds the key (POST and poll)", async () => {
    clean(await run(service({ submit: () => { throw new Error(`socket closed for Bearer ${KEY}`); } })));
    clean(await run(service({ submit: () => processing(), poll: () => { throw new Error(`boom ${KEY}`); } })));
  });
  test("every path: success, wait bound, bad status, bad output", async () => {
    clean(await run(service({})));
    clean(await run(service({ submit: () => processing(), poll: () => withStatus("processing") })));
    clean(await run(service({ submit: () => new Response(`oops ${KEY}`, { status: 500 }) })));
    clean(await run(service({ submit: () => completed("p1", [`https://evil.example.com/${KEY}.png`]) })));
  });
  test("the egress log names hosts only", async () => {
    const x = await run(service({}));
    expect(x.egress.allowed.every((h) => /^[a-z.]+$/.test(h))).toBe(true);
  });
});

describe("the picture egress: two guarded fetches", () => {
  const log = () => ({ allowed: [] as string[], refused: [] as string[] });
  const make = (hosts = [OUT_HOST]) => {
    const calls: string[] = [];
    const inner = (async (u: string) => { calls.push(String(u)); return new Response("{}"); }) as unknown as typeof fetch;
    return { calls, eg: pictureEgress(BASE, hosts, inner, { log: log() }) };
  };
  test("api reaches the base's host and path only", async () => {
    const { eg, calls } = make();
    await eg.api(`${BASE}/api/v3/x`, { method: "POST" });
    expect(calls).toEqual([`${BASE}/api/v3/x`]);
    for (const bad of ["https://evil.example.com/api/v3/x", `https://${OUT_HOST}/x.png`, "http://api.wavespeed.ai/api/v3/x", "https://api.wavespeed.ai:8443/api/v3/x", "https://u:p@api.wavespeed.ai/api/v3/x", "https://id.gilb.com/base", "https://api.anthropic.com/v1"]) {
      await expect(eg.api(bad, { method: "POST" })).rejects.toBeInstanceOf(EgressRefused);
    }
    expect(calls).toHaveLength(1);
  });
  test("a base with a path holds the API to it", async () => {
    const calls: string[] = [];
    const eg = pictureEgress("https://gateway.example.net/wavespeed", [], (async (u: string) => { calls.push(u); return new Response("{}"); }) as unknown as typeof fetch, { log: log() });
    await eg.api("https://gateway.example.net/wavespeed/api/v3/x", { method: "GET" });
    await expect(eg.api("https://gateway.example.net/other", { method: "GET" })).rejects.toBeInstanceOf(EgressRefused);
    expect(calls).toHaveLength(1);
  });
  test("output reaches the listed hosts only, GET only, never the API host (the key's place)", async () => {
    const { eg, calls } = make();
    await eg.output(`https://${OUT_HOST}/a.png`, { method: "GET" });
    expect(calls).toHaveLength(1);
    for (const [bad, method] of [["https://evil.example.com/a.png", "GET"], [`${BASE}/api/v3/x`, "GET"], [`https://${OUT_HOST}/a.png`, "POST"], [`http://${OUT_HOST}/a.png`, "GET"]] as const) {
      await expect(eg.output(bad, { method })).rejects.toBeInstanceOf(EgressRefused);
    }
    expect(calls).toHaveLength(1);
  });
  test("the public-address rule: a listed host that is a private address, a local name or a port off the web is refused", async () => {
    const { eg, calls } = make(["10.0.0.5", "localhost", "intranet", "cdn.wavespeed.ai:25"]);
    for (const bad of ["https://10.0.0.5/a.png", "https://localhost/a.png", "https://intranet/a.png", "https://cdn.wavespeed.ai:25/a.png", "https://169.254.169.254/latest"]) {
      await expect(eg.output(bad, { method: "GET" })).rejects.toBeInstanceOf(EgressRefused);
    }
    expect(calls).toHaveLength(0);
  });
  test("the host app's extra guard (here an AI-vendor deny rule) refuses a host even when listed", async () => {
    const calls: string[] = [];
    const inner = (async (u: string) => { calls.push(u); return new Response("{}"); }) as unknown as typeof fetch;
    const eg = pictureEgress(BASE, ["api.openai.com"], inner, { extraGuard: (url) => { if (url.hostname.endsWith("openai.com")) throw new Error("is an AI vendor"); } });
    await expect(eg.output("https://api.openai.com/a.png", { method: "GET" })).rejects.toBeInstanceOf(EgressRefused);
    expect(calls).toHaveLength(0);
  });
});

describe("p153 S8: the poll cadence", () => {
  test("the first poll waits 1.5 s, each wait is half as long again, never over 10 s; the submit POST is sent ONCE", async () => {
    const { POLL_FIRST_MS } = await import("../src/wavespeed.js");
    expect(POLL_FIRST_MS).toBe(1500);
    const svc = service({ submit: () => processing("pp"), poll: (n) => (n < 6 ? withStatus("processing", "pp") : completed("pp")), output: () => image() });
    const { deps, clock } = wsDeps(svc);
    await makeWaveSpeedPicture(deps, REQ);
    expect(clock.c.sleeps.slice(0, 4)).toEqual([1500, 2250, 3375, 5063]);
    expect(Math.max(...clock.c.sleeps)).toBeLessThanOrEqual(10_000);
    expect(posts(svc)).toHaveLength(1);
  });
});

describe("the api fetch keeps checkProviderUrl's path rules (lifted from Social shared/imageProvider.ts)", () => {
  test("a query, a fragment, '..' and an encoded dot, slash or backslash are refused before a socket opens", async () => {
    const calls: string[] = [];
    const inner = (async (u: string) => { calls.push(u); return new Response("{}"); }) as unknown as typeof fetch;
    const eg = pictureEgress(BASE, [OUT_HOST], inner);
    for (const bad of [`${BASE}/api/v3/x?k=1`, `${BASE}/api/v3/x#f`, `${BASE}/api/v3/%2e%2e/admin`, `${BASE}/api/v3/a%2fb`, `${BASE}/api/v3/a%5cb`]) {
      await expect(eg.api(bad, { method: "POST" })).rejects.toBeInstanceOf(EgressRefused);
    }
    expect(calls).toHaveLength(0);
    await eg.api(`${BASE}/api/v3/wavespeed-ai/flux-schnell`, { method: "POST" });
    expect(calls).toHaveLength(1);
  });
});
