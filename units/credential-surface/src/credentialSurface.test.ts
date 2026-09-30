import { describe, expect, it } from "vitest";
import { isCredentialSurfaceError } from "./credentialSurface";

describe("isCredentialSurfaceError", () => {
  it("accepts the five names and rejects the neighbours", () => {
    expect(isCredentialSurfaceError({ name: "NotSignedInError" })).toBe(true);
    expect(isCredentialSurfaceError({ name: "CredentialRefusedError" })).toBe(true);
    expect(isCredentialSurfaceError({ name: "CredentialExpiredError" })).toBe(true);
    expect(isCredentialSurfaceError({ name: "PublicCardViewerMismatchError" })).toBe(true);
    expect(isCredentialSurfaceError({ name: "OriginNotAllowedError" })).toBe(true);
    expect(isCredentialSurfaceError({ name: "PublicCardError" })).toBe(false);
    expect(isCredentialSurfaceError({ name: " notsignedinerror " })).toBe(false);
    expect(isCredentialSurfaceError(null)).toBe(false);
    expect(isCredentialSurfaceError("NotSignedInError")).toBe(false);
    expect(isCredentialSurfaceError({})).toBe(false);
    expect(isCredentialSurfaceError({ name: 1 })).toBe(false);
  });
});
