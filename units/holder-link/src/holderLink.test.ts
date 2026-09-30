import { describe, expect, it } from "vitest";
import { handoffReadableAtHolder } from "./holderLink";

const HOLDER = "https://holder.example.test/vault";

describe("handoffReadableAtHolder", () => {
  it("allows a bare id, including one with spaces, and does not need a holder", () => {
    expect(handoffReadableAtHolder("abc", null)).toBe(true);
    expect(handoffReadableAtHolder("  not a url  ", null)).toBe(true);
  });

  it("refuses a blank, a colon, or a slash in a non-address", () => {
    expect(handoffReadableAtHolder("   ", HOLDER)).toBe(false);
    expect(handoffReadableAtHolder("a:b", HOLDER)).toBe(false);
    expect(handoffReadableAtHolder("a/b", HOLDER)).toBe(false);
    expect(handoffReadableAtHolder("//holder.example.test/a", HOLDER)).toBe(false);
  });

  it("allows the same host, including a different scheme, and ignores the path", () => {
    expect(
      handoffReadableAtHolder("http://holder.example.test/base/e/1", HOLDER),
    ).toBe(true);
    expect(
      handoffReadableAtHolder("HTTPS://Holder.Example.TEST/base/e/1", HOLDER),
    ).toBe(true);
  });

  it("refuses a different host, a different port, or an absolute address with no holder", () => {
    expect(handoffReadableAtHolder("https://other.example.test/base/e/1", HOLDER)).toBe(false);
    expect(
      handoffReadableAtHolder("https://holder.example.test:8443/base/e/1", HOLDER),
    ).toBe(false);
    expect(handoffReadableAtHolder("https://holder.example.test/base/e/1", null)).toBe(false);
    expect(handoffReadableAtHolder("https://holder.example.test/base/e/1", "")).toBe(false);
  });
});
