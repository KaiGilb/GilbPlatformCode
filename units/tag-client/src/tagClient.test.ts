// The unit's exports, pinned against a fake platform fetch: what readMainTags sends, how it chunks, how it maps a row, and what it throws.
import { describe, expect, it } from "vitest";
import { PlatformError, type PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { isRouteMissing, MASTERS_BATCH_MAX, NO_TAG_ROUTES_SENTENCE, NoTagRoutesError, readMainTags } from "./tagClient";

const ORIGIN = "https://holder.platform.example.test";
const VAULT = `${ORIGIN}/vault`;

type Sent = { url: string; method: string; headers: Record<string, string> | undefined; body: Record<string, unknown> };
type Reply = { status?: number; body?: unknown; text?: string };

function world(reply: (call: number, body: Record<string, unknown>) => Reply | Promise<Reply>, origin = ORIGIN) {
  const sent: Sent[] = [];
  const platform: PlatformClient = {
    origin,
    fetch: async (url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      sent.push({ url, method: String(init?.method), headers: init?.headers as Record<string, string> | undefined, body });
      const r = await reply(sent.length, body);
      const text = r.text ?? (r.body === undefined ? "" : JSON.stringify(r.body));
      return new Response(text === "" ? null : text, { status: r.status ?? 200 });
    },
  };
  return { platform, sent };
}

/** The platform's answer for a list of records: every one has a main tag `tag-<n>`. */
const tagged = (body: Record<string, unknown>): Reply => ({
  body: { masterTags: (body.targetEntities as string[]).map((t) => ({ targetEntity: t, tagString: `tag-${t.split("/").pop()}`, tagKnown: true })) },
});
const rec = (n: number | string) => `${VAULT}/e/r${n}`;
const thrown = async (p: Promise<unknown>): Promise<unknown> => p.then(() => { throw new Error("did not throw"); }, (e: unknown) => e);

describe("constants", () => {
  it("the batch maximum is 50 and the no-routes sentence is the words of the error", () => {
    expect(MASTERS_BATCH_MAX).toBe(50);
    expect(NO_TAG_ROUTES_SENTENCE).toBe("This platform does not make tags yet");
  });
});

describe("isRouteMissing", () => {
  it("Fastify's own 404 is told from an entity 404 by the message, not by the status", () => {
    expect(isRouteMissing({ status: 404, json: { message: "Route GET:/base/tag/master not found" }, text: "" })).toBe(true);
    expect(isRouteMissing({ status: 404, json: { error: "NotFound", message: "No resource at x" }, text: "" })).toBe(false);
    expect(isRouteMissing({ status: 200, json: { message: "Route GET:/x not found" }, text: "" })).toBe(false);
  });

  it("reads the message from the body text when the body is not JSON, trims it, and wants the words at the start", () => {
    expect(isRouteMissing({ status: 404, json: null, text: "  Route POST:/base/tag/masters not found\n" })).toBe(true);
    expect(isRouteMissing({ status: 404, json: null, text: "the Route GET:/x not found" })).toBe(false);
    expect(isRouteMissing({ status: 404, json: null, text: "Route not found" })).toBe(false);
    expect(isRouteMissing({ status: 404, json: null, text: "" })).toBe(false);
  });

  it("a JSON body whose message is not a string falls back to the text", () => {
    expect(isRouteMissing({ status: 404, json: { message: 5 }, text: "Route GET:/x not found" })).toBe(true);
    expect(isRouteMissing({ status: 404, json: { message: 5 }, text: "" })).toBe(false);
  });

  it("only a 404 is a missing route", () => {
    for (const status of [200, 400, 403, 500]) expect(isRouteMissing({ status, json: { message: "Route GET:/x not found" }, text: "" })).toBe(false);
  });
});

describe("NoTagRoutesError", () => {
  it("is a PlatformError named NoTagRoutesError that says the sentence and carries the answer's status, url and body", () => {
    const e = new NoTagRoutesError({ url: `${ORIGIN}/base/tag/masters`, status: 404, text: "gone" });
    expect(e).toBeInstanceOf(PlatformError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("NoTagRoutesError");
    expect(e.message).toBe(NO_TAG_ROUTES_SENTENCE);
    expect([e.status, e.url, e.body]).toEqual([404, `${ORIGIN}/base/tag/masters`, "gone"]);
    expect(e.created).toBeUndefined();
  });
});

describe("readMainTags: what it sends", () => {
  it("one POST to base/tag/masters on the client's origin, with exactly {vault, targetEntities}", async () => {
    const { platform, sent } = world((_, b) => tagged(b));
    await readMainTags(platform, VAULT, [rec(1), rec(2)]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method).toBe("POST");
    expect(sent[0]!.url).toBe(`${ORIGIN}/base/tag/masters`);
    expect(sent[0]!.body).toEqual({ vault: VAULT, targetEntities: [rec(1), rec(2)] });
    expect(Object.keys(sent[0]!.body).sort()).toEqual(["targetEntities", "vault"]);
    expect(sent[0]!.headers).toEqual({ "content-type": "application/json" });
  });

  it("an origin with a trailing slash still makes one slash", async () => {
    const { platform, sent } = world((_, b) => tagged(b), `${ORIGIN}/`);
    await readMainTags(platform, VAULT, [rec(1)]);
    expect(sent[0]!.url).toBe(`${ORIGIN}/base/tag/masters`);
  });

  it("an empty list makes no call and answers an empty map", async () => {
    const { platform, sent } = world((_, b) => tagged(b));
    expect((await readMainTags(platform, VAULT, [])).size).toBe(0);
    expect(sent).toHaveLength(0);
  });
});

describe("readMainTags: chunks of MASTERS_BATCH_MAX", () => {
  it("120 records are 3 calls (50, 50, 20), each with {vault, targetEntities}; the answers are joined", async () => {
    const { platform, sent } = world((_, b) => tagged(b));
    const records = Array.from({ length: 120 }, (_, i) => rec(i));
    const got = await readMainTags(platform, VAULT, records);
    expect(sent.map((c) => (c.body.targetEntities as string[]).length)).toEqual([50, 50, 20]);
    expect(sent.every((c) => c.body.vault === VAULT && Object.keys(c.body).sort().join() === "targetEntities,vault")).toBe(true);
    expect(got.size).toBe(120);
    expect(got.get(rec(0))).toEqual({ tag: "tag-r0", known: true });
    expect(got.get(rec(119))).toEqual({ tag: "tag-r119", known: true });
  });

  it("the chunks keep the caller's order and lose no record", async () => {
    const { platform, sent } = world((_, b) => tagged(b));
    const records = Array.from({ length: 120 }, (_, i) => rec(i));
    await readMainTags(platform, VAULT, records);
    expect(sent.flatMap((c) => c.body.targetEntities as string[])).toEqual(records);
  });

  it("exactly 50 records are one call, 51 are two calls (50 and 1): the function chunks, it does not refuse", async () => {
    const fifty = world((_, b) => tagged(b));
    expect((await readMainTags(fifty.platform, VAULT, Array.from({ length: 50 }, (_, i) => rec(i)))).size).toBe(50);
    expect(fifty.sent).toHaveLength(1);
    const fiftyOne = world((_, b) => tagged(b));
    expect((await readMainTags(fiftyOne.platform, VAULT, Array.from({ length: 51 }, (_, i) => rec(i)))).size).toBe(51);
    expect(fiftyOne.sent.map((c) => (c.body.targetEntities as string[]).length)).toEqual([50, 1]);
  });

  it("the calls are made one after the other, not together", async () => {
    let open = 0;
    let most = 0;
    const { platform } = world(async (_, b) => {
      open++;
      most = Math.max(most, open);
      await Promise.resolve();
      open--;
      return tagged(b);
    });
    await readMainTags(platform, VAULT, Array.from({ length: 120 }, (_, i) => rec(i)));
    expect(most).toBe(1);
  });
});

describe("readMainTags: how a row maps", () => {
  const row = (r: unknown) => world(() => ({ body: { masterTags: [r] } }));

  it("a known row with a tag string is { tag, known: true }", async () => {
    const { platform } = row({ targetEntity: rec(1), tagString: "ann", tagKnown: true });
    expect(await readMainTags(platform, VAULT, [rec(1)])).toEqual(new Map([[rec(1), { tag: "ann", known: true }]]));
  });

  it("tagKnown:false carries its reason (none, anomaly, hidden) and the tag is null", async () => {
    for (const reason of ["none", "anomaly", "hidden"]) {
      const { platform } = row({ targetEntity: rec(1), tagString: null, tagKnown: false, tagUnknownReason: reason });
      expect((await readMainTags(platform, VAULT, [rec(1)])).get(rec(1))).toEqual({ tag: null, known: false, reason });
    }
  });

  it("tagKnown:false with no reason has no `reason` key at all", async () => {
    const { platform } = row({ targetEntity: rec(1), tagString: null, tagKnown: false });
    const got = (await readMainTags(platform, VAULT, [rec(1)])).get(rec(1))!;
    expect(got).toEqual({ tag: null, known: false });
    expect("reason" in got).toBe(false);
  });

  it("a reason that is not a string is dropped", async () => {
    const { platform } = row({ targetEntity: rec(1), tagString: null, tagKnown: false, tagUnknownReason: 3 });
    expect((await readMainTags(platform, VAULT, [rec(1)])).get(rec(1))).toEqual({ tag: null, known: false });
  });

  it("a row that says known but has no usable tag string (null, empty, not a string) is { tag: null, known: true }", async () => {
    for (const tagString of [null, "", 7]) {
      const { platform } = row({ targetEntity: rec(1), tagString, tagKnown: true });
      expect((await readMainTags(platform, VAULT, [rec(1)])).get(rec(1))).toEqual({ tag: null, known: true });
    }
  });

  it("a tag string on a row that is not known (tagKnown anything but true) is not read as a tag", async () => {
    for (const tagKnown of [false, "true", 1, undefined]) {
      const { platform } = row({ targetEntity: rec(1), tagString: "ann", tagKnown });
      expect((await readMainTags(platform, VAULT, [rec(1)])).get(rec(1))).toEqual({ tag: null, known: false });
    }
  });

  it("a row with no string targetEntity, and a row that is not an object, are skipped", async () => {
    const { platform } = world(() => ({
      body: { masterTags: [{ tagString: "a", tagKnown: true }, { targetEntity: 4, tagString: "b", tagKnown: true }, null, "x", [1], { targetEntity: rec(2), tagString: "ok", tagKnown: true }] },
    }));
    expect(await readMainTags(platform, VAULT, [rec(1), rec(2)])).toEqual(new Map([[rec(2), { tag: "ok", known: true }]]));
  });

  it("a record the platform did not answer is not in the map; the answer is not matched against the request", async () => {
    const { platform } = world(() => ({ body: { masterTags: [{ targetEntity: rec(9), tagString: "nine", tagKnown: true }] } }));
    const got = await readMainTags(platform, VAULT, [rec(1)]);
    expect(got.has(rec(1))).toBe(false);
    expect(got.get(rec(9))).toEqual({ tag: "nine", known: true });
  });

  it("the same record answered in two chunks keeps the later answer", async () => {
    const { platform } = world((call) => ({ body: { masterTags: [{ targetEntity: rec(1), tagString: `call-${call}`, tagKnown: true }] } }));
    const got = await readMainTags(platform, VAULT, Array.from({ length: 51 }, (_, i) => rec(i)));
    expect(got.get(rec(1))).toEqual({ tag: "call-2", known: true });
  });
});

describe("readMainTags: what it throws", () => {
  it("a platform without the route is a NoTagRoutesError (a PlatformError) with the sentence, the status, the url and the body", async () => {
    const text = JSON.stringify({ message: "Route POST:/base/tag/masters not found", error: "Not Found", statusCode: 404 });
    const { platform } = world(() => ({ status: 404, text }));
    const err = await thrown(readMainTags(platform, VAULT, [rec(1)]));
    expect(err).toBeInstanceOf(NoTagRoutesError);
    expect(err).toBeInstanceOf(PlatformError);
    const e = err as NoTagRoutesError;
    expect(e.message).toBe("This platform does not make tags yet");
    expect([e.status, e.url, e.body]).toEqual([404, `${ORIGIN}/base/tag/masters`, text]);
  });

  it("a missing route in the first call stops the read: no second call", async () => {
    const { platform, sent } = world(() => ({ status: 404, text: "Route POST:/base/tag/masters not found" }));
    await thrown(readMainTags(platform, VAULT, Array.from({ length: 120 }, (_, i) => rec(i))));
    expect(sent).toHaveLength(1);
  });

  it("an entity 404 is a PlatformError, not a NoTagRoutesError", async () => {
    const { platform } = world(() => ({ status: 404, body: { error: "NotFound", message: "No resource at x" } }));
    const err = await thrown(readMainTags(platform, VAULT, [rec(1)]));
    expect(err).toBeInstanceOf(PlatformError);
    expect(err).not.toBeInstanceOf(NoTagRoutesError);
    expect((err as PlatformError).status).toBe(404);
  });

  it("any other status is a PlatformError with the status, the url, the body and a message that says what came back", async () => {
    for (const status of [400, 403, 500]) {
      const { platform } = world(() => ({ status, text: "refused" }));
      const e = (await thrown(readMainTags(platform, VAULT, [rec(1)]))) as PlatformError;
      expect(e).toBeInstanceOf(PlatformError);
      expect(e).not.toBeInstanceOf(NoTagRoutesError);
      expect([e.status, e.url, e.body]).toEqual([status, `${ORIGIN}/base/tag/masters`, "refused"]);
      expect(e.message).toBe(`POST ${ORIGIN}/base/tag/masters answered ${status}: refused`);
    }
  });

  it("only 200 is accepted: a 201 and a 204 throw", async () => {
    for (const status of [201, 204]) {
      const { platform } = world(() => ({ status, body: status === 204 ? undefined : { masterTags: [] } }));
      const e = (await thrown(readMainTags(platform, VAULT, [rec(1)]))) as PlatformError;
      expect(e).toBeInstanceOf(PlatformError);
      expect(e.status).toBe(status);
    }
  });

  it("an answer with no masterTags list is a PlatformError that says so (never an empty map)", async () => {
    for (const body of [{}, { masterTags: "x" }, { masterTags: { a: 1 } }, [], null]) {
      const { platform } = world(() => ({ body }));
      const e = (await thrown(readMainTags(platform, VAULT, [rec(1)]))) as PlatformError;
      expect(e).toBeInstanceOf(PlatformError);
      expect(e.message).toBe(`POST ${ORIGIN}/base/tag/masters served no masterTags`);
      expect(e.status).toBe(200);
    }
  });

  it("a platform that cannot be reached is a PlatformError with status 0", async () => {
    const platform: PlatformClient = { origin: ORIGIN, fetch: async () => { throw new TypeError("offline"); } };
    const e = (await thrown(readMainTags(platform, VAULT, [rec(1)]))) as PlatformError;
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.status).toBe(0);
  });

  it("a later chunk that fails fails the whole read: nothing partial is answered", async () => {
    const { platform, sent } = world((call, b) => (call === 2 ? { status: 500, text: "boom" } : tagged(b)));
    const err = await thrown(readMainTags(platform, VAULT, Array.from({ length: 120 }, (_, i) => rec(i))));
    expect((err as PlatformError).status).toBe(500);
    expect(sent).toHaveLength(2);
  });
});
