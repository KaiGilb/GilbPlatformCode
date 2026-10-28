// New tests: readLink, pinned beyond the ported ones, and the unit's export list.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

const ref = (id: string) => ({ "@id": id });

describe("the unit's export list", () => {
  it("is exactly readLink", () => {
    expect(Object.keys(unit)).toEqual(["readLink"]);
  });
});

describe("readLink", () => {
  it("no facts at all is none", () => {
    expect(unit.readLink(null)).toEqual({ state: "none" });
    expect(unit.readLink(undefined)).toEqual({ state: "none" });
    expect(unit.readLink({})).toEqual({ state: "none" });
    expect(unit.readLink({ sameAs: null, "a:sameAs": undefined })).toEqual({ state: "none" });
  });
  it("one reference under either spelling is linked, with the target trimmed", () => {
    expect(unit.readLink({ sameAs: ref(" https://h.example.test/base/e/p ") })).toEqual({ state: "linked", target: "https://h.example.test/base/e/p" });
    expect(unit.readLink({ "a:sameAs": ref("https://h.example.test/base/e/p") })).toEqual({ state: "linked", target: "https://h.example.test/base/e/p" });
  });
  it("owl:sameAs is never read: it is a different term that grants access", () => {
    expect(unit.readLink({ "owl:sameAs": ref("https://h.example.test/base/e/p") })).toEqual({ state: "none" });
  });
  it("a list of references is read as its members; the same target under both spellings is one link", () => {
    expect(unit.readLink({ sameAs: [ref("https://h.example.test/x")] })).toEqual({ state: "linked", target: "https://h.example.test/x" });
    expect(unit.readLink({ sameAs: ref("https://h.example.test/x"), "a:sameAs": ref("https://h.example.test/x") })).toEqual({ state: "linked", target: "https://h.example.test/x" });
  });
  it("two different targets are ambiguous: none is chosen", () => {
    expect(unit.readLink({ sameAs: [ref("https://h.example.test/x"), ref("https://h.example.test/y")] })).toEqual({ state: "ambiguous" });
    expect(unit.readLink({ sameAs: ref("https://h.example.test/x"), "a:sameAs": ref("https://h.example.test/y") })).toEqual({ state: "ambiguous" });
  });
  it("anything that is not a reference with a non-blank @id is malformed, even beside a good one", () => {
    for (const bad of ["https://h.example.test/x", 5, true, ref(""), ref("   "), { "@id": 7 }, {}, [], [ref("https://h.example.test/x"), "plain"]]) {
      const r = unit.readLink({ sameAs: bad as unknown });
      expect(r.state, JSON.stringify(bad)).toBe(Array.isArray(bad) && bad.length === 0 ? "none" : "malformed");
    }
  });
  it("a malformed value wins over an ambiguous pair", () => {
    expect(unit.readLink({ sameAs: [ref("https://h.example.test/x"), ref("https://h.example.test/y"), "plain"] })).toEqual({ state: "malformed" });
  });
});
