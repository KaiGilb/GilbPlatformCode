import { describe, expect, it } from "vitest";
import { BRIDGE_SLUGS, CANONICAL_DISPLAY_SLUG, FILE_NAME_SLUG, IDENTITY_DISPLAY_SLUGS, MASTER_TAG_SLUGS, displayFriendly, entityDisplayName } from "./entityDisplayName";
import { PARTY_NAME_FLOOR } from "./partyName";

describe("the name the picker shows", () => {
  it("the slugs it reads", () => {
    expect(CANONICAL_DISPLAY_SLUG).toBe("label");
    expect(MASTER_TAG_SLUGS).toEqual(["unitTag", "tag"]);
    expect(IDENTITY_DISPLAY_SLUGS).toEqual(["anchorBoundEmail", "accountSubject", "principalUri", "aliasUri", "registeredVault", "vaultAddress"]);
    expect(BRIDGE_SLUGS).toEqual(["title", "processName", "name"]);
    expect(FILE_NAME_SLUG).toBe("fileName");
    expect(PARTY_NAME_FLOOR.name).toBe("name");
    expect(PARTY_NAME_FLOOR.legacy).toEqual(["label"]);
  });
  it("reads a:name first, then the label, the tag (unitTag before tag), an identity id, the type's name field, a bridge, a file name, the address, the fallback", () => {
    const facts: Record<string, string> = { name: "N", label: "L", unitTag: "U", tag: "T", anchorBoundEmail: "ann@example.test", title: "Ti", fileName: "f.txt" };
    const order = ["name", "label", "unitTag", "tag", "anchorBoundEmail", "title", "fileName"];
    for (const slug of order) {
      expect(entityDisplayName(facts)).toBe(facts[slug]);
      delete facts[slug];
    }
    expect(entityDisplayName(facts, { entityUri: "https://h.example.test/base/e/abc" })).toBe("abc");
    expect(entityDisplayName(facts, { entityUri: "https://h.example.test/base/e/abc", fallback: "Nothing" })).toBe("abc");
    expect(entityDisplayName(facts)).toBe("Untitled");
    expect(entityDisplayName(null, { fallback: "F" })).toBe("F");
    expect(entityDisplayName(undefined)).toBe("Untitled");
  });
  it("trims, skips blanks, and reads a:fileName and the type's name field", () => {
    expect(entityDisplayName({ name: "   ", label: " Walk " })).toBe("Walk");
    expect(entityDisplayName({ "a:fileName": "x.pdf" })).toBe("x.pdf");
    expect(entityDisplayName({ heading: "H" }, { nameField: "heading" })).toBe("H");
    expect(entityDisplayName({ label: "L", heading: "H" }, { nameField: "label" })).toBe("L");
    expect(entityDisplayName({ title: "Ti", processName: "P" }, { nameField: "title" })).toBe("Ti");
    expect(entityDisplayName({ processName: "P", name: "ignored-by-floor" })).toBe("ignored-by-floor");
  });
  it("displayFriendly: an email stays, a platform address becomes its host or last segment, a bare path its tail", () => {
    expect(displayFriendly("ann@example.test")).toBe("ann@example.test");
    expect(displayFriendly("https://connect.example.test/base")).toBe("connect.example.test");
    expect(displayFriendly("https://id.example.test/base/p/abc-123")).toBe("abc-123");
    expect(displayFriendly("https://id.example.test")).toBe("id.example.test");
    expect(displayFriendly("a/b/c")).toBe("c");
    expect(displayFriendly("plain")).toBe("plain");
    expect(displayFriendly("  ")).toBe("");
    expect(displayFriendly("tail/")).toBe("tail/");
  });
});

describe("the record's main tag (the `mainTag` option)", () => {
  it("names a record that holds no label or tag", () => {
    expect(entityDisplayName({}, { mainTag: "alpha" })).toBe("alpha");
    expect(entityDisplayName({ x: "y" }, { mainTag: "alpha" })).toBe("alpha");
  });
  it("a unitTag, a tag, a label and a name all win over it", () => {
    expect(entityDisplayName({ unitTag: "PT-1" }, { mainTag: "x" })).toBe("PT-1");
    expect(entityDisplayName({ tag: "T-2" }, { mainTag: "x" })).toBe("T-2");
    expect(entityDisplayName({ label: "Walk" }, { mainTag: "x" })).toBe("Walk");
    expect(entityDisplayName({ name: "Ann", label: "Walk" }, { mainTag: "x" })).toBe("Ann");
  });
  it("it wins over an identity id (an email), the type's name field and a bridge", () => {
    expect(entityDisplayName({ anchorBoundEmail: "ann@example.test" }, { mainTag: "alpha" })).toBe("alpha");
    expect(entityDisplayName({ heading: "H" }, { nameField: "heading", mainTag: "alpha" })).toBe("alpha");
  });
  // Kept as the app has it: the main tag is read before `title`, so a record holding only a title shows its main tag.
  it("a record that holds only a title shows its main tag, not the title", () => {
    expect(entityDisplayName({ title: "Ti" }, { mainTag: "alpha" })).toBe("alpha");
    expect(entityDisplayName({ title: "Ti" })).toBe("Ti");
  });
  it("a blank, a missing or a null main tag is ignored; it is trimmed", () => {
    expect(entityDisplayName({ anchorBoundEmail: "ann@example.test" }, { mainTag: "   " })).toBe("ann@example.test");
    expect(entityDisplayName({ title: "Ti" }, { mainTag: null })).toBe("Ti");
    expect(entityDisplayName({ title: "Ti" }, { mainTag: undefined })).toBe("Ti");
    expect(entityDisplayName({}, { mainTag: "  alpha  " })).toBe("alpha");
  });
  it("it is read only when facts exist: no facts, the address tail", () => {
    expect(entityDisplayName(null, { mainTag: "alpha", entityUri: "https://h.example.test/base/e/abc" })).toBe("abc");
  });
});
