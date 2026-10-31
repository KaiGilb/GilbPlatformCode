import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the package's exports", () => {
  it("are exactly these values", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["ADDED_BY_COLLECT_MS", "ADDED_BY_STALE_MS", "AddedByHostContext", "AddedByLine", "HeldVisibilitySwitch", "SOURCE_NAME_MAX_ITEMS", "__resetAddedByForTest", "addedByKey", "fetchSourceNames", "useAddedBy", "useAddedByHost"].sort(),
    );
  });
  it("keeps the bounds the platform and the card rely on", () => {
    expect(unit.SOURCE_NAME_MAX_ITEMS).toBe(50);
    expect(unit.ADDED_BY_STALE_MS).toBe(60_000);
    expect(unit.addedByKey("x")).toEqual(["mynet", "added-by", "x"]);
  });
});
