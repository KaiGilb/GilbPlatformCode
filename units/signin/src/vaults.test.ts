import { describe, expect, it } from "vitest";
import { createNamedVault, listVaults, normaliseVaultName, sameVaultHost, type SignedRequestSource } from "./vaults";
import { VaultRequestRefusedError } from "./types";
import type { Transport, TransportRequest } from "./transport";

const ORIGIN = "https://node-a.example.test";
const REP = "https://types.example.test/base/t/Person";

type Sent = { url: string; req: TransportRequest };

function rig(status: number, body: unknown) {
  const sent: Sent[] = [];
  let signed = 0;
  const credential: SignedRequestSource = {
    authHeaders: async () => {
      signed++;
      return { Authorization: "DPoP tok", DPoP: "proof" };
    },
  };
  const transport: Transport = async (url, req) => {
    sent.push({ url, req });
    return { status, json: async () => body };
  };
  return { sent, credential, transport, signedCount: () => signed };
}

describe("normaliseVaultName", () => {
  it("matches the platform rule", () => {
    expect(normaliseVaultName("johndeveloper-sailboats")).toBe("johndevelopersailboats");
    expect(normaliseVaultName("John Smith!")).toBe("johnsmith");
    expect(normaliseVaultName("---")).toBe("user");
    expect(normaliseVaultName("")).toBe("user");
  });
});

describe("listVaults", () => {
  it("maps both represents forms, landing flag, name, partOf; drops entries without vaultId", async () => {
    const r = rig(200, {
      vaults: [
        { vaultId: "a", name: "alpha", modes: ["read", "write", "control"], isLandingVault: true, represents: REP, partOf: null },
        { vaultId: "b", name: "beta", modes: ["read"], represents: { "@id": REP }, partOf: { vaultId: "a" } },
        { name: "no id", modes: ["read"] },
        { vaultId: "", name: "empty id" },
      ],
    });
    const list = await listVaults(ORIGIN + "/", { credential: r.credential, transport: r.transport });
    expect(list).toEqual([
      { vaultId: "a", name: "alpha", modes: ["read", "write"], isLandingVault: true, represents: REP },
      { vaultId: "b", name: "beta", modes: ["read"], isLandingVault: false, represents: REP, partOf: "a" },
    ]);
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]!.url).toBe(`${ORIGIN}/lws/vaults`);
    expect(r.sent[0]!.req.method).toBe("GET");
    expect(r.sent[0]!.req.headers.DPoP).toBe("proof");
    expect(r.signedCount()).toBe(1);
  });

  it("reads shortName from podName only when podNameKnown is true; never from the host", async () => {
    const r = rig(200, {
      vaults: [
        { vaultId: "https://annhouseplants.example.test/vault", modes: ["write"], podName: "annhouseplants", podNameKnown: true },
        { vaultId: "https://b.example.test/vault", modes: ["write"], podName: "bee", podNameKnown: false },
        { vaultId: "https://c.example.test/vault", modes: ["write"], podName: "cee" },
        { vaultId: "https://d.example.test/vault", modes: ["write"], podName: null, podNameKnown: true },
        { vaultId: "https://e.example.test/vault", modes: ["write"], podName: "", podNameKnown: true },
      ],
    });
    const list = await listVaults(ORIGIN, { credential: r.credential, transport: r.transport });
    expect(list.map((v) => v.shortName)).toEqual(["annhouseplants", undefined, undefined, undefined, undefined]);
    expect("shortName" in list[1]!).toBe(false);
  });

  it("keeps each vault's entity URI (the node @id) as `entity`; absent when no @id", async () => {
    const r = rig(200, {
      vaults: [
        { "@id": "https://a.example.test/vault/e/ent1", vaultId: "https://a.example.test/vault", name: "a", modes: ["write"] },
        { vaultId: "https://b.example.test/vault", name: "b", modes: ["read"] },
      ],
    });
    const list = await listVaults(ORIGIN, { credential: r.credential, transport: r.transport });
    expect(list[0]!.entity).toBe("https://a.example.test/vault/e/ent1");
    expect(list[1]).not.toHaveProperty("entity");
  });

  it("keeps the parent's entity URI as partOfEntity (partOf.@id); partOf stays the parent's vaultId", async () => {
    const r = rig(200, {
      vaults: [
        { vaultId: "k", modes: ["read"], partOf: { "@id": "https://p.example.test/vault/e/p1", vaultId: "p" } },
        { vaultId: "j", modes: ["read"], partOf: { vaultId: "p" } },
        { vaultId: "i", modes: ["read"], partOf: null },
      ],
    });
    const [k, j, i] = await listVaults(ORIGIN, { credential: r.credential, transport: r.transport });
    expect(k).toMatchObject({ partOf: "p", partOfEntity: "https://p.example.test/vault/e/p1" });
    expect(j!.partOf).toBe("p");
    expect(j).not.toHaveProperty("partOfEntity");
    expect(i).not.toHaveProperty("partOfEntity");
  });

  it("a listed vault's entity can be sent as parentVault, exactly", async () => {
    const ent = "https://a.example.test/vault/e/ent1";
    const l = rig(200, { vaults: [{ "@id": ent, vaultId: "https://a.example.test/vault", modes: ["write"] }] });
    const [parent] = await listVaults(ORIGIN, { credential: l.credential, transport: l.transport });
    const c = rig(201, { vault: "https://k.example.test/vault/e/k", vaultId: "https://k.example.test/vault", name: "kid", represents: REP });
    await createNamedVault(ORIGIN, { name: "kid", represents: REP, parentVault: parent!.entity }, { credential: c.credential, transport: c.transport });
    expect(JSON.parse(c.sent[0]!.req.body as string).parentVault).toBe(ent);
  });

  it("throws with the status on a non-2xx", async () => {
    const r = rig(401, { error: "unauthorized" });
    await expect(listVaults(ORIGIN, { credential: r.credential, transport: r.transport })).rejects.toMatchObject({ status: 401, platformMessage: "unauthorized" });
  });
});

describe("createNamedVault", () => {
  const created = { vault: "https://x.example.test/vault", vaultId: "v1", name: "johndevelopersailboats", parent: "p1", represents: REP, created: true };

  it("posts exactly {name, represents, parentVault} once, signed, and returns the fields", async () => {
    const r = rig(201, created);
    const out = await createNamedVault(ORIGIN, { name: "johndeveloper-sailboats", represents: REP, parentVault: "p1" }, { credential: r.credential, transport: r.transport });
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]!.url).toBe(`${ORIGIN}/base/vault/create-named`);
    expect(r.sent[0]!.req.method).toBe("POST");
    expect(JSON.parse(r.sent[0]!.req.body!)).toEqual({ name: "johndeveloper-sailboats", represents: REP, parentVault: "p1" });
    expect(r.sent[0]!.req.headers.Authorization).toBe("DPoP tok");
    expect(out).toEqual({ vaultId: "v1", vault: "https://x.example.test/vault", name: "johndevelopersailboats", parent: "p1", represents: REP, complete: true });
  });

  it("202 (partial mint): complete false, fields filled, one POST, no retry", async () => {
    const r = rig(202, { ...created, partial: true });
    const out = await createNamedVault(ORIGIN, { name: "n", represents: REP }, { credential: r.credential, transport: r.transport });
    expect(out.complete).toBe(false);
    expect(out.vaultId).toBe("v1");
    expect(out.vault).toBe(created.vault);
    expect(r.sent).toHaveLength(1);
  });

  it("omits parentVault when not given", async () => {
    const r = rig(201, created);
    await createNamedVault(ORIGIN, { name: "n", represents: REP }, { credential: r.credential, transport: r.transport });
    expect(JSON.parse(r.sent[0]!.req.body!)).toEqual({ name: "n", represents: REP });
  });

  it("throws before any network call or signing when represents is empty", async () => {
    const r = rig(201, created);
    await expect(createNamedVault(ORIGIN, { name: "n", represents: "" }, { credential: r.credential, transport: r.transport })).rejects.toThrow(/type IRI/);
    expect(r.sent).toHaveLength(0);
    expect(r.signedCount()).toBe(0);
  });

  it("on 400 throws with the status and the platform's message word for word", async () => {
    const msg = "represents is required: a GilbVeda type IRI.";
    const r = rig(400, { error: "bad_request", message: msg });
    const err = await createNamedVault(ORIGIN, { name: "n", represents: REP }, { credential: r.credential, transport: r.transport }).catch((e) => e);
    expect(err).toBeInstanceOf(VaultRequestRefusedError);
    expect(err.status).toBe(400);
    expect(err.platformMessage).toBe(msg);
    expect(err.message).toContain(msg);
    expect(err.message).toContain("400");
  });

  it("falls back to error when there is no message", async () => {
    const r = rig(403, { error: "forbidden" });
    const err = await createNamedVault(ORIGIN, { name: "n", represents: REP }, { credential: r.credential, transport: r.transport }).catch((e) => e);
    expect(err.platformMessage).toBe("forbidden");
  });

  it("does not retry on 503", async () => {
    const r = rig(503, { error: "unavailable", message: "try later" });
    await expect(createNamedVault(ORIGIN, { name: "n", represents: REP }, { credential: r.credential, transport: r.transport })).rejects.toMatchObject({ status: 503 });
    expect(r.sent).toHaveLength(1);
  });

  describe("2xx answer with no usable vaultId", () => {
    const SENTENCE = "The vault was made, but the answer named no vaultId and it is not in your vault list yet. Sign in again, then look for it.";
    function twoStep(createRes: () => { status: number; json: () => Promise<unknown> }, list: unknown) {
      const sent: Sent[] = [];
      const credential: SignedRequestSource = { authHeaders: async () => ({ Authorization: "DPoP t", DPoP: "p" }) };
      const transport: Transport = async (url, req) => {
        sent.push({ url, req });
        return req.method === "POST" ? createRes() : { status: 200, json: async () => list };
      };
      return { sent, credential, transport };
    }
    const posts = (sent: Sent[]) => sent.filter((s) => s.req.method === "POST").length;
    const listed = { vaults: [{ vaultId: "v9", name: "johndevelopersailboats", modes: ["read"] }] };
    const run = (r: ReturnType<typeof twoStep>) =>
      createNamedVault(ORIGIN, { name: "johndeveloper-sailboats", represents: REP }, { credential: r.credential, transport: r.transport });

    it("finds the vault in the list by normalised name; one POST", async () => {
      const r = twoStep(() => ({ status: 201, json: async () => ({ created: true }) }), listed);
      const out = await run(r);
      expect(out.vaultId).toBe("v9");
      expect(out.name).toBe("johndevelopersailboats");
      expect(out.represents).toBe(REP);
      expect(out.parent).toBeUndefined();
      expect(out).not.toHaveProperty("vault");
      expect(posts(r.sent)).toBe(1);
    });

    it("throws the sentence when the list lacks it; one POST", async () => {
      const r = twoStep(() => ({ status: 201, json: async () => ({}) }), { vaults: [{ vaultId: "x", name: "other" }] });
      const err = await run(r).catch((e) => e);
      expect(err).toBeInstanceOf(VaultRequestRefusedError);
      expect(err.platformMessage).toBe(SENTENCE);
      expect(err.status).toBe(201);
      expect(posts(r.sent)).toBe(1);
    });

    it("treats a non-JSON 2xx body the same way (found)", async () => {
      const r = twoStep(() => ({ status: 201, json: async () => { throw new SyntaxError("bad json"); } }), listed);
      expect((await run(r)).vaultId).toBe("v9");
      expect(posts(r.sent)).toBe(1);
    });

    it("treats a non-JSON 2xx body the same way (not found)", async () => {
      const r = twoStep(() => ({ status: 201, json: async () => { throw new SyntaxError("bad json"); } }), { vaults: [] });
      await expect(run(r)).rejects.toMatchObject({ platformMessage: SENTENCE });
      expect(posts(r.sent)).toBe(1);
    });
  });
});

describe("sameVaultHost", () => {
  it("compares hosts only", () => {
    expect(sameVaultHost("https://abc.example.test/base", "https://abc.example.test/vault")).toBe(true);
    expect(sameVaultHost("https://abc.example.test/base", "https://abd.example.test/vault")).toBe(false);
    expect(sameVaultHost("garbage", "https://abc.example.test/vault")).toBe(false);
    expect(sameVaultHost("", "")).toBe(false);
  });
});

describe("create-named vaultId segment (0.2.5)", () => {
  it("returns vaultId as the platform sent it, /vault or /base, and the list fallback matches either by host", async () => {
    for (const seg of ["/vault", "/base"]) {
      const r = rig(201, { vaultId: `https://k.example.test${seg}`, name: "k", represents: REP });
      const out = await createNamedVault(ORIGIN, { name: "k", represents: REP }, { credential: r.credential, transport: r.transport });
      expect(out.vaultId).toBe(`https://k.example.test${seg}`);
    }
    expect(sameVaultHost("https://k.example.test/vault", "https://k.example.test/base")).toBe(true);
  });

  it("no vaultId in the answer: finds a /vault-listed vault by entity host", async () => {
    const sent: string[] = [];
    const credential: SignedRequestSource = { authHeaders: async () => ({ Authorization: "x", DPoP: "y" }) };
    const transport: Transport = async (url, req) => {
      sent.push(req.method);
      if (req.method === "POST") return { status: 201, json: async () => ({ vault: "https://zz.example.test/base/e/1" }) };
      return { status: 200, json: async () => ({ vaults: [{ vaultId: "https://zz.example.test/vault", name: "other", modes: ["write"] }] }) };
    };
    const out = await createNamedVault(ORIGIN, { name: "kid", represents: REP }, { credential, transport });
    expect(out.vaultId).toBe("https://zz.example.test/vault");
  });
});
