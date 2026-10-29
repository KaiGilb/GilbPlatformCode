// A slow kind write keeps one id. A second writeTie while the first is in flight PUTs that same id.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-term-slots")>()),
  attributeSpelling: async (n: string) => n,
}));

import { __resetKindRelationVocab, __setKindWriteBoundForTest, ownLiveTies, writeTie, type KindVault } from "./kindRelation";

const VNS = "https://ann.platform.example.test/vault";
const VENT = `${VNS}/e/me`;
const CONTACT = `${VNS}/e/ben`;
const HOLDER = `${VNS}/e/holder`;
const VAULT: KindVault = { vaultId: VNS, entity: VENT, represents: "https://ontology.example.test/base/t/Person" };
const CURIE = "t:ColleagueOf";

describe("writeTie — a slow write is one tie", () => {
  afterEach(() => {
    vi.useRealTimers();
    __setKindWriteBoundForTest(null);
    __resetKindRelationVocab();
  });

  it("rejects at 12s, and a second write of the same tie while the first is in flight uses the same id", async () => {
    vi.useFakeTimers();
    __setKindWriteBoundForTest(12_000);
    __resetKindRelationVocab();
    const ids: string[] = [];
    const release: (() => void)[] = [];
    let show = false;
    const row = (id: string): RecordRelation => ({
      relation: `${VNS}/r/${id}`,
      role: "role:source",
      type: CURIE,
      members: [
        { member: CONTACT, role: "role:source" },
        { member: VENT, role: "role:target" },
      ],
    });
    const readRows = vi.fn(async (): Promise<RecordRelation[]> => (show && ids[0] ? [row(ids[0])] : []));
    const readDoc = vi.fn(async (uri: string) => {
      const id = uri.slice(uri.lastIndexOf("/") + 1);
      if (!show || id !== ids[0]) return null;
      return {
        id,
        uri,
        typeCurie: CURIE,
        sourceUri: CONTACT,
        targetUri: VENT,
        extras: { "a:claimSubject": { "@id": HOLDER }, "a:visibilityTier": "private" },
      };
    });
    const readBack = vi.fn(async (uri: string) => {
      const id = uri.slice(uri.lastIndexOf("/") + 1);
      return show && id === ids[0] ? { curie: CURIE, source: CONTACT, target: VENT } : null;
    });
    const write = vi.fn((a: { id: string }) => {
      ids.push(a.id);
      return new Promise<{ id: string; uri: string }>((res) => {
        release.push(() => res({ id: a.id, uri: `${VNS}/r/${a.id}` }));
      });
    });
    const deps = {
      readRows,
      readDoc,
      readBack,
      write,
      lock: async <T,>(_n: string, act: () => Promise<T>) => act(),
      newId: vi.fn()
        .mockReturnValueOnce("aaaaaaaaaaaaaaaaaaaaaaaaaa")
        .mockReturnValueOnce("bbbbbbbbbbbbbbbbbbbbbbbbbb"),
    };
    const args = { vault: VAULT, subject: CONTACT, curie: CURIE, holder: HOLDER };
    const first = writeTie(args, deps);
    const firstSettled = first.then(() => "ok" as const, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(12_000);
    const err = await firstSettled;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/writing the kind relation timed out$/);
    const second = writeTie(args, deps);
    await vi.advanceTimersByTimeAsync(0);
    expect(ids).toEqual(["aaaaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaaaaaaaaaaaa"]);
    show = true;
    for (const go of release) go();
    await vi.advanceTimersByTimeAsync(0);
    await expect(second).resolves.toMatchObject({ id: "aaaaaaaaaaaaaaaaaaaaaaaaaa", live: true, reused: "pending" });
    expect(new Set(ids).size).toBe(1);
    expect(await ownLiveTies(args, deps)).toHaveLength(1);
  });
});
