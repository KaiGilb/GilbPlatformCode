// A sign-in failure on a name read makes names() reject with the door's own error; every other failure is `unavailable` for that row.
import { describe, expect, it } from "vitest";
import { sleep } from "../test/clock";
import {
  NAME_READ_CONCURRENCY,
  createStakeholderListReader,
  type NameAnswer,
  type StakeholderListDeps,
} from "./index";
import {
  isCredentialSurfaceError,
} from "@kaigilb/gilbplatformcode-credential-surface";
import {
  type AtomicPlacement,
  type ConnectionsReading,
} from "@kaigilb/gilbplatformcode-person-connections";

const PP: AtomicPlacement = { context: "personal", depth: "first-degree" };
const CORA = "https://holder.example.test/vault";
const who = (n: string | number): string => `https://p${n}.example.test/vault`;

/** An error as the host's sign-in layer throws it: only its `name` is read. */
function named(name: string, message = name): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

/** The five credential error names. */
const CREDENTIAL_NAMES = [
  "NotSignedInError",
  "CredentialRefusedError",
  "CredentialExpiredError",
  "PublicCardViewerMismatchError",
  "OriginNotAllowedError",
] as const;

/** `count` placed people, no records; `readName` is the test's own. Counts each name read and the most in flight. */
function harness(count: number, readName: (principal: string) => Promise<NameAnswer>) {
  const calls = { readName: 0, other: 0 };
  const inFlight = { now: 0, max: 0 };
  const tick = () => sleep(1);
  const deps: StakeholderListDeps = {
    holder: CORA,
    vaults: [CORA],
    ownCardIds: [],
    async connections(): Promise<ConnectionsReading> {
      calls.other++;
      return { holder: CORA, vaultId: CORA, sets: [], people: Array.from({ length: count }, (_, i) => ({ principal: who(i), placements: [PP] })) };
    },
    async listRecords() {
      calls.other++;
      return { records: [], next: null };
    },
    async linkedRecordIds() {
      calls.other++;
      return [];
    },
    async readLink() {
      calls.other++;
      return { state: "none" };
    },
    async resolve() {
      calls.other++;
      return { kind: "none" };
    },
    async readName(principal) {
      calls.readName++;
      inFlight.now++;
      inFlight.max = Math.max(inFlight.max, inFlight.now);
      try {
        await tick();
        return await readName(principal);
      } finally {
        inFlight.now--;
      }
    },
  };
  return { deps, calls, inFlight };
}

describe("createStakeholderListReader", () => {
  describe("names: a sign-in failure is passed through, every other failure stays 'unavailable'", () => {
    // A credential failure says the signed-out sentence, so the list must be told it was one.
    it.each(CREDENTIAL_NAMES)("a door that throws %s: names() rejects with that same error, and the package's test says so", async (name) => {
      const thrown = named(name);
      const { deps } = harness(1, async () => {
        throw thrown;
      });
      const reader = createStakeholderListReader(deps);
      await reader.read();
      const err = await reader.names([who(0)]).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBe(thrown);
      expect((err as Error).name).toBe(name);
      expect(isCredentialSurfaceError(err)).toBe(true);
    });

    // every other failure is "Name could not be read" for that row only, never an exception that empties a list.
    it.each([
      ["a plain Error", new Error("503 Service Unavailable")],
      ["a TypeError (network)", new TypeError("Failed to fetch")],
      ["an AbortError", named("AbortError")],
      ["a not-a-person error", named("NotAPersonError")],
      ["a non-Error value", "boom"],
      ["an object carrying status 401 but no credential name", Object.assign(new Error("401"), { status: 401 })],
    ])("a door that throws %s: names() resolves with 'unavailable'", async (_label, thrown) => {
      const { deps } = harness(1, async () => {
        throw thrown;
      });
      const reader = createStakeholderListReader(deps);
      await reader.read();
      const out = await reader.names([who(0)]);
      expect(out.get(who(0))).toEqual({ state: "unavailable" });
      expect(isCredentialSurfaceError(thrown)).toBe(false);
    });

    it("an 'unavailable' answer (not a throw) is still 'unavailable'", async () => {
      const { deps } = harness(1, async () => ({ kind: "unavailable" }));
      const reader = createStakeholderListReader(deps);
      await reader.read();
      expect((await reader.names([who(0)])).get(who(0))).toEqual({ state: "unavailable" });
    });

    // Spec: List.Coverage — a sign-in failure is not an answer: after signing in again, "Try again" reads the name.
    it("a sign-in failure is not kept: the next names() asks again and gets the name", async () => {
      let signedIn = false;
      const { deps, calls } = harness(1, async () => {
        if (!signedIn) throw named("NotSignedInError");
        return { kind: "name", name: "Walt Hale" };
      });
      const reader = createStakeholderListReader(deps);
      await reader.read();
      await expect(reader.names([who(0)])).rejects.toMatchObject({ name: "NotSignedInError" });
      signedIn = true;
      expect((await reader.names([who(0)])).get(who(0))).toEqual({ state: "name", name: "Walt Hale" });
      expect(calls.readName).toBe(2);
      // Kept now: a third ask sends nothing.
      await reader.names([who(0)]);
      expect(calls.readName).toBe(2);
    });

    it("two asks for the same name at once share one read, and both are told about the sign-in failure", async () => {
      const { deps, calls } = harness(1, async () => {
        throw named("CredentialExpiredError");
      });
      const reader = createStakeholderListReader(deps);
      await reader.read();
      const both = await Promise.allSettled([reader.names([who(0)]), reader.names([who(0)])]);
      expect(calls.readName).toBe(1);
      expect(both.map((s) => (s.status === "rejected" ? (s.reason as Error).name : s.status))).toEqual([
        "CredentialExpiredError",
        "CredentialExpiredError",
      ]);
    });

    // Spec: List.RequestsPerScreen — passing the failure through sends no request more or fewer than reading 'unavailable'.
    it("request count: a window of 10 with a sign-in failure costs the same name reads as with a 503, 3 at a time at most", async () => {
      const window = Array.from({ length: 10 }, (_, i) => who(i));
      const run = async (fail: (principal: string) => unknown) => {
        const h = harness(30, async (p) => {
          const e = fail(p);
          if (e) throw e;
          return { kind: "name", name: p };
        });
        const reader = createStakeholderListReader(h.deps);
        await reader.read();
        const before = { ...h.calls };
        const settled = await reader.names(window).then(
          (m) => m,
          (e: unknown) => e,
        );
        // Let every read already started finish, so the count is the whole cost of the call.
        await sleep(50);
        return { settled, names: h.calls.readName - before.readName, other: h.calls.other - before.other, max: h.inFlight.max };
      };
      const signedOut = await run((p) => (p === who(4) ? named("CredentialRefusedError") : null));
      const unavailable = await run((p) => (p === who(4) ? new Error("503") : null));
      expect(signedOut.settled).toMatchObject({ name: "CredentialRefusedError" });
      expect(unavailable.settled).toBeInstanceOf(Map);
      expect(signedOut.names).toBe(10);
      expect(unavailable.names).toBe(10);
      expect(signedOut.other).toBe(0);
      expect(unavailable.other).toBe(0);
      expect(signedOut.max).toBeLessThanOrEqual(NAME_READ_CONCURRENCY);
      expect(unavailable.max).toBeLessThanOrEqual(NAME_READ_CONCURRENCY);
    });

    it("the names read before the sign-in failure in the same call are kept and not read again", async () => {
      const window = [who(0), who(1), who(2), who(3)];
      let signedIn = false;
      const { deps, calls } = harness(4, async (p) => {
        if (p === who(3) && !signedIn) throw named("NotSignedInError");
        return { kind: "name", name: p };
      });
      const reader = createStakeholderListReader(deps);
      await reader.read();
      await expect(reader.names(window)).rejects.toMatchObject({ name: "NotSignedInError" });
      await sleep(20);
      expect(calls.readName).toBe(4);
      signedIn = true;
      const out = await reader.names(window);
      expect(calls.readName).toBe(5);
      expect([...out.values()].every((s) => s.state === "name")).toBe(true);
    });
  });

  describe("isCredentialSurfaceError", () => {
    it.each(CREDENTIAL_NAMES)("%s is a credential failure", (name) => {
      expect(isCredentialSurfaceError(named(name))).toBe(true);
      // Only the name is read: a plain object carrying it counts too.
      expect(isCredentialSurfaceError({ name })).toBe(true);
    });

    it.each([null, undefined, "NotSignedInError", 401, {}, { name: 401 }, new Error("NotSignedInError"), named("CodeRejectedError")])(
      "%s is not",
      (v) => {
        expect(isCredentialSurfaceError(v)).toBe(false);
      },
    );
  });
});
