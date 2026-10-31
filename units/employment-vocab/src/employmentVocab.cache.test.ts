// New. The vocabulary is cached on success only, asked once for concurrent callers, and takes the edge key it is handed; importing the file registers the type.
import { beforeEach, describe, expect, it, vi } from "vitest";

const master = vi.hoisted(() => ({ attributeSpelling: vi.fn(), typeSpelling: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-term-slots", () => master);

// eslint-disable-next-line import/first
import { isCardPartType } from "@kaigilb/gilbplatformcode-lws-vault-sets";
// eslint-disable-next-line import/first
import { __resetEmploymentVocab, EmploymentVocabUnavailableError, resolveEmploymentVocab } from "./index";

beforeEach(() => {
  __resetEmploymentVocab();
  master.attributeSpelling.mockReset().mockImplementation(async (n: string) => n);
  master.typeSpelling.mockReset().mockImplementation(async (n: string) => `t:${n}`);
});

describe("resolveEmploymentVocab", () => {
  it("Employment is a card part as soon as the file is imported, before any answer", () => {
    expect(isCardPartType("Employment")).toBe(true);
    expect(master.typeSpelling).not.toHaveBeenCalled();
  });
  it("asks the master once for callers that overlap, and once more for none that follow a success", async () => {
    await Promise.all([resolveEmploymentVocab("employment"), resolveEmploymentVocab("employment")]);
    await resolveEmploymentVocab("employment");
    expect(master.typeSpelling).toHaveBeenCalledTimes(1);
    expect(master.attributeSpelling).toHaveBeenCalledTimes(8);
  });
  it("a failure is not cached: the next call asks again and can succeed", async () => {
    master.typeSpelling.mockImplementationOnce(async () => null);
    await expect(resolveEmploymentVocab("employment")).rejects.toBeInstanceOf(EmploymentVocabUnavailableError);
    expect((await resolveEmploymentVocab("employment")).employmentType).toBe("t:Employment");
    expect(master.typeSpelling).toHaveBeenCalledTimes(2);
  });
  it("the error names every missing term and nothing else", async () => {
    master.attributeSpelling.mockImplementation(async (n: string) => (n === "org" || n === "ongoing" ? null : n));
    await expect(resolveEmploymentVocab("employment")).rejects.toThrow(/a\/org, a\/ongoing/);
  });
  it("takes the edge key it is handed, with or without the prefix, and keeps the rest cached", async () => {
    expect((await resolveEmploymentVocab("worksAt")).employment).toBe("a:worksAt");
    expect((await resolveEmploymentVocab("a:worksAt")).employment).toBe("a:worksAt");
    expect((await resolveEmploymentVocab("employment")).employment).toBe("a:employment");
    expect(master.typeSpelling).toHaveBeenCalledTimes(1);
  });
  it("registers the spelling the master answers, not only the term name", async () => {
    master.typeSpelling.mockImplementation(async () => "t:EmploymentRecord");
    await resolveEmploymentVocab("employment");
    expect(isCardPartType("https://v.example.test/base/t/EmploymentRecord")).toBe(true);
  });
  it("writes the spelling the master answers, not the term name", async () => {
    master.attributeSpelling.mockImplementation(async (n: string) => `x_${n}`);
    master.typeSpelling.mockImplementation(async (n: string) => `t:X${n}`);
    const v = await resolveEmploymentVocab("employment");
    expect(v).toMatchObject({ org: "a:x_org", jobTitle: "a:x_jobTitle", claimSlotKey: "a:x_claimSlotKey", name: "a:x_name", startDate: "a:x_startDate", endDate: "a:x_endDate", ongoing: "a:x_ongoing", workLocation: "a:x_workLocation", employmentType: "t:XEmployment", employmentTypeQuery: "XEmployment" });
  });
});
