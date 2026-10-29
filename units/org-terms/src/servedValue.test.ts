import { describe, expect, it } from "vitest";
import { refsOf, servedValue } from "./orgTerms";

describe("refsOf", () => {
  it("reads a string, an {@id} node, or an array of either, trimmed, empty ones dropped", () => {
    expect(refsOf(" a ")).toEqual(["a"]);
    expect(refsOf({ "@id": " b " })).toEqual(["b"]);
    expect(refsOf(["a", { "@id": "b" }, "  ", { "@id": "" }, 5, null, {}])).toEqual(["a", "b"]);
  });
  it("reads nothing from undefined, null or a number", () => {
    expect(refsOf(undefined)).toEqual([]);
    expect(refsOf(null)).toEqual([]);
    expect(refsOf(7)).toEqual([]);
  });
  it("does not read an {@id} that is not a string", () => {
    expect(refsOf({ "@id": 5 })).toEqual([]);
  });
});

describe("servedValue", () => {
  it("reads the bare key, else the a:-prefixed one; the bare key wins", () => {
    expect(servedValue({ x: 1 }, "x")).toBe(1);
    expect(servedValue({ "a:x": 2 }, "x")).toBe(2);
    expect(servedValue({ x: 1, "a:x": 2 }, "x")).toBe(1);
    expect(servedValue({}, "x")).toBeUndefined();
  });
  it("a bare key that holds null falls through to the prefixed one", () => {
    expect(servedValue({ x: null, "a:x": 3 }, "x")).toBe(3);
  });
});

describe("refsOf and servedValue, more cases", () => {
  it("keeps the order of an array and does not de-duplicate", () => {
    expect(refsOf(["b", "a", "b"])).toEqual(["b", "a", "b"]);
  });
  it("trims the address inside an {@id} and drops an {@id} that is only spaces", () => {
    expect(refsOf([{ "@id": "  " }, { "@id": " c " }])).toEqual(["c"]);
  });
  it("reads an empty string and an empty array as nothing", () => {
    expect(refsOf("")).toEqual([]);
    expect(refsOf([])).toEqual([]);
  });
  it("servedValue keeps a falsy bare value (0, empty string, false) and does not fall through to the prefixed key", () => {
    expect(servedValue({ x: 0, "a:x": 9 }, "x")).toBe(0);
    expect(servedValue({ x: "", "a:x": 9 }, "x")).toBe("");
    expect(servedValue({ x: false, "a:x": 9 }, "x")).toBe(false);
  });
});
