import { describe, expect, it } from "vitest";
import { isMediatedProfilePhotoUrl, isReadyPhotoSrc, normalizePhotoLocation } from "./photoLocation";

describe("isReadyPhotoSrc", () => {
  it("accepts only blob and data prefixes", () => {
    expect(isReadyPhotoSrc(undefined)).toBe(false);
    expect(isReadyPhotoSrc("  blob:abc")).toBe(true);
    expect(isReadyPhotoSrc("data:image/png;base64,xx")).toBe(true);
    expect(isReadyPhotoSrc("BLOB:abc")).toBe(false);
    expect(isReadyPhotoSrc("/files/abc")).toBe(false);
  });
});

describe("isMediatedProfilePhotoUrl", () => {
  it("matches the profile-photo path and keeps a query, not a slash", () => {
    expect(isMediatedProfilePhotoUrl(" https://h.example/base/connect/profile-photo ")).toBe(true);
    expect(isMediatedProfilePhotoUrl("https://h.example/base/connect/profile-photo?p=1")).toBe(true);
    expect(isMediatedProfilePhotoUrl("https://h.example/base/connect/profile-photo/")).toBe(false);
    expect(isMediatedProfilePhotoUrl("https://h.example/base/connect/profile-photo/extra")).toBe(
      false,
    );
    expect(isMediatedProfilePhotoUrl("https://h.example/BASE/connect/profile-photo")).toBe(false);
  });
});

describe("normalizePhotoLocation", () => {
  it("leaves a mediated address and a files path alone", () => {
    expect(normalizePhotoLocation("  ")).toBe("");
    expect(normalizePhotoLocation("https://h.example/base/connect/profile-photo?p=1")).toBe(
      "https://h.example/base/connect/profile-photo?p=1",
    );
    expect(normalizePhotoLocation(" /files/abc ")).toBe("/files/abc");
  });

  it("drops the query on an absolute files URL and rewrites an entity", () => {
    expect(normalizePhotoLocation("https://h.example/files/abc?x=1")).toBe("/files/abc");
    expect(normalizePhotoLocation("HTTPS://h.example/files/abc/")).toBe("/files/abc/");
    expect(normalizePhotoLocation("https://h.example/base/e/abc")).toBe("/files/abc");
    expect(normalizePhotoLocation("https://h.example/vault/e/abc/")).toBe("/files/abc");
    expect(normalizePhotoLocation("note/e/abc")).toBe("/files/abc");
    expect(normalizePhotoLocation("https://h.example/base/e/abc?x=1")).toBe(
      "https://h.example/base/e/abc?x=1",
    );
    expect(normalizePhotoLocation("https://h.example/files/e/abc")).toBe("/files/e/abc");
    expect(normalizePhotoLocation("just-a-name")).toBe("just-a-name");
  });
});
