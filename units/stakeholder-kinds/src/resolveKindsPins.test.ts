// New tests: `resolvePredicates` and `resolveStakeholderKinds` pinned over the fixture master, one behaviour each.
import { describe, it, expect } from "vitest";
import { masterSource, VocabularyUnavailableError, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { PREDICATE_TERMS, resolvePredicate, resolvePredicates, type StakeholderPredicates } from "./predicates";
import { resolveStakeholderKinds } from "./kinds";
import { fixtureMaster, CONTEXT, RIG, t, a, type FixtureMaster } from "../test/support";

const src = (m: FixtureMaster) => masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
const KEYS = Object.keys(PREDICATE_TERMS) as (keyof StakeholderPredicates)[];

describe("resolvePredicates", () => {
  it("reads the six predicate terms, each once, and returns each key's own spellings", async () => {
    const m = fixtureMaster();
    const all = await resolvePredicates(src(m));
    expect(Object.keys(all).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) {
      expect(m.count(`/base/${PREDICATE_TERMS[key]}`)).toBe(1);
      expect(all[key]).toEqual(await resolvePredicate(src(fixtureMaster()), key));
      expect(all[key].term).toBe(a(PREDICATE_TERMS[key].slice(2)));
    }
    expect(all.playableBy.readKeys).toContain("a:playableBy");
  });

  it("does not read again a spelling it is given as already known, and returns that very value", async () => {
    const m = fixtureMaster();
    const known = await resolvePredicate(src(fixtureMaster()), "fieldOf");
    const all = await resolvePredicates(src(m), { fieldOf: known });
    expect(all.fieldOf).toBe(known);
    expect(m.count("/base/a/fieldOf")).toBe(0);
    for (const key of KEYS.filter((k) => k !== "fieldOf")) expect(m.count(`/base/${PREDICATE_TERMS[key]}`)).toBe(1);
  });

  it("with every spelling known reads nothing", async () => {
    const full = await resolvePredicates(src(fixtureMaster()));
    const m = fixtureMaster();
    expect(await resolvePredicates(src(m), full)).toEqual(full);
    expect(m.requested).toEqual([]);
  });

  it("makes its reads at the same time (every term is asked before any answer is waited on)", async () => {
    const asked: string[] = [];
    const slow: VocabularySource = {
      ...src(fixtureMaster()),
      term: async (iri) => {
        asked.push(iri);
        await Promise.resolve();
        return { "@id": iri, "a:predicateAttribute": `a:${iri.split("/").pop()}` };
      },
    };
    const pending = resolvePredicates(slow);
    await Promise.resolve();
    expect(asked).toHaveLength(6);
    await pending;
  });

  it("fails loudly when one predicate cannot be read: nothing partial is returned", async () => {
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/a/name`, 500);
    await expect(resolvePredicates(src(m))).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });
});

describe("resolveStakeholderKinds — its options", () => {
  it("reads the role it is told to: `roleTerm`, a path under /base/", async () => {
    const m = fixtureMaster();
    m.put("t/OtherRole", { "@context": CONTEXT, "@id": t("OtherRole"), "a:playableBy": [{ "@id": t("Person") }] });
    const kinds = await resolveStakeholderKinds(src(m), { roleTerm: "t/OtherRole" });
    expect(kinds.role).toBe(`${RIG}/base/t/OtherRole`);
    expect(kinds.members).toEqual([t("Person")]);
    expect(kinds.types.map((k) => k.name)).toEqual(["Person", "Passenger"]);
    expect(m.count("/base/t/Stakeholder")).toBe(0);
  });

  it("with `predicates` given reads none of the six, and returns that very object", async () => {
    const predicates = await resolvePredicates(src(fixtureMaster()));
    const m = fixtureMaster();
    const kinds = await resolveStakeholderKinds(src(m), { predicates });
    expect(kinds.predicates).toBe(predicates);
    for (const key of KEYS) expect(m.count(`/base/${PREDICATE_TERMS[key]}`)).toBe(0);
    expect(kinds.types).toHaveLength(10);
  });

  it("with `knownPredicates` reads only the rest", async () => {
    const known = { playableBy: await resolvePredicate(src(fixtureMaster()), "playableBy") };
    const m = fixtureMaster();
    const kinds = await resolveStakeholderKinds(src(m), { knownPredicates: known });
    expect(kinds.predicates.playableBy).toBe(known.playableBy);
    expect(m.count("/base/a/playableBy")).toBe(0);
    expect(m.count("/base/a/label")).toBe(1);
    expect(kinds.members).toHaveLength(7);
  });

  it("ignores `knownPredicates` when `predicates` is given", async () => {
    const predicates = await resolvePredicates(src(fixtureMaster()));
    const wrong = { ...predicates.playableBy, readKeys: ["nothing"] };
    const kinds = await resolveStakeholderKinds(src(fixtureMaster()), { predicates, knownPredicates: { playableBy: wrong } });
    expect(kinds.predicates.playableBy).toBe(predicates.playableBy);
    expect(kinds.members).toHaveLength(7);
  });
});

describe("resolveStakeholderKinds — reads and refusals", () => {
  it("asks the role's term through the named read when the source has one, and on its own when it has not", async () => {
    const named = fixtureMaster();
    await resolveStakeholderKinds(src(named));
    expect(named.requested.some((u) => new URL(u).searchParams.getAll("type").includes("Stakeholder"))).toBe(true);
    expect(named.requested).not.toContain(`${RIG}/base/t/Stakeholder`);
    const plain = fixtureMaster();
    const s = src(plain);
    await resolveStakeholderKinds({ termIri: s.termIri, term: s.term, children: s.children, carriersOf: s.carriersOf });
    expect(plain.requested).toContain(`${RIG}/base/t/Stakeholder`);
  });

  it("a role that declares no players throws, naming the role and the keys it looked under", async () => {
    const m = fixtureMaster();
    m.put("t/Stakeholder", { "@context": CONTEXT, "@id": t("Stakeholder") });
    const err = await resolveStakeholderKinds(src(m)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VocabularyUnavailableError);
    expect((err as Error).message).toContain(`${RIG}/base/t/Stakeholder declares no players under a:playableBy / playableBy`);
    expect((err as Error).message).toContain("the stakeholder kinds cannot be read");
  });

  it("the shortcut term is read in the first round, with the predicates, so it adds no round of its own", async () => {
    const m = fixtureMaster();
    const order: string[] = [];
    const s = src(m);
    await resolveStakeholderKinds({
      ...s,
      term: (iri, signal) => (order.push(iri), s.term(iri, signal)),
      terms: undefined,
    });
    const first = order.slice(0, 8);
    expect(first).toContain(`${RIG}/base/a/createShortcut`);
    expect(first).toContain(`${RIG}/base/t/Stakeholder`);
    expect(first.filter((u) => u.includes("/base/a/"))).toHaveLength(7);
  });

  it("a shortcut named twice on the role is listed once, with its label", async () => {
    const m = fixtureMaster();
    m.put("a/createShortcut", { "@context": CONTEXT, "@id": a("createShortcut"), "a:predicateAttribute": "a:createShortcut" });
    const role = m.docs.get(`${RIG}/base/t/Stakeholder`) as Record<string, unknown>;
    m.put("t/Stakeholder", { ...role, "a:createShortcut": [{ "@id": t("Person") }, { "@id": t("Person") }] });
    const kinds = await resolveStakeholderKinds(src(m));
    expect(kinds.createShortcuts.map((c) => [c.name, c.label])).toEqual([["Person", "Person"]]);
    expect(kinds.shortcuts).toBe("declared");
  });

  it("a shortcut term whose read throws (not rejects) still gives no label and no error", async () => {
    const m = fixtureMaster();
    m.put("a/createShortcut", { "@context": CONTEXT, "@id": a("createShortcut"), "a:predicateAttribute": "a:createShortcut" });
    const role = m.docs.get(`${RIG}/base/t/Stakeholder`) as Record<string, unknown>;
    m.put("t/Stakeholder", { ...role, "a:createShortcut": [{ "@id": t("Organization") }] });
    const s = src(m);
    const kinds = await resolveStakeholderKinds({
      ...s,
      terms: undefined,
      term: (iri, signal) => {
        if (iri === t("Organization")) throw new Error("synchronous refusal");
        return s.term(iri, signal);
      },
    });
    expect(kinds.createShortcuts).toEqual([{ term: t("Organization"), name: "Organization", label: null }]);
  });
});
