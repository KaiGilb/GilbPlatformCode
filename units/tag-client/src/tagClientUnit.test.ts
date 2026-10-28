import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's export list", () => {
  it("is the batch read, its constants, its error and its route test; `asObject` stays private", () => {
    expect(Object.keys(unit).sort()).toEqual(["MASTERS_BATCH_MAX", "NO_TAG_ROUTES_SENTENCE", "NoTagRoutesError", "isRouteMissing", "readMainTags"].sort());
  });
});
