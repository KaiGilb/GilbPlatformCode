import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the package's exports", () => {
  it("are exactly these values", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["MAX_BUSY_FAILS", "MAX_OTHER_FAILS", "RETRY_DELAYS_MS", "afterFailure", "busyDelayMs", "classifyWith", "dropOp", "idbStore", "listOps", "listOpsFor", "memoryStore", "newOpId", "opStatus", "opsFor", "progressOf", "queueStore", "resetForRetry", "saveOp", "setQueueDbName", "setQueueStore", "stampOp", "stopsFlush"].sort(),
    );
  });
  it("newOpId gives a fresh id each time", () => {
    expect(unit.newOpId()).not.toBe(unit.newOpId());
  });
});
