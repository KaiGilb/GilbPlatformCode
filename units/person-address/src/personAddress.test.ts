import { describe, expect, it } from "vitest";
import {
  isNamedVaultNamespaceUri,
  isPersonConnectionKey,
  isResolvedPrincipalUri,
  looksLikePersonAddress,
} from "./personAddress";

const OPAQUE = "01234567-89ab-cdef-0123-456789abcdef";

describe("person address branch", () => {
  it("treats only an exact /base path as a vault namespace", () => {
    expect(isNamedVaultNamespaceUri("https://example.test/base")).toBe(true);
    expect(isNamedVaultNamespaceUri("https://example.test/base/")).toBe(true);
    expect(isNamedVaultNamespaceUri("https://example.test/base?x=1")).toBe(true);
    expect(isNamedVaultNamespaceUri("https://example.test/vault")).toBe(false);
    expect(isNamedVaultNamespaceUri("https://example.test/BASE")).toBe(false);
    expect(isNamedVaultNamespaceUri("not a url")).toBe(false);
  });

  it("treats /base, /vault, and /base/p as already resolved, and not /i", () => {
    expect(isResolvedPrincipalUri("https://example.test/vault")).toBe(true);
    expect(isResolvedPrincipalUri("https://example.test/base")).toBe(true);
    expect(isResolvedPrincipalUri("https://example.test/base/p/Ab_1")).toBe(true);
    expect(isResolvedPrincipalUri("https://example.test/i")).toBe(false);
    expect(isResolvedPrincipalUri("https://example.test/card")).toBe(false);
  });

  it("keeps person keys to the opaque id and /i", () => {
    expect(isPersonConnectionKey("https://example.test/i")).toBe(true);
    expect(isPersonConnectionKey("https://example.test/base/p/Ab_1")).toBe(true);
    expect(isPersonConnectionKey("https://example.test/card")).toBe(false);
    expect(isPersonConnectionKey("https://example.test/vault")).toBe(false);
    expect(isPersonConnectionKey("https://example.test/base")).toBe(false);
  });

  it("sends every http address except /base to the address route", () => {
    expect(looksLikePersonAddress("https://example.test/base")).toBe(false);
    expect(looksLikePersonAddress("https://example.test/vault")).toBe(true);
    expect(looksLikePersonAddress("https://example.test/base/e/abc")).toBe(true);
    expect(looksLikePersonAddress("https://example.test/i")).toBe(true);
    expect(looksLikePersonAddress(`https://example.test/base/p/${OPAQUE}`)).toBe(true);
    expect(looksLikePersonAddress("Lars Larson")).toBe(false);
    expect(looksLikePersonAddress("")).toBe(false);
    expect(looksLikePersonAddress(`/base/p/${OPAQUE}`)).toBe(true);
    expect(looksLikePersonAddress("/base/p/short")).toBe(false);
    expect(looksLikePersonAddress("example.test/i")).toBe(true);
    expect(looksLikePersonAddress("example.test/card/")).toBe(true);
    expect(looksLikePersonAddress("example.test/i/extra")).toBe(false);
    expect(looksLikePersonAddress(`example.test/base/p/${OPAQUE}`)).toBe(true);
  });
});
