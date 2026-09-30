import { describe, expect, it } from "vitest";
import { VAULT_ID_RE, principalGranteeProblem, vaultIdProblem } from "./vaultAddress";

describe("vaultIdProblem", () => {
  it("accepts a host ending in /base or /vault, with an optional port, and trims", () => {
    expect(vaultIdProblem("https://name.example.test/vault")).toBeNull();
    expect(vaultIdProblem("  https://name.example.test/base  ")).toBeNull();
    expect(vaultIdProblem("https://name.example.test:8787/base")).toBeNull();
    expect(VAULT_ID_RE.test("https://name.example.test/VAULT")).toBe(true);
  });

  it("rejects an empty value, a trailing slash, a record, and a non-https scheme", () => {
    expect(vaultIdProblem("")).toBe("Enter a vault address.");
    expect(vaultIdProblem("   ")).toBe("Enter a vault address.");
    expect(vaultIdProblem("https://name.example.test/vault/")).not.toBeNull();
    expect(vaultIdProblem("https://name.example.test/base/e/abc")).toBe(
      "A vault address looks like https://<host>/vault — nothing after it. Platform vaults end in /base instead.",
    );
    expect(vaultIdProblem("name.example.test/vault")).toBe(
      "A vault address must start with https:// and end in /vault (or /base for a platform vault).",
    );
  });

  it("names the same host's /vault when a WebID is pasted", () => {
    expect(vaultIdProblem("https://name.example.test/i")).toBe(
      "That is a WebID, not a vault. Use the vault itself — e.g. https://name.example.test/vault",
    );
    expect(vaultIdProblem("https://name.example.test/i/")).toContain("https://name.example.test/vault");
  });

  it("rejects a principal and does not call it a vault", () => {
    expect(vaultIdProblem("https://name.example.test/base/p/8b0d8f48")).toBe(
      "That is a principal (a person), not a vault. A reach edge is granted VAULT → VAULT; use the vault address itself — nothing after /vault.",
    );
    expect(vaultIdProblem("https://name.example.test/vault/p/8b0d8f48")).toContain("principal");
  });
});

describe("principalGranteeProblem", () => {
  it("accepts any https address and rejects empty or non-https", () => {
    expect(principalGranteeProblem("https://not-a-vault")).toBeNull();
    expect(principalGranteeProblem("")).toBe("Enter a WebID, principal, or vault address.");
    expect(principalGranteeProblem("name")).toBe(
      "Use a full https:// vault address — e.g. https://<host>/vault.",
    );
  });

  it("uses the caller's example and does not invent a host", () => {
    expect(principalGranteeProblem("name", "https://desk.example.test/vault")).toBe(
      "Use a full https:// vault address — e.g. https://desk.example.test/vault.",
    );
  });
});
