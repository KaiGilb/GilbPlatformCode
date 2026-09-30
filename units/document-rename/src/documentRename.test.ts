import { describe, expect, it } from "vitest";
import { buildDocumentRenamePatch, prefillDocumentRename } from "./documentRename";

describe("prefillDocumentRename", () => {
  it("reads a bare title, including blank and spaces, and does not fall through", () => {
    expect(prefillDocumentRename({ title: "Hello" })).toEqual({ title: "Hello" });
    expect(prefillDocumentRename({ title: "", "a:title": "Hidden" })).toEqual({ title: "" });
    expect(prefillDocumentRename({ title: "  Hello  " })).toEqual({ title: "  Hello  " });
  });

  it("falls through when the bare title is missing or not a string", () => {
    expect(prefillDocumentRename({ "a:title": "Wire" })).toEqual({ title: "Wire" });
    expect(prefillDocumentRename({ title: null, "a:title": "Wire" })).toEqual({ title: "Wire" });
    expect(prefillDocumentRename({ title: 1, "a:title": "Wire" })).toEqual({ title: "Wire" });
  });

  it("is an empty title when neither spelling is a string", () => {
    expect(prefillDocumentRename(null)).toEqual({ title: "" });
    expect(prefillDocumentRename(undefined)).toEqual({ title: "" });
    expect(prefillDocumentRename({})).toEqual({ title: "" });
    expect(prefillDocumentRename({ title: 1, "a:title": 2 })).toEqual({ title: "" });
  });
});

describe("buildDocumentRenamePatch", () => {
  it("writes the bare title only when the strings differ, and does not trim", () => {
    expect(buildDocumentRenamePatch({ title: "A" }, { title: "B" })).toEqual({ title: "B" });
    expect(buildDocumentRenamePatch({ title: "A" }, { title: "A" })).toEqual({});
    expect(buildDocumentRenamePatch({ title: " A " }, { title: "A" })).toEqual({ title: "A" });
    expect(buildDocumentRenamePatch({ title: "A" }, { title: "" })).toEqual({ title: "" });
  });

  it("does not add a body key", () => {
    expect(Object.keys(buildDocumentRenamePatch({ title: "A" }, { title: "B" }))).toEqual([
      "title",
    ]);
  });
});
