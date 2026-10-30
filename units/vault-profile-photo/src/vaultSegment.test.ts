// Ported from the app's vaultProfilePhoto.vaultSegment.c183.test.ts (10 of 10): the photo ref parsers must read a user vault's `/vault/e/`
// address as well as `/base/e/`. These import the SHIPPED functions of `gilbPhotoRef.ts`; a copy of the regex here would go green against itself.
// Changes: the import (the app re-exported the two from the module under test), and the hosts are `example.test` hosts.
import { describe, it, expect } from "vitest";
import { entityIdTail, fileIdFromPhotoRef } from "./gilbPhotoRef";

describe("fileIdFromPhotoRef reads BOTH vault segments", () => {
  it("recovers the file id from a /vault/e/ reference", () => {
    expect(fileIdFromPhotoRef("https://viviantest.example.test/vault/e/photo-123")).toBe("photo-123");
  });
  it("still recovers the file id from a /base/e/ reference", () => {
    expect(fileIdFromPhotoRef("https://veda.example.test/base/e/photo-123")).toBe("photo-123");
  });
  it("both segments yield the SAME id: the id is not the address", () => {
    expect(fileIdFromPhotoRef("https://h.example.test/vault/e/same")).toBe(fileIdFromPhotoRef("https://h.example.test/base/e/same"));
  });
  it("refuses a segment that is neither base nor vault", () => {
    expect(fileIdFromPhotoRef("https://h.example.test/wat/e/photo-123")).toBeNull();
  });
});

describe("entityIdTail reads BOTH vault segments", () => {
  it("recovers the entity id from a /vault/e/ URI", () => {
    expect(entityIdTail("https://viviantest.example.test/vault/e/abcdefgh1234")).toBe("abcdefgh1234");
  });
  it("still recovers the entity id from a /base/e/ URI", () => {
    expect(entityIdTail("https://veda.example.test/base/e/abcdefgh1234")).toBe("abcdefgh1234");
  });
  it("both segments yield the SAME id", () => {
    expect(entityIdTail("https://h.example.test/vault/e/abcdefgh1234")).toBe(entityIdTail("https://h.example.test/base/e/abcdefgh1234"));
  });
  it("refuses a bare vault root on either segment", () => {
    expect(entityIdTail("https://h.example.test/vault")).toBe("");
    expect(entityIdTail("https://h.example.test/base")).toBe("");
  });
  it("still refuses a WebID tail", () => {
    expect(entityIdTail("https://h.example.test/i")).toBe("");
  });
  // THE DISCRIMINATOR: agrees across segments even when the fallback heuristic cannot rescue it.
  it("agrees across segments even when the fallback heuristic cannot rescue it", () => {
    expect(entityIdTail("https://h.example.test/vault/e/abc?x=1")).toBe(entityIdTail("https://h.example.test/base/e/abc?x=1"));
    expect(entityIdTail("https://h.example.test/vault/e/abc?x=1")).toBe("abc");
  });
});
