// The employer/employee spellings are the master's answer by term name; fail closed; asked again after a miss.
// The first two tests are the app's own (lib/mynet/employment/employmentLinkVocab.s8org.test.ts), with the term-slots peer mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const spelling = vi.hoisted(() => vi.fn());
vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({ attributeSpelling: spelling }));

// eslint-disable-next-line import/first
import { EmploymentLinkVocabUnavailableError, __resetEmploymentLinkVocab, resolveEmploymentLinkVocab } from "./employmentLinkVocab";

beforeEach(() => {
  __resetEmploymentLinkVocab();
  spelling.mockReset();
});

describe("resolveEmploymentLinkVocab", () => {
  it("answers the a:-prefixed spellings the master named, asking by the term names", async () => {
    spelling.mockImplementation(async (n: string) => n);
    expect(await resolveEmploymentLinkVocab()).toEqual({ employer: "a:employer", employee: "a:employee" });
    expect(spelling.mock.calls.map((c) => c[0]).sort()).toEqual(["employee", "employer"]);
  });
  it("fails CLOSED when a term does not answer (no guessed key) and asks again next time", async () => {
    spelling.mockImplementation(async (n: string) => (n === "employee" ? null : n));
    await expect(resolveEmploymentLinkVocab()).rejects.toBeInstanceOf(EmploymentLinkVocabUnavailableError);
    spelling.mockImplementation(async (n: string) => n);
    await expect(resolveEmploymentLinkVocab()).resolves.toEqual({ employer: "a:employer", employee: "a:employee" });
  });
});

describe("resolveEmploymentLinkVocab, pinned", () => {
  it("asks employer first, then employee, both at once, with the term name only", async () => {
    spelling.mockImplementation(async (n: string) => n);
    await resolveEmploymentLinkVocab();
    expect(spelling.mock.calls).toEqual([["employer"], ["employee"]]);
  });
  it("keeps each term's own answer under its own key, whatever the master spells", async () => {
    spelling.mockImplementation(async (n: string) => (n === "employer" ? "worksFor" : "staffMember"));
    expect(await resolveEmploymentLinkVocab()).toEqual({ employer: "a:worksFor", employee: "a:staffMember" });
  });
  it("is served from the cache on the second call: the same promise, no new ask", async () => {
    spelling.mockImplementation(async (n: string) => n);
    const first = resolveEmploymentLinkVocab();
    const second = resolveEmploymentLinkVocab();
    expect(second).toBe(first);
    await first;
    expect(await resolveEmploymentLinkVocab()).toEqual({ employer: "a:employer", employee: "a:employee" });
    expect(spelling).toHaveBeenCalledTimes(2);
  });
  it("forgets the cache when __resetEmploymentLinkVocab is called", async () => {
    spelling.mockImplementation(async (n: string) => n);
    await resolveEmploymentLinkVocab();
    __resetEmploymentLinkVocab();
    await resolveEmploymentLinkVocab();
    expect(spelling).toHaveBeenCalledTimes(4);
  });
  it("names every missing term, as a/<term>, in the error", async () => {
    spelling.mockResolvedValue(null);
    const err = await resolveEmploymentLinkVocab().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmploymentLinkVocabUnavailableError);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("EmploymentLinkVocabUnavailableError");
    expect((err as Error).message).toBe("The ontology did not name a/employer, a/employee, so an employer cannot be linked right now.");
  });
  it("names only the missing term when one answers", async () => {
    spelling.mockImplementation(async (n: string) => (n === "employer" ? null : n));
    const err = await resolveEmploymentLinkVocab().catch((e: unknown) => e);
    expect((err as Error).message).toBe("The ontology did not name a/employer, so an employer cannot be linked right now.");
  });
  it("does not cache a failure, so the next call is a new ask", async () => {
    spelling.mockResolvedValue(null);
    await expect(resolveEmploymentLinkVocab()).rejects.toBeInstanceOf(EmploymentLinkVocabUnavailableError);
    await expect(resolveEmploymentLinkVocab()).rejects.toBeInstanceOf(EmploymentLinkVocabUnavailableError);
    expect(spelling).toHaveBeenCalledTimes(4);
  });
  it("passes a rejection of the spelling read on, and forgets it", async () => {
    spelling.mockRejectedValueOnce(new Error("offline")).mockResolvedValue("x");
    await expect(resolveEmploymentLinkVocab()).rejects.toThrow("offline");
    await expect(resolveEmploymentLinkVocab()).resolves.toEqual({ employer: "a:x", employee: "a:x" });
  });
  it("treats an empty spelling as unanswered", async () => {
    spelling.mockImplementation(async (n: string) => (n === "employee" ? "" : n));
    await expect(resolveEmploymentLinkVocab()).rejects.toBeInstanceOf(EmploymentLinkVocabUnavailableError);
  });
});
