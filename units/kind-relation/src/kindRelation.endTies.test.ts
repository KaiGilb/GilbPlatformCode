// Two tabs or two devices end the SAME tie at once. Ending is idempotent: a refused end whose tie reads back ENDED is done; one that still
// reads live, or cannot be read, stays an error. Removing takes the same browser lock as writing. The end and the document reader are mocks
// of the one peer that holds them.
import { beforeEach, describe, expect, it, vi } from "vitest";

const doors = vi.hoisted(() => ({ end: vi.fn(), read: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-lws-relations", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-relations")>()),
  endRelation: doors.end,
  readRelationDoc: doors.read,
}));

// eslint-disable-next-line import/first
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
// eslint-disable-next-line import/first
import { endKindRelations, endTies, isEndedRelationDoc, tieLockName, type KindVault } from "./kindRelation";

const VNS = "https://ann.platform.example.test/base";
const TIE = `${VNS}/r/abc123`;
const CONTACT = `${VNS}/e/ben`;
const VAULT: KindVault = { vaultId: VNS, entity: `${VNS}/e/vault-entity`, represents: null };
const refused500 = () => new Error('Not ended: the vault refused (500). {"error":"InternalServerError"}');
const live = { id: "abc123", uri: TIE, typeCurie: "t:FriendOf", sourceUri: CONTACT, targetUri: VAULT.entity, extras: {} };
const endedDoc = { id: "abc123", uri: TIE, typeCurie: "t:FriendOf", sourceUri: null, targetUri: null, extras: { "a:relationLifecycleState": "ended" } };

beforeEach(() => {
  doors.end.mockReset();
  doors.read.mockReset();
});

describe("isEndedRelationDoc", () => {
  it("reads the lifecycle stamp, and a relation with no roles left, as ended; a live one is not", () => {
    expect(isEndedRelationDoc(endedDoc)).toBe(true);
    expect(isEndedRelationDoc({ ...endedDoc, extras: { relationLifecycleState: ["ended"] } })).toBe(true);
    expect(isEndedRelationDoc({ ...live, sourceUri: null, targetUri: null })).toBe(true);
    expect(isEndedRelationDoc({ ...live, extras: { "a:relationLifecycleState": "ended" } })).toBe(true);
    expect(isEndedRelationDoc(live)).toBe(false);
    expect(isEndedRelationDoc({ ...live, sourceUri: null })).toBe(false);
  });
});

describe("a refused end (another tab or device ended the same tie at the same moment)", () => {
  it("the tie reads back ENDED: done, no error, and the read-back asked the tie's own address", async () => {
    doors.end.mockRejectedValue(refused500());
    doors.read.mockResolvedValue(endedDoc);
    await expect(endKindRelations(VNS, [TIE])).resolves.toBeUndefined();
    expect(doors.read).toHaveBeenCalledWith(TIE, VNS);
  });
  it("the tie still reads LIVE: the vault's refusal is said as it is", async () => {
    doors.end.mockRejectedValue(refused500());
    doors.read.mockResolvedValue(live);
    await expect(endKindRelations(VNS, [TIE])).rejects.toThrow("refused (500)");
  });
  it("the read-back is not found or fails: not proven ended, so the refusal stands", async () => {
    doors.end.mockRejectedValue(refused500());
    doors.read.mockResolvedValue(null);
    await expect(endKindRelations(VNS, [TIE])).rejects.toThrow("refused (500)");
    doors.read.mockRejectedValue(new Error("network"));
    await expect(endKindRelations(VNS, [TIE])).rejects.toThrow("refused (500)");
  });
  it("a sign-in failure is not read back and not hidden", async () => {
    doors.end.mockRejectedValue(new NotSignedInError());
    doors.read.mockResolvedValue(endedDoc);
    await expect(endKindRelations(VNS, [TIE])).rejects.toBeInstanceOf(NotSignedInError);
    expect(doors.read).not.toHaveBeenCalled();
  });
  it("one tie ended by the other side does not stop the next tie from being ended", async () => {
    const second = `${VNS}/r/def456`;
    doors.end.mockRejectedValueOnce(refused500()).mockResolvedValueOnce({ relation: second, changed: true, verified: true });
    doors.read.mockResolvedValue(endedDoc);
    await endKindRelations(VNS, [TIE, second]);
    expect(doors.end.mock.calls.map((c) => c[0])).toEqual([TIE, second]);
  });
});

describe("removing takes the same browser lock as writing", () => {
  it("endTies ends inside the lock named for this vault and contact", async () => {
    doors.end.mockResolvedValue({ relation: TIE, changed: true, verified: true });
    const held: string[] = [];
    let inside = false;
    const lock = vi.fn(async (name: string, act: () => Promise<unknown>) => {
      held.push(name);
      inside = true;
      try {
        return await act();
      } finally {
        inside = false;
      }
    });
    doors.end.mockImplementation(async () => {
      expect(inside).toBe(true);
      return { relation: TIE, changed: true, verified: true };
    });
    await endTies(VAULT, "https://id.platform.example.test/base/p/ann", CONTACT, [{ relationUri: TIE, curie: "t:FriendOf" }], { lock: lock as unknown as <T>(n: string, a: () => Promise<T>) => Promise<T> });
    expect(held).toEqual([tieLockName(VNS, CONTACT)]);
    expect(doors.end).toHaveBeenCalledTimes(1);
  });
  it("two tabs removing the same tie take turns: the vault never sees two ends at once, and both resolve", async () => {
    // A lock that queues by name, as Web Locks do across tabs.
    const queues = new Map<string, Promise<unknown>>();
    const lock = <T,>(name: string, act: () => Promise<T>): Promise<T> => {
      const run = (queues.get(name) ?? Promise.resolve()).then(act, act);
      queues.set(name, run.catch(() => undefined));
      return run;
    };
    let inFlight = 0;
    let most = 0;
    let isEnded = false;
    doors.end.mockImplementation(async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      for (let i = 0; i < 5; i++) await Promise.resolve();
      inFlight -= 1;
      if (inFlight > 0) throw refused500(); // what the platform answers to a concurrent end
      const was = isEnded;
      isEnded = true;
      return { relation: TIE, changed: !was, verified: true };
    });
    doors.read.mockImplementation(async () => (isEnded ? endedDoc : live));
    const tie = [{ relationUri: TIE, curie: "t:FriendOf" }];
    await expect(Promise.all([endTies(VAULT, "h", CONTACT, tie, { lock }), endTies(VAULT, "h", CONTACT, tie, { lock })])).resolves.toBeDefined();
    expect(most).toBe(1);
  });
});
