// @vitest-environment node
// New. Pins the entry point: the three functions of the source file, no more (the record states stay private).
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly heldVersion, noteServedVersion and saveRecordSidecar", () => {
  expect(Object.keys(unit).sort()).toEqual(["heldVersion", "noteServedVersion", "saveRecordSidecar"]);
});
it("arities: noteServedVersion 3, heldVersion 1, saveRecordSidecar 5", () => {
  expect(unit.noteServedVersion.length).toBe(3);
  expect(unit.heldVersion.length).toBe(1);
  expect(unit.saveRecordSidecar.length).toBe(5);
});
