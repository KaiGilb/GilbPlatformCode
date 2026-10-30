// The self-card door `POST /lws/vault/<vaultId>/selfcard` and `ensureVaultSelfCard` over it. Added tests (the app's selfCardDoor tests run the
// save functions, which this unit does not hold; what they pinned about the DOOR is pinned here directly): it knocks on /selfcard and never
// on /c, 200 (adopted) is a success, a refusal reaches the caller as one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { RecordForbiddenError } from "@kaigilb/gilbplatformcode-lws-records";
import { ensureSelfCardRecord } from "./selfCardRecord";
import { ensureVaultSelfCard } from "./vaultProfilePhoto";
import { onSelfCardMade } from "./selfCardMade";
import { setUp, tearDown, type FakeAuth } from "../test/support";

const VAULT = "https://ann.platform.example.test/vault";
const CARD = "vsc-0123456789abcdef01234567";
let auth: FakeAuth;
let calls: Array<{ url: string; init: RequestInit }>;

function answer(status: number, opts: { location?: string | null; body?: unknown; etag?: string } = {}) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const headers: Record<string, string> = {};
    if (opts.location !== null) headers.location = opts.location ?? `https://x.example.test/lws/r/${CARD}`;
    if (opts.etag) headers.etag = opts.etag;
    return new Response(typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? {}), { status, headers });
  }));
}
const body = () => JSON.parse(String(calls[0]!.init.body));

beforeEach(() => {
  auth = setUp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("ensureSelfCardRecord", () => {
  it("POSTs to the vault's /selfcard door at the node that holds the vault, never to /c", async () => {
    answer(201);
    await ensureSelfCardRecord(VAULT, "t:Person", { name: "Ann" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`https://ann.platform.example.test/lws/vault/${encodeURIComponent(VAULT)}/selfcard`);
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.url).not.toMatch(/\/c(\?|$)/);
  });
  it("signs the write for that very url, sends JSON, survives an unload, and sends no Slug", async () => {
    answer(201);
    await ensureSelfCardRecord(VAULT, "t:Person", {});
    expect(auth.dpopWriteAuth).toHaveBeenCalledWith("POST", calls[0]!.url);
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h).toMatchObject({ authorization: "DPoP tw", dpop: "pw", "content-type": "application/json" });
    expect(Object.keys(h).map((k) => k.toLowerCase())).not.toContain("slug");
    expect(calls[0]!.init.keepalive).toBe(true);
  });
  it("sends the type and the facts as the wire body (a:<slug> keys, empty values left out)", async () => {
    answer(201);
    await ensureSelfCardRecord(VAULT, "t:Person", { name: "Ann", profilePhoto: "/files/f1", blank: "" });
    expect(body()).toEqual({ type: "t:Person", facts: { "a:name": "Ann", "a:profilePhoto": "/files/f1" } });
  });
  it("201 is created (adopted false) and 200 is the existing card returned untouched (adopted true): both are successes", async () => {
    answer(201, { etag: '"e1"' });
    expect(await ensureSelfCardRecord(VAULT, "t:Person", {})).toEqual({ id: CARD, etag: '"e1"', adopted: false });
    answer(200);
    expect(await ensureSelfCardRecord(VAULT, "t:Person", {})).toEqual({ id: CARD, etag: null, adopted: true });
  });
  it("takes the id from the @id of the body when there is no Location", async () => {
    answer(201, { location: null, body: { "@id": `https://x.example.test/lws/r/${CARD}` } });
    expect((await ensureSelfCardRecord(VAULT, "t:Person", {})).id).toBe(CARD);
  });
  it("an answer with neither a Location nor a body id gives an empty id", async () => {
    answer(201, { location: null, body: "not json" });
    expect((await ensureSelfCardRecord(VAULT, "t:Person", {})).id).toBe("");
  });
  it("409 is a refusal that reaches the caller, carrying its status", async () => {
    answer(409, { body: "SelfCardIdentityUnknown" });
    await expect(ensureSelfCardRecord(VAULT, "t:Person", {})).rejects.toMatchObject({ status: 409 });
  });
  it("403 is a RecordForbiddenError and 401 drops the credential and is NotSignedInError", async () => {
    answer(403);
    await expect(ensureSelfCardRecord(VAULT, "t:Person", {})).rejects.toBeInstanceOf(RecordForbiddenError);
    answer(401);
    await expect(ensureSelfCardRecord(VAULT, "t:Person", {})).rejects.toBeInstanceOf(NotSignedInError);
    expect(auth.invalidateDpop).toHaveBeenCalledTimes(1);
  });
  it("an empty vault is refused before anything is sent", async () => {
    answer(201);
    await expect(ensureSelfCardRecord("", "t:Person", {})).rejects.toThrow(/no vault partition was named/);
    expect(calls).toHaveLength(0);
  });
});

describe("ensureVaultSelfCard", () => {
  it("makes a Person card with the facts it is given", async () => {
    answer(201);
    const made = await ensureVaultSelfCard(VAULT, { profilePhoto: "/files/f1" });
    expect(body()).toEqual({ type: "t:Person", facts: { "a:profilePhoto": "/files/f1" } });
    expect(made).toEqual({ id: CARD, etag: null, adopted: false });
  });
  it("puts the trimmed display name under name, and overrides a name in the facts", async () => {
    answer(201);
    await ensureVaultSelfCard(VAULT, { name: "old" }, "  Ann Example  ");
    expect(body().facts).toEqual({ "a:name": "Ann Example" });
  });
  it("a blank display name adds nothing and leaves a name in the facts alone", async () => {
    answer(201);
    await ensureVaultSelfCard(VAULT, { name: "kept" }, "   ");
    expect(body().facts).toEqual({ "a:name": "kept" });
  });
  it("does not change the facts object it was given", async () => {
    answer(201);
    const facts = { profilePhoto: "/files/f1" };
    await ensureVaultSelfCard(VAULT, facts, "Ann");
    expect(facts).toEqual({ profilePhoto: "/files/f1" });
  });
  it("announces the vault once, after the card is made, and not before the answer", async () => {
    answer(201);
    const heard: string[] = [];
    const stop = onSelfCardMade((v) => heard.push(`${v}|${calls.length}`));
    await ensureVaultSelfCard(VAULT, {});
    stop();
    expect(heard).toEqual([`${VAULT}|1`]);
  });
  it("an adopted card is announced too (200 is a success)", async () => {
    answer(200);
    const heard: string[] = [];
    const stop = onSelfCardMade((v) => heard.push(v));
    expect((await ensureVaultSelfCard(VAULT, {})).adopted).toBe(true);
    stop();
    expect(heard).toEqual([VAULT]);
  });
  it("a refusal announces nothing and rejects", async () => {
    answer(403);
    const heard: string[] = [];
    const stop = onSelfCardMade((v) => heard.push(v));
    await expect(ensureVaultSelfCard(VAULT, {})).rejects.toBeInstanceOf(RecordForbiddenError);
    stop();
    expect(heard).toEqual([]);
  });
});
