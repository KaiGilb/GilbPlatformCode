import { describe, expect, it } from "vitest";
import { body, world } from "./support";

const LIST = "https://fake.test/lws/vaults";

describe("GET /lws/vaults (row 5)", () => {
  it("answers the document shape: @context, @id, total, vaults, complete, incompletePeers; ld+json", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const res = await a.fetch(LIST);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/ld+json");
    const d = await body(res);
    expect(d["@context"]).toBe("https://www.w3.org/ns/lws/v1");
    expect(d["@id"]).toBe("https://fake.test/lws/vaults");
    expect(d).toMatchObject({ total: 1, complete: true, incompletePeers: 0 });
    expect(d.vaults[0]).toEqual({
      vaultId: "https://ann.fake.test/vault",
      name: "ann",
      represents: "https://veda.gilb.com/base/t/Person",
      partOf: null,
      parentAmbiguous: false,
      modes: ["read", "write"],
      isLandingVault: true,
      podName: "ann",
      podNameKnown: true,
    });
    expect(d.vaults[0]["@id"]).toBeUndefined();
  });
  it("lists only the vaults the caller reaches, with the modes held; a write grant brings read", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "write");
    w.fake.grant(w.fake.seedVault({ name: "club", owner: w.ann }), w.ben, "read");
    const b = await w.as(w.ben);
    const d = await body(await b.fetch(LIST));
    expect(d.vaults.map((v: { name: string; modes: string[]; isLandingVault: boolean }) => [v.name, v.modes, v.isLandingVault])).toEqual([
      ["ann", ["read", "write"], false],
      ["ben", ["read", "write"], true],
      ["club", ["read"], false],
    ]);
  });
  it("grant write plants the read in the same act, as the platform does (src/routes/authz.ts:1537-1540); grant read does not plant write", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "write");
    w.fake.grant(w.annV, w.cat, "read");
    expect([...w.fake.state.grants.get(w.annV.id)!.get(w.ben.principal)!].sort()).toEqual(["read", "write"]);
    expect([...w.fake.state.grants.get(w.annV.id)!.get(w.cat.principal)!]).toEqual(["read"]);
  });
  it("a control grant alone lists nothing (the list speaks read and write only)", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.cat, "control");
    const c = await w.as(w.cat);
    expect((await body(await c.fetch(LIST))).vaults).toEqual([]);
  });
  it("sorts by name then vault id and reports a parent", async () => {
    const w = await world();
    const kids = [w.fake.seedVault({ name: "zeta", owner: w.ann, partOf: w.annV }), w.fake.seedVault({ name: "alpha", owner: w.ann, partOf: w.annV })];
    const a = await w.as(w.ann);
    const d = await body(await a.fetch(LIST));
    expect(d.vaults.map((v: { name: string }) => v.name)).toEqual(["alpha", "ann", "zeta"]);
    expect(d.vaults[0].partOf).toEqual({ vaultId: w.annV.id });
    expect(kids).toHaveLength(2);
  });
  it("revokeAccess takes a vault out of the list", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "read");
    w.fake.revokeAccess(w.ben, w.annV);
    const b = await w.as(w.ben);
    expect((await body(await b.fetch(LIST))).vaults.map((v: { name: string }) => v.name)).toEqual(["ben"]);
  });
  it("a person with no vault gets an empty 200 (not an error)", async () => {
    const w = await world();
    const c = await w.as(w.cat);
    const res = await c.fetch(LIST);
    expect(res.status).toBe(200);
    expect((await body(res)).total).toBe(0);
  });
});
