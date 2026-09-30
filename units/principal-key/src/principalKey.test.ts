import { describe, expect, it } from "vitest";
import {
  decodePrincipalKey,
  encodePrincipalKey,
  friendlyCardUrl,
  opaqueCardPath,
  parseConnectTarget,
  vaultHostCardAlias,
} from "./principalKey";

const PRINCIPAL = "https://person.example.test/base/p/abc";

describe("encodePrincipalKey / decodePrincipalKey", () => {
  it("round-trips an address, including a non-ascii path", () => {
    const withMark = "https://person.example.test/\u00e4";
    expect(decodePrincipalKey(encodePrincipalKey(PRINCIPAL))).toBe(PRINCIPAL);
    expect(decodePrincipalKey(encodePrincipalKey(withMark))).toBe(withMark);
  });

  it("does not trim on the way in, and does trim on the way out", () => {
    const padded = `  ${PRINCIPAL}  `;
    expect(decodePrincipalKey(encodePrincipalKey(padded))).toBe(PRINCIPAL);
    expect(encodePrincipalKey(padded)).not.toBe(encodePrincipalKey(PRINCIPAL));
  });

  it("rejects a key that is not an http(s) address, and the check is case-sensitive", () => {
    expect(decodePrincipalKey("not-valid!!!")).toBeNull();
    expect(decodePrincipalKey(encodePrincipalKey("not-a-url"))).toBeNull();
    expect(decodePrincipalKey(encodePrincipalKey("Https://person.example.test/i"))).toBeNull();
    expect(decodePrincipalKey("")).toBeNull();
  });
});

describe("opaqueCardPath", () => {
  it("joins the base path and does not add an origin", () => {
    const key = encodePrincipalKey(PRINCIPAL);
    expect(opaqueCardPath("/mynet/", PRINCIPAL)).toBe(`/mynet/card/${key}`);
    expect(opaqueCardPath("/", PRINCIPAL)).toBe(`/card/${key}`);
    expect(opaqueCardPath("", PRINCIPAL)).toBe(`/card/${key}`);
  });
});

describe("friendlyCardUrl", () => {
  it("maps the four vault-host paths to /card and keeps the port", () => {
    expect(friendlyCardUrl("https://person.example.test/i")).toBe(
      "https://person.example.test/card",
    );
    expect(friendlyCardUrl("https://person.example.test/i/")).toBe(
      "https://person.example.test/card",
    );
    expect(friendlyCardUrl("https://person.example.test/base")).toBe(
      "https://person.example.test/card",
    );
    expect(friendlyCardUrl("https://person.example.test/vault/")).toBe(
      "https://person.example.test/card",
    );
    expect(friendlyCardUrl("http://person.example.test:8443/card")).toBe(
      "http://person.example.test:8443/card",
    );
  });

  it("drops the query and the fragment", () => {
    expect(friendlyCardUrl("https://person.example.test/vault?x=1#h")).toBe(
      "https://person.example.test/card",
    );
  });

  it("is null for a person key, a root, a connect path, and a longer vault path", () => {
    expect(friendlyCardUrl("https://id.example.test/base/p/abc")).toBeNull();
    expect(friendlyCardUrl("https://person.example.test/")).toBeNull();
    expect(friendlyCardUrl("https://person.example.test/connect")).toBeNull();
    expect(friendlyCardUrl("https://person.example.test/vault/e/abc")).toBeNull();
    expect(friendlyCardUrl("https://person.example.test/I")).toBeNull();
    expect(friendlyCardUrl(null)).toBeNull();
    expect(friendlyCardUrl(undefined)).toBeNull();
    expect(friendlyCardUrl("")).toBeNull();
    expect(friendlyCardUrl("not-a-url")).toBeNull();
  });
});

describe("vaultHostCardAlias", () => {
  it("returns the first matching candidate, not the card address", () => {
    expect(
      vaultHostCardAlias(
        "https://id.example.test/base/p/abc",
        "https://person.example.test/i/",
        "https://other.example.test/base",
      ),
    ).toBe("https://person.example.test/i/");
  });

  it("returns null when nothing matches, and does not compose an address", () => {
    expect(vaultHostCardAlias("https://id.example.test/base/p/abc", null, undefined, "")).toBeNull();
    expect(vaultHostCardAlias()).toBeNull();
  });
});

describe("parseConnectTarget", () => {
  it("keeps a trimmed /i or /base/p/ address, including the query", () => {
    expect(parseConnectTarget("  https://person.example.test/i?x=1  ")).toBe(
      "https://person.example.test/i?x=1",
    );
    expect(parseConnectTarget("https://id.example.test/base/p/abc")).toBe(
      "https://id.example.test/base/p/abc",
    );
    expect(parseConnectTarget("https://person.example.test/card/i")).toBe(
      "https://person.example.test/card/i",
    );
  });

  it("accepts an opaque key and rejects a vault root and a blank", () => {
    expect(parseConnectTarget(encodePrincipalKey(PRINCIPAL))).toBe(PRINCIPAL);
    expect(parseConnectTarget("https://person.example.test/vault")).toBeNull();
    expect(parseConnectTarget("   ")).toBeNull();
    expect(parseConnectTarget("person.example.test/i")).toBeNull();
  });
});
