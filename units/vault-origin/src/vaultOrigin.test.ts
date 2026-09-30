import { describe, expect, it } from "vitest";
import { vaultOriginOf } from "./vaultOrigin";

const APP = "http://app.example.test";

describe("vaultOriginOf", () => {
  it("keeps the caller origin on the same host and uses the address origin otherwise", () => {
    expect(vaultOriginOf(null, APP)).toBe(APP);
    expect(vaultOriginOf("", APP)).toBe(APP);
    expect(vaultOriginOf("not a url", APP)).toBe(APP);
    expect(vaultOriginOf("javascript:alert(1)", APP)).toBe(APP);
    expect(vaultOriginOf("http://app.example.test/base/e/a", APP)).toBe(APP);
    expect(vaultOriginOf("https://app.example.test/base/e/a", APP)).toBe(APP);
    expect(vaultOriginOf("https://APP.example.test/base/e/a", APP)).toBe(APP);
    expect(vaultOriginOf("https://other.example.test/base/e/a", APP)).toBe(
      "https://other.example.test",
    );
    expect(vaultOriginOf("https://other.example.test:443/base/e/a", APP)).toBe(
      "https://other.example.test",
    );
    expect(vaultOriginOf("https://other.example.test:444/base/e/a", APP)).toBe(
      "https://other.example.test:444",
    );
    expect(vaultOriginOf("https://app.example.test:8443/base/e/a", APP)).toBe(
      "https://app.example.test:8443",
    );
    expect(vaultOriginOf("https://other.example.test/a", "not a base")).toBe("not a base");
  });
});