import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's export list", () => {
  it("is exactly the symbols the Plan-card readers reach", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "APP_UI_PREFS_TYPE",
        "MAX_PARALLEL_DEREFERENCES",
        "OPEN_PAGE_SIZE",
        "PREFS_LABEL",
        "SearchUnavailableError",
        "UNTYPED_FIND",
        "bareTypeNames",
        "createLimiter",
        "findByAttribute",
        "idFromEntityUri",
        "idFromUri",
        "isAppUiPreferencesType",
        "isCardPartType",
        "isInternalControlType",
        "isNonRecordListEntry",
        "isRelationEntityUri",
        "isUiPrefsRecord",
        "listVaultFiles",
        "listVaultFilesPage",
        "listVaultRecordsPage",
        "lwsReadFetch",
        "mapWithConcurrency",
        "pageAllByAttribute",
        "planReadLimit",
        "registerCardPartTypes",
        "searchEntities",
        "typeLocalName",
      ].sort(),
    );
  });
  it("the two id readers take the segment after the last slash", () => {
    expect(unit.idFromUri("https://h.example.test/base/e/abc")).toBe("abc");
    expect(unit.idFromUri("bare")).toBe("bare");
    expect(unit.idFromEntityUri("https://h.example.test/base/e/abc")).toBe("abc");
    expect(unit.idFromEntityUri("a/b/")).toBe("");
  });
  it("bareTypeNames trims, drops blanks and repeats, and keeps the order", () => {
    expect(unit.bareTypeNames([" Task ", "", "  ", "Note", "Task"])).toEqual(["Task", "Note"]);
    expect(unit.bareTypeNames(null)).toEqual([]);
  });
});
