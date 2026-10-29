// `stakeholderKindsOf`: ported by block from `gilb-stakeholders` `test/kindReader-m3k-r2-scaling.test.ts` (1 of its tests) and
// `test/qa-c214-m3k-s86.test.ts` (2 of its tests) at 0a261488, with new pins for what the source's tests leave open.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { createStakeholderKindReader, stakeholderKindsOf, type StakeholderKindSet } from "./kindReader";
import { resolveStakeholderKinds } from "./kinds";
import { resolvePredicates } from "./predicates";
import { fixtureMaster, RIG, t, type FixtureMaster } from "../test/support";

const src = (m: FixtureMaster) => masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
const setOf = (m: FixtureMaster = fixtureMaster()) => createStakeholderKindReader({ source: src(m), origin: RIG, store: null }).get();

describe("stakeholderKindsOf — the cached set as the kinds the field-set path takes", () => {
  it("is the old StakeholderKinds: the same role, members, types, shortcuts and completeness", async () => {
    const old = await resolveStakeholderKinds(src(fixtureMaster()));
    const set = await setOf();
    const kinds = stakeholderKindsOf(set, await resolvePredicates(src(fixtureMaster())));
    expect(kinds.role).toBe(old.role);
    expect(kinds.members).toEqual(old.members);
    expect(kinds.types.map((k) => [k.term, k.name, k.isMember, k.parents, k.members])).toEqual(
      old.types.map((k) => [k.term, k.name, k.isMember, k.parents, k.members]),
    );
    expect(kinds.createShortcuts.map((c) => c.term)).toEqual(old.createShortcuts.map((c) => c.term));
    expect(kinds.shortcuts).toEqual(old.shortcuts);
    expect(kinds.complete).toBe(true);
    expect(kinds.predicates.fieldOf.readKeys.length).toBeGreaterThan(0);
    // A copy: changing it does not change the set in hand.
    kinds.types.pop();
    expect(set.types.length).toBe(10);
  });

  it("equals resolveStakeholderKinds (labels aside, where the set fills more)", async () => {
    const source = src(fixtureMaster());
    const today = await resolveStakeholderKinds(source);
    const set = await setOf();
    const conv = stakeholderKindsOf(set, await resolvePredicates(source));
    const strip = (x: typeof today) => ({ ...x, types: x.types.map((k) => ({ ...k, label: null })), createShortcuts: x.createShortcuts.map((c) => ({ ...c, label: null })) });
    expect(strip(conv)).toEqual(strip(today));
    today.types.forEach((k, i) => {
      if (k.label !== null) expect(conv.types[i]!.label).toBe(k.label);
    });
  });

  it("is a copy: changing any part of it, shortcuts included, leaves the set alone", async () => {
    const set = await setOf();
    const before = JSON.stringify(set);
    const conv = stakeholderKindsOf(set, await resolvePredicates(src(fixtureMaster())));
    conv.members.push("x");
    conv.types[0]!.label = "changed";
    conv.types[0]!.parents.push("x");
    conv.types[0]!.members.push("x");
    conv.incompleteAt.push("x");
    if (conv.createShortcuts[0]) conv.createShortcuts[0].label = "changed";
    const sc = conv.shortcuts as unknown as Record<string, unknown>;
    if (sc && typeof sc === "object") {
      sc.state = "changed";
      if (Array.isArray(sc.named)) (sc.named as unknown[]).push("x");
    }
    expect(JSON.stringify(set)).toBe(before);
  });

  it("(new) carries the set's own words on every type, and its shortcuts with their words", async () => {
    const m = fixtureMaster();
    m.put("a/createShortcut", { "@id": `${RIG}/base/a/createShortcut`, "a:predicateAttribute": "a:createShortcut" });
    const role = m.docs.get(`${RIG}/base/t/Stakeholder`) as Record<string, unknown>;
    m.put("t/Stakeholder", { ...role, "a:createShortcut": [{ "@id": t("Person") }] });
    const set = await setOf(m);
    const kinds = stakeholderKindsOf(set, await resolvePredicates(src(fixtureMaster())));
    expect(kinds.types.find((k) => k.name === "Person")!.label).toBe("Person");
    expect(kinds.types.find((k) => k.name === "AiAgent")!.label).toBe("AI Agent");
    expect(kinds.createShortcuts).toEqual([{ term: t("Person"), name: "Person", label: "Person" }]);
    expect(kinds.shortcuts).toBe("declared");
  });

  it("(new) hands back the predicates it is given, as they are, and the set's completeness as it is", async () => {
    const set = await setOf();
    const predicates = await resolvePredicates(src(fixtureMaster()));
    expect(stakeholderKindsOf(set, predicates).predicates).toBe(predicates);
    const floor: StakeholderKindSet = { ...set, complete: false, incompleteAt: [t("SoftwareSystem")] };
    const kinds = stakeholderKindsOf(floor, predicates);
    expect(kinds.complete).toBe(false);
    expect(kinds.incompleteAt).toEqual([t("SoftwareSystem")]);
    expect(kinds.incompleteAt).not.toBe(floor.incompleteAt);
  });

  it("(new) copies each type's parents and members, and each shortcut, one by one", async () => {
    const set = await setOf();
    const kinds = stakeholderKindsOf(set, await resolvePredicates(src(fixtureMaster())));
    expect(kinds.members).not.toBe(set.members);
    expect(kinds.types).not.toBe(set.types);
    kinds.types.forEach((k, i) => {
      expect(k).not.toBe(set.types[i]);
      expect(k.parents).not.toBe(set.types[i]!.parents);
      expect(k.members).not.toBe(set.types[i]!.members);
      expect(k).toEqual(set.types[i]);
    });
  });

  it("(new) copies each create shortcut: changing one leaves the set's alone", async () => {
    const m = fixtureMaster();
    m.put("a/createShortcut", { "@id": `${RIG}/base/a/createShortcut`, "a:predicateAttribute": "a:createShortcut" });
    const role = m.docs.get(`${RIG}/base/t/Stakeholder`) as Record<string, unknown>;
    m.put("t/Stakeholder", { ...role, "a:createShortcut": [{ "@id": t("Person") }] });
    const set = await setOf(m);
    const kinds = stakeholderKindsOf(set, await resolvePredicates(src(fixtureMaster())));
    expect(kinds.createShortcuts).not.toBe(set.createShortcuts);
    expect(kinds.createShortcuts[0]).not.toBe(set.createShortcuts[0]);
    kinds.createShortcuts[0]!.label = "changed";
    kinds.createShortcuts.push({ term: "x", name: "x", label: null });
    expect(set.createShortcuts).toEqual([{ term: t("Person"), name: "Person", label: "Person" }]);
  });
});
