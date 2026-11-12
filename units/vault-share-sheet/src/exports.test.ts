import { describe, expect, it } from "vitest";
import * as unit from "./index";
import * as model from "./model";

describe("the unit's exports", () => {
  it("the model entry is exactly these", () => {
    expect(Object.keys(model).sort()).toEqual(["accessFailure", "accessRows", "defaultShareApi", "granteeFromInput", "loadAccessView"]);
  });
  it("the React entry is the model's plus the hook, the sheet and the words", () => {
    expect(Object.keys(unit).sort()).toEqual([...Object.keys(model), "VaultShareSheet", "defaultWords", "useVaultShare"].sort());
  });
});
