import { describe, expect, it } from "vitest";
import { canonicalHtu, proofHtu } from "./requestHtu";

describe("canonicalHtu", () => {
  it("drops the query, the fragment, and the user info, and keeps http", () => {
    expect(canonicalHtu("https://user:pass@example.test:8443/a/b?q=1#h")).toBe(
      "https://example.test:8443/a/b",
    );
    expect(canonicalHtu("http://example.test")).toBe("http://example.test/");
  });

  it("throws when the address cannot be parsed", () => {
    expect(() => canonicalHtu("not a url")).toThrow();
  });
});

describe("proofHtu", () => {
  it("forces https unless an explicit origin is passed", () => {
    expect(proofHtu("http://example.test:8787/lws/x?q=1#h")).toBe(
      "https://example.test:8787/lws/x",
    );
    expect(proofHtu("http://example.test:8787/lws/x?q=1", "http://override.test/ignored?z=1")).toBe(
      "http://override.test/lws/x",
    );
    expect(proofHtu("https://example.test/a", null)).toBe("https://example.test/a");
  });
});
