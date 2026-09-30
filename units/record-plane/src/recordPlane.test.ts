import { describe, expect, it } from "vitest";
import {
  isAppUiPreferencesType,
  isInfrastructureEntry,
  isInternalControlType,
  isNonRecordListEntry,
  isRelationEntityUri,
  isUiPrefsRecord,
} from "./recordPlane";

describe("record plane", () => {
  it("recognises a relation address and not a vault relation path", () => {
    expect(isRelationEntityUri("https://example.test/base/r/abc")).toBe(true);
    expect(isRelationEntityUri("https://example.test/vault/r/abc")).toBe(false);
    expect(isRelationEntityUri("https://example.test/base/e/r")).toBe(false);
    expect(isRelationEntityUri(null)).toBe(false);
  });

  it("hides a file on the register and keeps it off the infrastructure test, unless it is a relation address", () => {
    expect(isNonRecordListEntry("https://example.test/base/e/1", "t:File")).toBe(true);
    expect(isInfrastructureEntry("https://example.test/base/e/1", "t:File")).toBe(false);
    expect(isInfrastructureEntry("https://example.test/base/r/1", "t:File")).toBe(true);
    expect(isNonRecordListEntry(undefined, "t:ReferenceDocument")).toBe(false);
    expect(isNonRecordListEntry(undefined, "t:Reference")).toBe(true);
    expect(isNonRecordListEntry(undefined, "ReferenceDocument")).toBe(false);
  });

  it("treats the bare preferences word as a non-record name, not as the preferences type", () => {
    expect(isAppUiPreferencesType("t:AppUiPreferences")).toBe(true);
    expect(isAppUiPreferencesType("https://example.test/base/t/AppUiPreferences")).toBe(true);
    expect(isAppUiPreferencesType("AppUiPreferences")).toBe(false);
    expect(isAppUiPreferencesType("https://example.test/vault/t/AppUiPreferences")).toBe(false);
    expect(isInternalControlType("AppUiPreferences")).toBe(true);
    expect(isUiPrefsRecord(undefined, "AppUiPreferences")).toBe(false);
    expect(isNonRecordListEntry(undefined, "https://example.test/vault/t/AppUiPreferences")).toBe(
      false,
    );
  });

  it("hides an old preferences note only when the facts are passed", () => {
    expect(isUiPrefsRecord({ baseappPref: " ui-v1 " })).toBe(true);
    expect(isUiPrefsRecord(null, null, "App UI preferences")).toBe(true);
    expect(isUiPrefsRecord({ title: "BaseApp preferences" })).toBe(true);
    expect(isNonRecordListEntry(undefined, "t:NoteDocument", { baseappPref: "ui-v1" })).toBe(true);
    expect(isNonRecordListEntry(undefined, "t:NoteDocument")).toBe(false);
    expect(isInternalControlType("filectl:%")).toBe(true);
    expect(isInternalControlType("Filectl:x")).toBe(false);
    expect(() => isInternalControlType("https://example.test/base/t/%")).toThrow(URIError);
  });
});
