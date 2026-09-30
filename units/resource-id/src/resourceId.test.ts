import { describe, expect, it } from "vitest";
import { idFromResourceUri } from "./resourceId";

describe("idFromResourceUri", () => {
  it("reads the three shapes", () => {
    expect(idFromResourceUri("https://h.example/lws/r/abc")).toBe("abc");
    expect(idFromResourceUri("https://h.example/base/e/abc")).toBe("abc");
    expect(idFromResourceUri("https://h.example/vault/e/abc")).toBe("abc");
    expect(idFromResourceUri("base:e/abc")).toBe("abc");
  });

  it("returns the whole string when the shape is not exact", () => {
    expect(idFromResourceUri("https://h.example/base/e/abc?x=1")).toBe(
      "https://h.example/base/e/abc?x=1",
    );
    expect(idFromResourceUri("base:e/abc/extra")).toBe("base:e/abc/extra");
    expect(idFromResourceUri("BASE:e/abc")).toBe("BASE:e/abc");
    expect(idFromResourceUri("not-an-address")).toBe("not-an-address");
    expect(idFromResourceUri("https://h.example/base/e/a%20b")).toBe("a%20b");
  });
});
