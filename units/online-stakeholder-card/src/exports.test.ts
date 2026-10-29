import { describe, expect, test } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  test("the value exports, by name", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "CHECK_FAILED",
        "LINK_FAILED_KEPT",
        "LINK_FAILED_REMOVED",
        "LINK_FAILED_TAG_KEPT",
        "NOT_A_STAKEHOLDER",
        "OnlineStakeholderCard",
        "OnlineStakeholderCardHostContext",
        "REMOVE_FAILED",
        "SAVE_FAILED",
        "useOnlineStakeholderCardHost",
      ].sort(),
    );
  });
  test("the component, the hook and the message functions are functions; the message constants are strings", () => {
    for (const n of ["OnlineStakeholderCard", "useOnlineStakeholderCardHost", "LINK_FAILED_KEPT", "REMOVE_FAILED", "LINK_FAILED_TAG_KEPT"] as const) {
      expect(typeof unit[n], n).toBe("function");
    }
    for (const n of ["CHECK_FAILED", "LINK_FAILED_REMOVED", "SAVE_FAILED", "NOT_A_STAKEHOLDER"] as const) {
      expect(typeof unit[n], n).toBe("string");
    }
  });
  test("the host context has no default: its value is null", () => {
    // A React context object keeps its default on `_currentValue`.
    expect((unit.OnlineStakeholderCardHostContext as unknown as { _currentValue: unknown })._currentValue).toBeNull();
  });
});
