// Two tabs, one pending map each (the per-device model). Tab A's kind PUT is slow and times out; tab B writes the same kind (a new id, A's has not
// landed); then A's PUT lands. A rig once showed TWO live ColleagueOf ties. This test states the invariant: one live tie per kind.
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

describe("a slow tie in one tab and the same kind written in another", () => {
  afterEach(() => { vi.useRealTimers(); __setKindWriteBoundForTest(null); __resetKindRelationVocab(); });

  it("a slow tie in tab A, the same kind written in tab B, then A lands: one live tie, never two", async () => {
    vi.useFakeTimers();
    __setKindWriteBoundForTest(12_000);
    __resetKindRelationVocab();
    const live = new Set<string>();
    const ended = new Set<string>();
    const row = (id: string): RecordRelation => ({ relation: `${VNS}/r/${id}`, role: "role:source", type: CURIE, members: [{ member: CONTACT, role: "role:source" }, { member: VENT, role: "role:target" }] });
    const tail = (u: string) => u.slice(u.lastIndexOf("/") + 1);
    const base = {
      readRows: vi.fn(async (): Promise<RecordRelation[]> => [...live].filter((i) => !ended.has(i)).map(row)),
      readDoc: vi.fn(async (uri: string) => {
        const id = tail(uri);
        if (!live.has(id) || ended.has(id)) return null;
        return { id, uri, typeCurie: CURIE, sourceUri: CONTACT, targetUri: VENT, extras: { "a:claimSubject": { "@id": HOLDER }, "a:visibilityTier": "private" } };
      }),
      readBack: vi.fn(async (uri: string) => (live.has(tail(uri)) && !ended.has(tail(uri)) ? { curie: CURIE, source: CONTACT, target: VENT } : null)),
      end: vi.fn(async (_v: string, uris: readonly string[]) => { for (const u of uris) ended.add(tail(u)); }),
      lock: async <T,>(_n: string, act: () => Promise<T>) => act(),
    };
    let releaseA: () => void = () => {};
    const tabA = { ...base, pending: new Map<string, string>(), newId: () => "aaaaaaaaaaaaaaaaaaaaaaaaaa",
      write: vi.fn((a: { id: string }) => new Promise<{ id: string; uri: string }>((res) => { releaseA = () => { live.add(a.id); res({ id: a.id, uri: `${VNS}/r/${a.id}` }); }; })) };
    const tabB = { ...base, pending: new Map<string, string>(), newId: () => "bbbbbbbbbbbbbbbbbbbbbbbbbb",
      write: vi.fn(async (a: { id: string }) => { live.add(a.id); return { id: a.id, uri: `${VNS}/r/${a.id}` }; }) };
    const args = { vault: VAULT, subject: CONTACT, curie: CURIE, holder: HOLDER };
    const a = writeTie(args, tabA).then(() => "ok", (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(String(await a)).toMatch(/writing the kind relation timed out$/);
    await writeTie(args, tabB);
    releaseA();
    await vi.advanceTimersByTimeAsync(100);
    expect(await ownLiveTies(args, base)).toHaveLength(1);
  });
  it("control (known answer): A lands BEFORE tab B writes: one live tie", async () => {
    vi.useFakeTimers();
    __setKindWriteBoundForTest(12_000);
    __resetKindRelationVocab();
    const live = new Set<string>();
    const ended = new Set<string>();
    const row = (id: string): RecordRelation => ({ relation: `${VNS}/r/${id}`, role: "role:source", type: CURIE, members: [{ member: CONTACT, role: "role:source" }, { member: VENT, role: "role:target" }] });
    const tail = (u: string) => u.slice(u.lastIndexOf("/") + 1);
    const base = {
      readRows: vi.fn(async (): Promise<RecordRelation[]> => [...live].filter((i) => !ended.has(i)).map(row)),
      readDoc: vi.fn(async (uri: string) => {
        const id = tail(uri);
        if (!live.has(id) || ended.has(id)) return null;
        return { id, uri, typeCurie: CURIE, sourceUri: CONTACT, targetUri: VENT, extras: { "a:claimSubject": { "@id": HOLDER }, "a:visibilityTier": "private" } };
      }),
      readBack: vi.fn(async (uri: string) => (live.has(tail(uri)) && !ended.has(tail(uri)) ? { curie: CURIE, source: CONTACT, target: VENT } : null)),
      end: vi.fn(async (_v: string, uris: readonly string[]) => { for (const u of uris) ended.add(tail(u)); }),
      lock: async <T,>(_n: string, act: () => Promise<T>) => act(),
    };
    let releaseA: () => void = () => {};
    const tabA = { ...base, pending: new Map<string, string>(), newId: () => "aaaaaaaaaaaaaaaaaaaaaaaaaa",
      write: vi.fn((a: { id: string }) => new Promise<{ id: string; uri: string }>((res) => { releaseA = () => { live.add(a.id); res({ id: a.id, uri: `${VNS}/r/${a.id}` }); }; })) };
    const tabB = { ...base, pending: new Map<string, string>(), newId: () => "bbbbbbbbbbbbbbbbbbbbbbbbbb",
      write: vi.fn(async (a: { id: string }) => { live.add(a.id); return { id: a.id, uri: `${VNS}/r/${a.id}` }; }) };
    const args = { vault: VAULT, subject: CONTACT, curie: CURIE, holder: HOLDER };
    const a = writeTie(args, tabA).then(() => "ok", (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(String(await a)).toMatch(/writing the kind relation timed out$/);
    releaseA();
    await vi.advanceTimersByTimeAsync(100);
    await writeTie(args, tabB);
    await vi.advanceTimersByTimeAsync(100);
    expect(await ownLiveTies(args, base)).toHaveLength(1);
  });
});
