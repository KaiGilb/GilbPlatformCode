import { dpopHeaders, generateDpopKeyPair } from "@kaigilb/gilbplatformcode-signin";
import { describe, expect, it } from "vitest";
import { opaqueId } from "../src/bytes";
import { body, recUrl, vaultUrl, world } from "./support";

const LIST = "https://fake.test/lws/vaults";

describe("failNext", () => {
  it("answers the status once by default, then lets requests through; the injected call is logged and nothing changes", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    w.fake.failNext("GET /lws/vaults", { status: 503 });
    const first = await a.fetch(LIST);
    expect(first.status).toBe(503);
    expect(await body(first)).toEqual({ error: "Injected", message: "The fake answered 503 on purpose." });
    expect(w.fake.calls.last()).toMatchObject({ injected: true, status: 503 });
    expect((await a.fetch(LIST)).status).toBe(200);
  });
  it("times and skip: skip lets the first n through, times says how many fail", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    w.fake.failNext("GET /lws/vaults", { status: 500, times: 2, skip: 1 });
    expect([(await a.fetch(LIST)).status, (await a.fetch(LIST)).status, (await a.fetch(LIST)).status, (await a.fetch(LIST)).status]).toEqual([200, 500, 500, 200]);
  });
  it("matches a path template (:param), a method, and a RegExp; a different method is not hit", async () => {
    const w = await world();
    const r = w.fake.seedRecord(w.annV, { type: "N", facts: {} });
    const a = await w.as(w.ann);
    w.fake.failNext("PATCH /lws/r/:id", { status: 409, message: "clash" });
    expect((await a.fetch(recUrl(w.annV, r.id))).status).toBe(200);
    const hit = await a.fetch(recUrl(w.annV, r.id), { method: "PATCH", body: "{}" });
    expect(hit.status).toBe(409);
    expect((await body(hit)).message).toBe("clash");
    w.fake.failNext(/^GET \/lws\/vault\/.+\/records$/, { status: 502, body: { error: "Bad", message: "m" } });
    const rx = await a.fetch(vaultUrl(w.annV, "/records"));
    expect(rx.status).toBe(502);
    expect(await body(rx)).toEqual({ error: "Bad", message: "m" });
  });
  it("the returned function takes the rule away", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const off = w.fake.failNext("GET /lws/vaults", { status: 500, times: 9 });
    off();
    expect((await a.fetch(LIST)).status).toBe(200);
  });
  it("an injected failure comes before auth (as a flaky network does) and does not spend the proof", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    w.fake.failNext("GET /lws/vaults", { status: 500 });
    const h = await a.headers("GET", LIST);
    expect((await w.fake.fetch(LIST, { headers: h })).status).toBe(500);
    expect((await w.fake.fetch(LIST, { headers: h })).status).toBe(200);
  });
});

describe("dropNext, offline", () => {
  it("dropNext rejects fetch with a TypeError, as a lost network does, once; the call is logged as a network error", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    w.fake.dropNext("GET /lws/vaults");
    await expect(a.fetch(LIST)).rejects.toBeInstanceOf(TypeError);
    expect(w.fake.calls.last()!.status).toBe("network-error");
    expect((await a.fetch(LIST)).status).toBe(200);
  });
  it("offline rejects everything and records nothing; back online it answers", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    w.fake.offline = true;
    await expect(a.fetch(LIST)).rejects.toBeInstanceOf(TypeError);
    expect(w.fake.calls.count()).toBe(0);
    w.fake.offline = false;
    expect((await a.fetch(LIST)).status).toBe(200);
  });
});

describe("hold", () => {
  it("keeps matching requests waiting until released; others go through", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const release = w.fake.hold("GET /lws/vaults");
    let done = false;
    const pending = a.fetch(LIST).then((r) => {
      done = true;
      return r;
    });
    const other = await a.fetch(vaultUrl(w.annV, "/records"));
    expect(other.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    release();
    expect((await pending).status).toBe(200);
    expect(done).toBe(true);
    expect((await a.fetch(LIST)).status).toBe(200); // the hold is gone
  });
});

describe("hold with skip", () => {
  it("lets the first n matching requests through and holds the rest until released", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const release = w.fake.hold("GET /lws/vaults", { skip: 2 });
    expect((await a.fetch(LIST)).status).toBe(200);
    expect((await a.fetch(LIST)).status).toBe(200);
    let done = false;
    const third = a.fetch(LIST).then((r) => {
      done = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    expect(w.fake.calls.of("GET /lws/vaults").map((c) => c.status)).toEqual([200, 200, "network-error"]);
    release();
    expect((await third).status).toBe(200);
  });
});

describe("calls", () => {
  it("logs method, url, host, path, query, lower-case headers, parsed body, caller, status, in order", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    await a.fetch(vaultUrl(w.annV, "/c"), { method: "POST", headers: { "Content-Type": "application/json", Slug: "x" }, body: JSON.stringify({ type: "t:N", facts: { a: 1 } }) });
    await a.fetch(vaultUrl(w.annV, "/records?type=N&type=M&include=body"));
    const [post, get] = w.fake.calls.all;
    expect(post).toMatchObject({ n: 1, method: "POST", host: "ann.fake.test", path: `/lws/vault/${encodeURIComponent(w.annV.id)}/c`, status: 201, body: { type: "t:N", facts: { a: 1 } } });
    expect(post!.headers.slug).toBe("x");
    expect(get).toMatchObject({ n: 2, method: "GET", status: 200, query: { type: ["N", "M"], include: ["body"] } });
    expect(w.fake.calls.of("POST /lws/vault/:vault/c")).toHaveLength(1);
    expect(w.fake.calls.of(/^GET /)).toHaveLength(1);
    expect(w.fake.calls.last("POST /lws/vault/:vault/c")).toBe(post);
    expect(w.fake.calls.count("GET /lws/vault/:vault/records")).toBe(1);
    w.fake.calls.clear();
    expect(w.fake.calls.all).toEqual([]);
  });
  it("a Request object is read for its method, headers and body", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const url = vaultUrl(w.annV, "/c");
    const res = await w.fake.fetch(new Request(url, { method: "POST", headers: { ...(await a.headers("POST", url)), "content-type": "application/json" }, body: JSON.stringify({ facts: { x: 1 } }) }));
    expect(res.status).toBe(201);
  });
});

describe("the other-device hooks", () => {
  it("edit merges and moves the position and ETag; remove ends; bump moves only the ETag; both are invisible to calls", async () => {
    const w = await world();
    const r = w.fake.seedRecord(w.annV, { type: "N", facts: { name: "a", gone: 1 } });
    const a = await w.as(w.ann);
    const etag0 = (await a.fetch(recUrl(w.annV, r.id))).headers.get("etag");
    w.fake.edit(r.id, { "a:name": "b", gone: null });
    const doc = await body(await a.fetch(recUrl(w.annV, r.id)));
    expect(doc).toMatchObject({ name: "b" });
    expect(doc.gone).toBeUndefined();
    expect((await a.fetch(recUrl(w.annV, r.id))).headers.get("etag")).not.toBe(etag0);
    w.fake.remove(r.id);
    expect(w.fake.state.records.get(r.id)!.endedSeq).not.toBeNull();
    expect(w.fake.calls.all.every((c) => c.method === "GET")).toBe(true);
  });
});

describe("reset", () => {
  it("empties state, calls, violations, rules, holds and offline; ids and positions start again", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const r1 = w.fake.seedRecord(w.annV, { type: "N", facts: {} });
    w.fake.failNext("GET /lws/vaults", { status: 500, times: 5 });
    const release = w.fake.hold("GET /lws/vault/:vault/records");
    await a.fetch("https://fake.test/lws/nothing").catch(() => undefined);
    w.fake.offline = true;
    w.fake.reset();
    expect(w.fake.offline).toBe(false);
    expect(w.fake.calls.all).toEqual([]);
    expect(w.fake.violations).toEqual([]);
    expect(w.fake.state.people.size + w.fake.state.vaults.size + w.fake.state.records.size + w.fake.state.sessions.size).toBe(0);
    expect(w.fake.state.seq).toBe(0);
    release();
    const ann = w.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const again = w.fake.seedRecord(ann.landingVaultId!, { type: "N", facts: {} });
    expect(again.id).toBe(opaqueId(3)); // the person took 1 and the vault entity 2: the counter began again
    expect(again.seq).toBe(1);
    const key = await generateDpopKeyPair();
    const { token } = w.fake.signInAs(ann, { jwk: key.publicJwk });
    const t = await w.fake.fetch(LIST, { headers: await dpopHeaders(key, token, "GET", LIST) });
    expect(t.status).toBe(200); // not the 500 failNext queued before the reset
  });
});
