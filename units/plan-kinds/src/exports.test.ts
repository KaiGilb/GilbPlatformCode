import { describe, expect, test } from "vitest";
import * as api from "./index";

describe("the export list is the source's", () => {
  test("every value export, by name", () => {
    expect(Object.keys(api).sort()).toEqual([
      "PLAN_CREATE_TYPES",
      "PLAN_FIELD_LABELS",
      "PLAN_FIELD_ORDER",
      "PLAN_HIDDEN_FIELDS",
      "PLAN_ONLY_TYPE_IDS",
      "PLAN_TYPE_FIELD_LABELS",
      "PLAN_VALUE_LINE_LABELS",
      "isPlanRecordType",
      "isPlanType",
      "isResourceType",
      "isValueCardType",
      "planCardTypeNames",
      "planLevelDefault",
      "planLinesFor",
      "planSolutionTypeNames",
      "planTypeChangeSentence",
      "planTypeFieldLabel",
      "planTypeNames",
      "planTypePair",
    ]);
  });
});
