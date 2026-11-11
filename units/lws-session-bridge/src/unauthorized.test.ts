import { describe, expect, it, vi } from "vitest";
import { errorForUnauthorized } from "./unauthorized";
import { NotSignedInError, RequestRefusedError } from "./errors";

const body = (message?: string) => ({ text: async () => (message === undefined ? "" : JSON.stringify({ error: "Unauthorized", message })) });

describe("errorForUnauthorized", () => {
  it("a DPoP proof fault keeps the token and says what the platform said", async () => {
    for (const m of [
      "DPoP proof htu does not match the request URI",
      "DPoP proof htm does not match the request method",
      "DPoP proof iat is outside the freshness window",
      "DPoP proof has already been used (replay rejected)",
      "DPoP proof ath does not match the presented access token",
      "DPoP proof has no jti (replay protection requires it)",
    ]) {
      const invalidate = vi.fn();
      const e = await errorForUnauthorized(body(m), invalidate);
      expect(e).toBeInstanceOf(RequestRefusedError);
      expect(e.message).toBe(`The platform refused this request: ${m}`);
      expect(invalidate).not.toHaveBeenCalled();
    }
  });
  it("an invalid or expired token drops the token and is NotSignedInError carrying the sentence", async () => {
    const invalidate = vi.fn();
    const e = await errorForUnauthorized(body("Invalid access token: \"exp\" claim timestamp check failed"), invalidate);
    expect(e).toBeInstanceOf(NotSignedInError);
    expect((e as NotSignedInError).platformSentence).toMatch(/^Invalid access token/);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
  it("the key-mismatch sentence means sign in again (the token is bound to another key)", async () => {
    const invalidate = vi.fn();
    const e = await errorForUnauthorized(body("DPoP proof key does not match the token's bound key (cnf.jkt)"), invalidate);
    expect(e).toBeInstanceOf(NotSignedInError);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
  it("no body, or a body that is not JSON, is today's behaviour", async () => {
    for (const res of [body(undefined), { text: async () => "<html>" }, { text: async () => { throw new Error("gone"); } }]) {
      const invalidate = vi.fn();
      const e = await errorForUnauthorized(res, invalidate);
      expect(e).toBeInstanceOf(NotSignedInError);
      expect((e as NotSignedInError).platformSentence).toBeUndefined();
      expect(invalidate).toHaveBeenCalledTimes(1);
    }
  });
});
