// The address half. The defect these pin is the one that blanked the picture: a parser that
// knew `/base/e/` and not `/vault/e/`, failing silently to null.
import { describe, it, expect } from "vitest";
import {
  fileIdFromPhotoRef,
  entityIdTail,
  vaultSegmentOf,
  photoRefOrigin,
  photoBytesUrl,
  isMediatedPhotoRef,
} from "./photoRef";

describe("fileIdFromPhotoRef — both vault segments, one id", () => {
  it("reads a plain file path", () => {
    expect(fileIdFromPhotoRef("/files/abc123")).toBe("abc123");
  });
  it("reads a /vault/e/ reference — the shape that used to return null", () => {
    expect(fileIdFromPhotoRef("https://vault-a.example.test/vault/e/photo-123")).toBe("photo-123");
  });
  it("reads a /base/e/ reference", () => {
    expect(fileIdFromPhotoRef("https://ontology.example.test/base/e/photo-123")).toBe("photo-123");
  });
  it("both segments yield the SAME id — the id is not the address", () => {
    expect(fileIdFromPhotoRef("https://h.example/vault/e/same")).toBe(
      fileIdFromPhotoRef("https://h.example/base/e/same"),
    );
  });
  // Discriminating negative: a green must not be buyable by matching /<anything>/e/.
  it("refuses a segment that is neither base nor vault", () => {
    expect(fileIdFromPhotoRef("https://h.example/wat/e/photo-123")).toBeNull();
  });
  it("refuses a mediated route — it names no file", () => {
    expect(fileIdFromPhotoRef("/base/connect/profile-photo?principal=x")).toBeNull();
  });
});

describe("entityIdTail — both vault segments, and the fences that were earned", () => {
  it("reads both segments identically even with a query string", () => {
    // The crutch case: a `lastIndexOf('/')` fallback cannot strip `?x=1`, so before the fix the
    // two segments disagreed here while agreeing everywhere else.
    expect(entityIdTail("https://h.example/vault/e/abc?x=1")).toBe("abc");
    expect(entityIdTail("https://h.example/base/e/abc?x=1")).toBe("abc");
  });
  it("reads an lws record URI", () => {
    expect(entityIdTail("https://h.example/lws/r/abcdefgh1234")).toBe("abcdefgh1234");
  });
  it("refuses a bare vault root on either segment", () => {
    expect(entityIdTail("https://h.example/vault")).toBe("");
    expect(entityIdTail("https://h.example/base")).toBe("");
  });
  it("refuses a WebID tail", () => {
    expect(entityIdTail("https://h.example/i")).toBe("");
  });
});

describe("vaultSegmentOf — read the segment off the URI, never assume it", () => {
  it("reads each live segment", () => {
    expect(vaultSegmentOf("https://x.example.test/vault/e/1")).toBe("/vault");
    expect(vaultSegmentOf("https://x.example.test/base/e/1")).toBe("/base");
  });
  it("falls back to /base when there is no URI to read", () => {
    expect(vaultSegmentOf(null)).toBe("/base");
    expect(vaultSegmentOf("not a uri")).toBe("/base");
  });
});

describe("photoRefOrigin / photoBytesUrl — the apex holds no vault's files", () => {
  it("a host-less reference carries no origin", () => {
    expect(photoRefOrigin("/files/abc")).toBeNull();
  });
  it("a reference's own host wins over the door", () => {
    expect(photoBytesUrl("https://holder.example.test/files/abc", "https://apex.example.test")).toBe(
      "https://holder.example.test/files/abc",
    );
  });
  it("a host-less reference is addressed at the door it was read from", () => {
    expect(photoBytesUrl("/files/abc", "https://holder.example.test")).toBe(
      "https://holder.example.test/files/abc",
    );
  });
  // 🔴 The rule that stops a 404 from looking like a deletion: with no door, REFUSE rather
  // than quietly asking the apex for a file only the holder's node has.
  it("refuses to invent a door", () => {
    expect(photoBytesUrl("/files/abc", null)).toBeNull();
  });
  it("recognises the mediated route", () => {
    expect(isMediatedPhotoRef("/base/connect/profile-photo?principal=x")).toBe(true);
    expect(isMediatedPhotoRef("/files/abc")).toBe(false);
  });
});

describe("the two rules a README reader relies on", () => {
  it("the mediated route is recognised in any case", () => {
    expect(isMediatedPhotoRef("https://h.example/BASE/Connect/Profile-Photo?principal=x")).toBe(true);
    expect(fileIdFromPhotoRef("/Base/Connect/Profile-Photo")).toBeNull();
  });
  it("a bare opaque id needs 8 characters; a shorter word is not an id", () => {
    expect(fileIdFromPhotoRef("abcdefgh")).toBe("abcdefgh");
    expect(fileIdFromPhotoRef("abcdefg")).toBeNull();
    expect(entityIdTail("abcdefgh")).toBe("abcdefgh");
    expect(entityIdTail("https://h.example/x/abcdefg")).toBe("");
  });
});
