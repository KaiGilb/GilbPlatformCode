// The pure helpers of the card: which facts a save persists, which extra facts a record shows, the link a record carries, the fallback field list.
import { describe, expect, it } from "vitest";
import { ALLOWED_EXTRA_ATTR_SLUGS } from "@kaigilb/gilbplatformcode-record-types";
import { editorFacts, effectiveFields, extraKeysFromFacts, linkTargetOf, openNodeFields, sameEditorFacts } from "./recordFacts";

const field = (slug: string) => ({ slug, label: slug, kind: "text" as const });

describe("editorFacts", () => {
  it("every typed field is persisted, an absent one as the empty string", () => {
    expect(editorFacts([field("a"), field("b")], { a: "1" }, [])).toEqual({ a: "1", b: "" });
  });
  it("an extra key the person added is persisted when the app may address it", () => {
    expect(editorFacts([field("a")], { a: "1", note: "n" }, ["note"])).toEqual({ a: "1", note: "n" });
  });
  it("a typed field named twice is persisted once; an extra that is typed is not doubled", () => {
    expect(Object.keys(editorFacts([field("a")], { a: "1" }, ["a"]))).toEqual(["a"]);
  });
  it("facts already on the record stay editable, except grants, framed keys and the online-card link", () => {
    const out = editorFacts([field("a")], { a: "1", extra: "x", "@id": "y", directReader: "r", DirectWriter: "w", readerGroup: "g", writerGroup: "g", sameAs: "https://x.test/base/e/p" }, []);
    expect(out).toEqual({ a: "1", extra: "x" });
  });
  it("an undefined value is not carried", () => {
    expect(editorFacts([], { gone: undefined as never }, [])).toEqual({});
  });
  it("a null value is carried as the empty string", () => {
    expect(editorFacts([], { n: null as never }, [])).toEqual({ n: "" });
  });
});

describe("sameEditorFacts", () => {
  it("compares only the keys named, an absent key as the empty string", () => {
    expect(sameEditorFacts({ a: "1" }, { a: "1", b: "2" }, ["a"])).toBe(true);
    expect(sameEditorFacts({ a: "1" }, { a: "1", b: "2" }, ["a", "b"])).toBe(false);
    expect(sameEditorFacts({}, { b: "" }, ["b"])).toBe(true);
  });
});

describe("extraKeysFromFacts", () => {
  it("lists a non-typed fact that has a value", () => {
    expect(extraKeysFromFacts([field("a")], { a: "1", note: "n" })).toEqual(["note"]);
  });
  it("skips framed keys, grants, the online-card link and typed keys", () => {
    expect(extraKeysFromFacts([field("a")], { a: "1", "@type": "x", directReader: "r", readerGroup: "g", sameAs: "https://x.test/base/e/p" })).toEqual([]);
  });
  it("an empty value surfaces only when its slug is on the short seed list", () => {
    const seeded = ALLOWED_EXTRA_ATTR_SLUGS[0]!;
    expect(extraKeysFromFacts([], { [seeded]: "", other: "" })).toEqual([seeded]);
  });
  it("a slug the app may not address is skipped", () => {
    expect(extraKeysFromFacts([], { "a:colon": "x" })).toEqual([]);
  });
});

describe("linkTargetOf", () => {
  it("is the person the record is linked to", () => {
    expect(linkTargetOf({ served: { facts: { sameAs: { "@id": "https://x.test/base/p/kari" } } } })).toBe("https://x.test/base/p/kari");
  });
  it("is null for a record that carries no link, or none read", () => {
    expect(linkTargetOf({ served: { facts: {} } })).toBeNull();
    expect(linkTargetOf(null)).toBeNull();
    expect(linkTargetOf({})).toBeNull();
  });
});

describe("effectiveFields", () => {
  it("with no registry fields: the name field alone", () => {
    expect(effectiveFields([], "title")).toEqual(openNodeFields("title"));
    expect(openNodeFields("title")[0]).toMatchObject({ slug: "title", label: "Name", kind: "text" });
  });
  it("with fields that hold the name slug: the fields as they are", () => {
    const f = [field("title"), field("b")];
    expect(effectiveFields(f, "title")).toBe(f);
  });
  it("with fields that lack the name slug: the name field first", () => {
    expect(effectiveFields([field("b")], "title").map((x) => x.slug)).toEqual(["title", "b"]);
  });
});
