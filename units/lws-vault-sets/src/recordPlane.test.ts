import { describe, expect, it } from "vitest";
import {
  APP_UI_PREFS_TYPE,
  PREFS_LABEL,
  isAppUiPreferencesType,
  isCardPartType,
  isInternalControlType,
  isNonRecordListEntry,
  isRelationEntityUri,
  isUiPrefsRecord,
  registerCardPartTypes,
  typeLocalName,
} from "./recordPlane";

describe("typeLocalName", () => {
  it.each([
    ["t:Task", "Task"],
    ["  t:Task  ", "Task"],
    ["cost:Meter", "Meter"],
    ["https://h.example.test/base/t/Person", "Person"],
    ["https://h.example.test/base/t/Odd%20Name", "Odd Name"],
    ["https://h.example.test/base/t/Person#frag", "Person"],
    ["Bare", "Bare"],
    ["https://h.example.test/other/Thing", "https://h.example.test/other/Thing"],
  ])("%s -> %s", (input, want) => {
    expect(typeLocalName(input)).toBe(want);
  });
});

describe("isRelationEntityUri", () => {
  it("is true for an address with /base/r/ (any case), false otherwise", () => {
    expect(isRelationEntityUri("https://h.example.test/base/r/abc")).toBe(true);
    expect(isRelationEntityUri("https://h.example.test/BASE/R/abc")).toBe(true);
    expect(isRelationEntityUri("https://h.example.test/base/e/abc")).toBe(false);
    expect(isRelationEntityUri(null)).toBe(false);
    expect(isRelationEntityUri(undefined)).toBe(false);
    expect(isRelationEntityUri("")).toBe(false);
  });
});

describe("isAppUiPreferencesType", () => {
  it("knows the three spellings of the preferences type", () => {
    expect(APP_UI_PREFS_TYPE).toBe("AppUiPreferences");
    expect(isAppUiPreferencesType("t:AppUiPreferences")).toBe(true);
    expect(isAppUiPreferencesType(" https://h.example.test/base/t/AppUiPreferences ")).toBe(true);
    expect(isAppUiPreferencesType("x:AppUiPreferences")).toBe(true);
    expect(isAppUiPreferencesType("t:AppUiPreferencesTwo")).toBe(false);
    expect(isAppUiPreferencesType(null)).toBe(false);
    expect(isAppUiPreferencesType("")).toBe(false);
  });
});

describe("isUiPrefsRecord", () => {
  it("is true for the type, for the legacy marker fact and for either title", () => {
    expect(isUiPrefsRecord(null, "t:AppUiPreferences")).toBe(true);
    expect(isUiPrefsRecord({ baseappPref: " ui-v1 " }, "t:NoteDocument")).toBe(true);
    expect(isUiPrefsRecord({ title: "BaseApp preferences" }, "t:NoteDocument")).toBe(true);
    expect(isUiPrefsRecord({ title: PREFS_LABEL })).toBe(true);
    expect(isUiPrefsRecord({}, "t:NoteDocument", PREFS_LABEL)).toBe(true);
  });
  it("is false for an ordinary record and when there is nothing to look at", () => {
    expect(isUiPrefsRecord({ title: "Shopping" }, "t:NoteDocument")).toBe(false);
    expect(isUiPrefsRecord(null, "t:NoteDocument")).toBe(false);
    expect(isUiPrefsRecord(undefined)).toBe(false);
  });
});

describe("isInternalControlType", () => {
  it("is true for the control prefixes and every listed non-record name", () => {
    for (const t of ["filectl:FileContent", "cost:Meter", "t:File", "t:Vault", "t:FileContent", "t:Relation", "t:PartOf", "t:Reference", "t:Authorship", "t:DependsOn", "t:Assignment", "t:AppUiPreferences", "t:VaultAccessGrant"]) {
      expect(isInternalControlType(t), t).toBe(true);
    }
    expect(isInternalControlType("https://h.example.test/base/t/PartOf")).toBe(true);
  });
  it("is false for a record type and for an absent type", () => {
    expect(isInternalControlType("t:Person")).toBe(false);
    expect(isInternalControlType(null)).toBe(false);
    expect(isInternalControlType("")).toBe(false);
  });
});

describe("card-part types (the module's one registry)", () => {
  it("a type is a card part only after it was registered, by bare name, in any spelling", () => {
    expect(isCardPartType("t:ZzFieldClaim")).toBe(false);
    registerCardPartTypes(["https://h.example.test/base/t/ZzFieldClaim", "", "  "]);
    expect(isCardPartType("t:ZzFieldClaim")).toBe(true);
    expect(isCardPartType("https://other.example.test/base/t/ZzFieldClaim")).toBe(true);
    expect(isCardPartType("t:ZzOther")).toBe(false);
    expect(isCardPartType(null)).toBe(false);
  });
});

describe("isNonRecordListEntry", () => {
  const E = "https://h.example.test/base/e/a";
  it("keeps an ordinary record", () => {
    expect(isNonRecordListEntry(E, "t:Person")).toBe(false);
    expect(isNonRecordListEntry(null, null)).toBe(false);
  });
  it("drops a relation address, a control type, the preferences type and a legacy preferences note", () => {
    expect(isNonRecordListEntry("https://h.example.test/base/r/x", "t:Person")).toBe(true);
    expect(isNonRecordListEntry(E, "filectl:FileContent")).toBe(true);
    expect(isNonRecordListEntry(E, "t:AppUiPreferences")).toBe(true);
    expect(isNonRecordListEntry(E, "t:NoteDocument", { baseappPref: "ui-v1" })).toBe(true);
  });
  it("the legacy arm needs the facts: without them the note is kept", () => {
    expect(isNonRecordListEntry(E, "t:NoteDocument")).toBe(false);
  });
  it("drops a registered card-part type", () => {
    registerCardPartTypes(["ZzPlaceClaim"]);
    expect(isNonRecordListEntry(E, "t:ZzPlaceClaim")).toBe(true);
  });
});
