// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual(["FetchTimeoutError", "LANGUAGE_FETCH_PARALLEL", "LANGUAGE_FETCH_TIMEOUT_MS", "__poolActive", "__resetFetchPool", "pooled", "pooledGet"]);
});
it("the numbers", () => {
  expect(unit.LANGUAGE_FETCH_PARALLEL).toBe(8);
  expect(unit.LANGUAGE_FETCH_TIMEOUT_MS).toBe(8000);
});
