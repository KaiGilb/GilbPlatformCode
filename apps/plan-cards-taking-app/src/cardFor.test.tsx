// Which component draws which type. The four cards draw the same lines for the same record (each is the plan-card engine under its own
// name; the record's type decides the lines), so a wrong choice would not show in a drawn page: it is checked here, by identity.
import { beforeEach, describe, expect, test } from "vitest";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { recordFromServed } from "@kaigilb/gilbplatformcode-lws-records";
import { ValueCard } from "@kaigilb/gilbplatformcode-value-card";
import { FunctionCard } from "@kaigilb/gilbplatformcode-function-card";
import { SolutionCard } from "@kaigilb/gilbplatformcode-solution-card";
import { ResourceCard } from "@kaigilb/gilbplatformcode-resource-card";
import { cardFor } from "./cardFor";
import { ORIGIN } from "../test/fakeVault";

const rec = (type: string | null) => recordFromServed("r1", { "@id": `${ORIGIN}/base/e/r1`, ...(type ? { "@type": type } : {}) }, '"v1"');

beforeEach(() => setBaseOrigin(ORIGIN));

describe("cardFor", () => {
  test.each([
    ["t:Value", ValueCard],
    ["t:Function", FunctionCard],
    ["t:Solution", SolutionCard],
    ["t:Resource", ResourceCard],
    [`${ORIGIN}/base/t/Value`, ValueCard],
  ] as const)("%s is drawn by its own card", (type, Card) => {
    expect(cardFor(rec(type))).toBe(Card);
  });
  test("the four cards are four different components", () => {
    expect(new Set([ValueCard, FunctionCard, SolutionCard, ResourceCard]).size).toBe(4);
  });
  test("another type has no card", () => {
    expect(cardFor(rec("t:Task"))).toBeNull();
  });
  test("a record that names no type has no card (it is not a Development Resource)", () => {
    expect(cardFor(rec(null))).toBeNull();
  });
});
