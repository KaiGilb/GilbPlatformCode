// New tests: `isAbsoluteIri`, `locate`, `originHostMismatch` and `retryAfterMs` of platform.ts, pinned. No clock: `retryAfterMs` takes `now`.
import { describe, expect, it } from "vitest";
import { PlatformError, isAbsoluteIri, locate, originHostMismatch, retryAfterMs, type PlatformClient } from "./platform";

const noFetch: PlatformClient["fetch"] = async () => new Response("{}");
const at = (origin: string): PlatformClient => ({ origin, fetch: noFetch });

describe("isAbsoluteIri", () => {
  it("is true for an absolute http or https IRI with a host and a path", () => {
    expect(isAbsoluteIri("https://h.example.test/base/e/abc")).toBe(true);
    expect(isAbsoluteIri("http://h.example.test:8080/vault/e/abc?x=1#y")).toBe(true);
  });
  it("is false for a relative address, another scheme, a host with no path, whitespace, and anything that is not a string", () => {
    expect(isAbsoluteIri("/base/e/abc")).toBe(false);
    expect(isAbsoluteIri("ftp://h.example.test/x")).toBe(false);
    expect(isAbsoluteIri("https://h.example.test")).toBe(false);
    expect(isAbsoluteIri("https://h.example.test/a b")).toBe(false);
    expect(isAbsoluteIri("https:///x")).toBe(false);
    expect(isAbsoluteIri("")).toBe(false);
    expect(isAbsoluteIri(undefined)).toBe(false);
    expect(isAbsoluteIri(42)).toBe(false);
    expect(isAbsoluteIri(null)).toBe(false);
  });
});

describe("locate", () => {
  it("sends an IRI's own path and query to the platform's origin, dropping the fragment and a trailing slash of the origin", () => {
    expect(locate(at("https://rig.example.test/"), "https://other.example.test/vault/e/abc?x=1&y=2#frag")).toBe("https://rig.example.test/vault/e/abc?x=1&y=2");
    expect(locate(at("https://rig.example.test"), "https://other.example.test/base/e/abc")).toBe("https://rig.example.test/base/e/abc");
  });
  it("throws a PlatformError of status 0, carrying the text, when the IRI is not an address", () => {
    let thrown: unknown;
    try {
      locate(at("https://rig.example.test"), "not an address");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(PlatformError);
    const e = thrown as PlatformError;
    expect(e.status).toBe(0);
    expect(e.url).toBe("not an address");
    expect(e.message).toContain('"not an address" is not an address');
  });
});

describe("originHostMismatch", () => {
  it("is null when the origin's host, port included, is the vault's host", () => {
    expect(originHostMismatch(at("https://holder.example.test"), "https://holder.example.test/vault")).toBeNull();
    expect(originHostMismatch(at("http://localhost:3101"), "http://localhost:3101/vault")).toBeNull();
  });
  it("says which host the vault is written at, and which the client has, when they differ", () => {
    const m = originHostMismatch(at("https://rig.example.test"), "https://holder.example.test/vault");
    expect(m).toContain("holder.example.test");
    expect(m).toContain("rig.example.test");
    expect(m).toContain("Give the client the vault's own origin");
  });
  it("tells a different port apart", () => {
    expect(originHostMismatch(at("http://localhost:3102"), "http://localhost:3101/vault")).not.toBeNull();
  });
  it("says the origin is not an address when it cannot be read", () => {
    expect(originHostMismatch(at("not an origin"), "https://holder.example.test/vault")).toContain("is not an address");
  });
});

describe("retryAfterMs", () => {
  const NOW = Date.parse("2026-01-01T00:00:00Z");
  const h = (v?: string) => new Headers(v === undefined ? {} : { "retry-after": v });
  it("reads whole and fractional seconds as milliseconds", () => {
    expect(retryAfterMs(h("3"), NOW)).toBe(3000);
    expect(retryAfterMs(h(" 1.5 "), NOW)).toBe(1500);
    expect(retryAfterMs(h("0"), NOW)).toBe(0);
  });
  it("reads an HTTP date as the milliseconds from now to it, and never below 0", () => {
    expect(retryAfterMs(h("Thu, 01 Jan 2026 00:00:10 GMT"), NOW)).toBe(10_000);
    expect(retryAfterMs(h("Wed, 31 Dec 2025 23:00:00 GMT"), NOW)).toBe(0);
    expect(retryAfterMs(h("-5"), NOW)).toBe(0); // not a count of seconds: read as a date long past
  });
  it("is null when the header is absent, empty, unreadable, or there are no headers", () => {
    expect(retryAfterMs(h(), NOW)).toBeNull();
    expect(retryAfterMs(h("  "), NOW)).toBeNull();
    expect(retryAfterMs(h("soon"), NOW)).toBeNull();
    expect(retryAfterMs(undefined, NOW)).toBeNull();
  });
});
