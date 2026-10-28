// The pure parts of the unit, pinned: the need for a main tag, the vault of an address, the rows that are asked, the cache keys, the constants and the export list.
import { describe, expect, it } from "vitest";
import * as unit from "./index";
import { mainTagKey, mainTagsKey, MASTERS_BATCH_MAX, needsMainTag, rowsNeedingMainTag, TAG_READ_BOUND_MS, vaultOfEntity } from "./index";

const V = "https://ann.example.test/base";
const e = (id: string) => `${V}/e/${id}`;

describe("needsMainTag", () => {
  it("no facts at all need the main tag", () => {
    expect(needsMainTag(null)).toBe(true);
    expect(needsMainTag(undefined)).toBe(true);
    expect(needsMainTag({})).toBe(true);
  });

  it.each([["name"], ["label"], ["unitTag"], ["tag"]])("a record that holds %s asks nothing", (slug) => {
    expect(needsMainTag({ [slug]: "x" })).toBe(false);
    expect(needsMainTag({ [slug]: "  x  " })).toBe(false);
  });

  it("a record that holds only a title still asks (the title is not among the four): the main tag is asked although the reference chip shows the title", () => {
    expect(needsMainTag({ title: "A title" })).toBe(true);
    expect(needsMainTag({ processName: "A step" })).toBe(true);
  });

  it("a blank string counts as absent, and so does a value that is not a string", () => {
    expect(needsMainTag({ name: "", label: "   ", unitTag: " ", tag: "\n" })).toBe(true);
    expect(needsMainTag({ name: undefined })).toBe(true);
    expect(needsMainTag({ name: 5 as unknown as string })).toBe(true);
    expect(needsMainTag({ name: "  ", tag: "t" })).toBe(false);
  });

  it("a name wins over nothing else being needed: any one of the four is enough", () => {
    expect(needsMainTag({ title: "T", label: "L" })).toBe(false);
    expect(needsMainTag({ other: "x", unitTag: "PT-1" })).toBe(false);
  });
});

describe("vaultOfEntity", () => {
  it.each([
    [`${V}/e/x`, V],
    ["https://ann.example.test/vault/e/x", "https://ann.example.test/vault"],
    ["http://rig.example.test:8080/base/e/abc123", "http://rig.example.test:8080/base"],
    [`  ${V}/e/x  `, V],
  ])("%s is in the vault %s", (uri, vault) => {
    expect(vaultOfEntity(uri)).toBe(vault);
  });

  it.each([
    ["a query", `${V}/e/x?y=1`],
    ["a fragment", `${V}/e/x#f`],
    ["a trailing slash", `${V}/e/x/`],
    ["a deeper path", `${V}/e/a/b`],
    ["no /e/", `${V}/r/x`],
    ["no id", `${V}/e/`],
    ["the vault itself", V],
    ["another path segment than base or vault", "https://ann.example.test/other/e/x"],
    ["a scheme that is not http(s)", "ftp://ann.example.test/base/e/x"],
    ["a bare id", "x"],
    ["the empty string", ""],
  ])("%s gives null", (_what, uri) => {
    expect(vaultOfEntity(uri)).toBeNull();
  });
});

describe("rowsNeedingMainTag", () => {
  it("is the addresses of the rows that hold no name, label, unitTag or tag", () => {
    expect(rowsNeedingMainTag([{ entityUri: e("a"), facts: {} }, { entityUri: e("b"), facts: null }, { entityUri: e("c"), facts: undefined }])).toEqual([e("a"), e("b"), e("c")]);
  });

  it("skips the rows that are named", () => {
    expect(
      rowsNeedingMainTag([
        { entityUri: e("n"), facts: { name: "Ann" } },
        { entityUri: e("l"), facts: { label: "L" } },
        { entityUri: e("u"), facts: { unitTag: "PT-1" } },
        { entityUri: e("t"), facts: { tag: "t1" } },
        { entityUri: e("x"), facts: {} },
      ]),
    ).toEqual([e("x")]);
  });

  it("asks each address once, in the order first seen", () => {
    expect(rowsNeedingMainTag([{ entityUri: e("b"), facts: {} }, { entityUri: e("a"), facts: {} }, { entityUri: e("b"), facts: {} }])).toEqual([e("b"), e("a")]);
  });

  it("skips a row with no address and a row whose address is of a foreign shape", () => {
    expect(
      rowsNeedingMainTag([
        { facts: {} },
        { entityUri: null, facts: {} },
        { entityUri: "", facts: {} },
        { entityUri: `${e("q")}?y=1`, facts: {} },
        { entityUri: `${e("q")}/`, facts: {} },
        { entityUri: "not-an-address", facts: {} },
        { entityUri: e("ok"), facts: {} },
      ]),
    ).toEqual([e("ok")]);
  });

  it("an empty list asks nothing", () => {
    expect(rowsNeedingMainTag([])).toEqual([]);
  });
});

describe("the cache keys and constants", () => {
  it("mainTagKey is ['main-tag', uri]", () => {
    expect(mainTagKey(e("a"))).toEqual(["main-tag", e("a")]);
  });

  it("mainTagsKey is ['main-tags', vault, ...sorted uris], and the caller's list is not reordered", () => {
    const uris = [e("c"), e("a"), e("b")];
    expect(mainTagsKey(V, uris)).toEqual(["main-tags", V, e("a"), e("b"), e("c")]);
    expect(uris).toEqual([e("c"), e("a"), e("b")]);
    expect(mainTagsKey(V, [])).toEqual(["main-tags", V]);
  });

  it("the batch is 50 records and the read is bound at 12 seconds", () => {
    expect(MASTERS_BATCH_MAX).toBe(50);
    expect(TAG_READ_BOUND_MS).toBe(12_000);
  });
});

describe("the export list", () => {
  it("is the thirteen values of the README (the two types are not values) and no more", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "MASTERS_BATCH_MAX",
        "TAG_READ_BOUND_MS",
        "fetchMainTagsForRows",
        "mainTagKey",
        "mainTagsKey",
        "needsMainTag",
        "readMasterTags",
        "rowsNeedingMainTag",
        "tagPlatformFor",
        "useMainTag",
        "useMainTags",
        "useMainTagsForRows",
        "vaultOfEntity",
      ].sort(),
    );
  });
});
