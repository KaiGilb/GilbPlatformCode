import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { grantVaultAccess, fetchVaultAcl, NO_CONTROL, revokeVaultAccess, shareVault, unshareVault, VaultAccessError } from "./index";
import { jsonResponse, setUp, stubFetch, tearDown, type Seen } from "../test/support";

const VAULT = "https://ann.platform.example.test/vault";
const VAULT_HOST = "ann.platform.example.test";
const GRANTEE = "https://sam.platform.example.test/vault";
const CONTROL = "You don't hold Control on this vault, so you can't change who can access it.";
const REAUTH = "Your session needs to re-authorize — try again.";

function headersOf(seen: Seen): Record<string, string> {
  return (seen.init?.headers ?? {}) as Record<string, string>;
}

function bodyOf(seen: Seen): { vault: string; grantee: string; mode: string } {
  return JSON.parse(String(seen.init?.body)) as { vault: string; grantee: string; mode: string };
}

beforeEach(() => {
  setUp();
});

afterEach(() => {
  tearDown();
});

describe("grantVaultAccess", () => {
  // production 2026-11-09, PictureRecords run 3, F28
  it("posts the grant to the vault's own host, not the base origin, with the write credential", async () => {
    const auth = setUp("https://gilb.com");
    const vault = "https://anna.gilb.com/vault";
    const seen = stubFetch(() => jsonResponse({ vault, grantee: GRANTEE, mode: "write", granted: true }, 201));
    await grantVaultAccess(vault, GRANTEE, "write");
    expect(seen).toHaveLength(1);
    const url = "https://anna.gilb.com/base/authz/grant-vault";
    expect(seen[0]?.url).toBe(url);
    expect(new URL(seen[0]!.url).host).toBe("anna.gilb.com");
    expect(new URL(seen[0]!.url).host).not.toBe("gilb.com");
    expect(seen[0]?.init?.method).toBe("POST");
    expect(bodyOf(seen[0]!)).toEqual({ vault, grantee: GRANTEE, mode: "write" });
    expect(headersOf(seen[0]!).authorization).toBe("DPoP tok-write");
    expect(headersOf(seen[0]!).dpop).toBe("proof-write");
    expect(auth.dpopWriteAuth).toHaveBeenCalledWith("POST", url);
  });

  it("turns 403 into the Control sentence", async () => {
    stubFetch(() => jsonResponse({ error: "Forbidden", message: "Principal x does not hold acl:Control" }, 403));
    await expect(grantVaultAccess(VAULT, GRANTEE, "read")).rejects.toMatchObject({
      name: "VaultAccessError",
      status: 403,
      message: CONTROL,
    });
  });

  it("exports NO_CONTROL, the same sentence the 403 carries, so a host does not copy it", async () => {
    expect(NO_CONTROL).toBe(CONTROL);
    stubFetch(() => jsonResponse({ error: "Forbidden" }, 403));
    await expect(grantVaultAccess(VAULT, GRANTEE, "read")).rejects.toMatchObject({ message: NO_CONTROL });
  });

  it("drops the credential on 401 and says to re-authorize", async () => {
    const auth = setUp();
    stubFetch(() => jsonResponse({ error: "Unauthorized" }, 401));
    await expect(grantVaultAccess(VAULT, GRANTEE, "write")).rejects.toMatchObject({
      status: 401,
      message: REAUTH,
    });
    expect(auth.invalidateDpop).toHaveBeenCalledOnce();
  });

  it("shows the 400 sentence, not the machine token", async () => {
    stubFetch(() => jsonResponse({ error: "BadRequest", message: "the grantee is not a known principal" }, 400));
    try {
      await grantVaultAccess(VAULT, GRANTEE, "append");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(VaultAccessError);
      expect((e as VaultAccessError).message).toBe("the grantee is not a known principal");
      expect((e as VaultAccessError).message).not.toContain("BadRequest");
    }
  });
});

describe("fetchVaultAcl", () => {
  it("reads a 200 as controlled, with the display fields normalised", async () => {
    const auth = setUp();
    const seen = stubFetch(() =>
      jsonResponse({
        note: "who holds what",
        acl: [
          {
            principal: GRANTEE,
            levels: ["read", "write"],
            label: "Sam",
            webId: "https://sam.example.test/i",
            kind: "grant",
            labelSource: "vault-name",
            registered: true,
            viewer: "self",
          },
          { principal: "https://id.example.test/base/p/no-name", levels: ["read"] },
        ],
        edges: [{ sourceVault: "https://other.example.test/vault", mode: "read", grade: "full", kind: "public" }],
      }),
    );
    const result = await fetchVaultAcl(VAULT);
    expect(seen[0]?.url).toBe(
      `https://${VAULT_HOST}/base/consent/vault-acl?vault=${encodeURIComponent(VAULT)}`,
    );
    expect(auth.dpopReadAuth).toHaveBeenCalledWith("GET", seen[0]?.url);
    expect(result).toEqual({
      controlled: true,
      note: "who holds what",
      acl: [
        {
          principal: GRANTEE,
          levels: ["read", "write"],
          label: "Sam",
          webId: "https://sam.example.test/i",
          kind: "grant",
        },
        {
          principal: "https://id.example.test/base/p/no-name",
          levels: ["read"],
          label: null,
          webId: null,
          kind: "grant",
        },
      ],
      edges: [{ sourceVault: "https://other.example.test/vault", mode: "read", grade: "full", kind: "public" }],
    });
  });

  it("reads a 404 as not controlled", async () => {
    stubFetch(() => jsonResponse({ error: "NotFound" }, 404));
    await expect(fetchVaultAcl(VAULT)).resolves.toEqual({ controlled: false });
  });
});

describe("shareVault", () => {
  it("view grants read and does not read the list back", async () => {
    const seen = stubFetch(() => jsonResponse({ vault: VAULT, grantee: GRANTEE, mode: "read", granted: true }, 201));
    await shareVault(VAULT, GRANTEE, "view");
    expect(seen).toHaveLength(1);
    expect(bodyOf(seen[0]!)).toEqual({ vault: VAULT, grantee: GRANTEE, mode: "read" });
  });

  it("edit resolves when the platform planted read beside write", async () => {
    const seen = stubFetch((url) => {
      if (url.includes("/base/consent/vault-acl")) {
        return jsonResponse({
          acl: [{ principal: GRANTEE, levels: ["read", "write"] }],
        });
      }
      return jsonResponse({ vault: VAULT, grantee: GRANTEE, mode: "write", granted: true }, 201);
    });
    await shareVault(VAULT, GRANTEE, "edit");
    expect(bodyOf(seen[0]!)).toEqual({ vault: VAULT, grantee: GRANTEE, mode: "write" });
    expect(seen.some((s) => s.url.includes("/base/consent/vault-acl"))).toBe(true);
  });

  it("edit matches the principal the grant echoes, not the text that was pasted", async () => {
    // A short WebID is not a vault address. The platform resolves it, so the echo is not the paste.
    const pasted = "https://ann.example.test/i";
    const echoed = "https://id.example.test/base/p/resolved";
    stubFetch((url) => {
      if (url.includes("/base/consent/vault-acl")) {
        return jsonResponse({
          acl: [
            { principal: pasted, levels: ["write"] },
            { principal: echoed, levels: ["read", "write"] },
          ],
        });
      }
      return jsonResponse({ vault: VAULT, grantee: echoed, mode: "write", granted: true }, 201);
    });
    await expect(shareVault(VAULT, pasted, "edit")).resolves.toBeUndefined();
  });

  it("edit throws, naming view, when the list shows write and no read", async () => {
    stubFetch((url) => {
      if (url.includes("/base/consent/vault-acl")) {
        return jsonResponse({ acl: [{ principal: GRANTEE, levels: ["write"] }] });
      }
      return jsonResponse({ vault: VAULT, grantee: GRANTEE, mode: "write", granted: true }, 201);
    });
    await expect(shareVault(VAULT, GRANTEE, "edit")).rejects.toMatchObject({
      name: "VaultAccessError",
      message: expect.stringMatching(/view|read/),
    });
  });
});

describe("unshareVault", () => {
  it("revokes write, then read, then append, and ignores a revoke that found nothing", async () => {
    const seen = stubFetch((_url, init) => {
      const mode = bodyOf({ url: "", init }).mode;
      return jsonResponse({ vault: VAULT, grantee: GRANTEE, mode, revoked: mode !== "write" }, 200);
    });
    await unshareVault(VAULT, GRANTEE);
    expect(seen.map((s) => bodyOf(s).mode)).toEqual(["write", "read", "append"]);
    for (const s of seen) {
      expect(new URL(s.url).pathname).toBe("/base/authz/revoke-vault");
      expect(new URL(s.url).host).toBe(VAULT_HOST);
    }
  });

  it("stops on a 403 from the first revoke and does not revoke read or append", async () => {
    const seen = stubFetch(() => jsonResponse({ error: "Forbidden" }, 403));
    await expect(unshareVault(VAULT, GRANTEE)).rejects.toMatchObject({ status: 403, message: CONTROL });
    expect(seen).toHaveLength(1);
    expect(bodyOf(seen[0]!).mode).toBe("write");
  });
});

describe("revokeVaultAccess", () => {
  it("posts the revoke to the vault host", async () => {
    const auth = setUp();
    const seen = stubFetch(() => jsonResponse({ vault: VAULT, grantee: GRANTEE, mode: "read", revoked: true }));
    await revokeVaultAccess(VAULT, GRANTEE, "read");
    expect(seen[0]?.url).toBe(`https://${VAULT_HOST}/base/authz/revoke-vault`);
    expect(auth.dpopWriteAuth).toHaveBeenCalledWith("POST", seen[0]?.url);
  });
});

describe("the grantee is a vault address", () => {
  const host = "https://sam.platform.example.test";

  function refuseMessage(grantee: string): string {
    return `"${grantee}" is a vault's host, not a person. Use their vault address, for example ${host}/vault.`;
  }

  it("refuses a bare host before any request", async () => {
    const seen = stubFetch(() => jsonResponse({}));
    const message = refuseMessage(host);
    await expect(shareVault(VAULT, host, "edit")).rejects.toMatchObject({
      name: "VaultAccessError",
      status: 400,
      message,
    });
    await expect(grantVaultAccess(VAULT, host, "write")).rejects.toMatchObject({
      name: "VaultAccessError",
      status: 400,
      message,
    });
    expect(seen).toHaveLength(0);
  });

  it("refuses a host whose path is only /", async () => {
    const grantee = `${host}/`;
    const seen = stubFetch(() => jsonResponse({}));
    const message = refuseMessage(grantee);
    await expect(shareVault(VAULT, grantee, "view")).rejects.toMatchObject({
      name: "VaultAccessError",
      status: 400,
      message,
    });
    await expect(grantVaultAccess(VAULT, grantee, "read")).rejects.toMatchObject({
      name: "VaultAccessError",
      status: 400,
      message,
    });
    expect(seen).toHaveLength(0);
  });

  it.each(["/vault", "/base"])("accepts a vault address %s and sends the grant", async (path) => {
    const grantee = `${host}${path}`;
    const seen = stubFetch((url) => {
      if (url.includes("/base/consent/vault-acl")) {
        return jsonResponse({ acl: [{ principal: grantee, levels: ["read", "write"] }] });
      }
      return jsonResponse({ vault: VAULT, grantee, mode: "write", granted: true }, 201);
    });
    await expect(shareVault(VAULT, grantee, "edit")).resolves.toBeUndefined();
    await grantVaultAccess(VAULT, grantee, "read");
    const grants = seen.filter((s) => new URL(s.url).pathname === "/base/authz/grant-vault");
    expect(grants.map((s) => bodyOf(s).grantee)).toEqual([grantee, grantee]);
  });

  it("still sends a revoke for a bare host, so an old grant can be removed", async () => {
    const seen = stubFetch(() => jsonResponse({ vault: VAULT, grantee: host, mode: "write", revoked: true }));
    await revokeVaultAccess(VAULT, host, "write");
    expect(seen).toHaveLength(1);
    expect(bodyOf(seen[0]!).grantee).toBe(host);
    expect(new URL(seen[0]!.url).pathname).toBe("/base/authz/revoke-vault");
  });

  it("still sends an unshare for a bare host", async () => {
    const seen = stubFetch(() => jsonResponse({ revoked: true }));
    await unshareVault(VAULT, host);
    expect(seen).toHaveLength(3);
    expect(seen.map((s) => bodyOf(s).grantee)).toEqual([host, host, host]);
  });

  it("throws when the platform echoes an unresolved grantee unchanged", async () => {
    const grantee = `${host}/i`;
    stubFetch((url) => {
      if (url.includes("/base/consent/vault-acl")) {
        return jsonResponse({ acl: [{ principal: grantee, levels: ["read", "write"] }] });
      }
      return jsonResponse({ vault: VAULT, grantee, mode: "write", granted: true }, 201);
    });
    await expect(shareVault(VAULT, grantee, "edit")).rejects.toMatchObject({
      name: "VaultAccessError",
      status: 400,
      message: `The platform did not resolve "${grantee}" to a person, so the grant would reach no one.`,
    });
  });

  it.each(["/base/p/sam", "/base/g/team"])("accepts an echoed opaque key %s", async (path) => {
    const grantee = `https://id.platform.example.test${path}`;
    stubFetch((url) => {
      if (url.includes("/base/consent/vault-acl")) {
        return jsonResponse({ acl: [{ principal: grantee, levels: ["read", "write"] }] });
      }
      return jsonResponse({ vault: VAULT, grantee, mode: "write", granted: true }, 201);
    });
    await expect(shareVault(VAULT, grantee, "edit")).resolves.toBeUndefined();
  });
});
