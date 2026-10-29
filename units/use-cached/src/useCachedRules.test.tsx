// Ported from the source app's tester-s1 file for useCached: the paint-from-memory and fresh-before-write cases, with the real hook and the real cache; only the loader is a stub.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cacheKey, createSessionCache } from "@kaigilb/gilbplatformcode-session-cache";
import { setPrincipal, __freshPageForTests } from "@kaigilb/gilbplatformcode-principal-hub";
import { useCached } from "./useCached";

afterEach(() => { cleanup(); __freshPageForTests(); });

function Demo({ cache, load, k, id = "d" }: { cache: ReturnType<typeof createSessionCache>; load: () => Promise<string>; k: string | null; id?: string }) {
  const { data, updating, error, refresh } = useCached(k, load, cache);
  return (
    <div>
      <p data-testid={`${id}-data`}>{data ?? "none"}</p>
      <p data-testid={`${id}-updating`}>{updating ? "updating" : "idle"}</p>
      <p data-testid={`${id}-error`}>{error ? String((error as Error).message) : "no error"}</p>
      <button onClick={() => void refresh()}>{`Reload ${id}`}</button>
    </div>
  );
}
const t = (id: string, s: string) => screen.getByTestId(`${id}-${s}`).textContent;

describe("rule 2 PaintFromMemory", () => {
  test("U1 a held fresh value paints on the first render and sends 0 requests, before and after effects", async () => {
    const cache = createSessionCache();
    const K = cacheKey("https://a.example/vault", "drafts");
    await cache.swr(K, async () => "held").promise;
    const load = vi.fn(async () => "other");
    render(<Demo cache={cache} load={load} k={K} />);
    expect(t("d", "data")).toBe("held");
    expect(load).not.toHaveBeenCalled();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(load).not.toHaveBeenCalled();
    expect(t("d", "data")).toBe("held");
  });

  test("U2 keyed by person AND workspace: another workspace's key never shows this one's data; another person's key neither", async () => {
    const cache = createSessionCache();
    setPrincipal("https://alice/vault");
    const kA1 = cacheKey("https://ws1", "drafts");
    const kA2 = cacheKey("https://ws2", "drafts");
    await cache.swr(kA1, async () => "alice-ws1").promise;
    setPrincipal("https://bob/vault");
    const kB1 = cacheKey("https://ws1", "drafts");
    expect(new Set([kA1, kA2, kB1]).size).toBe(3);
    const load = vi.fn(async () => "bob-ws1");
    render(<Demo cache={cache} load={load} k={kB1} />);
    expect(t("d", "data")).toBe("none"); // not alice's value
    await waitFor(() => expect(t("d", "data")).toBe("bob-ws1"));
  });

  test("U3 a key change shows the new key's data (no leftover of the old key) and loads only that key", async () => {
    const cache = createSessionCache();
    const K1 = cacheKey("https://ws1", "x"), K2 = cacheKey("https://ws2", "x");
    await cache.swr(K1, async () => "one").promise;
    const load = vi.fn(async () => "two");
    const view = render(<Demo cache={cache} load={load} k={K1} />);
    expect(t("d", "data")).toBe("one");
    view.rerender(<Demo cache={cache} load={load} k={K2} />);
    expect(t("d", "data")).toBe("none");
    await waitFor(() => expect(t("d", "data")).toBe("two"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("U4 one request in flight per key: two components on one key load once", async () => {
    const cache = createSessionCache();
    const K = cacheKey("https://ws1", "shared");
    let release!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => { release = r; }));
    render(<><Demo cache={cache} load={load} k={K} id="a" /><Demo cache={cache} load={load} k={K} id="b" /></>);
    await act(async () => { await Promise.resolve(); });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { release("v"); });
    await waitFor(() => { expect(t("a", "data")).toBe("v"); expect(t("b", "data")).toBe("v"); });
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("U5 an error is not stored as data: the key stays empty, the error is shown, and the next mount asks again", async () => {
    const cache = createSessionCache();
    const K = cacheKey("https://ws1", "err");
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("down")).mockResolvedValue("ok");
    const first = render(<Demo cache={cache} load={load} k={K} />);
    await waitFor(() => expect(t("d", "error")).toBe("down"));
    expect(t("d", "data")).toBe("none");
    expect(cache.peek(K).data).toBeUndefined();
    first.unmount();
    render(<Demo cache={cache} load={load} k={K} />);
    await waitFor(() => expect(t("d", "data")).toBe("ok"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("U6 the latest loader is used and a new function each render does not reload", async () => {
    const cache = createSessionCache();
    const K = cacheKey("https://ws1", "loader");
    const a = vi.fn(async () => "a"), b = vi.fn(async () => "b");
    const view = render(<Demo cache={cache} load={a} k={K} />);
    await waitFor(() => expect(t("d", "data")).toBe("a"));
    view.rerender(<Demo cache={cache} load={b} k={K} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(a).toHaveBeenCalledTimes(1); expect(b).not.toHaveBeenCalled();
    await act(async () => { screen.getByText("Reload d").click(); });
    await waitFor(() => expect(t("d", "data")).toBe("b")); // Refresh used the LATEST loader
  });

  test("U7 Refresh always asks, even when fresh, and a refresh that fails keeps the last good data and shows the error", async () => {
    const cache = createSessionCache();
    const K = cacheKey("https://ws1", "ref");
    let n = 0;
    const load = vi.fn(async () => { n++; if (n === 2) throw new Error("boom"); return `v${n}`; });
    render(<Demo cache={cache} load={load} k={K} />);
    await waitFor(() => expect(t("d", "data")).toBe("v1"));
    await act(async () => { screen.getByText("Reload d").click(); });
    await waitFor(() => expect(t("d", "error")).toBe("boom"));
    expect(t("d", "data")).toBe("v1");
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("rule 6 FreshBeforeWrite (what useCached.refresh gives a caller that wrote)", () => {
  test("U8 refresh during a slow display read does NOT join it: it starts its own later read and the newest answer wins, even if the older read answers last", async () => {
    const cache = createSessionCache();
    const K = cacheKey("https://ws1", "fresh");
    const releases: Array<(v: string) => void> = [];
    const load = vi.fn(() => new Promise<string>((r) => { releases.push(r); }));
    render(<Demo cache={cache} load={load} k={K} />);
    await act(async () => { await Promise.resolve(); });
    expect(load).toHaveBeenCalledTimes(1); // the display read, started before the write
    await act(async () => { screen.getByText("Reload d").click(); }); // a write happened; the page asks again
    expect(load).toHaveBeenCalledTimes(2); // its own read, not the earlier in-flight one
    await act(async () => { releases[1]!("after-write"); });
    await waitFor(() => expect(t("d", "data")).toBe("after-write"));
    await act(async () => { releases[0]!("before-write"); }); // the older read answers late
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(t("d", "data")).toBe("after-write"); // the stale answer is not kept
  });
});
