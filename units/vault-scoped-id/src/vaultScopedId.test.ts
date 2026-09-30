import { describe, expect, it } from "vitest";
import { vaultIdFromVaultScopedUrl } from "./vaultScopedId";

describe("vaultIdFromVaultScopedUrl", () => {
  it("reads the id only when the slash after it is there", () => {
    expect(vaultIdFromVaultScopedUrl("https://example.test/lws/vault/abc/records")).toBe("abc");
    expect(vaultIdFromVaultScopedUrl("https://example.test/lws/vault/abc")).toBeNull();
    expect(vaultIdFromVaultScopedUrl("https://example.test/lws/vault/abc/?x=1")).toBe("abc");
    expect(vaultIdFromVaultScopedUrl("https://example.test/lws/vault/abc#x")).toBeNull();
    expect(vaultIdFromVaultScopedUrl("https://example.test/LWS/vault/abc/")).toBeNull();
    expect(vaultIdFromVaultScopedUrl("https://example.test/lws/vaults/abc/")).toBeNull();
  });

  it("decodes once, and a broken escape is null", () => {
    expect(vaultIdFromVaultScopedUrl("https://example.test/lws/vault/a%20b/")).toBe("a b");
    expect(vaultIdFromVaultScopedUrl("https://example.test/lws/vault/a%2Fb/")).toBe("a/b");
    expect(vaultIdFromVaultScopedUrl("https://example.test/lws/vault/a%ZZ/")).toBeNull();
    expect(vaultIdFromVaultScopedUrl("https://example.test/lws/vault/AbC/")).toBe("AbC");
  });
});
