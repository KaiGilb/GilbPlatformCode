import { describe, expect, it } from "vitest";
import { NotSignedInError, OriginNotAllowedError, RequestRefusedError } from "./errors";

describe("NotSignedInError", () => {
  it("is an Error named NotSignedInError with the sentence a person reads", () => {
    const e = new NotSignedInError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("NotSignedInError");
    expect(e.message).toBe("Your sign-in needs refreshing — sign in again, then try once more");
  });
  it("names the live product and no retired one", () => {
    expect(new NotSignedInError().message).not.toMatch(/\bBase\b/);
  });
});

describe("OriginNotAllowedError", () => {
  it("is an Error named OriginNotAllowedError whose message carries the detail it was given", () => {
    const e = new OriginNotAllowedError("origin not allowed");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("OriginNotAllowedError");
    expect(e.message.endsWith(": origin not allowed")).toBe(true);
  });
  // deadNameInAppCopy.c2045.test.ts, "one red panel, ONE product name" (the two assertions on the real constructor).
  it("the origin refusal a person reads names the live product", () => {
    expect(new OriginNotAllowedError("origin https://evil.example").message).toContain("GilbPlatform");
  });
  it("…and still names the env var verbatim, because that is configuration, not branding", () => {
    expect(new OriginNotAllowedError("x").message).toContain("FIRST_PARTY_ORIGINS");
  });
  it("the two classes are distinct types", () => {
    expect(new OriginNotAllowedError("x")).not.toBeInstanceOf(NotSignedInError);
    expect(new NotSignedInError()).not.toBeInstanceOf(OriginNotAllowedError);
  });
});

describe("RequestRefusedError and the platform sentence", () => {
  it("NotSignedInError keeps its sentence and carries the platform's when given", () => {
    expect(new NotSignedInError().platformSentence).toBeUndefined();
    const e = new NotSignedInError("Invalid access token: expired");
    expect(e.platformSentence).toBe("Invalid access token: expired");
    expect(e.message).toBe("Your sign-in needs refreshing — sign in again, then try once more");
  });
  it("RequestRefusedError says the platform refused the request, with its sentence, and is not a NotSignedInError", () => {
    const e = new RequestRefusedError("DPoP proof htu does not match the request URI");
    expect(e.name).toBe("RequestRefusedError");
    expect(e.message).toBe("The platform refused this request: DPoP proof htu does not match the request URI");
    expect(e.platformSentence).toBe("DPoP proof htu does not match the request URI");
    expect(e).not.toBeInstanceOf(NotSignedInError);
  });
});
