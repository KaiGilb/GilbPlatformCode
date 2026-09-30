import { expect, test } from "vitest";
import { lookupValueLeaf, namespacedLookupUnitTag, presentLookupValueBody } from "./lookupText";

test("leaf is the part after the last dot", () => {
  expect(lookupValueLeaf("ReuseRegistry.Marbesa")).toBe("Marbesa");
  expect(lookupValueLeaf("Marbesa")).toBe("Marbesa");
  expect(lookupValueLeaf("")).toBe("");
  expect(lookupValueLeaf(null)).toBe("");
});

test("the body keeps its markdown and drops a byte-order mark", () => {
  expect(presentLookupValueBody("\uFEFFkeep **this**")).toBe("keep **this**");
  expect(presentLookupValueBody("a\r\nb")).toBe("a\nb");
});

test("the table name is not composed into the tag", () => {
  expect(namespacedLookupUnitTag("Table.Leaf")).toBe("Leaf");
});
