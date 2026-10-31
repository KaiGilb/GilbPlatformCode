// Ported from GilbApp `employmentStore.c214e7.test.ts` (the three cases that are about the vocabulary: lines 64, 84, 228), re-based:
// the master is the two spies below (the source used the fake store's), and the card-part case reads `lws-vault-sets` directly.
import { beforeEach, describe, expect, it, vi } from "vitest";

const master = vi.hoisted(() => ({ attributeSpelling: vi.fn(), typeSpelling: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-term-slots", () => master);

// eslint-disable-next-line import/first
import { isNonRecordListEntry } from "@kaigilb/gilbplatformcode-lws-vault-sets";
// eslint-disable-next-line import/first
import { __resetEmploymentVocab, EmploymentVocabUnavailableError, resolveEmploymentVocab } from "./index";

beforeEach(() => {
  __resetEmploymentVocab();
  master.attributeSpelling.mockReset().mockImplementation(async (n: string) => n);
  master.typeSpelling.mockReset().mockImplementation(async (n: string) => `t:${n}`);
});

const vocab = () => resolveEmploymentVocab("employment");

describe("the spellings are asked of the master by term name", () => {
  it("every attribute and the type come from attributeSpelling / typeSpelling; the edge key is the card's", async () => {
    const v = await vocab();
    expect(v).toMatchObject({
      employment: "a:employment",
      org: "a:org",
      jobTitle: "a:jobTitle",
      claimSlotKey: "a:claimSlotKey",
      startDate: "a:startDate",
      endDate: "a:endDate",
      ongoing: "a:ongoing",
      workLocation: "a:workLocation",
      employmentType: "t:Employment",
      employmentTypeQuery: "Employment",
    });
    expect(master.typeSpelling).toHaveBeenCalledWith("Employment");
    for (const n of ["org", "jobTitle", "claimSlotKey", "startDate", "endDate", "ongoing", "workLocation"]) {
      expect(master.attributeSpelling).toHaveBeenCalledWith(n);
    }
  });

  it("a term the master does not answer makes the vocabulary unavailable", async () => {
    master.attributeSpelling.mockImplementation(async (n: string) => (n === "jobTitle" ? null : n));
    await expect(vocab()).rejects.toBeInstanceOf(EmploymentVocabUnavailableError);
  });
});

describe("an employment entity is a part of the card", () => {
  it("is not a register row once the vocabulary is known", async () => {
    await vocab();
    expect(isNonRecordListEntry("https://v.example.test/base/e/x", "t:Employment")).toBe(true);
  });
});
