// New test: the unit's export list.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the export list", () => {
  it("is exactly these names", () => {
    expect(Object.keys(unit).sort()).toEqual(["fetchAttributeLabel", "fetchTermLabel", "prefetchVedaLabels", "useVedaTypeLabel"]);
  });
});
