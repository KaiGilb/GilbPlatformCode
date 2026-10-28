// @vitest-environment jsdom

// a landed delete is put into the session's deleted list ONCE (it was put there by the
// delete door's mutationFn AND by the delete watcher's success step). The watcher, which every delete under the key passes, keeps it.
import { describe, expect, it, vi } from "vitest";
import { afterEach as afterEachSetUp, beforeEach as beforeEachSetUp } from "vitest";
import { setUp, tearDown } from "../test/support";
beforeEachSetUp(() => {
  setUp();
});
afterEachSetUp(() => tearDown());
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const forget = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-state", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@kaigilb/gilbplatformcode-stakeholder-list-state");
  return {
    ...actual,
    forgetDeletedLinkedRecord: (id: string) => {
      forget.calls.push(id);
      actual.forgetDeletedLinkedRecord(id);
    },
  };
});
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (importOriginal) => ({ ...((await importOriginal()) as object), deleteRecord: vi.fn(async () => undefined) }));
vi.mock("@kaigilb/gilbplatformcode-working-set-store", () => ({ rememberRecord: vi.fn(async () => {}), forgetRecord: vi.fn(async () => {}), listRecordRefs: vi.fn(async () => []), purgeWorkingSet: vi.fn(async () => {}) }));
import { useDeleteRecord } from "./recordHooks";
import { deletedLinkedRecords } from "@kaigilb/gilbplatformcode-stakeholder-list-state";

describe("a landed delete enters the session's deleted list once", () => {
  it("one DELETE that lands: forgetDeletedLinkedRecord is called once, and the record is known as deleted", async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useDeleteRecord("https://a.platform.example.test/vault"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "d1", entityUri: "https://a.platform.example.test/vault/e/d1" });
    });
    await waitFor(() => expect(deletedLinkedRecords().has("d1")).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(forget.calls.filter((x) => x.endsWith("d1"))).toHaveLength(1);
  });
});

