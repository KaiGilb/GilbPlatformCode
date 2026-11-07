import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the package's exports", () => {
  it("are exactly these values", () => {
    expect(Object.keys(unit).sort()).toEqual(["AccessDeniedScreen", "NoAccessError", "VaultBusyError", "readRefusal", "refusalLine"].sort());
  });
});
