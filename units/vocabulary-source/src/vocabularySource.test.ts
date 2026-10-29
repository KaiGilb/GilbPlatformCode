import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's export list", () => {
  it("is exactly the symbols the kind reader, the field-set reader and the Plan card reach", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "CarrierSelectorMissingError",
        "MAX_BOUND_MS",
        "MASTER_READ_CAP_MS",
        "MASTER_REQUEST_TIMEOUT_MS",
        "MasterTimeoutError",
        "NAMED_READ_MAX",
        "VocabularyUnavailableError",
        "bareForm",
        "boundSource",
        "cardinalityOf",
        "checkedBound",
        "encodingOf",
        "masterSource",
        "nameOfIri",
        "refsUnder",
        "spellingFromBinding",
        "spellingOfTermDoc",
        "textUnder",
        "typeAttributeOf",
        "valuesUnder",
        "withDeadline",
      ].sort(),
    );
  });
});
