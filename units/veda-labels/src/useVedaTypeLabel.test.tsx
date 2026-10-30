// New tests (the source has none): the hook's overlay behaviour. Fake `fetch`; no wall-clock waits beyond Testing Library's own.
// The module's caches are shared by the tests of this file, so each test names types of its own.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { useVedaTypeLabel } from "./useVedaTypeLabel";
import { fakeAuthHost, fakeFetch, gate, ORIGIN, type Reply } from "../test/support";

const realFetch = globalThis.fetch;
beforeEach(() => {
  setBaseOrigin(ORIGIN);
  setLwsAuth(fakeAuthHost());
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  resetBaseOrigin();
  resetLwsAuth();
});

function install(answer: (url: string) => Reply) {
  const f = fakeFetch(answer);
  globalThis.fetch = f.fn;
  return f.calls;
}
const labelFor = (name: string) => `${name} label`;
const ok = (u: string) => ({ body: { "a:label": labelFor(u.slice(u.lastIndexOf("/") + 1)) } });

describe("useVedaTypeLabel", () => {
  it("is null at first, then the live label once the master answers", async () => {
    const g = gate();
    install((u) => ({ ...ok(u), gate: g.promise }));
    const { result } = renderHook(() => useVedaTypeLabel("t:HookFirst"));
    expect(result.current).toBeNull();
    g.open();
    await waitFor(() => expect(result.current).toBe("HookFirst label"));
  });

  it("takes the bare name from an address and from a curie", async () => {
    const calls = install(ok);
    const a = renderHook(() => useVedaTypeLabel("https://anywhere.example.test/base/t/HookAddr"));
    const b = renderHook(() => useVedaTypeLabel("t:HookCurie"));
    const c = renderHook(() => useVedaTypeLabel("HookBare"));
    await waitFor(() => expect(a.result.current).toBe("HookAddr label"));
    await waitFor(() => expect(b.result.current).toBe("HookCurie label"));
    await waitFor(() => expect(c.result.current).toBe("HookBare label"));
    expect(calls.map((c2) => c2.url).sort()).toEqual([`${ORIGIN}/base/t/HookAddr`, `${ORIGIN}/base/t/HookBare`, `${ORIGIN}/base/t/HookCurie`]);
  });

  it.each([[null], [undefined], [""], ["   "], ["https://x.example.test/base/t/"], ["t:"]])("%j names no type: null, and no request", async (typeUri) => {
    const calls = install(ok);
    const { result } = renderHook(() => useVedaTypeLabel(typeUri as string | null | undefined));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("stays null when the master serves no label (a 404, a document with no label)", async () => {
    const calls = install((u) => (u.endsWith("/HookGone") ? { status: 404 } : { body: {} }));
    const a = renderHook(() => useVedaTypeLabel("t:HookGone"));
    const b = renderHook(() => useVedaTypeLabel("t:HookEmpty"));
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(a.result.current).toBeNull();
    expect(b.result.current).toBeNull();
  });

  it("stays null, and throws nothing, when the read fails", async () => {
    const calls = install(() => ({ fails: true }));
    const { result } = renderHook(() => useVedaTypeLabel("t:HookDown"));
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current).toBeNull();
  });

  it("rows of one type share one request", async () => {
    const calls = install(ok);
    const rows = [1, 2, 3, 4].map(() => renderHook(() => useVedaTypeLabel("t:HookShared")));
    for (const r of rows) await waitFor(() => expect(r.result.current).toBe("HookShared label"));
    expect(calls).toHaveLength(1);
  });

  it("when the type changes, the new type's label replaces the old, and a late answer for the old one is dropped", async () => {
    const slow = gate();
    install((u) => (u.endsWith("/HookOld") ? { ...ok(u), gate: slow.promise } : ok(u)));
    const { result, rerender } = renderHook(({ t }) => useVedaTypeLabel(t), { initialProps: { t: "t:HookOld" } });
    rerender({ t: "t:HookNew" });
    await waitFor(() => expect(result.current).toBe("HookNew label"));
    slow.open();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current).toBe("HookNew label");
  });

  // The source's behaviour, pinned: the hook never clears the label when the type changes to one the master has no label for;
  // the earlier label stays until a new one arrives. A caller that must not show it keeps the type in its own key.
  it("when the type changes to one with no label, the earlier label stays", async () => {
    const calls = install((u) => (u.endsWith("/HookKeepNone") ? { status: 404 } : ok(u)));
    const { result, rerender } = renderHook(({ t }) => useVedaTypeLabel(t), { initialProps: { t: "t:HookKeep" } });
    await waitFor(() => expect(result.current).toBe("HookKeep label"));
    rerender({ t: "t:HookKeepNone" });
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current).toBe("HookKeep label");
  });

  it("a type that becomes null clears the label", async () => {
    install(ok);
    const { result, rerender } = renderHook(({ t }) => useVedaTypeLabel(t), { initialProps: { t: "t:HookClear" as string | null } });
    await waitFor(() => expect(result.current).toBe("HookClear label"));
    rerender({ t: null });
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("an answer that arrives after the screen is gone sets nothing", async () => {
    const slow = gate();
    install((u) => ({ ...ok(u), gate: slow.promise }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useVedaTypeLabel("t:HookGoneScreen"));
    unmount();
    slow.open();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current).toBeNull();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
