import { describe, expect, test } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  test("the value exports, by name", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "ContactKindChip",
        "ContactKindChips",
        "ContactKindChooser",
        "GILBAPP_CHIP_HELP",
        "HolderImage",
        "PLACEMENT_BAND_TITLE",
        "PLACEMENT_CHIP_HELP",
        "PersonPlacementChips",
        "StakeholderContactHeader",
        "StakeholderContactHeaderHostContext",
        "USER_VOCAB_KEY",
        "VocabUnreadableError",
        "contactImageType",
        "holderCaption",
        "holderFaceKey",
        "holderPersonName",
        "isOwnVault",
        "predicateCurieKey",
        "readHeaderVocab",
        "useHeaderRelations",
        "useHolderFace",
        "useHolderPersonName",
        "useStakeholderContactHeaderHost",
      ].sort(),
    );
  });
  test("the components and hooks are functions", () => {
    for (const n of ["ContactKindChip", "ContactKindChips", "ContactKindChooser", "HolderImage", "PersonPlacementChips", "StakeholderContactHeader", "useHeaderRelations", "useHolderFace", "useHolderPersonName", "useStakeholderContactHeaderHost", "contactImageType", "holderCaption", "holderFaceKey", "holderPersonName", "isOwnVault", "predicateCurieKey", "readHeaderVocab"] as const) {
      expect(typeof unit[n], n).toBe("function");
    }
  });
  test("contactImageType: the first of the kind and its ancestors that is a person, else the kind; null for none", () => {
    const T = (n: string) => `https://ontology.example.test/base/t/${n}`;
    expect(unit.contactImageType(null)).toBeNull();
    expect(unit.contactImageType({ kind: T("Customer"), ancestors: [T("Agent"), T("Person")] })).toBe(T("Person"));
    expect(unit.contactImageType({ kind: T("Person"), ancestors: [] })).toBe(T("Person"));
    expect(unit.contactImageType({ kind: T("Project"), ancestors: [T("Thing")] })).toBe(T("Project"));
  });
});
