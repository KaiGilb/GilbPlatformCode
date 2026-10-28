import { describe, expect, it } from "vitest";
import { BRIDGE_SLUGS, CANONICAL_DISPLAY_SLUG, FILE_NAME_SLUG, IDENTITY_DISPLAY_SLUGS, MASTER_TAG_SLUGS, displayFriendly, entityDisplayName } from "./entityDisplayName";
import { vaultNamespaceOfEntityUri } from "./vaultNamespaceOfEntityUri";
import { writeSource } from "./writeSource";
import { SEARCH_INCOMPLETE_HITS, SEARCH_INCOMPLETE_NONE } from "./planSearch";

describe("entityDisplayName (the app's copy)", () => {
  it("keeps the slugs it reads, in the order it reads them", () => {
    expect(CANONICAL_DISPLAY_SLUG).toBe("label");
    expect(MASTER_TAG_SLUGS).toEqual(["unitTag", "tag"]);
    expect(IDENTITY_DISPLAY_SLUGS).toEqual(["anchorBoundEmail", "accountSubject", "principalUri", "aliasUri", "registeredVault", "vaultAddress"]);
    expect(BRIDGE_SLUGS).toEqual(["title", "processName", "name"]);
    expect(FILE_NAME_SLUG).toBe("fileName");
  });

  it("reads the record's own name before its label, then the label, the tags, the identity values, the bridges, the file name", () => {
    const all = { name: "N", label: "L", unitTag: "U", tag: "T", anchorBoundEmail: "a@b.c", title: "Ti", processName: "P", fileName: "F" };
    expect(entityDisplayName(all)).toBe("N");
    const { name: _n, ...noName } = all;
    expect(entityDisplayName(noName)).toBe("L");
    const { label: _l, ...noLabel } = noName;
    expect(entityDisplayName(noLabel)).toBe("U");
    const { unitTag: _u, ...noUnit } = noLabel;
    expect(entityDisplayName(noUnit)).toBe("T");
    expect(entityDisplayName({ anchorBoundEmail: "a@b.c", title: "Ti" })).toBe("a@b.c");
    expect(entityDisplayName({ title: "Ti", processName: "P" })).toBe("Ti");
    expect(entityDisplayName({ processName: "P", fileName: "F" })).toBe("P");
    expect(entityDisplayName({ fileName: "F" })).toBe("F");
    expect(entityDisplayName({ "a:fileName": "G" })).toBe("G");
  });

  it("trims, skips blanks, and shortens only identity values and the address", () => {
    expect(entityDisplayName({ name: "  ", label: "  Ann  " })).toBe("Ann");
    expect(entityDisplayName({ label: "https://h.example.test/base/e/ann" })).toBe("https://h.example.test/base/e/ann");
    expect(entityDisplayName({ principalUri: "https://id.example.test/base/p/abc-1" })).toBe("abc-1");
    expect(entityDisplayName({}, { entityUri: " https://h.example.test/base/e/ann " })).toBe("ann");
    expect(entityDisplayName(undefined, { entityUri: "https://h.example.test/base/e/ann" })).toBe("ann");
  });

  it("uses the type's name field unless it is a slug read earlier, and not twice as a bridge", () => {
    expect(entityDisplayName({ nickname: "Nick", title: "Ti" }, { nameField: "nickname" })).toBe("Nick");
    expect(entityDisplayName({ label: "", title: "Ti" }, { nameField: "label" })).toBe("Ti");
    expect(entityDisplayName({ title: "Ti", processName: "P" }, { nameField: "processName" })).toBe("P");
  });

  it("falls back to the fallback, Untitled by default", () => {
    expect(entityDisplayName(null)).toBe("Untitled");
    expect(entityDisplayName({})).toBe("Untitled");
    expect(entityDisplayName({}, { fallback: "x" })).toBe("x");
    expect(entityDisplayName({}, { fallback: "" })).toBe("");
    expect(entityDisplayName({ label: 5 as unknown as string }, { fallback: "z", entityUri: "  " })).toBe("z");
  });

  it("displayFriendly: an email as it is, a host for a base root, the last path part otherwise", () => {
    expect(displayFriendly("  a@b.c ")).toBe("a@b.c");
    expect(displayFriendly("")).toBe("");
    expect(displayFriendly("https://connect.example.test/base")).toBe("connect.example.test");
    expect(displayFriendly("https://connect.example.test")).toBe("connect.example.test");
    expect(displayFriendly("https://h.example.test/base/")).toBe("h.example.test");
    expect(displayFriendly("https://h.example.test/x/base")).toBe("h.example.test");
    expect(displayFriendly("https://h.example.test/vault")).toBe("vault");
    expect(displayFriendly("https://h.example.test/a/b/")).toBe("b");
    expect(displayFriendly("a/b/c")).toBe("c");
    expect(displayFriendly("a/")).toBe("a/");
    expect(displayFriendly("plain")).toBe("plain");
    expect(displayFriendly("http://[bad")).toBe("[bad");
  });
});

describe("vaultNamespaceOfEntityUri (the app's copy)", () => {
  it("answers the origin with the segment the address carries", () => {
    expect(vaultNamespaceOfEntityUri("https://h.example.test/base/e/abc")).toBe("https://h.example.test/base");
    expect(vaultNamespaceOfEntityUri("https://p.example.test/vault/e/abc")).toBe("https://p.example.test/vault");
  });

  it("looks for vault before base", () => {
    expect(vaultNamespaceOfEntityUri("https://h.example.test/base/e/x/vault/e/y")).toBe("https://h.example.test/base/e/x/vault");
  });

  it("answers null for anything else, and for an address that starts at the segment", () => {
    expect(vaultNamespaceOfEntityUri("https://h.example.test/base/r/abc")).toBeNull();
    expect(vaultNamespaceOfEntityUri("abc")).toBeNull();
    expect(vaultNamespaceOfEntityUri("/base/e/abc")).toBeNull();
    expect(vaultNamespaceOfEntityUri("")).toBeNull();
  });
});

describe("writeSource (the app's copy)", () => {
  it("is empty for a record with no served keys, so the call keeps its number of arguments", () => {
    expect(writeSource({})).toEqual([]);
    expect(writeSource({ entityUri: "https://h.example.test/base/e/a", servedKeys: [] })).toEqual([]);
  });

  it("names the record's address and the served keys", () => {
    expect(writeSource({ entityUri: "https://h.example.test/base/e/a", servedKeys: ["x"] })).toEqual([{ at: "https://h.example.test/base/e/a", servedKeys: ["x"] }]);
    expect(writeSource({ servedKeys: ["x"] })).toEqual([{ at: null, servedKeys: ["x"] }]);
  });
});

describe("the search sentences", () => {
  it("are the app's", () => {
    expect(SEARCH_INCOMPLETE_NONE).toBe("Not every record could be searched. Try again.");
    expect(SEARCH_INCOMPLETE_HITS).toBe("Some records could not be searched.");
  });
});
