import { describe, expect, it } from "vitest";
import { VAULT_ID_RE, principalGranteeProblem, vaultAddressFromName, vaultIdProblem, vaultNameProblem } from "./vaultAddress";

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

describe("vaultNameProblem", () => {
  it("accepts a bare name, trimmed, in any case", () => {
    for (const n of ["anna", " Anna ", "my-club", "a", "a1", "x".repeat(63)]) expect(vaultNameProblem(n), n).toBeNull();
  });
  it("refuses blank, an email, and what is not one DNS label", () => {
    expect(vaultNameProblem("  ")).toBe("Enter a vault name.");
    expect(vaultNameProblem("anna@example.test")).toBe("Type their GilbPlatform vault name or address (not an email)");
    for (const n of ["-anna", "anna-", "an na", "anna.club", "anna/vault", "x".repeat(64), "ånna"]) expect(vaultNameProblem(n), n).toMatch(/^A vault name uses only/);
  });
});

describe("vaultAddressFromName", () => {
  it("composes https://<name>.<apex>/vault, lower-cased", () => {
    expect(vaultAddressFromName("anna", "platform.example.test")).toBe("https://anna.platform.example.test/vault");
    expect(vaultAddressFromName(" Anna ", "Platform.Example.Test")).toBe("https://anna.platform.example.test/vault");
    expect(vaultAddressFromName("anna", "localhost:5173")).toBe("https://anna.localhost:5173/vault");
  });
  it("the result passes vaultIdProblem", () => {
    expect(vaultIdProblem(vaultAddressFromName("my-club", "platform.example.test")!)).toBeNull();
  });
  it("is null for a name vaultNameProblem refuses", () => {
    for (const n of ["", "anna@example.test", "-x", "a b", "a.b"]) expect(vaultAddressFromName(n, "platform.example.test"), n).toBeNull();
  });
  it("is null for an apex that is not a bare host (an origin, a path, an empty string)", () => {
    for (const a of ["", "https://platform.example.test", "platform.example.test/vault", "platform example", "-x.test"]) expect(vaultAddressFromName("anna", a), a).toBeNull();
  });
});
