import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's export list", () => {
  it("is exactly the symbols the Plan-card record hooks reach, with the platform client they need", () => {
    expect(Object.keys(unit).sort()).toEqual(["PlatformError", "RECORD_PAGE_LIMIT", "RecordListError", "headRecordState", "request", "routeUrl", "syncRecordChanges", "vaultSegment"].sort());
  });
});
