import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("are exactly these", () => {
    expect(Object.keys(unit).sort()).toEqual(["decorateSessionVaults", "listReachableVaults", "lwsVaultsUrl", "useVaults", "vaultsKey"]);
  });
});
