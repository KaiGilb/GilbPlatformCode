// New. The arms of `memberEntityUri`, `writePairRelation` and `endRelation` that the ported cases leave to chance: the master check
// for a relation that names its roles, the bounds on signing in, the abort before the request, the update/create split, and the
// two places the platform origin is used.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { BoundTimeoutError, __setCatalogForTest, catalogFromGraph, endRelation, memberEntityUri, writePairRelation } from "./index";
import { resp, setUp, tearDown, type FakeHost } from "../test/support";

const VAULT = "https://v.platform.example.test/base";
const A = `${VAULT}/e/a`;
const B = `${VAULT}/e/b`;
const MASTER = "https://ontology.example.test/base/t";

let host: FakeHost;
let calls: { method: string; url: string; headers: Record<string, string>; body: Record<string, unknown> | null }[];
let master: Record<string, Record<string, unknown> | number>;

function seed(...curies: string[]): void {
  __setCatalogForTest(
    catalogFromGraph(
      curies.map((c) => ({ "@id": `https://ontology.example.test/base/t/${c.slice(2)}`, "a:label": c.slice(2), "a:linkPlane": "user", "a:typeAttribute": c, "a:symmetric": false })),
      "user",
    ),
  );
}

beforeEach(() => {
  host = setUp();
  calls = [];
  master = {};
  seed("t:Reference");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, url, headers: (init?.headers ?? {}) as Record<string, string>, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
      if (method === "GET" && url.startsWith(MASTER + "/")) {
        const doc = master[decodeURIComponent(url.slice(MASTER.length + 1))] ?? master[url];
        if (typeof doc === "number") return resp(doc, { body: {} });
        if (doc) return resp(200, { body: doc });
        return resp(404, { body: {} });
      }
      if (method === "GET" && url.includes("/relations")) return resp(200, { body: { relations: [] } });
      return resp(201, { body: { changed: true, entity: `${VAULT}/r/issued` } });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __setCatalogForTest(null);
  tearDown();
});

const puts = () => calls.filter((c) => c.method === "PUT");
const base = { sourceId: "a", targetId: "b", sourceEntityUri: A, targetEntityUri: B, vaultNamespace: VAULT };

describe("memberEntityUri", () => {
  it("prefers the framed @id when it is an http or https address, over everything else", () => {
    expect(memberEntityUri("a", "http://x.example.test/base/e/a", VAULT)).toBe("http://x.example.test/base/e/a");
    expect(memberEntityUri("https://y.example.test/e/a", "https://x.example.test/base/e/a", VAULT)).toBe("https://x.example.test/base/e/a");
  });
  it("a preferred value that is not an address is ignored", () => {
    expect(memberEntityUri("a", "base:e/a", VAULT)).toBe(`${VAULT}/e/a`);
    expect(memberEntityUri("a", null, VAULT)).toBe(`${VAULT}/e/a`);
  });
  it("an id that is already an address is kept, with or without a vault", () => {
    expect(memberEntityUri("http://x.example.test/e/a", undefined, undefined)).toBe("http://x.example.test/e/a");
  });
  it("composes the vault namespace and the id, dropping one closing slash of the namespace", () => {
    expect(memberEntityUri("a", undefined, `${VAULT}/`)).toBe(`${VAULT}/e/a`);
  });
  it("last resort: the platform origin, read when called (a dev single-host case)", () => {
    expect(memberEntityUri("a")).toBe("https://platform.example.test/base/e/a");
    setBaseOrigin("https://other.example.test");
    expect(memberEntityUri("a", null, null)).toBe("https://other.example.test/base/e/a");
  });
});

describe("writePairRelation: the agent of the write", () => {
  it("is the signed-in principal", async () => {
    await writePairRelation({ ...base, relationId: `${VAULT}/r/r1`, typeCurie: "t:Reference" });
    expect(puts()[0]!.body!.agent).toBe("https://id.platform.example.test/base/p/ann");
  });
  it("is the anonymous agent at the platform origin when there is no session", async () => {
    host.tokenManager.getSession.mockRejectedValueOnce(new Error("not signed in"));
    await writePairRelation({ ...base, relationId: `${VAULT}/r/r1`, typeCurie: "t:Reference" });
    expect(puts()[0]!.body!.agent).toBe("https://platform.example.test/base/e/anonymous");
  });
});

describe("writePairRelation: the body", () => {
  it("carries the type, the agent, the two roles, the extra facts and the vault; valid_from only when it has text", async () => {
    await writePairRelation({ ...base, relationId: `${VAULT}/r/r1`, typeCurie: "t:Reference", extraFacts: { "a:status": "80" }, validFrom: " 2026-01-02 " });
    expect(puts()[0]!.body).toMatchObject({
      type: "t:Reference",
      facts: { "role:source": { "@id": A }, "role:target": { "@id": B }, "a:status": "80" },
      vault: VAULT,
      valid_from: "2026-01-02",
    });
    calls = [];
    await writePairRelation({ ...base, relationId: `${VAULT}/r/r1`, typeCurie: "t:Reference", validFrom: "   ", vaultNamespace: `  ${VAULT}  ` });
    expect(puts()[0]!.body).not.toHaveProperty("valid_from");
    expect(puts()[0]!.body!.vault).toBe(VAULT);
  });
  it("an UPDATE (a known relation id, no asCreate) is one PUT at the relation's own URI and reads nothing", async () => {
    const out = await writePairRelation({ ...base, relationId: `${VAULT}/r/r1`, typeCurie: "t:Reference" });
    expect(calls.map((c) => c.method)).toEqual(["PUT"]);
    expect(calls[0]!.url).toBe(`${VAULT}/r/r1`);
    expect(out).toEqual({ id: "r1", changed: true, uri: `${VAULT}/r/issued` });
  });
  it("a CREATE under a client id (asCreate) PUTs that id and then reads the source's relations once", async () => {
    const out = await writePairRelation({ ...base, relationId: "client1", asCreate: true, typeCurie: "t:Reference" });
    expect(calls.map((c) => c.method)).toEqual(["PUT", "GET"]);
    expect(calls[0]!.url).toBe(`${VAULT}/r/client1`);
    expect(calls[1]!.url).toBe("https://v.platform.example.test/base/e/a/relations");
    expect(out.id).toBe("client1");
    expect(out.relations).toEqual([]);
  });
  it("a CREATE with no vault is refused before any request", async () => {
    await expect(writePairRelation({ sourceId: "a", targetId: "b", typeCurie: "t:Reference" })).rejects.toThrow("Relation mint names the vault. No vault was given.");
    await expect(writePairRelation({ sourceId: "a", targetId: "b", typeCurie: "t:Reference", vaultNamespace: "   " })).rejects.toThrow("names the vault");
    expect(calls).toHaveLength(0);
  });
  it("a write that changed nothing and answered 200 is reported unchanged", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp(200, { body: { changed: false } }));
    const out = await writePairRelation({ ...base, relationId: `${VAULT}/r/r1`, typeCurie: "t:Reference" });
    expect(out).toEqual({ id: "r1", changed: false, uri: null });
  });
  it("a bare relation id is addressed at the vault the caller named", async () => {
    await writePairRelation({ ...base, relationId: "bare1", typeCurie: "t:Reference" });
    expect(puts()[0]!.url).toBe(`${VAULT}/r/bare1`);
  });
});

describe("writePairRelation: the type is checked against the live user-plane catalogue", () => {
  it("a cold catalogue is read once at the public corpus address, and a type it lists is written", async () => {
    __setCatalogForTest(null);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async (input: string, init?: RequestInit) => {
      calls.push({ method: "GET", url: String(input), headers: (init?.headers ?? {}) as Record<string, string>, body: null });
      return resp(200, { body: { "@graph": [{ "@id": "https://ontology.example.test/base/t/Cold", "a:label": "cold", "a:linkPlane": "user", "a:typeAttribute": "t:Cold" }] } });
    });
    await writePairRelation({ ...base, relationId: `${VAULT}/r/r1`, typeCurie: "t:Cold" });
    expect(calls[0]!.url).toBe("https://platform.example.test/base/vocab?status=all&linkPlane=user");
    expect(calls[0]!.headers).toEqual({ accept: "application/ld+json, application/json" });
    expect(puts()[0]!.body!.type).toBe("t:Cold");
  });
  it("a cold catalogue that does not list the type refuses it, and a catalogue that cannot be read lists nothing", async () => {
    __setCatalogForTest(null);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp(500, { body: {} }));
    await expect(writePairRelation({ ...base, relationId: `${VAULT}/r/r1`, typeCurie: "t:Cold" })).rejects.toThrow(/not a live user-plane join/);
    expect(puts()).toHaveLength(0);
  });
});

describe("writePairRelation: a relation that names its roles is checked on the master", () => {
  const roles = { source: "role:holder", target: "role:held" };
  const named = { ...base, relationId: `${VAULT}/r/r1`, roles };

  it("must name its type too", async () => {
    await expect(writePairRelation(named)).rejects.toThrow("A relation that names its roles must also name its type.");
    expect(calls).toHaveLength(0);
  });
  it("a term the master serves as a relation (a:nodeKind) is written with the two role keys given, and without role:source or role:target", async () => {
    master.StakeholderOf = { "a:nodeKind": "relation" };
    await writePairRelation({ ...named, typeCurie: "t:StakeholderOf" });
    expect(calls[0]!.url).toBe(`${MASTER}/StakeholderOf`);
    expect(calls[0]!.headers).toEqual({ accept: "application/json" });
    expect(Object.keys(puts()[0]!.body!.facts as object)).toEqual(["role:holder", "role:held"]);
    expect(puts()[0]!.body!.type).toBe("t:StakeholderOf");
  });
  it("the link-plane catalogue is not asked when roles are named", async () => {
    __setCatalogForTest(null);
    master.StakeholderOf = { "a:isRelationPredicate": true };
    await writePairRelation({ ...named, typeCurie: "t:StakeholderOf" });
    expect(calls.some((c) => c.url.includes("/vocab"))).toBe(false);
  });
  it.each([
    ["a:isRelationPredicate as text", { "a:isRelationPredicate": "true" }],
    ["a bare nodeKind", { nodeKind: "relation" }],
    ["an @type of Relation", { "@type": ["t:Thing", "https://ontology.example.test/base/t/Relation"] }],
    ["a parent of Relation", { "a:subTypeOf": "t:Relation" }],
    ["a parent of ConnectedTo", { "a:subTypeOf": { "@id": "https://ontology.example.test/base/t/ConnectedTo" } }],
  ])("a term that is a relation by %s is written", async (_name, doc) => {
    master.StakeholderOf = doc;
    await writePairRelation({ ...named, typeCurie: "t:StakeholderOf" });
    expect(puts()).toHaveLength(1);
  });
  it("a relation only by being a kind of an intermediate type is found, up to eight hops", async () => {
    master.StakeholderOf = { "a:subTypeOf": `${MASTER}/Mid1` };
    master.Mid1 = { "a:subTypeOf": { "@id": `${MASTER}/Mid2` } };
    master.Mid2 = { "a:nodeKind": "relation" };
    await writePairRelation({ ...named, typeCurie: "t:StakeholderOf" });
    expect(calls.filter((c) => c.url.startsWith(MASTER)).map((c) => c.url)).toEqual([`${MASTER}/StakeholderOf`, `${MASTER}/Mid1`, `${MASTER}/Mid2`]);
    expect(puts()).toHaveLength(1);
  });
  it("a chain longer than eight hops is not followed to the end", async () => {
    for (let i = 0; i < 12; i++) master[i === 0 ? "StakeholderOf" : `H${i}`] = { "a:subTypeOf": `${MASTER}/H${i + 1}` };
    master.H12 = { "a:nodeKind": "relation" };
    await expect(writePairRelation({ ...named, typeCurie: "t:StakeholderOf" })).rejects.toThrow("the master term is not a relation");
    expect(calls.filter((c) => c.url.startsWith(MASTER))).toHaveLength(8);
  });
  it("a chain that loops back is stopped", async () => {
    master.StakeholderOf = { "a:subTypeOf": `${MASTER}/Loop` };
    master.Loop = { "a:subTypeOf": `${MASTER}/StakeholderOf` };
    await expect(writePairRelation({ ...named, typeCurie: "t:StakeholderOf" })).rejects.toThrow("the master term is not a relation");
  });
  it("a term that is not a relation is refused, and nothing is written", async () => {
    master.StakeholderOf = { "a:nodeKind": "type" };
    await expect(writePairRelation({ ...named, typeCurie: "t:StakeholderOf" })).rejects.toThrow("Refusing to write t:StakeholderOf: the master term is not a relation.");
    expect(puts()).toHaveLength(0);
  });
  it("a term the master does not serve is refused with the status", async () => {
    await expect(writePairRelation({ ...named, typeCurie: "t:StakeholderOf" })).rejects.toThrow("the master did not serve that term (404)");
    master.StakeholderOf = 503;
    await expect(writePairRelation({ ...named, typeCurie: "t:StakeholderOf" })).rejects.toThrow("(503)");
  });
  it("a body that is not a document ends the walk at once", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, json: async () => null } as unknown as Response);
    await expect(writePairRelation({ ...named, typeCurie: "t:StakeholderOf" })).rejects.toThrow("the master term is not a relation");
  });
  it("the master is read at the ontology origin that was set, read when called", async () => {
    const { setTermOrigin } = await import("@kaigilb/gilbplatformcode-term-origin");
    setTermOrigin("https://other-ontology.example.test/");
    await expect(writePairRelation({ ...named, typeCurie: "t:StakeholderOf" })).rejects.toThrow();
    expect(calls[0]!.url).toBe("https://other-ontology.example.test/base/t/StakeholderOf");
  });
  it("the category term is refused first, with the generic named", async () => {
    await expect(writePairRelation({ ...base, typeCurie: "t:Relation" })).rejects.toThrow(/category of predicates.*t:ConnectedTo/);
  });
});

describe("writePairRelation: the bounds before the request leaves", () => {
  const input = { ...base, relationId: `${VAULT}/r/r1`, typeCurie: "t:Reference" };

  it("signing in that does not answer is stopped at 10 s, before any request", async () => {
    vi.useFakeTimers();
    host.tokenManager.getSession.mockImplementation(() => new Promise(() => {}));
    const seen = writePairRelation(input).then(
      () => null,
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(9_999);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    const e = await seen;
    expect(e).toBeInstanceOf(BoundTimeoutError);
    expect((e as Error).message).toBe("signing in timed out");
    expect(calls).toHaveLength(0);
  });

  it("a caller whose own bound has fired does not send, and onSent is not called (the sign-in and the proof together passed the bound)", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const onSent = vi.fn();
    host.tokenManager.getSession.mockImplementation(() => new Promise((r) => setTimeout(() => r({ principal: "https://id.platform.example.test/base/p/ann", vault: null, vaults: [] }), 7_000)));
    host.dpopWriteAuth.mockImplementation(() => new Promise((r) => setTimeout(() => r({ authorization: "DPoP tok", dpop: "proof" }), 7_000)));
    const seen = writePairRelation({ ...input, signal: controller.signal, onSent }).then(
      () => null,
      (e: unknown) => e,
    );
    setTimeout(() => controller.abort(), 12_000);
    await vi.advanceTimersByTimeAsync(14_500);
    const e = await seen;
    expect(e).toBeInstanceOf(BoundTimeoutError);
    expect((e as Error).message).toBe("writing the link timed out");
    expect(onSent).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("onSent is called once, after the headers exist and before the request", async () => {
    const order: string[] = [];
    const onSent = vi.fn(() => order.push("onSent"));
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      order.push("fetch");
      return resp(200, { body: { changed: true } });
    });
    await writePairRelation({ ...input, onSent });
    expect(order).toEqual(["onSent", "fetch"]);
    expect(onSent).toHaveBeenCalledTimes(1);
  });
});

describe("endRelation: the answers", () => {
  it("a missing id is refused", async () => {
    await expect(endRelation("")).rejects.toThrow("Missing relation id");
  });
  it("a 404 is an end that was not verified: nothing changed and nothing claimed", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp(404, { body: {} }));
    await expect(endRelation(`${VAULT}/r/r1`)).resolves.toEqual({ relation: null, changed: false, verified: null });
  });
  it("an end that landed where it was sent, with the connection gone, is verified", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: string, init?: RequestInit) => {
      if (init?.method === "POST") return resp(200, { body: { relation: `${VAULT}/r/r1`, changed: true } });
      return resp(404, { body: {} });
    });
    await expect(endRelation(`${VAULT}/r/r1`, VAULT)).resolves.toEqual({ relation: `${VAULT}/r/r1`, changed: true, verified: true });
  });
  it("a read-back that cannot run is reported unverified, not as either answer", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: string, init?: RequestInit) => {
      if (init?.method === "POST") return resp(200, { body: { relation: `${VAULT}/r/r1`, changed: false } });
      return resp(500, { body: "down" });
    });
    await expect(endRelation(`${VAULT}/r/r1`, VAULT)).resolves.toEqual({ relation: `${VAULT}/r/r1`, changed: false, verified: null });
  });
  it("a read-back that finds the person signed out says so", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: string, init?: RequestInit) => {
      if (init?.method === "POST") return resp(200, { body: { relation: `${VAULT}/r/r1`, changed: true } });
      return resp(401, { body: "no" });
    });
    await expect(endRelation(`${VAULT}/r/r1`, VAULT)).rejects.toBeInstanceOf(NotSignedInError);
  });
  it("an answer that names no relation is not a different vault", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: string, init?: RequestInit) => {
      if (init?.method === "POST") return resp(200, { body: {} });
      return resp(404, { body: {} });
    });
    await expect(endRelation("r9", VAULT)).resolves.toEqual({ relation: null, changed: false, verified: true });
  });
});
