import { describe, expect, it } from "vitest";
import { refDisplayName as entityRefName } from "@kaigilb/gilbplatformcode-entity-ref";
import { refDisplayName } from "./index";

// The first two cases and the third are the cases of the source's entityRefFacts test for refDisplayName.
describe("refDisplayName", () => {
  it("uses the tag when that is the only name", () => {
    expect(refDisplayName({ unitTag: "Content.Measure" })).toBe("Content.Measure");
    expect(refDisplayName({ tag: "Voice.Match" })).toBe("Voice.Match");
  });

  it("prefers a label over a tag", () => {
    expect(refDisplayName({ label: "A label", unitTag: "Content.Measure" })).toBe("A label");
  });

  it("names a town by its termLabel", () => {
    const child = { termLabel: "Sarandi", "member-of": "https://geo.example.test/base/e/osm-r-59470" };
    expect(refDisplayName(child, "https://geo.example.test/base/e/osm-r-123")).toBe("Sarandi");
  });

  it("reads label, termLabel, title, name, in that order", () => {
    expect(refDisplayName({ name: "N", title: "T", termLabel: "L2", label: "L1" })).toBe("L1");
    expect(refDisplayName({ name: "N", title: "T", termLabel: "L2" })).toBe("L2");
    expect(refDisplayName({ name: "N", title: "T" })).toBe("T");
    expect(refDisplayName({ name: "N" })).toBe("N");
  });

  it("trims, and a blank slot does not win", () => {
    expect(refDisplayName({ label: "   ", title: "  Ann  " })).toBe("Ann");
    expect(refDisplayName({ label: "", unitTag: "  " })).toBe("Untitled");
  });

  it("reads unitTag before tag, and both after the four names", () => {
    expect(refDisplayName({ tag: "B", unitTag: "A" })).toBe("A");
    expect(refDisplayName({ unitTag: "A", name: "N" })).toBe("N");
    expect(refDisplayName({ unitTag: " ", tag: "B" })).toBe("B");
  });

  it("names a file by its file name, after the tags", () => {
    expect(refDisplayName({ fileName: " Customer contract.pdf " })).toBe("Customer contract.pdf");
    expect(refDisplayName({ fileName: "x.pdf", tag: "T" })).toBe("T");
  });

  it("reads only the bare slugs: a:label, a:title and file-name are not names", () => {
    expect(refDisplayName({ "a:label": "X", "a:title": "Y", "file-name": "Z" })).toBe("Untitled");
  });

  it("falls back to the legible tail of the address: decoded, no query, no hash, no trailing slash", () => {
    expect(refDisplayName({}, "https://example.test/base/e/abc123")).toBe("abc123");
    expect(refDisplayName(null, "https://example.test/base/e/abc123/")).toBe("abc123");
    expect(refDisplayName(undefined, "https://example.test/base/e/a%20b?x=1#y")).toBe("a b");
    expect(refDisplayName({ label: "" }, "bare-id")).toBe("bare-id");
  });

  it("is Untitled when there is nothing: no facts and no address, or an empty address", () => {
    expect(refDisplayName(null)).toBe("Untitled");
    expect(refDisplayName(undefined, null)).toBe("Untitled");
    expect(refDisplayName({}, "")).toBe("Untitled");
  });

  it("an address whose tail is empty is the address itself (the tail rule's fallback)", () => {
    expect(refDisplayName({}, "/")).toBe("/");
  });

  it("is not the entity-ref unit's refDisplayName: that one does not read unitTag, tag or fileName", () => {
    expect(entityRefName({ unitTag: "Content.Measure" })).toBe("Untitled");
    expect(refDisplayName({ unitTag: "Content.Measure" })).toBe("Content.Measure");
    expect(entityRefName({ fileName: "x.pdf" })).toBe("Untitled");
    expect(refDisplayName({ fileName: "x.pdf" })).toBe("x.pdf");
    expect(entityRefName({ label: "L", termLabel: "T" })).toBe(refDisplayName({ label: "L", termLabel: "T" }));
  });
});

describe("refDisplayName with the record's main tag", () => {
  const MAIN = "platform-tag";
  it("label, termLabel, title and name win over the main tag", () => {
    expect(refDisplayName({ label: "L" }, undefined, MAIN)).toBe("L");
    expect(refDisplayName({ termLabel: "TL" }, undefined, MAIN)).toBe("TL");
    expect(refDisplayName({ title: "T" }, undefined, MAIN)).toBe("T");
    expect(refDisplayName({ name: "N" }, undefined, MAIN)).toBe("N");
  });

  it("unitTag and tag win over the main tag", () => {
    expect(refDisplayName({ unitTag: "PT-1" }, undefined, "somethingelse")).toBe("PT-1");
    expect(refDisplayName({ tag: "t1" }, undefined, "somethingelse")).toBe("t1");
  });

  it("the main tag wins over the file name, the tail of the address and Untitled", () => {
    expect(refDisplayName({ fileName: "x.pdf" }, undefined, MAIN)).toBe(MAIN);
    expect(refDisplayName({}, "https://example.test/base/e/abc123", MAIN)).toBe(MAIN);
    expect(refDisplayName({}, undefined, MAIN)).toBe(MAIN);
  });

  it("the main tag is trimmed, and a blank one, null or undefined is ignored", () => {
    expect(refDisplayName({}, undefined, "  alpha  ")).toBe("alpha");
    expect(refDisplayName({ fileName: "x.pdf" }, undefined, "  ")).toBe("x.pdf");
    expect(refDisplayName({}, "https://example.test/base/e/abc123", "")).toBe("abc123");
    expect(refDisplayName({}, undefined, null)).toBe("Untitled");
    expect(refDisplayName({}, undefined, undefined)).toBe("Untitled");
  });

  it("a call with two arguments answers as before", () => {
    expect(refDisplayName({ fileName: " Customer contract.pdf " }, "https://example.test/base/e/abc123")).toBe("Customer contract.pdf");
    expect(refDisplayName({}, "https://example.test/base/e/abc123")).toBe("abc123");
    expect(refDisplayName(null, undefined)).toBe("Untitled");
  });

  it("with no facts the main tag is not read: the tail of the address, else Untitled", () => {
    expect(refDisplayName(null, "https://example.test/base/e/abc123", MAIN)).toBe("abc123");
    expect(refDisplayName(undefined, undefined, MAIN)).toBe("Untitled");
  });
});
