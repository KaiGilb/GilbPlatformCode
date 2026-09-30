import { describe, expect, it } from "vitest";
import {
  entityIdTail,
  idFromEntityUri,
  idFromUri,
  opaqueIdFromUri,
  slashTail,
  uriTail,
} from "./idTail";

describe("slashTail", () => {
  it("is the last segment, and the three app names are that function", () => {
    const uri = "https://example.test/base/e/proc-x";
    expect(slashTail(uri)).toBe("proc-x");
    expect(entityIdTail(uri)).toBe("proc-x");
    expect(idFromUri(uri)).toBe("proc-x");
    expect(idFromEntityUri(uri)).toBe("proc-x");
    expect(slashTail("bare-id")).toBe("bare-id");
  });

  it("keeps the query and does not decode", () => {
    expect(slashTail("https://example.test/base/e/id?x=1")).toBe("id?x=1");
    expect(slashTail("https://example.test/base/e/a%20b")).toBe("a%20b");
  });

  it("a trailing slash yields an empty segment", () => {
    expect(slashTail("https://example.test/base/e/note-x/")).toBe("");
  });
});

describe("uriTail", () => {
  it("strips the query, the hash, and trailing slashes, then decodes", () => {
    expect(uriTail("https://example.test/base/r/rel-abc")).toBe("rel-abc");
    expect(uriTail("https://example.test/base/e/note-x/")).toBe("note-x");
    expect(uriTail("https://example.test/base/e/id?x=1")).toBe("id");
    expect(uriTail("https://example.test/base/e/id#part")).toBe("id");
    expect(uriTail("https://example.test/base/e/a%20b")).toBe("a b");
    expect(uriTail("plain")).toBe("plain");
  });

  it("returns the encoded segment when the percent encoding is broken", () => {
    expect(uriTail("https://example.test/base/e/a%ZZ")).toBe("a%ZZ");
  });

  it("opaqueIdFromUri is uriTail", () => {
    const uri = "https://example.test/base/e/a%20b?x=1";
    expect(opaqueIdFromUri(uri)).toBe(uriTail(uri));
  });
});
