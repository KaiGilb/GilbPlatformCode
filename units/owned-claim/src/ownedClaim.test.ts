import { describe, expect, it } from "vitest";
import { claimsForEmployment, titleTokenOfSlot } from "./ownedClaim";

const company = { kind: "company", slot: "emp1", id: "c" };
const title = { kind: "job-title", slot: "emp1:t0:extra", id: "t" };
const otherCompany = { kind: "company", slot: "emp2", id: "c2" };
const spaced = { kind: "company", slot: "emp1 ", id: "s" };
const skill = { kind: "skill", slot: "emp1", id: "k" };

describe("claimsForEmployment", () => {
  it("keeps the company by exact slot and the title by prefix, in order", () => {
    const owned = claimsForEmployment([otherCompany, title, skill, company, spaced], "emp1");
    expect(owned.map((row) => row.id)).toEqual(["t", "c"]);
    expect(owned[0]).toBe(title);
    expect(owned[1]).toBe(company);
  });

  it("does not treat a colon slot as a company, and does not trim", () => {
    expect(claimsForEmployment([{ kind: "company", slot: "emp1:t0" }], "emp1")).toEqual([]);
    expect(claimsForEmployment([spaced], "emp1")).toEqual([]);
  });

  it("matches an empty key only against an empty company slot or a leading colon", () => {
    expect(
      claimsForEmployment(
        [
          { kind: "company", slot: "" },
          { kind: "job-title", slot: ":t0" },
          { kind: "company", slot: "emp1" },
        ],
        "",
      ).map((row) => row.slot),
    ).toEqual(["", ":t0"]);
  });
});

describe("titleTokenOfSlot", () => {
  it("keeps everything after the key and the first colon, including later colons", () => {
    expect(titleTokenOfSlot("emp1:t0:extra", "emp1")).toBe("t0:extra");
    expect(titleTokenOfSlot("emp1:", "emp1")).toBe("");
  });

  it("slices even when the slot does not start with the key", () => {
    expect(titleTokenOfSlot("emp1:t0", "")).toBe("mp1:t0");
    expect(titleTokenOfSlot("emp1:t0", "zz")).toBe("1:t0");
  });
});
