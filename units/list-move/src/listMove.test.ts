import { describe, expect, it } from "vitest";
import { moveIndex } from "./listMove";

describe("moveIndex", () => {
  it("moves the first item to index 2 and keeps the length", () => {
    const items = ["a", "b", "c", "d"];
    const next = moveIndex(items, 0, 2);
    expect(next).toEqual(["b", "c", "a", "d"]);
    expect(next).toHaveLength(items.length);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });

  it("returns a copy when the indexes are the same", () => {
    const items = ["a", "b"];
    const next = moveIndex(items, 1, 1);
    expect(next).toEqual(["a", "b"]);
    expect(next).not.toBe(items);
  });

  it("does not insert a hole when from is past the end", () => {
    expect(moveIndex(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});
