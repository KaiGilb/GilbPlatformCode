// Shared set-up for the tests, not shipped (the package files are `src` only): the platform settings, a fake host for the auth seam, and a
// fake host for the doors (`StakeholderListDoorsHost`) with a request meter and the delete list.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth, type LwsAuthHost } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { watchRecordDeletes } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { deletedLinkedRecords, deletedLinkedRevision, onDeletedLinkedRecords } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import type { StakeholderListDoorsHost } from "../src/doorsHost";

export const ORIGIN = "https://platform.example.test";
export const ONTOLOGY = "https://ontology.example.test";
export const SYSTEM_HOSTS = ["ontology.platform.example.test", "geo.platform.example.test", "life.platform.example.test", "id.platform.example.test", "kaizen.platform.example.test"];

/** A host whose every header-forming member answers a DPoP pair and records its arguments. */
export function fakeAuth() {
  return {
    bearerHeaderFor: vi.fn(async (_url: string, _method?: string) => ({ authorization: "DPoP tok-bearer", dpop: "proof-bearer" })),
    dpopReadAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP tok", dpop: "proof" })),
    dpopWriteAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP tok", dpop: "proof" })),
    invalidateDpop: vi.fn(),
    tokenManager: {
      getSession: vi.fn(async () => ({ principal: "https://id.platform.example.test/base/p/ann", vault: null, vaults: [] })),
      invalidate: vi.fn(),
    },
  } satisfies LwsAuthHost;
}
export type FakeAuth = ReturnType<typeof fakeAuth>;

/** Sets the platform settings and a fake auth host; returns the auth host. */
export function setUp(origin: string = ORIGIN): FakeAuth {
  setBaseOrigin(origin);
  setSystemVaultHosts(SYSTEM_HOSTS);
  setTermOrigin(ONTOLOGY);
  const auth = fakeAuth();
  setLwsAuth(auth);
  return auth;
}

export function tearDown(): void {
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  resetTermOrigin();
}

/** Registers the platform settings and the fake auth host before each test of the calling file, and resets them after it. */
export function installPlatformHooks(): void {
  beforeEach(() => {
    setUp();
  });
  afterEach(() => {
    tearDown();
  });
}

/** A fetch Response stand-in with a real Headers bag. */
export function resp(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body ?? ""),
  } as unknown as Response;
}

// ── a request meter: counts every `fetch` the page sends, when it is sent (the app's `installRequestMeter` and `requestsSent`) ──
let sent = 0;
let installed = false;
/** Count every `fetch` of `scope` from now on. A second call does nothing. */
export function installRequestMeter(scope: { fetch: typeof fetch } = globalThis): void {
  if (installed) return;
  installed = true;
  const inner = scope.fetch;
  scope.fetch = ((...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
    sent++;
    return inner.apply(scope, args);
  }) as typeof fetch;
}
/** How many requests the meter has counted (0 when it was not installed). */
export function requestsSent(): number {
  return sent;
}

/**
 * The fake host of the doors. `requestsSent` is the meter above; `heldRecordOf` answers what the test gave it (nothing by default);
 * `useRecordsBeingDeleted` is the app's hook over the delete watcher and the session's deleted list.
 */
export function fakeDoorsHost(over: Partial<StakeholderListDoorsHost> = {}): StakeholderListDoorsHost {
  return {
    requestsSent: () => requestsSent(),
    heldRecordFreshMs: 15_000,
    heldRecordOf: (_qc: QueryClient, _id: string, _uri: string | null | undefined): BaseRecord | null => null,
    useRecordsBeingDeleted,
    ...over,
  };
}

/** The ids of records being deleted or deleted in this session: the delete watcher's pending ids and the session's deleted list. */
function useRecordsBeingDeleted(): ReadonlySet<string> {
  const qc = useQueryClient();
  const watch = watchRecordDeletes(qc);
  const subscribe = useCallback(
    (tell: () => void) => {
      const a = watch.subscribe(() => tell());
      const b = onDeletedLinkedRecords(tell);
      return () => {
        a();
        b();
      };
    },
    [watch],
  );
  const pending = useSyncExternalStore(subscribe, watch.pending, watch.pending);
  const landedRev = useSyncExternalStore(subscribe, deletedLinkedRevision, deletedLinkedRevision);
  return useMemo(() => {
    const landed = deletedLinkedRecords();
    if (pending.size === 0) return landed;
    return new Set([...landed, ...pending]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, landedRev]);
}
