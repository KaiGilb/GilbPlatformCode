// @vitest-environment node
// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these (the types are erased)", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "AdderCardHostContext",
    "AdderCardHostProvider",
    "NO_OWN_VAULT_SAYS",
    "NoOwnVaultError",
    "adderCardOf",
    "landingVaultOf",
    "nameFromEmail",
    "useAdderCard",
    "useAdderCardHost",
  ]);
});
it("arities", () => {
  expect(unit.adderCardOf.length).toBe(2);
  expect(unit.landingVaultOf.length).toBe(1);
  expect(unit.nameFromEmail.length).toBe(1);
  expect(unit.useAdderCard.length).toBe(0);
});
it("the making map and the finding reader stay private", () => {
  const names = Object.keys(unit);
  expect(names).not.toContain("making");
  expect(names).not.toContain("findOrMake");
  expect(names).not.toContain("readFinding");
});
