// The organization's own terms are the master's answer by term name; fail closed; cached on success only.
// The app has no test of orgTerms.ts alone (its other tests mock it), so every test here is new.
import { beforeEach, describe, expect, it, vi } from "vitest";

const spelling = vi.hoisted(() => vi.fn());
vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({ attributeSpelling: spelling }));

// eslint-disable-next-line import/first
import { OrgTermsUnavailableError, __resetOrgTerms, resolveOrgTerms } from "./orgTerms";

beforeEach(() => {
  __resetOrgTerms();
  spelling.mockReset();
});

describe("resolveOrgTerms", () => {
  it("answers the bare spellings the master named, asking logo, parentOrganization, employer in that order", async () => {
    spelling.mockImplementation(async (n: string) => `${n}X`);
    expect(await resolveOrgTerms()).toEqual({ logo: "logoX", parentOrganization: "parentOrganizationX", employer: "employerX" });
    expect(spelling.mock.calls).toEqual([["logo"], ["parentOrganization"], ["employer"]]);
  });
  it("adds no a: prefix to an answer", async () => {
    spelling.mockImplementation(async (n: string) => n);
    expect((await resolveOrgTerms()).logo).toBe("logo");
  });
  it("is served from the cache on the second call: the same promise, no new ask", async () => {
    spelling.mockImplementation(async (n: string) => n);
    const first = resolveOrgTerms();
    expect(resolveOrgTerms()).toBe(first);
    await first;
    await resolveOrgTerms();
    expect(spelling).toHaveBeenCalledTimes(3);
  });
  it("forgets the cache when __resetOrgTerms is called", async () => {
    spelling.mockImplementation(async (n: string) => n);
    const first = await resolveOrgTerms();
    __resetOrgTerms();
    const second = await resolveOrgTerms();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(spelling).toHaveBeenCalledTimes(6);
  });
  it("fails CLOSED when one term does not answer, naming it as a/<term>", async () => {
    spelling.mockImplementation(async (n: string) => (n === "parentOrganization" ? null : n));
    const err = await resolveOrgTerms().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrgTermsUnavailableError);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("OrgTermsUnavailableError");
    expect((err as Error).message).toBe("The ontology did not name a/parentOrganization, so this part of the organization card is not available right now.");
  });
  it("names every missing term in the order logo, parentOrganization, employer", async () => {
    spelling.mockResolvedValue(null);
    const err = await resolveOrgTerms().catch((e: unknown) => e);
    expect((err as Error).message).toBe("The ontology did not name a/logo, a/parentOrganization, a/employer, so this part of the organization card is not available right now.");
  });
  it("does not cache a failure: the next call asks again and can succeed", async () => {
    spelling.mockImplementation(async (n: string) => (n === "employer" ? null : n));
    await expect(resolveOrgTerms()).rejects.toBeInstanceOf(OrgTermsUnavailableError);
    spelling.mockImplementation(async (n: string) => n);
    await expect(resolveOrgTerms()).resolves.toEqual({ logo: "logo", parentOrganization: "parentOrganization", employer: "employer" });
    expect(spelling).toHaveBeenCalledTimes(6);
  });
  it("passes a rejection of the spelling read on, and forgets it", async () => {
    spelling.mockRejectedValueOnce(new Error("offline")).mockResolvedValue("x");
    await expect(resolveOrgTerms()).rejects.toThrow("offline");
    await expect(resolveOrgTerms()).resolves.toEqual({ logo: "x", parentOrganization: "x", employer: "x" });
  });
  it("treats an empty spelling as unanswered", async () => {
    spelling.mockImplementation(async (n: string) => (n === "logo" ? "" : n));
    await expect(resolveOrgTerms()).rejects.toBeInstanceOf(OrgTermsUnavailableError);
  });
  it("gives a concurrent caller the pending promise, not a second ask", async () => {
    const releases: Array<(v: string) => void> = [];
    spelling.mockImplementation(() => new Promise<string>((r) => { releases.push(r); }));
    const a = resolveOrgTerms();
    const b = resolveOrgTerms();
    expect(b).toBe(a);
    expect(spelling).toHaveBeenCalledTimes(3);
    releases.forEach((r) => r("v"));
    await a;
  });
});
