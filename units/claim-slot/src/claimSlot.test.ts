import { describe, expect, it } from "vitest";
import {
  employmentCompanySlot,
  employmentJobTitleSlot,
  employmentKeyFromClaimSlot,
  isProfileFieldClaimKind,
  profileFieldClaimKindFromType,
} from "./claimSlot";

describe("profile field claim kinds", () => {
  it("recognises the seven kinds and nothing else", () => {
    expect(isProfileFieldClaimKind("job-title")).toBe(true);
    expect(isProfileFieldClaimKind("company")).toBe(true);
    expect(isProfileFieldClaimKind("Job-title")).toBe(false);
    expect(isProfileFieldClaimKind(" job-title")).toBe(false);
    expect(isProfileFieldClaimKind("org")).toBe(false);
    expect(isProfileFieldClaimKind("title")).toBe(false);
  });

  it("maps only the four field-row types", () => {
    expect(profileFieldClaimKindFromType("email")).toBe("email");
    expect(profileFieldClaimKindFromType("phone")).toBe("phone");
    expect(profileFieldClaimKindFromType("social")).toBe("social");
    expect(profileFieldClaimKindFromType("address")).toBe("address");
    expect(profileFieldClaimKindFromType("org")).toBeNull();
    expect(profileFieldClaimKindFromType("title")).toBeNull();
    expect(profileFieldClaimKindFromType("company")).toBeNull();
    expect(profileFieldClaimKindFromType("job-title")).toBeNull();
    expect(profileFieldClaimKindFromType("profile-photo")).toBeNull();
    expect(profileFieldClaimKindFromType("email ")).toBeNull();
    expect(profileFieldClaimKindFromType("Email")).toBeNull();
  });
});

describe("employment slots", () => {
  it("keeps the company key and joins the title with a colon", () => {
    expect(employmentCompanySlot("emp1")).toBe("emp1");
    expect(employmentCompanySlot("")).toBe("");
    expect(employmentCompanySlot(" emp1 ")).toBe(" emp1 ");
    expect(employmentJobTitleSlot("emp1", "t0")).toBe("emp1:t0");
    expect(employmentJobTitleSlot("", "t0")).toBe(":t0");
    expect(employmentJobTitleSlot("emp1", "")).toBe("emp1:");
  });

  it("reads the employment key back without guessing", () => {
    expect(employmentKeyFromClaimSlot("company", "emp1")).toBe("emp1");
    expect(employmentKeyFromClaimSlot("company", "")).toBeNull();
    expect(employmentKeyFromClaimSlot("company", "emp1:t0")).toBe("emp1:t0");
    expect(employmentKeyFromClaimSlot("job-title", "emp1:t0")).toBe("emp1");
    expect(employmentKeyFromClaimSlot("job-title", "emp1:t0:extra")).toBe("emp1");
    expect(employmentKeyFromClaimSlot("job-title", "emp1:")).toBe("emp1");
    expect(employmentKeyFromClaimSlot("job-title", ":t0")).toBeNull();
    expect(employmentKeyFromClaimSlot("email", "emp1")).toBeNull();
  });
});
