// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RECORDS_QUERY_HEAD } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

// The app read its ontology origin as a constant; the unit reads the setting at call time, and the hook builds its master source when it writes.
beforeEach(() => setTermOrigin("https://ontology.example.test"));
afterEach(() => resetTermOrigin());

describe("the reference add's hook drops the cached record reads and lists through the cache kit's keys", () => {
  it("after a successful add, every records list and record read is invalidated", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const { renderHook, waitFor } = await import("@testing-library/react");
    const React = await import("react");
    const { QueryClientProvider } = await import("@tanstack/react-query");
    const hook = await import("./useAddCardReference");
    const card = await import("./cardReferences");
    const { vi } = await import("vitest");
    const spy = vi.spyOn(card, "addReferenceFromCard").mockResolvedValue({ carrier: "c" } as never);
    const qc = new QueryClient();
    qc.setQueryData([...RECORDS_QUERY_HEAD, "snapshot", "https://p.example.test/vault", "live", "Person"], { records: [] });
    qc.setQueryData(["base", "record", "x", "https://p.example.test"], { id: "x" });
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => hook.useAddCardReference({} as never), { wrapper });
    await result.current.mutateAsync({ vaultId: "v", agent: "a", carrier: "c", field: {} as never, target: "t" });
    await waitFor(() => {
      expect(qc.getQueryState([...RECORDS_QUERY_HEAD, "snapshot", "https://p.example.test/vault", "live", "Person"])!.isInvalidated).toBe(true);
      expect(qc.getQueryState(["base", "record", "x", "https://p.example.test"])!.isInvalidated).toBe(true);
    });
    spy.mockRestore();
  });
});
