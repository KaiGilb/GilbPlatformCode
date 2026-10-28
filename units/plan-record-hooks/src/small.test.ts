// @vitest-environment node
// New tests for the small pieces: the type key, the held vaults, the saved-elsewhere rule, the fresh-create window, the delete key.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import {
  RECORD_DELETE_KEY,
  RECORDS_SNAPSHOT_KEY_HEAD,
  canReadVault,
  createWiring,
  heldVaultIds,
  isFreshlyCreated,
  isRecordDeleteKey,
  keysSavedElsewhere,
  markFreshlyCreated,
  refreshMultiVaultLists,
  typeFacetKey,
  type ReachableVault,
} from "./index";
import { seedRecordReads } from "./recordHooks";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
});
afterEach(() => {
  vi.useRealTimers();
  tearDown();
});

describe("typeFacetKey", () => {
  it("a type the registry knows is named by its registry id, whatever the spelling", () => {
    expect(typeFacetKey("t:Person")).toBe(typeFacetKey("Person"));
    expect(typeFacetKey("t:Person")).toBe(typeFacetKey("https://ontology.platform.example.test/base/t/Person"));
    expect(typeFacetKey("note")).toBe(typeFacetKey("t:NoteDocument"));
  });
  it("a type the registry does not know is its bare name, lower-cased", () => {
    expect(typeFacetKey("t:Zebra")).toBe("zebra");
    expect(typeFacetKey("https://x.platform.example.test/base/t/ZebraCrossing")).toBe("zebracrossing");
    expect(typeFacetKey("Zebra")).toBe("zebra");
  });
  it("an empty name stays empty", () => {
    expect(typeFacetKey("")).toBe("");
  });
});

describe("heldVaultIds", () => {
  const vault = (vaultId: string, modes: ReachableVault["modes"]): ReachableVault => ({ vaultId, entity: null, name: null, parent: null, parentAmbiguous: false, modes, represents: null, isLandingVault: false });
  it("lists the vaults the person can read, once each, in the order given", () => {
    expect(heldVaultIds([vault("b", ["read"]), vault("a", ["write"]), vault("c", ["read", "write"]), vault("b", ["read"])])).toEqual(["b", "c"]);
  });
  it("nothing held is nothing listed", () => {
    expect(heldVaultIds([])).toEqual([]);
    expect(heldVaultIds([vault("a", [])])).toEqual([]);
  });
  it("canReadVault asks the mode set", () => {
    expect(canReadVault(vault("a", ["read"]))).toBe(true);
    expect(canReadVault(vault("a", ["write"]))).toBe(false);
  });
});

describe("keysSavedElsewhere", () => {
  it("is sorted, and a key removed elsewhere counts", () => {
    expect(keysSavedElsewhere({ z: "1", a: "2" }, { m: "3" }, [])).toEqual(["a", "m", "z"]);
  });
  it("an absent fact is the empty text on both sides", () => {
    expect(keysSavedElsewhere({ a: "" }, {}, [])).toEqual([]);
    expect(keysSavedElsewhere({}, { a: "" }, [])).toEqual([]);
  });
  it("a value any of the card's own sets holds is the card's own", () => {
    expect(keysSavedElsewhere({ a: "x" }, { a: "y" }, [{ a: "z" }, { a: "x" }])).toEqual([]);
    expect(keysSavedElsewhere({ a: "x" }, { a: "y" }, [{ a: "z" }])).toEqual(["a"]);
  });
});

describe("the fresh-create window", () => {
  it("an id is fresh for a minute after it was marked, and then not", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    expect(isFreshlyCreated("temp-a")).toBe(false);
    markFreshlyCreated("fresh-1");
    expect(isFreshlyCreated("fresh-1")).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(isFreshlyCreated("fresh-1")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isFreshlyCreated("fresh-1")).toBe(false);
  });
  it("peeking does not spend the window", () => {
    markFreshlyCreated("fresh-2");
    expect(isFreshlyCreated("fresh-2")).toBe(true);
    expect(isFreshlyCreated("fresh-2")).toBe(true);
  });
  it("marking a new id drops the stale ones", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-02-01T00:00:00Z"));
    markFreshlyCreated("old-1");
    vi.advanceTimersByTime(120_000);
    markFreshlyCreated("new-1");
    expect(isFreshlyCreated("old-1")).toBe(false);
    expect(isFreshlyCreated("new-1")).toBe(true);
  });
});

describe("the delete key and the multi-vault refresh", () => {
  it("isRecordDeleteKey is true for exactly the delete key", () => {
    expect(isRecordDeleteKey(RECORD_DELETE_KEY)).toBe(true);
    expect(isRecordDeleteKey([...RECORD_DELETE_KEY])).toBe(true);
    expect(isRecordDeleteKey(["base", "record-update"])).toBe(false);
    expect(isRecordDeleteKey(["base", "record-delete", "x"])).toBe(false);
    expect(isRecordDeleteKey(undefined)).toBe(false);
  });
  it("refreshMultiVaultLists invalidates every snapshot and nothing else", async () => {
    const qc = new QueryClient();
    qc.setQueryData([...RECORDS_SNAPSHOT_KEY_HEAD, "v1", "live", "all", "to-end"], { x: 1 });
    qc.setQueryData(["base", "records", "v1"], { x: 2 });
    await refreshMultiVaultLists(qc);
    expect(qc.getQueryState([...RECORDS_SNAPSHOT_KEY_HEAD, "v1", "live", "all", "to-end"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["base", "records", "v1"])?.isInvalidated).toBe(false);
  });
});

describe("seedRecordReads", () => {
  const doc = (id: string, etag: string) => ({ id, entityUri: `https://h.platform.example.test/base/e/${id}`, typeUri: "t:NoteDocument", facts: {}, opaqueFacts: [], etag }) as BaseRecord;
  const key = (id: string) => ["base", "record", id, vaultOriginOf(`https://h.platform.example.test/base/e/${id}`)];
  it("keeps the page's document under its own key, whatever the age of the record read", () => {
    const qc = new QueryClient();
    seedRecordReads(qc, [doc("a", '"1"')]);
    expect(qc.getQueryData(["base", "page-doc", "a", vaultOriginOf("https://h.platform.example.test/base/e/a")])).toMatchObject({ etag: '"1"' });
  });
  it("replaces a read kept 15 s ago or more, and not one kept less", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
    const qc = new QueryClient();
    qc.setQueryData(key("a"), doc("a", '"old"'));
    vi.advanceTimersByTime(14_999);
    seedRecordReads(qc, [doc("a", '"page"')]);
    expect(qc.getQueryData<BaseRecord>(key("a"))?.etag).toBe('"old"');
    vi.advanceTimersByTime(2);
    seedRecordReads(qc, [doc("a", '"page"')]);
    expect(qc.getQueryData<BaseRecord>(key("a"))?.etag).toBe('"page"');
  });
});

describe("createWiring", () => {
  it("copies the name into the label and the title, unless the create writes the name only", () => {
    expect(createWiring({ title: "Ann" }, "title")).toEqual({ title: "Ann", label: "Ann" });
    expect(createWiring({ title: "Ann" }, "title", true)).toEqual({ title: "Ann" });
    const facts = { name: "Ann" };
    expect(createWiring(facts, "name", true)).toBe(facts);
  });
});
