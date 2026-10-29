// The copy of gilb-photo's fileIdFromPhotoRef: its reading of each shape, and that it throws on a malformed encoding (photo-ref answers null).
import { describe, expect, it } from "vitest";
import { VAULT_PATH_SEGMENTS, VAULT_SEGMENT_PATTERN, fileIdFromPhotoRef, isMediatedPhotoRef } from "./fileIdFromPhotoRef";

describe("fileIdFromPhotoRef", () => {
  it.each([
    ["a /files/ path", "/files/abc", "abc"],
    ["a /files/ address", "https://v.example.test/files/abc?x=1#f", "abc"],
    ["/files/ in any case", "https://v.example.test/FILES/Abc", "Abc"],
    ["a /base/e/ address", "https://v.example.test/base/e/logo0001", "logo0001"],
    ["a /vault/e/ address", "https://v.example.test/vault/e/logo0002", "logo0002"],
    ["a percent-encoded id", "/files/a%20b", "a b"],
    ["a percent-encoded id in an entity address", "https://v.example.test/vault/e/a%2Fb", "a/b"],
    ["blanks around it", "  /files/abc  ", "abc"],
    ["a bare id of eight characters", "abcdefgh", "abcdefgh"],
    ["a bare id with blanks", "\tabcdefgh\n", "abcdefgh"],
    ["a bare id is not decoded", "abc%20defgh", "abc%20defgh"],
  ])("%s", (_n, ref, id) => {
    expect(fileIdFromPhotoRef(ref)).toBe(id);
  });
  it.each([
    ["empty", ""],
    ["blanks", "   "],
    ["a bare id of seven characters", "abcdefg"],
    ["a bare word with a colon", "a:bcdefghi"],
    ["a word with a slash and no entity", "a/bcdefghi"],
    ["a segment that is neither base nor vault", "https://v.example.test/note/e/abc"],
    ["the mediated route", "https://v.example.test/base/connect/profile-photo"],
    ["the mediated route in another case, with a query", "/base/connect/Profile-Photo?x=1"],
  ])("%s names no file", (_n, ref) => {
    expect(fileIdFromPhotoRef(ref)).toBeNull();
  });
  it.each(["/files/%", "/files/%E0%A4%A", "https://v.example.test/base/e/a%zz", "https://v.example.test/vault/e/%E0%A4%A"])("a malformed percent-encoding throws URIError: %s", (ref) => {
    expect(() => fileIdFromPhotoRef(ref)).toThrow(URIError);
  });
  it("a /files/ path wins over an entity path in the same value", () => {
    expect(fileIdFromPhotoRef("https://v.example.test/base/e/ent0001/files/file0001")).toBe("file0001");
  });
  it("the mediated route names no file even when it carries a path that would parse as one", () => {
    expect(fileIdFromPhotoRef("https://v.example.test/base/connect/profile-photo/files/abc")).toBeNull();
    expect(fileIdFromPhotoRef("https://v.example.test/base/connect/profile-photo?next=/vault/e/abc")).toBeNull();
  });
  it("isMediatedPhotoRef is case-insensitive and needs a word boundary", () => {
    expect(isMediatedPhotoRef("/base/connect/profile-photo")).toBe(true);
    expect(isMediatedPhotoRef("/BASE/CONNECT/PROFILE-PHOTO?x=1")).toBe(true);
    expect(isMediatedPhotoRef("/base/connect/profile-photos")).toBe(false);
    expect(isMediatedPhotoRef("/connect/profile-photo")).toBe(false);
  });
  it("the segment list", () => {
    expect([...VAULT_PATH_SEGMENTS]).toEqual(["base", "vault"]);
    expect(VAULT_SEGMENT_PATTERN).toBe("(?:base|vault)");
  });
});
