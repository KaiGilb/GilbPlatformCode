import { describe, expect, it } from "vitest";
import { canonicalPrefsRow, prefsRecordIdKey } from "./prefsRow";

describe("prefsRecordIdKey", () => {
  it("prefixes the vault id as given", () => {
    expect(prefsRecordIdKey("Vault")).toBe("baseapp.uiPrefsId:Vault");
    expect(prefsRecordIdKey(" Vault ")).toBe("baseapp.uiPrefsId: Vault ");
    expect(prefsRecordIdKey("")).toBe("baseapp.uiPrefsId:");
  });
});

describe("canonicalPrefsRow", () => {
  it("picks the smallest id and ignores recency", () => {
    const rows = [
      { id: "m", updatedAt: 1, name: "mid" },
      { id: "z", updatedAt: 99, name: "new" },
      { id: "a", updatedAt: 0, name: "old" },
    ];
    const copy = rows.map((row) => ({ ...row }));
    expect(canonicalPrefsRow(rows)).toEqual({ id: "a", updatedAt: 0, name: "old" });
    expect(rows).toEqual(copy);
    expect(canonicalPrefsRow([])).toBeNull();
  });

  it("uses code-unit order, and keeps the earlier row when ids match", () => {
    expect(canonicalPrefsRow([{ id: "a" }, { id: "B" }])?.id).toBe("B");
    expect(canonicalPrefsRow([{ id: "" }, { id: "a" }])?.id).toBe("");
    const tied = canonicalPrefsRow([
      { id: "same", which: "first" },
      { id: "same", which: "second" },
    ]);
    expect(tied).toEqual({ id: "same", which: "first" });
  });
});
