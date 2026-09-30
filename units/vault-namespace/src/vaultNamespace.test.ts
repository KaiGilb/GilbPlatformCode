import { describe, expect, it } from "vitest";
import { entityUriInVault, namespaceFromVaultEntity } from "./vaultNamespace";

describe("namespaceFromVaultEntity", () => {
  it("reads a user root and a platform root", () => {
    expect(namespaceFromVaultEntity("https://h.example/vault/e/abc")).toBe("https://h.example/vault");
    expect(namespaceFromVaultEntity("https://h.example/base/e/abc")).toBe("https://h.example/base");
    expect(namespaceFromVaultEntity("https://h.example/vault")).toBe("https://h.example/vault");
    expect(namespaceFromVaultEntity("http://h.example/base")).toBe("http://h.example/base");
  });

  it("keeps the root when a query follows the id", () => {
    expect(namespaceFromVaultEntity("https://h.example/vault/e/abc?x=1")).toBe(
      "https://h.example/vault",
    );
  });

  it("refuses a trailing slash, a short /e, a principal, and uppercase http", () => {
    expect(namespaceFromVaultEntity("https://h.example/vault/")).toBeUndefined();
    expect(namespaceFromVaultEntity("https://h.example/vault/e")).toBeUndefined();
    expect(namespaceFromVaultEntity("https://h.example/base/p/x")).toBeUndefined();
    expect(namespaceFromVaultEntity("HTTP://h.example/vault")).toBeUndefined();
    expect(namespaceFromVaultEntity("https://h.example/other")).toBeUndefined();
    expect(namespaceFromVaultEntity(" https://h.example/vault")).toBeUndefined();
  });
});

describe("entityUriInVault", () => {
  it("joins the id under the root and strips one trailing slash", () => {
    expect(entityUriInVault("https://h.example/vault", "abc")).toBe("https://h.example/vault/e/abc");
    expect(entityUriInVault("https://h.example/vault/", "abc")).toBe("https://h.example/vault/e/abc");
    expect(entityUriInVault("https://h.example/vault//", "abc")).toBe(
      "https://h.example/vault//e/abc",
    );
    expect(entityUriInVault("https://h.example/vault", "")).toBe("https://h.example/vault/e/");
    expect(entityUriInVault("https://h.example/vault", "a b")).toBe("https://h.example/vault/e/a b");
  });
});
