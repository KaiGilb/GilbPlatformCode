// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "FLAG_BACKOFF_MAX_MS",
    "FLAG_BACKOFF_MS",
    "FLAG_TTL_MS",
    "FlagReadError",
    "__resetFlags",
    "flagSvgIsComplete",
    "flagSvgIsSafe",
    "flagSvgStarts",
    "geoFlagSource",
    "readFlag",
    "setFlagSource",
    "setFlagStore",
  ]);
});
it("the times", () => {
  expect(unit.FLAG_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  expect(unit.FLAG_BACKOFF_MS).toBe(60_000);
  expect(unit.FLAG_BACKOFF_MAX_MS).toBe(600_000);
});
