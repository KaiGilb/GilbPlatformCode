// useCached. A tiny demo page, in the test only.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cacheKey, createSessionCache } from "@kaigilb/gilbplatformcode-session-cache";
import { useCached } from "./useCached";

const K = cacheKey("https://a.example/vault", "drafts");
afterEach(cleanup);

function Demo({ cache, load, k = K }: { cache: ReturnType<typeof createSessionCache>; load: () => Promise<string>; k?: string | null }) {
  const { data, updating, error, refresh, updatedAt } = useCached(k, load, cache);
  return (
    <div>
      <p data-testid="data">{data ?? "none"}</p>
      <p data-testid="updating">{updating ? "updating" : "idle"}</p>
      <p data-testid="error">{error ? String((error as Error).message) : "no error"}</p>
      <p data-testid="at">{updatedAt === undefined ? "never" : "loaded"}</p>
      <button onClick={() => void refresh()}>Reload</button>
    </div>
  );
}

describe("useCached", () => {
  test("data is on the FIRST render when the cache holds it, with a background revalidation shown as updating", async () => {
    const cache = createSessionCache({ staleMs: 0 }); // everything held is already due for a revalidation
    await cache.swr(K, async () => "cached").promise;
    let release!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => { release = r; }));
    render(<Demo cache={cache} load={load} />);
    // synchronously after the first render, before any load answered
    expect(screen.getByTestId("data").textContent).toBe("cached");
    expect(screen.getByTestId("at").textContent).toBe("loaded");
    await waitFor(() => expect(screen.getByTestId("updating").textContent).toBe("updating"));
    expect(screen.getByTestId("data").textContent).toBe("cached"); // still shown while it revalidates
    await act(async () => { release("fresh"); });
    await waitFor(() => expect(screen.getByTestId("data").textContent).toBe("fresh"));
    expect(screen.getByTestId("updating").textContent).toBe("idle");
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("a miss shows none and updating, then the data", async () => {
    const cache = createSessionCache();
    render(<Demo cache={cache} load={async () => "first"} />);
    expect(screen.getByTestId("data").textContent).toBe("none");
    await waitFor(() => expect(screen.getByTestId("data").textContent).toBe("first"));
  });

  test("a fresh value is not loaded again on mount", async () => {
    const cache = createSessionCache();
    await cache.swr(K, async () => "v").promise;
    const load = vi.fn(async () => "other");
    render(<Demo cache={cache} load={load} />);
    expect(screen.getByTestId("data").textContent).toBe("v");
    await act(async () => { await Promise.resolve(); });
    expect(load).not.toHaveBeenCalled();
  });

  test("refresh loads again even when fresh; the error of a failed load is shown beside the last good data", async () => {
    const cache = createSessionCache();
    let n = 0;
    const load = vi.fn(async () => { n++; if (n === 3) throw new Error("down"); return `v${n}`; });
    render(<Demo cache={cache} load={load} />);
    await waitFor(() => expect(screen.getByTestId("data").textContent).toBe("v1"));
    await act(async () => { screen.getByText("Reload").click(); });
    await waitFor(() => expect(screen.getByTestId("data").textContent).toBe("v2"));
    await act(async () => { screen.getByText("Reload").click(); });
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("down"));
    expect(screen.getByTestId("data").textContent).toBe("v2");
    expect(load).toHaveBeenCalledTimes(3);
  });

  test("a null key loads nothing", async () => {
    const cache = createSessionCache();
    const load = vi.fn(async () => "x");
    render(<Demo cache={cache} load={load} k={null} />);
    await act(async () => { await Promise.resolve(); });
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByTestId("data").textContent).toBe("none");
  });
});
