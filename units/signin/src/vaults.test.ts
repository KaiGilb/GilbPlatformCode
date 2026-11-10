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
