// New tests for `withCanonicalLabel` beyond the ported ones: which source wins, what is left as it was, and when the same object comes back.
import { describe, expect, it } from "vitest";
import { withCanonicalLabel } from "./entityDisplayName";

describe("withCanonicalLabel", () => {
  it("the field the type names as its name wins and is copied to label and to title", () => {
    expect(withCanonicalLabel({ name: "Ann", title: "old", label: "older" }, "name")).toEqual({ name: "Ann", title: "Ann", label: "Ann" });
  });
  it("returns the very same object when label and title already agree with the name", () => {
    const facts = { title: "A", label: "A" };
    expect(withCanonicalLabel(facts, "title")).toBe(facts);
  });
  it("returns the very same object when there is a label and the title agrees", () => {
    const facts = { label: "A", title: "A" };
    expect(withCanonicalLabel(facts)).toBe(facts);
  });
  it("facts with no name anywhere come back as they are", () => {
    const empty = {};
    expect(withCanonicalLabel(empty, "title")).toBe(empty);
    const other = { color: "red" };
    expect(withCanonicalLabel(other)).toBe(other);
  });
  it("a name made of blanks is no name", () => {
    expect(withCanonicalLabel({ title: "   " }, "title")).toEqual({ title: "   " });
  });
  it("a bridge field becomes the label, and the title is kept when it has one", () => {
    expect(withCanonicalLabel({ processName: "Step" })).toEqual({ processName: "Step", label: "Step", title: "Step" });
    expect(withCanonicalLabel({ name: "N" })).toEqual({ name: "N", label: "N", title: "N" });
  });
  it("a tag becomes the label only, and unitTag comes before tag", () => {
    expect(withCanonicalLabel({ unitTag: "U", tag: "T" })).toEqual({ unitTag: "U", tag: "T", label: "U" });
    expect(withCanonicalLabel({ tag: "T" })).toEqual({ tag: "T", label: "T" });
  });
  it("a label alone gets a title; a label with a different title gets its title set to the label", () => {
    expect(withCanonicalLabel({ label: "L" })).toEqual({ label: "L", title: "L" });
    expect(withCanonicalLabel({ label: "L", title: "T" })).toEqual({ label: "L", title: "L" });
  });
});
