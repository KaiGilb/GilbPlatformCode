import { describe, expect, it } from "vitest";
import { termDoesFromDocument } from "./termDoes";

describe("termDoesFromDocument", () => {
  it("trims a:does and a one-level @value", () => {
    expect(termDoesFromDocument({ "a:does": "  Says what it does.  " })).toEqual({
      state: "defined",
      does: "Says what it does.",
    });
    expect(termDoesFromDocument({ "a:does": { "@value": "  Wrapped  " } })).toEqual({
      state: "defined",
      does: "Wrapped",
    });
  });

  it("uses bare does only when a:does is missing or null", () => {
    expect(termDoesFromDocument({ does: "Bare" })).toEqual({ state: "defined", does: "Bare" });
    expect(termDoesFromDocument({ "a:does": null, does: "Bare" })).toEqual({
      state: "defined",
      does: "Bare",
    });
  });

  it("lets a blank, a number, or spaces on a:does hide a bare definition", () => {
    expect(termDoesFromDocument({ "a:does": "", does: "Bare" })).toEqual({ state: "none" });
    expect(termDoesFromDocument({ "a:does": "   ", does: "Bare" })).toEqual({ state: "none" });
    expect(termDoesFromDocument({ "a:does": 0, does: "Bare" })).toEqual({ state: "none" });
  });

  it("is none for an empty document, an empty @value, or a list of strings", () => {
    expect(termDoesFromDocument({})).toEqual({ state: "none" });
    expect(termDoesFromDocument({ "a:does": { "@value": "  " } })).toEqual({ state: "none" });
    expect(termDoesFromDocument({ "a:does": ["Says"] })).toEqual({ state: "none" });
  });

  it("refuses a missing document instead of reporting none", () => {
    expect(() => termDoesFromDocument(null as unknown as Record<string, unknown>)).toThrow(
      /failed read/,
    );
  });
});
