import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { b64url, fromB64url, opaqueId, sha256Hex, stableStringify, utf8 } from "../src/bytes";

describe("bytes", () => {
  it("sha256 matches node:crypto on empty, short, block-edge and long input", () => {
    for (const s of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "é".repeat(1000)]) {
      expect(sha256Hex(s)).toBe(createHash("sha256").update(s).digest("hex"));
    }
  });
  it("base64url round trips and carries no padding", () => {
    const bytes = Uint8Array.from([251, 255, 254, 1, 2]);
    const t = b64url(bytes);
    expect(t).not.toMatch(/[+/=]/);
    expect([...fromB64url(t)!]).toEqual([...bytes]);
    expect(fromB64url("***")).toBeNull();
  });
  it("stableStringify sorts keys at every depth", () => {
    expect(stableStringify({ b: 1, a: { d: 1, c: [2, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[2,{"y":2,"z":1}],"d":1},"b":1}');
  });
  it("opaque ids are 26 characters, distinct and Crockford-lower", () => {
    const ids = new Set(Array.from({ length: 500 }, (_, i) => opaqueId(i + 1)));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/);
    expect(utf8("é").length).toBe(2);
  });
});
