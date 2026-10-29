// Pins every export of the entry: the names of this package and, under each namespace, the names its unit exports (types are erased and are checked by typecheck).
import { describe, expect, test } from "vitest";
import * as kit from "./index";
import * as completeCopy from "./completeCopy";

const names = (o: object): string[] => Object.keys(o).sort();

describe("the entry", () => {
  test("exports exactly these names", () => { expect(names(kit)).toEqual(["cache","cached","createSpeedKit","device","hub","jobs","prefetch","sync","updated"]); });
  test("complete-copy exports exactly these names", () => { expect(names(completeCopy)).toEqual(["PlatformLacks", "completeCopy"]); });
});

describe("each namespace is its unit", () => {
  test("hub", () => { expect(names(kit.hub)).toEqual(["__freshPageForTests", "clearAllCaches", "currentPrincipal", "guardLate", "principalGuard", "principalVersion", "registerCache", "registeredCaches", "setPrincipal"]); });
  test("cache", () => { expect(names(kit.cache)).toEqual(["MAX_BYTES", "MAX_ENTRIES", "STALE_MS", "cacheKey", "clearSessionCache", "createSessionCache", "keyParts", "sessionCache"]); });
  test("cached", () => { expect(names(kit.cached)).toEqual(["useCached"]); });
  test("updated", () => { expect(names(kit.updated)).toEqual(["DEFAULT_CLASSES", "DEFAULT_LABELS", "RefreshNoteLine", "STALE_NOTE_AFTER_MS", "StaleNote", "UpdatedLine", "plainWhy", "useRefreshNote", "whenText"]); });
  test("jobs", () => { expect(names(kit.jobs)).toEqual(["createBackgroundJobs"]); });
  test("prefetch", () => { expect(names(kit.prefetch)).toEqual(["createPrefetchRegistry", "onIdle"]); });
  test("device", () => { expect(names(kit.device)).toEqual(["DEFAULT_MAX_BYTES", "FUTURE_SKEW_MS", "Persist", "SCHEMA", "STORE_MAX_AGE_MS", "indexedDbKv", "memoryKv"]); });
  test("sync", () => { expect(names(kit.sync)).toEqual(["PlatformError", "RECORD_PAGE_LIMIT", "RECORD_WALK_MAX_PAGES", "RecordListError", "expectStatus", "headRecordState", "isAbsoluteIri", "locate", "originHostMismatch", "request", "retryAfterMs", "routeUrl", "syncRecordChanges", "vaultSegment", "walkRecordPages"]); });
  test("createSpeedKit is a function; a namespace is not", () => { expect(typeof kit.createSpeedKit).toBe("function"); expect(typeof kit.hub).toBe("object"); });
});
