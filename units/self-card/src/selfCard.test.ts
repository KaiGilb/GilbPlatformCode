/**
 * The derivation must land BYTE-IDENTICALLY on the address the server mints. If it does not, it
 * addresses nothing and every read 404s — silently, because a 404 here is indistinguishable from
 * "this person has no card".
 *
 * ⛔ THE EXPECTED VALUES ARE NOT COMPUTED BY THIS TEST. A test that re-derives the hash agrees with
 * the module by construction and would pass even if both were wrong together. Each literal below
 * was produced by a separate instrument, the shell's `shasum`:
 *
 *     printf '%s' 'https://vault-a.example.test/vault' | shasum -a 256 | cut -c1-24
 *     -> a93e28680b27564d50be2ed6
 *
 * ⚠ What this proves: the module computes `vsc-` + the first 24 hex of sha256(root). It does not
 * prove the server still uses that rule. Check that against a live self-card before relying on it.
 */
import { describe, expect, it } from "vitest";
import { selfCardIdForVault, selfCardEntityUri, isSelfCardId, SELF_CARD_ID_PREFIX } from "./selfCard";

/** sha256 by `shasum`, first 24 hex. Not computed here. */
const VAULT = "https://vault-a.example.test/vault";
const CARD_ID = "vsc-a93e28680b27564d50be2ed6";
const CARD_URI = "https://vault-a.example.test/vault/e/vsc-a93e28680b27564d50be2ed6";
const SYSTEM_ROOT_CARD_ID = "vsc-1b35a46be9eab5af6d0ebe9d"; // https://vault-a.example.test/base
const OTHER_VAULT_CARD_ID = "vsc-ab296099440b07f0427a1a6c"; // https://vault-b.example.test/vault

describe("selfCardIdForVault — the server's derivation, byte for byte", () => {
  it("is vsc- and the first 24 hex of sha256 of the root", async () => {
    expect(await selfCardIdForVault(VAULT)).toBe(CARD_ID);
  });

  it("builds the full entity URI in the card's OWN vault", async () => {
    expect(await selfCardEntityUri(VAULT)).toBe(CARD_URI);
  });

  // ── the fixture varies the key the assertion depends on ──
  it("a DIFFERENT vault gives a different address — the hash is load-bearing, not decoration", async () => {
    const other = await selfCardIdForVault("https://vault-b.example.test/vault");
    expect(other).toBe(OTHER_VAULT_CARD_ID);
    expect(other.startsWith(SELF_CARD_ID_PREFIX)).toBe(true);
  });

  it("🔴 /base and /vault are DIFFERENT vaults and MUST NOT collide", async () => {
    // Both root shapes are live. The server hashes the root verbatim, so a system vault and a user
    // vault on the same host are different cards. Collapsing them would serve one person's card as
    // another's.
    expect(await selfCardIdForVault("https://vault-a.example.test/base")).toBe(SYSTEM_ROOT_CARD_ID);
    expect(await selfCardIdForVault(VAULT)).toBe(CARD_ID);
  });

  it("refuses a root with a trailing slash rather than hashing or trimming it", async () => {
    // A stored root never ends in a slash. Hashing one that does would give a real-looking
    // address for a card that does not exist; trimming it would guess. Both are refused.
    await expect(selfCardIdForVault("https://vault-a.example.test/vault/")).rejects.toThrow(/trailing slash/);
    await expect(selfCardEntityUri("https://vault-a.example.test/vault/")).rejects.toThrow(/trailing slash/);
  });

  it("refuses an empty root rather than collapsing every vault onto one card", async () => {
    await expect(selfCardIdForVault("")).rejects.toThrow(/vault root/i);
    await expect(selfCardIdForVault("   ")).rejects.toThrow(/vault root/i);
  });

  it("tolerates incidental whitespace around a real root", async () => {
    expect(await selfCardIdForVault(`  ${VAULT}  `)).toBe(CARD_ID);
  });
});

describe("isSelfCardId", () => {
  it("recognises a derived address and rejects a minted record id", () => {
    expect(isSelfCardId(CARD_ID)).toBe(true);
    // A minted record id shape — not a derived address.
    expect(isSelfCardId("x7q2mk40pz9b")).toBe(false);
    expect(isSelfCardId("vsc-tooshort")).toBe(false);
    expect(isSelfCardId(CARD_ID.toUpperCase().replace("VSC-", "vsc-"))).toBe(false); // hex is lower-case
    expect(isSelfCardId(null)).toBe(false);
  });
});
