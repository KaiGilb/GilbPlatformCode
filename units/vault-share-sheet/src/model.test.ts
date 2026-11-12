// @vitest-environment node
// The model against the fake platform: the real vault-access calls, signed as a person the fake knows.
import { readFileSync } from "node:fs";
import { resetBaseOrigin, setBaseOrigin, baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { createFakePlatform, type FakePlatform, type Person } from "@kaigilb/gilbplatformcode-fake-platform";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { NO_CONTROL, VaultAccessError, fetchVaultAcl, shareVault, unshareVault, type VaultAclEntry } from "@kaigilb/gilbplatformcode-vault-access";
import { vaultAddressFromName, vaultIdProblem, vaultNameProblem } from "@kaigilb/gilbplatformcode-vault-address";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accessFailure, accessRows, granteeFromInput, loadAccessView } from "./model";

let fake: FakePlatform;
let ann: Person;
let ben: Person;
let cat: Person;
let vaultId: string;
// One host per person: the fake refuses a proof id it has seen, and two hosts for one person repeat theirs within a millisecond.
let hosts: Map<string, ReturnType<FakePlatform["authHost"]>>;
const host = (p: Person) => hosts.get(p.email) ?? hosts.set(p.email, fake.authHost(p)).get(p.email)!;
const as = (p: Person) => setLwsAuth(host(p));
const apexOf = (origin: string) => new URL(origin).host;

beforeEach(() => {
  fake = createFakePlatform();
  hosts = new Map();
  ann = fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
  ben = fake.seedPerson({ email: "ben@example.test", vaultName: "ben" });
  cat = fake.seedPerson({ email: "cat@example.test", vaultName: "cat" });
  vaultId = ann.landingVaultId!;
  setBaseOrigin(fake.origin);
  vi.stubGlobal("fetch", fake.fetch);
  as(ann);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
});

/** Share the way the sheet does: what was typed, through granteeFromInput. */
async function shareTyped(text: string, level: "edit" | "view") {
  const g = granteeFromInput(text);
  if ("problem" in g) throw new Error(g.problem);
  await shareVault(vaultId, g.grantee, level);
}
const controlled = async () => {
  const v = await loadAccessView(vaultId);
  if (!v.controlled) throw new Error("expected a controlled view");
  return v;
};

describe("the rows", () => {
  it("1. shared as edit shows that person at level edit; shared as view shows view", async () => {
    await shareTyped("ben", "edit");
    await shareTyped("cat", "view");
    const { rows } = await controlled();
    expect(rows.map((r) => [r.principal, r.level, r.owner])).toEqual([
      [ben.principal, "edit", false],
      [cat.principal, "view", false],
    ].sort((a, b) => (a[0]! < b[0]! ? -1 : 1)));
  });

  it("2. the owner is the entry that holds control, returned apart from the rows, though the fake's owner row is kind grant", async () => {
    const url = `${new URL(vaultId).origin}/base/consent/vault-acl?vault=${encodeURIComponent(vaultId)}`;
    const res = await fake.fetch(url, { headers: await host(ann).dpopReadAuth("GET", url) });
    const wire = (await res.json()) as { acl: { principal: string; kind: string; levels: string[] }[] };
    const ownerWire = wire.acl.find((e) => e.principal === ann.principal)!;
    expect(ownerWire.kind).toBe("grant"); // F14: the live owner row is not owner-inferred
    expect(ownerWire.levels).toContain("control");

    await shareTyped("ben", "view");
    const v = await controlled();
    expect(v.owner).toMatchObject({ principal: ann.principal, owner: true, note: null });
    expect(v.rows.map((r) => r.principal)).toEqual([ben.principal]);
    expect(v.rows.some((r) => r.owner)).toBe(false);
  });

  it("accessRows: Control decides the owner, not the kind; a delegate holding Control stays visible and flagged, never the owner", () => {
    const e = (principal: string, levels: VaultAclEntry["levels"], kind: "grant" | "owner-inferred"): VaultAclEntry => ({ principal, levels, label: null, webId: null, kind });
    const a = accessRows([e("https://x.example.test/base/p/o", ["read", "write", "control"], "grant"), e("https://x.example.test/base/p/w", ["read", "write"], "owner-inferred")]);
    expect(a.owner?.principal).toBe("https://x.example.test/base/p/o");
    expect(a.rows.map((r) => r.principal)).toEqual(["https://x.example.test/base/p/w"]); // owner-inferred without Control is no owner
    const b = accessRows([e("p1", ["read", "write", "control"], "owner-inferred"), e("p2", ["control"], "grant")]);
    expect(b.owner?.principal).toBe("p1");
    expect(b.rows).toMatchObject([{ principal: "p2", owner: true }]);
    expect(accessRows([])).toEqual({ owner: null, rows: [] });
  });

  it("accessRows: write is edit, read only is view, append only is left out, the label and note come from principal-row", () => {
    const e = (principal: string, levels: VaultAclEntry["levels"], label: string | null): VaultAclEntry => ({ principal, levels, label, webId: null, kind: "grant" });
    const { rows } = accessRows([e("k1", ["read", "write"], "Ben"), e("k2", ["read"], null), e("k3", ["append"], "Nobody")]);
    expect(rows.map((r) => [r.principal, r.level])).toEqual([["k1", "edit"], ["k2", "view"]]);
    expect(rows[0]!.label).toBe("Ben");
    expect(rows[1]!.label).not.toBe("k2");
    expect(rows[1]!.note).toEqual(expect.any(String));
  });

  it("3. after unshare, no row remains", async () => {
    await shareTyped("ben", "edit");
    expect((await controlled()).rows).toHaveLength(1);
    await unshareVault(vaultId, ben.principal);
    expect((await controlled()).rows).toEqual([]);
  });
});

describe("a person without Control", () => {
  beforeEach(() => {
    fake.grant(fake.state.vaults.get(vaultId)!, ben, "write");
  });

  it("4. gets { controlled: false }, and the failure of a share is NO_CONTROL, the vault-access constant", async () => {
    as(ben);
    expect(await loadAccessView(vaultId)).toEqual({ controlled: false });
    const err = await shareVault(vaultId, cat.principal, "view").then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(VaultAccessError);
    expect(accessFailure(err)).toBe(NO_CONTROL);
    expect(accessFailure(new VaultAccessError(404, "not found"))).toBe(NO_CONTROL);
  });

  it("5. a refused share changes nothing: the access list is deep-equal before and after", async () => {
    const before = await fetchVaultAcl(vaultId);
    as(ben);
    await expect(shareVault(vaultId, cat.principal, "edit")).rejects.toBeInstanceOf(VaultAccessError);
    await expect(unshareVault(vaultId, ann.principal)).rejects.toBeInstanceOf(VaultAccessError);
    as(ann);
    expect(await fetchVaultAcl(vaultId)).toEqual(before);
  });
});

describe("accessFailure", () => {
  it("403 is NO_CONTROL, another VaultAccessError its message, an Error its message, anything else the fixed sentence", () => {
    expect(accessFailure(new VaultAccessError(403, "whatever"))).toBe(NO_CONTROL);
    expect(accessFailure(new VaultAccessError(400, "that is not a person"))).toBe("that is not a person");
    expect(accessFailure(new VaultAccessError(401, "re-authorize"))).toBe("re-authorize");
    expect(accessFailure(new Error("network down"))).toBe("network down");
    expect(accessFailure(new Error(""))).toBe("Something went wrong. Try again.");
    expect(accessFailure("text")).toBe("Something went wrong. Try again.");
    expect(accessFailure(undefined)).toBe("Something went wrong. Try again.");
  });
});

describe("granteeFromInput", () => {
  it("6. a bare host is refused with a sentence and no request is made", () => {
    const calls = fake.calls.count();
    for (const text of ["ann.example.test", "https://ann.example.test", "https://ann.example.test/"]) {
      const r = granteeFromInput(text);
      expect(r, text).toHaveProperty("problem");
      expect((r as { problem: string }).problem.length).toBeGreaterThan(10);
    }
    expect(fake.calls.count()).toBe(calls);
  });

  it("an empty entry and an email give the vault-address sentences, imported not re-worded", () => {
    expect(granteeFromInput("   ")).toEqual({ problem: vaultNameProblem("")! });
    expect(granteeFromInput("ben@example.test")).toEqual({ problem: vaultNameProblem("ben@example.test")! });
    expect(vaultNameProblem("ben@example.test")).toMatch(/not an email/);
    expect(granteeFromInput("https://ben@example.test/vault")).toEqual({ problem: vaultNameProblem("https://ben@example.test/vault")! });
  });

  it("a bare name becomes exactly what vaultAddressFromName answers under the host of the base origin", () => {
    const r = granteeFromInput("  Ben ");
    expect(r).toEqual({ grantee: vaultAddressFromName("Ben", apexOf(baseOrigin()))!, name: "ben" });
    expect((r as { grantee: string }).grantee).toBe("https://ben.fake.test/vault");
    expect(granteeFromInput("ben", { apex: "other.example.test" })).toEqual({ grantee: vaultAddressFromName("ben", "other.example.test")!, name: "ben" });
    expect(granteeFromInput("-bad-")).toEqual({ problem: vaultNameProblem("-bad-")! });
    expect(granteeFromInput("ben", { apex: "not a host" })).toHaveProperty("problem");
  });

  it("the model composes no '/vault' path of its own, and holds no host", () => {
    const src = readFileSync(new URL("./model.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/\/vault\b/);
    expect(src).not.toMatch(/gilb\.com/);
  });

  it("a full address is kept as typed (trimmed), named by its first host label, after vaultIdProblem", () => {
    expect(granteeFromInput(" https://ben.fake.test/vault ")).toEqual({ grantee: "https://ben.fake.test/vault", name: "ben" });
    expect(granteeFromInput("https://ben.fake.test/i")).toEqual({ problem: vaultIdProblem("https://ben.fake.test/i")! });
    expect(granteeFromInput("http://ben.fake.test/vault")).toEqual({ problem: vaultIdProblem("http://ben.fake.test/vault")! });
  });

  it("a name typed in the sheet reaches the person the fake knows by it", async () => {
    await shareTyped("Ben", "edit");
    expect((await controlled()).rows[0]!.principal).toBe(ben.principal);
  });
});

describe("two shares at once", () => {
  it("7. two different people at once are both there after the re-read", async () => {
    await Promise.all([shareTyped("ben", "edit"), shareTyped("cat", "view")]);
    const { rows } = await controlled();
    expect(rows.map((r) => [r.principal, r.level]).sort()).toEqual([[ben.principal, "edit"], [cat.principal, "view"]].sort());
  });

  it("7. the same person shared edit and view at once ends as edit, whichever lands first: grants only add on the fake", async () => {
    await Promise.all([shareTyped("ben", "edit"), shareTyped("ben", "view")]);
    expect((await controlled()).rows).toMatchObject([{ principal: ben.principal, level: "edit" }]);
  });
});
