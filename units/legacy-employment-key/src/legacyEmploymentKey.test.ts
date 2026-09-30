import { describe, expect, it } from "vitest";
import { employmentIndexOfKey, employmentKeys } from "./legacyEmploymentKey";

describe("legacy employment keys", () => {
  it("reads an unsuffixed key as index 1, and keeps the digits otherwise", () => {
    expect(employmentIndexOfKey("orgName")).toBe(1);
    expect(employmentIndexOfKey("orgName1")).toBe(1);
    expect(employmentIndexOfKey("title2")).toBe(2);
    expect(employmentIndexOfKey("title0")).toBe(0);
    expect(employmentIndexOfKey("emp1")).toBeNull();
    expect(employmentIndexOfKey("OrgName")).toBeNull();
    expect(employmentIndexOfKey("orgName2x")).toBeNull();
    expect(employmentIndexOfKey("")).toBeNull();
  });

  it("writes index 1 without a number, and does not special-case zero", () => {
    expect(employmentKeys(1)).toEqual({ org: "orgName", title: "title" });
    expect(employmentKeys(2)).toEqual({ org: "orgName2", title: "title2" });
    expect(employmentKeys(0)).toEqual({ org: "orgName0", title: "title0" });
  });
});
