// POST /base/style/extract (row 21): credential first, 4096-byte limit, schema, 10 per 60 s per principal, the address rules, seeded answers.
import { beforeEach, describe, expect, it } from "vitest";
import { body, json, world, type Who, type World } from "./support";

const URL_ = "https://fake.test/base/style/extract";
let w: World;
let ann: Who;
beforeEach(async () => {
  w = await world({ proofWindowSeconds: 3600 }); // the clock jumps in the rate tests; the proofs are signed at real time
  ann = await w.as(w.ann);
});
const read = (who: Who, address: unknown) => who.fetch(URL_, { method: "POST", ...json({ url: address }) });

describe("POST /base/style/extract", () => {
  it("answers the colours and fonts seeded for that address, and nothing else is invented", async () => {
    w.fake.seedStyle("https://example.com/", { colors: ["#112233", "#445566"], fonts: ["Lora"], radiusPx: 6 });
    const res = await read(ann, "https://example.com/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await body(res)).toEqual({ colors: ["#112233", "#445566"], fonts: ["Lora"], radiusPx: 6 });
    expect(w.fake.violations).toEqual([]);
  });
  it("an address never seeded gets a stub that depends on the address alone", async () => {
    const a1 = await body(await read(ann, "https://one.example.com/"));
    const a2 = await body(await read(ann, "https://one.example.com/"));
    const b = await body(await read(ann, "https://two.example.com/"));
    expect(a1).toEqual(a2);
    expect(a1.colors).toHaveLength(3);
    for (const c of a1.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(a1.fonts).toHaveLength(1);
    expect(b).not.toEqual(a1);
  });
  it("reset forgets the seeds and the rate count", async () => {
    w.fake.seedStyle("https://example.com/", { colors: ["#000000"], fonts: ["Lora"] });
    w.fake.reset();
    const again = await world();
    expect(await body(await read(await again.as(again.ann), "https://example.com/"))).not.toEqual({ colors: ["#000000"], fonts: ["Lora"] });
    expect(w.fake.state.style.seeds.size).toBe(0);
    expect(w.fake.state.style.hits.size).toBe(0);
  });

  describe("the credential comes first", () => {
    it("an unsigned call is 401, whatever the body", async () => {
      for (const init of [json({ url: "https://example.com/" }), json({ url: 7, extra: true }), { method: "POST", body: "{not json" }, { method: "POST", body: "x".repeat(10_000) }]) {
        const res = await w.fake.fetch(URL_, { method: "POST", ...init });
        expect(res.status).toBe(401);
      }
      expect(w.fake.state.style.hits.size).toBe(0);
    });
    it("an unsigned call with a body over the limit is still 401, not 413", async () => {
      const res = await w.fake.fetch(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://example.com/" + "a".repeat(5000) }) });
      expect(res.status).toBe(401);
    });
    it("a signed call with a body over 4096 bytes is 413", async () => {
      const res = await read(ann, "https://example.com/" + "a".repeat(5000));
      expect(res.status).toBe(413);
      expect(w.fake.state.style.hits.size).toBe(0);
    });
    it("a body of exactly 4096 bytes is not refused for its size", async () => {
      const pad = 4096 - Buffer.byteLength(JSON.stringify({ url: "" }));
      const exact = "a".repeat(pad); // not an address: the schema refuses the 2048-character limit, not the size
      const res = await ann.fetch(URL_, { method: "POST", ...json({ url: exact }) });
      expect(res.status).toBe(400);
      const ok = "https://example.com/" + "a".repeat(2048 - 20);
      expect((await read(ann, ok)).status).toBe(200);
    });
  });

  describe("the schema", () => {
    it("refuses a missing url, a non-string, an empty string, one over 2048 characters, an extra key, and a body that is not an object", async () => {
      const bad: unknown[] = [{}, { url: 7 }, { url: "" }, { url: "https://example.com/" + "a".repeat(2040) }, { url: "https://example.com/", extra: 1 }, [], "x", null];
      for (const b of bad) {
        const res = await ann.fetch(URL_, { method: "POST", ...json(b) });
        expect(res.status, JSON.stringify(b)?.slice(0, 40)).toBe(400);
      }
      const notJson = await ann.fetch(URL_, { method: "POST", body: "{nope" });
      expect(notJson.status).toBe(400);
      expect(w.fake.state.style.hits.size).toBe(0); // a refused body is not counted by the limiter
    });
  });

  describe("the address", () => {
    it("is bad_url unless it is https without credentials on the default port", async () => {
      for (const a of ["http://example.com/", "ftp://example.com/", "not a url", "https://user:pw@example.com/", "https://example.com:8443/", "javascript:alert(1)"]) {
        const res = await read(ann, a);
        expect(res.status, a).toBe(400);
        expect(await body(res), a).toEqual({ error: "bad_url" });
      }
      expect((await read(ann, "https://example.com:443/")).status).toBe(200);
    });
    it("is address_not_allowed for a private, loopback or local host", async () => {
      const refused = [
        "https://localhost/", "https://app.localhost/", "https://127.0.0.1/", "https://127.1/", "https://10.0.0.5/", "https://172.16.0.1/", "https://172.31.255.1/",
        "https://192.168.1.1/", "https://169.254.169.254/", "https://100.64.0.1/", "https://0.0.0.0/", "https://[::1]/", "https://[fd00::1]/", "https://[fe80::1]/",
        "https://printer.local/", "https://db.internal/", "https://intranet/", "https://2130706433/",
      ];
      for (const a of refused) {
        w.clock.ms += 61_000; // a fresh window each time: 18 addresses are more than the limit
        const res = await read(ann, a);
        expect(res.status, a).toBe(400);
        expect(await body(res), a).toEqual({ error: "address_not_allowed" });
      }
    });
    it("lets public hosts through, including ones near the private ranges", async () => {
      for (const a of ["https://example.com/", "https://172.32.0.1/", "https://172.15.0.1/", "https://100.128.0.1/", "https://8.8.8.8/", "https://sub.example.org/path?q=1"]) {
        expect((await read(ann, a)).status, a).toBe(200);
      }
    });
  });

  describe("the rate limit, 10 per 60 s per principal, on the fake's clock", () => {
    it("the 11th call inside the window is 429 rate_limited with Retry-After, and the window then reopens", async () => {
      for (let i = 0; i < 10; i++) expect((await read(ann, "https://example.com/")).status).toBe(200);
      const res = await read(ann, "https://example.com/");
      expect(res.status).toBe(429);
      expect(await body(res)).toEqual({ error: "rate_limited", retryAfterSec: 60 });
      expect(res.headers.get("retry-after")).toBe("60");
      w.clock.ms += 30_000;
      const later = await read(ann, "https://example.com/");
      expect(later.status).toBe(429);
      expect((await body(later)).retryAfterSec).toBe(30);
      w.clock.ms += 30_001; // the first ten are now 60.001 s old
      expect((await read(ann, "https://example.com/")).status).toBe(200);
    });
    it("is per principal", async () => {
      for (let i = 0; i < 10; i++) await read(ann, "https://example.com/");
      expect((await read(ann, "https://example.com/")).status).toBe(429);
      const ben = await w.as(w.ben);
      expect((await read(ben, "https://example.com/")).status).toBe(200);
    });
    it("a refused address still counts (the platform counts before it reads)", async () => {
      for (let i = 0; i < 10; i++) expect((await read(ann, "https://localhost/")).status).toBe(400);
      expect((await read(ann, "https://example.com/")).status).toBe(429);
    });
  });

  it("failNext reaches the row (a 504 from the platform's reader)", async () => {
    w.fake.failNext("POST /base/style/extract", { status: 504, body: { error: "site_timeout" } });
    const res = await read(ann, "https://example.com/");
    expect(res.status).toBe(504);
    expect(w.fake.calls.of("POST /base/style/extract")).toHaveLength(1);
    expect((await read(ann, "https://example.com/")).status).toBe(200);
  });
});
