// Ported by block from `gilb-stakeholders` `test/` at 0a261488: `kindReader-m3k-r2-scaling.test.ts` (3 of its 8 tests) and
// `qa-c214-m3k-s86.test.ts` (1 of its 23 tests). The field sets read from the cached kind set (`{ kindSet }`): one kind read in the package,
// where the field-set read takes the kinds from the set and reads only the predicate terms. New: the rest of the `kindSet` and `kinds`
// options, pinned over the same fixture.
import { beforeEach, describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import {
  createStakeholderKindReader,
  forgetStakeholderKindReaders,
  resolveStakeholderKinds,
  type StakeholderKindSet,
  type VocabularyStore,
} from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { resolveFieldSets } from "./fieldSets";
import { fixtureMaster, RIG, t, type FixtureMaster } from "../test/support";

const src = (m: FixtureMaster) => masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
const memoryStore = (): VocabularyStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const setOf = (store: VocabularyStore | null = null): Promise<StakeholderKindSet> =>
  createStakeholderKindReader({ source: src(fixtureMaster()), origin: RIG, store }).get();

beforeEach(() => forgetStakeholderKindReaders());

describe("the field sets read from the cached kind set: one kind read in the package", () => {
  it("resolveFieldSets({ kindSet }) sends no children listing and no role read, and gives the same field sets as the old path", async () => {
    const old = fixtureMaster();
    const before = await resolveFieldSets(src(old));
    const oldCount = old.requested.length;

    const set = await setOf();
    const m = fixtureMaster();
    const now = await resolveFieldSets(src(m), { kindSet: set });
    expect(m.requested.filter((u) => u.endsWith("/children")).length).toBe(0);
    expect(m.requested.filter((u) => u.includes("/base/t/Stakeholder") || u.includes("type=Stakeholder")).length).toBe(0);
    expect(m.requested.filter((u) => u.endsWith("/base/a/createShortcut")).length).toBe(0);
    expect(Object.keys(now.byKind).sort()).toEqual(Object.keys(before.byKind).sort());
    expect(Object.keys(now.byKind).length).toBe(10);
    for (const k of Object.keys(before.byKind)) expect(now.byKind[k]!.fields).toEqual(before.byKind[k]!.fields);
    expect(now.complete).toBe(before.complete);
    expect(now.unreadable).toEqual(before.unreadable);
    // Saved against the old path on the fixture: the role (1), a/createShortcut (1), the 10 children listings, and a/playableBy and
    // a/label (2), whose spellings the set carries.
    expect(oldCount - m.requested.length).toBe(14);
  });

  it("field sets with { kindSet } equal today's path for every kind, 0 children listings and 0 role reads", async () => {
    const mOld = fixtureMaster();
    const old = await resolveFieldSets(src(mOld));
    const set = await setOf(memoryStore());
    const mNew = fixtureMaster();
    const neu = await resolveFieldSets(src(mNew), { kindSet: set });
    expect(Object.keys(neu.byKind).sort()).toEqual(Object.keys(old.byKind).sort());
    expect(Object.keys(old.byKind).length).toBe(10);
    for (const k of Object.keys(old.byKind)) expect(neu.byKind[k]).toEqual(old.byKind[k]);
    expect(neu.complete).toBe(old.complete);
    expect(neu.incompleteAt).toEqual(old.incompleteAt);
    expect(neu.unreadable).toEqual(old.unreadable);
    expect(mNew.requested.filter((u) => u.endsWith("/children")).length).toBe(0);
    expect(mNew.requested.filter((u) => u.endsWith("/base/t/Stakeholder")).length).toBe(0);
    expect(mNew.requested.filter((u) => u.endsWith("/base/a/playableBy") || u.endsWith("/base/a/label")).length).toBe(0);
  });

  it("the players' words come from the set, so a card's kind words are filled for the players too", async () => {
    const set = await setOf();
    const fs = await resolveFieldSets(src(fixtureMaster()), { kindSet: set });
    expect(fs.byKind[t("Person")]!.label).toBe("Person");
    expect(fs.byKind[t("PartyGroup")]!.label).toBe("Party Group");
  });

  it("a card opened after a warm list: 0 kind requests (no children listing, no role, no a/label or a/playableBy twice)", async () => {
    const store = memoryStore();
    await setOf(store);
    const m = fixtureMaster();
    const reader = createStakeholderKindReader({ source: src(m), origin: RIG, store });
    const set = await reader.get();
    expect(m.requested.length).toBe(0);
    await resolveFieldSets(src(m), { kindSet: set });
    expect(m.requested.filter((u) => u.endsWith("/children")).length).toBe(0);
    expect(m.requested.filter((u) => u.endsWith("/base/a/playableBy")).length).toBe(0);
    expect(m.requested.filter((u) => u.endsWith("/base/a/label")).length).toBe(0);
  });

  it("(new) `kinds` already resolved are used as they are: no role read, no children listing, and the same sets", async () => {
    const kinds = await resolveStakeholderKinds(src(fixtureMaster()));
    const m = fixtureMaster();
    const sets = await resolveFieldSets(src(m), { kinds });
    expect(sets.kinds).toBe(kinds);
    expect(m.requested.filter((u) => u.endsWith("/children")).length).toBe(0);
    expect(m.requested.filter((u) => u.endsWith("/base/t/Stakeholder")).length).toBe(0);
    expect(m.requested.filter((u) => u.endsWith("/base/a/fieldOf")).length).toBe(0);
    const plain = await resolveFieldSets(src(fixtureMaster()));
    expect(sets.byKind).toEqual(plain.byKind);
  });

  it("(new) `kinds` win over `kindSet` when both are given", async () => {
    const kinds = await resolveStakeholderKinds(src(fixtureMaster()));
    const set = await setOf();
    const poor: StakeholderKindSet = { ...set, types: set.types.slice(0, 2), members: set.members.slice(0, 1) };
    const sets = await resolveFieldSets(src(fixtureMaster()), { kinds, kindSet: poor });
    expect(sets.kinds).toBe(kinds);
    expect(Object.keys(sets.byKind)).toHaveLength(10);
  });

  it("(new) a set that was not complete makes the field sets a declared floor, naming where", async () => {
    const set = await setOf();
    const floor: StakeholderKindSet = { ...set, complete: false, incompleteAt: [t("SoftwareSystem")] };
    const sets = await resolveFieldSets(src(fixtureMaster()), { kindSet: floor });
    expect(sets.complete).toBe(false);
    expect(sets.incompleteAt).toContain(`children of ${t("SoftwareSystem")}`);
  });
});
