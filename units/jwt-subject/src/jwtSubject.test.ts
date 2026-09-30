import { describe, expect, it } from "vitest";
import { subFromJwt } from "./jwtSubject";

function token(payload: unknown): string {
  const json = JSON.stringify(payload);
  const seg = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `hdr.${seg}.sig`;
}

describe("subFromJwt", () => {
  it("returns a string sub and does not trim it", () => {
    expect(subFromJwt(token({ sub: "  a@b.example  " }))).toBe("  a@b.example  ");
  });

  it("returns undefined when sub is missing or not a string", () => {
    expect(subFromJwt(token({}))).toBeUndefined();
    expect(subFromJwt(token({ sub: 1 }))).toBeUndefined();
    expect(subFromJwt(token({ sub: null }))).toBeUndefined();
  });

  it("returns undefined for a broken token and ignores the signature segment", () => {
    expect(subFromJwt("")).toBeUndefined();
    expect(subFromJwt("only-one")).toBeUndefined();
    expect(subFromJwt("a.!!!.c")).toBeUndefined();
    expect(subFromJwt(token({ sub: "ada@example.test" }) + "tampered")).toBe("ada@example.test");
  });
});
