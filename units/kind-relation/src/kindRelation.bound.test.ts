// A kind PUT that never settles ends writeTie with the wait named, after the kind bound.
// A mutant in which `boundKindStep` passes the promise through is killed by this test.
// The wait is fake time: the bound is crossed by advancing the clock, nothing sleeps.
import { afterEach, describe, expect, it, vi } from "vitest";
// The ontology answers both attribute spellings at once (no network in a unit test).
vi.mock("@kaigilb/gilbplatformcode-term-slots", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-term-slots")>()), attributeSpelling: async (n: string) => n }));
import { writeTie, __setKindWriteBoundForTest } from "./kindRelation";

describe("writeTie — a kind write that never settles", () => {
  afterEach(() => {
    vi.useRealTimers();
    __setKindWriteBoundForTest(null);
  });
  it("rejects with 'writing the kind relation timed out' and does not report success", async () => {
    vi.useFakeTimers();
    __setKindWriteBoundForTest(40);
    const vault = { vaultId: "https://ann.platform.example.test/vault", entity: "https://ann.platform.example.test/vault/e/me" } as never;
    const run = writeTie(
      { vault, subject: "https://ann.platform.example.test/vault/e/ben", curie: "t:ColleagueOf", holder: "https://ann.platform.example.test/vault/e/me" } as never,
      { readRows: async () => [], readDoc: async () => null, write: () => new Promise(() => {}), lock: (_n: string, act: () => Promise<unknown>) => act() } as never,
    );
    const settled = run.then(() => "ok" as const, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(40);
    const err = await settled;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/writing the kind relation timed out$/);
  });
});
