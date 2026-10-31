// @vitest-environment node
// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these (the types are erased)", () => {
  expect(Object.keys(unit).sort()).toEqual(["createResource", "deleteResource", "getResource", "patchResource", "readResources"]);
});
it("arities", () => {
  expect(unit.createResource.length).toBe(2);
  expect(unit.getResource.length).toBe(3);
  expect(unit.patchResource.length).toBe(4);
  expect(unit.deleteResource.length).toBe(3);
  expect(unit.readResources.length).toBe(2);
});
it("does not re-export the symbols that live in other units", () => {
  const names = Object.keys(unit);
  expect(names).not.toContain("entityUriInVault");
  expect(names).not.toContain("idFromResourceUri");
  expect(names).not.toContain("mapWithConcurrency");
});
