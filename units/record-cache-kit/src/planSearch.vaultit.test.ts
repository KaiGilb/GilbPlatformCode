import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import type { VaultRecordRef } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { invalidatePlanSearch, searchPlanRecords } from "./planSearch";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
});
afterEach(() => tearDown());

const HOST = "https://h.platform.example.test";

function uri(id: string): string {
  return `${HOST}/base/e/${id}`;
}

function record(id: string, typeUri: string, facts: Record<string, string>): BaseRecord {
  return {
    id,
    entityUri: uri(id),
    typeUri,
    facts,
    opaqueFacts: [],
    etag: '"e"',
    servedKeys: Object.keys(facts),
    served: { facts, context: undefined, etag: '"e"' },
  };
}

function listed(id: string, typeUri: string, facts: Record<string, string>): VaultRecordRef {
  return {
    id,
    entityUri: uri(id),
    typeUri,
    updatedAt: 1,
    label: facts.unitTag ?? facts.name ?? id,
    etag: '"e"',
    body: { "@id": uri(id), "@type": typeUri, ...Object.fromEntries(Object.entries(facts).map(([k, v]) => [`a:${k}`, v])) },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("searchPlanRecords", () => {
  it("lists an empty box from the body and does not search or read", async () => {
    const search = vi.fn();
    const read = vi.fn();
    const list = vi.fn(async () => ({
      records: [listed("step", "t:Function", { unitTag: "Walk.Step", name: "Speed of opening" })],
      complete: false,
    }));
    const found = await searchPlanRecords("https://p.platform.example.test/vault", "  ", ["Function"], { search, read, list });
    expect(search).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledWith("https://p.platform.example.test/vault", ["Function"], 0, { includeBody: true, limit: 50 });
    expect(found.complete).toBe(false);
    expect(found.hits.map((hit) => hit.label)).toEqual(["Speed of opening"]);
    expect(found.hits[0]?.tag).toBe("Walk.Step");
  });

  it("asks prefix search once, reads at most 20 and 6 at a time, and skips a bad read", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => uri(`r${i}`));
    const search = vi.fn(async () => ({ ids, next: null }));
    let inFlight = 0;
    let peak = 0;
    const read = vi.fn(async (id: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(30);
      inFlight -= 1;
      if (id === "r0") throw new Error("gone");
      if (id === "r1") return record(id, "t:Note", { name: "Not a function" });
      return record(id, "t:Function", { unitTag: `Tag.${id}`, name: `Name ${id}` });
    });
    const found = await searchPlanRecords("https://p.platform.example.test/vault", "Tag", ["Function"], { search, read });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("Tag", ["Function"], undefined, "https://p.platform.example.test/vault", "prefix");
    expect(read).toHaveBeenCalledTimes(20);
    expect(peak).toBeLessThanOrEqual(6);
    expect(found.complete).toBe(false);
    expect(found.hits.some((hit) => hit.id === "r0" || hit.id === "r1")).toBe(false);
    expect(found.hits.length).toBe(18);
    const labels = found.hits.map((hit) => hit.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it("treats a short page whose next is null as complete", async () => {
    const search = vi.fn(async () => ({ ids: [uri("a")], next: null }));
    const read = vi.fn(async () => record("a", "t:Value", { unitTag: "Walk.Step" }));
    const found = await searchPlanRecords("v", "Step", ["Value"], { search, read });
    expect(found.complete).toBe(true);
    expect(found.hits[0]?.tag).toBe("Walk.Step");
  });

  it("merges an exact unitTag hit ahead when prefix search returns nothing", async () => {
    const search = vi.fn(async () => ({ ids: [], next: null }));
    const read = vi.fn();
    const speed = record("speed", "t:Value", { unitTag: "QA-Walk.Speed" });
    const findTag = vi.fn(async () => speed);
    const found = await searchPlanRecords("https://p.platform.example.test/vault", "QA-Walk.Speed", ["Value"], { search, read, findTag });
    expect(findTag).toHaveBeenCalledTimes(1);
    expect(findTag).toHaveBeenCalledWith("https://p.platform.example.test/vault", "QA-Walk.Speed");
    expect(read).not.toHaveBeenCalled();
    expect(found.complete).toBe(true);
    expect(found.hits.map((hit) => hit.tag)).toEqual(["QA-Walk.Speed"]);
    expect(found.hits[0]?.id).toBe("speed");
  });

  it("does not exact-find a tag when neither a client nor findTag is passed", async () => {
    const search = vi.fn(async () => ({ ids: [], next: null }));
    const found = await searchPlanRecords("v", "QA-Walk.Speed", ["Value"], { search });
    expect(search).toHaveBeenCalledTimes(1);
    expect(found).toEqual({ hits: [], complete: true });
  });

  it("does not exact-find text that contains a space", async () => {
    const search = vi.fn(async () => ({ ids: [], next: null }));
    const findTag = vi.fn(async () => record("speed", "t:Value", { unitTag: "Walk Speed" }));
    const found = await searchPlanRecords("v", "Walk Speed", ["Value"], { search, findTag });
    expect(findTag).not.toHaveBeenCalled();
    expect(found.hits).toEqual([]);
  });

  it("drops an exact tag hit of another type and does not read a second id", async () => {
    const search = vi.fn(async () => ({ ids: [], next: null }));
    const findTag = vi.fn(async () => record("fn", "t:Function", { unitTag: "QA-Walk.Speed" }));
    const found = await searchPlanRecords("v", "QA-Walk.Speed", ["Value"], { search, findTag });
    expect(findTag).toHaveBeenCalledTimes(1);
    expect(found).toEqual({ hits: [], complete: true });
  });

  it("is not complete when the exact tag find throws, so Create is not offered", async () => {
    const search = vi.fn(async () => ({ ids: [uri("other")], next: null }));
    const read = vi.fn(async () => record("other", "t:Value", { unitTag: "Other.One" }));
    const findTag = vi.fn(async () => {
      throw new Error("find down");
    });
    const found = await searchPlanRecords("v", "Speed", ["Value"], { search, read, findTag });
    expect(found.hits.map((hit) => hit.id)).toEqual(["other"]);
    expect(found.complete).toBe(false);
  });

  it("returns nothing when the vault or the types are blank", async () => {
    const search = vi.fn();
    expect(await searchPlanRecords("  ", "A", ["Function"], { search })).toEqual({ hits: [], complete: false });
    expect(await searchPlanRecords("v", "A", [], { search })).toEqual({ hits: [], complete: false });
    expect(search).not.toHaveBeenCalled();
  });
});

describe("invalidatePlanSearch", () => {
  it("a Value create resolves before a slow pending search finishes", async () => {
    const vault = "https://p.platform.example.test/vault";
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const activeKey = ["plan-search", vault, "Value", "Reach"] as const;
    const idleKey = ["plan-search", vault, "Function", "Walk"] as const;
    const idleSearch = vi.fn(async () => ({ hits: [], complete: true }));
    qc.setQueryDefaults(idleKey, { queryFn: idleSearch });
    qc.setQueryData(activeKey, { hits: [{ uri: "stale-value" }], complete: true });
    qc.setQueryData(idleKey, { hits: [{ uri: "stale-function" }], complete: true });
    const observer = new QueryObserver(qc, {
      queryKey: activeKey,
      staleTime: Infinity,
      queryFn: async () => {
        await pending;
        return { hits: [{ uri: "fresh-value" }], complete: true };
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    // The open Value picker is the only one that should re-run. A closed Function picker must not.
    async function createValue(): Promise<{ id: string }> {
      invalidatePlanSearch(qc, vault);
      return { id: "new-value" };
    }
    const started = Date.now();
    const created = await createValue();
    expect(created).toEqual({ id: "new-value" });
    expect(Date.now() - started).toBeLessThan(200);
    expect(qc.getQueryState(activeKey)?.fetchStatus).toBe("fetching");
    expect(idleSearch).not.toHaveBeenCalled();
    expect(qc.getQueryState(idleKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(idleKey)?.fetchStatus).not.toBe("fetching");
    expect(qc.getQueryData(idleKey)).toEqual({ hits: [{ uri: "stale-function" }], complete: true });
    release();
    await vi.waitFor(() => expect(qc.getQueryState(activeKey)?.fetchStatus).toBe("idle"));
    expect(qc.getQueryData(activeKey)).toEqual({ hits: [{ uri: "fresh-value" }], complete: true });
    unsubscribe();
  });
});
