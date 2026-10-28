// @vitest-environment node
// The stakeholder type set as the Plan card reads it: the options and key read the term origin when used (it is set at start-up, after this module loads),
// the set is read from the master through the one kind reader, and the reader's changes reach the page's cache.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { KIND_SET_MAX_AGE_MS, forgetStakeholderKindReaders, stakeholderKindReader, type StakeholderKindSet } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import {
  STAKEHOLDER_TYPE_SET_QUERY,
  kindWordOf,
  masterKindReader,
  readStakeholderTypeSet,
  stakeholderTypeSetQueryKey,
  subscribeStakeholderTypeSet,
  toStakeholderTypeSet,
} from "./stakeholderKinds";
import { CONTEXT, RIG, fixtureMaster, t } from "../test/masterFixture";

beforeEach(() => {
  forgetStakeholderKindReaders();
  setTermOrigin(RIG);
});
afterEach(() => {
  forgetStakeholderKindReaders();
  resetTermOrigin();
});

// Only the fields the unit reads are set; the rest of the reader's set is not its business.
const kindSet = (over: Partial<StakeholderKindSet> = {}): StakeholderKindSet =>
  ({
    names: ["Person", "Organization"],
    complete: true,
    types: [
      { term: "https://o.example.test/base/t/Person", name: "Person", label: "Person", isMember: true, parents: [], members: [] },
      { term: "https://o.example.test/base/t/Organization", name: "Organization", label: "Organisation", isMember: true, parents: ["https://o.example.test/base/t/Party"], members: [] },
    ],
    ...over,
  }) as StakeholderKindSet;

describe("stakeholderTypeSetQueryKey", () => {
  it("names the master's origin as it is when the key is asked for", () => {
    expect(stakeholderTypeSetQueryKey()).toEqual(["gilb-stakeholders", "type-set", RIG]);
    setTermOrigin("https://other.example.test");
    expect(stakeholderTypeSetQueryKey()).toEqual(["gilb-stakeholders", "type-set", "https://other.example.test"]);
  });
});

describe("STAKEHOLDER_TYPE_SET_QUERY", () => {
  it("is never retried, stale after the reader's own max age, and keyed by the origin as it is when the options are used", () => {
    expect(STAKEHOLDER_TYPE_SET_QUERY.retry).toBe(false);
    expect(STAKEHOLDER_TYPE_SET_QUERY.staleTime).toBe(KIND_SET_MAX_AGE_MS);
    expect(STAKEHOLDER_TYPE_SET_QUERY.queryKey).toEqual(stakeholderTypeSetQueryKey());
    setTermOrigin("https://other.example.test");
    expect({ ...STAKEHOLDER_TYPE_SET_QUERY }.queryKey).toEqual(["gilb-stakeholders", "type-set", "https://other.example.test"]);
  });

  it("reads the set through the master's reader and keeps it under its key", async () => {
    const m = fixtureMaster();
    vi.stubGlobal("fetch", m.fetch);
    try {
      const qc = new QueryClient();
      const set = await qc.fetchQuery(STAKEHOLDER_TYPE_SET_QUERY);
      expect(set.names).toContain("Person");
      expect(qc.getQueryData(stakeholderTypeSetQueryKey())).toBe(set);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("toStakeholderTypeSet", () => {
  it("keeps the served order, each name and each type once, and copies the parents", () => {
    const set = kindSet({
      names: ["Person", "", "Person", "Organization"],
      types: [...kindSet().types, { term: "x", name: "Person", label: "Again", isMember: false, parents: [], members: [] }, { term: "y", name: "", label: null, isMember: false, parents: [], members: [] }],
    });
    const out = toStakeholderTypeSet(set);
    expect(out.names).toEqual(["Person", "Organization"]);
    expect(out.complete).toBe(true);
    expect(out.types.map((k) => k.name)).toEqual(["Person", "Organization"]);
    expect(out.types[1]).toEqual({ term: "https://o.example.test/base/t/Organization", name: "Organization", label: "Organisation", parents: ["https://o.example.test/base/t/Party"] });
    expect(out.types[1]!.parents).not.toBe(set.types[1]!.parents);
  });

  it("carries a set that is not complete as it is", () => {
    expect(toStakeholderTypeSet(kindSet({ complete: false })).complete).toBe(false);
  });

  it("gives a type with no parents an empty list", () => {
    const set = kindSet({ types: [{ term: "t", name: "A", label: null, isMember: true, members: [] } as never] });
    expect(toStakeholderTypeSet(set).types).toEqual([{ term: "t", name: "A", label: null, parents: [] }]);
  });
});

describe("kindWordOf", () => {
  const set = toStakeholderTypeSet(kindSet());
  it("is the master's word for a type, in any spelling of it", () => {
    expect(kindWordOf(set, "Organization")).toBe("Organisation");
    expect(kindWordOf(set, "t:Organization")).toBe("Organisation");
    expect(kindWordOf(set, "https://o.example.test/base/t/Organization")).toBe("Organisation");
  });
  it("is null while the set is read, for a type it does not know, and for no type", () => {
    expect(kindWordOf(undefined, "Person")).toBeNull();
    expect(kindWordOf(null, "Person")).toBeNull();
    expect(kindWordOf(set, "Nothing")).toBeNull();
    expect(kindWordOf(set, null)).toBeNull();
  });
});

describe("masterKindReader", () => {
  it("is the page's one shared reader without a fetch of its own", () => {
    expect(masterKindReader()).toBe(masterKindReader());
    expect(masterKindReader()).toBe(stakeholderKindReader({ vedaOrigin: RIG }));
  });

  it("is a new reader over the given fetch each time, apart from the shared one", () => {
    const m = fixtureMaster();
    const a = masterKindReader(m.fetch);
    expect(a).not.toBe(masterKindReader(m.fetch));
    expect(a).not.toBe(masterKindReader());
  });

  it("follows the term origin: another origin has another shared reader", () => {
    const first = masterKindReader();
    setTermOrigin("https://other.example.test");
    expect(masterKindReader()).not.toBe(first);
  });
});

describe("readStakeholderTypeSet", () => {
  it("reads the master named by the term origin, through a reader over the given fetch, asking the master only", async () => {
    const m = fixtureMaster();
    const set = await readStakeholderTypeSet(m.fetch);
    expect(set.names).toEqual(expect.arrayContaining(["Person", "Organization", "SoftwareSystem", "Passenger", "AiAgent"]));
    expect(set.complete).toBe(true);
    expect(set.types.find((k) => k.name === "Person")).toMatchObject({ term: t("Person"), label: "Person", parents: [] });
    expect(m.requested.length).toBeGreaterThan(0);
    expect(m.requested.every((u) => u.startsWith(RIG))).toBe(true);
  });

  it("throws when the master's role names no players, never an empty set", async () => {
    const m = fixtureMaster();
    m.put("t/Stakeholder", { "@context": CONTEXT, "@id": t("Stakeholder") });
    await expect(readStakeholderTypeSet(m.fetch)).rejects.toThrow(VocabularyUnavailableError);
  });

  it("leaves no background check behind, for a reader over a fetch of its own keeps nothing and checks nothing later", async () => {
    vi.useFakeTimers();
    try {
      const m = fixtureMaster();
      const read = readStakeholderTypeSet(m.fetch);
      await vi.advanceTimersByTimeAsync(0);
      await read;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps nothing on the device for a reader over a fetch of its own, where the shared reader does", async () => {
    const data = new Map<string, string>();
    const store = { getItem: vi.fn((k: string) => data.get(k) ?? null), setItem: vi.fn((k: string, v: string) => void data.set(k, v)) };
    vi.stubGlobal("localStorage", store);
    try {
      await readStakeholderTypeSet(fixtureMaster().fetch);
      expect(store.setItem).not.toHaveBeenCalled();
      expect(store.getItem).not.toHaveBeenCalled();
      vi.stubGlobal("fetch", fixtureMaster().fetch);
      await masterKindReader().get();
      expect(store.setItem).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reads nothing from the device between calls: each call with a fetch of its own asks the master again", async () => {
    const m = fixtureMaster();
    await readStakeholderTypeSet(m.fetch);
    const first = m.requested.length;
    await readStakeholderTypeSet(m.fetch);
    expect(m.requested.length).toBeGreaterThan(first);
  });
});

describe("subscribeStakeholderTypeSet", () => {
  it("hands each set the reader announces to the page in the list's form, and answers the reader's unsubscribe", () => {
    let listener: ((set: StakeholderKindSet) => void) | null = null;
    const unsubscribe = vi.fn();
    const reader = { subscribe: vi.fn((fn: (set: StakeholderKindSet) => void) => { listener = fn; return unsubscribe; }) };
    const seen: unknown[] = [];
    const off = subscribeStakeholderTypeSet((s) => seen.push(s), reader as never);
    expect(off).toBe(unsubscribe);
    listener!(kindSet());
    expect(seen).toEqual([toStakeholderTypeSet(kindSet())]);
  });

  it("follows the page's shared reader when it is given none", () => {
    const shared = masterKindReader();
    const spy = vi.spyOn(shared, "subscribe");
    const off = subscribeStakeholderTypeSet(() => {});
    expect(spy).toHaveBeenCalledTimes(1);
    expect(typeof off).toBe("function");
    off();
  });
});
