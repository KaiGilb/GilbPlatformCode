// New. Pins the export list of the package, so an export added or dropped by a later change is a decision and not an accident.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("plan-record-hooks exports", () => {
  it("are exactly these (the types are erased)", () => {
    expect(Object.keys(unit).sort()).toEqual([
      "LIST_FRESH_MS",
      "LIST_SLICE_ROWS",
      "RECORDS_PREFETCH_KEPT_CAP",
      "RECORDS_PREFETCH_ROWS_CAP",
      "RECORDS_SNAPSHOT_KEY_HEAD",
      "RECORD_DELETE_KEY",
      "RetypeChangedElsewhereError",
      "VAULT_FILES_KEY_ROOT",
      "canReadVault",
      "clearFreshlyCreated",
      "consumeFreshlyCreated",
      "createWiring",
      "heldVaultIds",
      "isFreshlyCreated",
      "isRecordDeleteKey",
      "keysSavedElsewhere",
      "markFreshlyCreated",
      "matchWorkingSetQuery",
      "refreshMultiVaultLists",
      "typeFacetKey",
      "useCreateRecord",
      "useDeleteRecord",
      "useRecords",
      "useRetypeRecord",
      "useVaultFilesMulti",
      "vaultFilesKey",
      "watchRecordDeletes",
    ]);
  });
  it("the hooks and the caps are what the hosts use", () => {
    for (const name of ["useRecords", "useCreateRecord", "useRetypeRecord", "useDeleteRecord", "useVaultFilesMulti", "markFreshlyCreated", "typeFacetKey", "heldVaultIds"] as const) expect(typeof unit[name]).toBe("function");
    expect(unit.LIST_SLICE_ROWS).toBe(20);
    expect(unit.RECORDS_PREFETCH_KEPT_CAP).toBe(40);
    expect(unit.RECORDS_PREFETCH_ROWS_CAP).toBe(200);
    expect(unit.LIST_FRESH_MS).toBe(15_000);
    expect(unit.RECORD_DELETE_KEY).toEqual(["base", "record-delete"]);
  });
  it("the retype error carries the record as stored", () => {
    const stored = { id: "x" } as never;
    const e = new unit.RetypeChangedElsewhereError(stored);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("RetypeChangedElsewhereError");
    expect(e.stored).toBe(stored);
    expect(new unit.RetypeChangedElsewhereError(null).stored).toBeNull();
    expect(e.message).toMatch(/changed elsewhere/);
  });
});
