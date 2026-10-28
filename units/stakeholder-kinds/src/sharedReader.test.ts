// New tests: what the ported blocks left unpinned in kindReader.ts (found by mutation checks).
import { beforeEach, describe, expect, it } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { createStakeholderKindReader, forgetStakeholderKindReaders, kindLabelOf, stakeholderKindReader } from "./kindReader";
import { fixtureMaster, RIG, CONTEXT, t } from "../test/support";

beforeEach(() => forgetStakeholderKindReaders());

function memoryStore() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}
const readerOn = (m: ReturnType<typeof fixtureMaster>, extra: Record<string, unknown> = {}) =>
  createStakeholderKindReader({ source: masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }), origin: RIG, store: null, defer: () => {}, ...extra });

describe("reading the set", () => {
  it("a role that names no players is an error, never an empty set", async () => {
    const m = fixtureMaster();
    m.put("t/Stakeholder", { "@context": CONTEXT, "@id": t("Stakeholder") });
    await expect(readerOn(m).get()).rejects.toThrow(VocabularyUnavailableError);
    await expect(readerOn(m).get()).rejects.toThrow(/declares no players/);
  });
  it("a type name appears once in `names`, even when two terms carry it", async () => {
    const m = fixtureMaster();
    m.put("t/Person/children", { children: [{ term: "https://other.example.test/base/t/Person" }], complete: true });
    const set = await readerOn(m).get();
    expect(set.names.filter((n) => n === "Person")).toHaveLength(1);
    expect(set.types.filter((k) => k.name === "Person").length).toBeGreaterThan(1);
  });
});

describe("kindLabelOf", () => {
  const kind = (name: string, label: string) => ({ term: `https://h.example.test/base/t/${name}`, name, label, isMember: true, parents: [], members: [] });
  const set = { types: [kind("A B", "Spaced"), kind("A/b", "Slashed"), kind("Person", "Human")] };
  it("decodes a percent-encoded name", () => {
    expect(kindLabelOf(set, "https://h.example.test/base/t/A%20B")).toBe("Spaced");
    expect(kindLabelOf(set, "t:A%20B")).toBe("Spaced");
  });
  it("keeps a name it cannot decode as served", () => {
    expect(kindLabelOf({ types: [kind("A%E0", "Raw")] }, "t:A%E0")).toBe("Raw");
  });
  it("an address with a path after the name is no type: the name is read only when nothing follows it", () => {
    expect(kindLabelOf(set, "https://h.example.test/base/t/A/b")).toBeNull();
    expect(kindLabelOf(set, "https://h.example.test/base/t/Person?x=1")).toBeNull();
    expect(kindLabelOf(set, "https://h.example.test/base/t/Person#x")).toBeNull();
    expect(kindLabelOf(set, "https://h.example.test/base/t/Person")).toBe("Human");
  });
  it("never throws, though a getter of the set throws", () => {
    const boom = { get types(): never { throw new Error("getter"); } };
    expect(kindLabelOf(boom as unknown as { types: [] }, "t:Person")).toBeNull();
    const trap = new Proxy({}, { get() { throw new Error("trap"); }, has() { throw new Error("trap"); } });
    expect(kindLabelOf({ types: [trap] } as unknown as { types: [] }, "t:Person")).toBeNull();
  });
});

describe("the shared reader", () => {
  it("a bound that is not allowed is refused on every call, even when the page already has the reader", () => {
    const origin = "https://ontology.platform.example.test";
    stakeholderKindReader({ vedaOrigin: origin, store: null });
    expect(() => stakeholderKindReader({ vedaOrigin: origin, store: null, timeoutMs: 0 })).toThrow(RangeError);
    expect(() => stakeholderKindReader({ vedaOrigin: origin, store: null, readCapMs: -1 })).toThrow(RangeError);
  });
  it("the store it is given is the one the set is kept in, under the origin's key", async () => {
    const m = fixtureMaster();
    const store = memoryStore();
    const reader = stakeholderKindReader({ vedaOrigin: RIG, fetchImpl: m.fetch, store });
    await reader.get();
    expect([...store.data.keys()]).toEqual([`gilb-stakeholders.kind-set.v1:${RIG}`]);
  });
  it("a role of its own is kept under its own key", async () => {
    const m = fixtureMaster();
    m.put("t/Other", { "@context": CONTEXT, "@id": t("Other"), "a:playableBy": [{ "@id": t("Person") }] });
    const store = memoryStore();
    await stakeholderKindReader({ vedaOrigin: RIG, fetchImpl: m.fetch, store }).get();
    await stakeholderKindReader({ vedaOrigin: RIG, roleTerm: "t/Other", fetchImpl: m.fetch, store }).get();
    expect([...store.data.keys()].sort()).toEqual([`gilb-stakeholders.kind-set.v1:${RIG}`, `gilb-stakeholders.kind-set.v1:${RIG}|t/Other`].sort());
  });
});
