// The reading query: null field sets are `skipToken`, and a field set's query function is a function.
import { beforeEach, describe, expect, it } from "vitest";
import { skipToken } from "@tanstack/react-query";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { pickerReadingQuery } from "./recordPerson";

beforeEach(() => {
  resetTermOrigin();
  setTermOrigin("https://ontology.example.test");
});

describe("pickerReadingQuery", () => {
  it("null field sets are skipToken; a field set's queryFn is a function", () => {
    expect(pickerReadingQuery(null).queryFn).toBe(skipToken);
    expect(typeof pickerReadingQuery({} as StakeholderFieldSets).queryFn).toBe("function");
  });
});
