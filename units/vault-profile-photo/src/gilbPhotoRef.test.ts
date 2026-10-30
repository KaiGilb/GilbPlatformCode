// The two parsers are the private package's, copied as they are. Added tests: the cases on which `photo-ref` is NOT equal to them (a false
// friend, listed in the README), and the shapes the app's functions accept.
import { describe, expect, it } from "vitest";
import { VAULT_PATH_SEGMENTS, VAULT_SEGMENT_PATTERN, entityIdTail, fileIdFromPhotoRef, isMediatedPhotoRef } from "./gilbPhotoRef";

describe("a malformed percent-encoding THROWS (as the app does), where photo-ref answers null", () => {
  it.each(["/files/%", "/files/%E0%A4%A", "https://h.example.test/vault/e/%E0%A4%A", "https://h.example.test/base/e/%zz"])("fileIdFromPhotoRef(%s)", (ref) => {
    expect(() => fileIdFromPhotoRef(ref)).toThrow(URIError);
  });
  it.each(["https://h.example.test/vault/e/%E0%A4%A", "https://h.example.test/base/e/%zz", "https://h.example.test/lws/r/%"])("entityIdTail(%s)", (ref) => {
    expect(() => entityIdTail(ref)).toThrow(URIError);
  });
});

describe("fileIdFromPhotoRef", () => {
  it.each([
    ["/files/abc123", "abc123"],
    ["https://h.example.test/files/abc123?x=1", "abc123"],
    ["https://h.example.test/base/e/abc123", "abc123"],
    ["https://h.example.test/vault/e/ab%20c", "ab c"],
    ["abcdefgh", "abcdefgh"],
    ["  /files/abc123  ", "abc123"],
  ])("%s", (ref, id) => {
    expect(fileIdFromPhotoRef(ref)).toBe(id);
  });
  it.each(["", "   ", "short", "/base/connect/profile-photo?principal=x", "https://h.example.test/base"])("names no file: %j", (ref) => {
    expect(fileIdFromPhotoRef(ref)).toBeNull();
  });
});

describe("entityIdTail", () => {
  it.each([
    ["https://h.example.test/lws/r/abcdefgh1234", "abcdefgh1234"],
    ["https://h.example.test/vault/e/abc", "abc"],
    ["abcdefgh1234", "abcdefgh1234"],
    ["https://h.example.test/x/abcdefgh1234", "abcdefgh1234"],
    ["  ", ""],
    ["https://h.example.test/x/short", ""],
  ])("%s", (ref, tail) => {
    expect(entityIdTail(ref)).toBe(tail);
  });
});

describe("the constants and the mediated test", () => {
  it("lists the two segments", () => {
    expect([...VAULT_PATH_SEGMENTS]).toEqual(["base", "vault"]);
    expect(VAULT_SEGMENT_PATTERN).toBe("(?:base|vault)");
  });
  it("recognises the mediated route and nothing else", () => {
    expect(isMediatedPhotoRef("https://h.example.test/base/connect/profile-photo?principal=x")).toBe(true);
    expect(isMediatedPhotoRef("/files/abc")).toBe(false);
  });
});
