import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { AUTOSAVE_DELAY_MS, useAutosaveRecord, type UseAutosaveRecordOptions } from "./useAutosaveRecord";

type F = { name: string; place: string; score: number };
const STORED: F = { name: "Fig", place: "Rome", score: 5 };

type Call = { changed: Partial<F>; keepalive: boolean };
function setup(over: Partial<UseAutosaveRecordOptions<F>> = {}) {
  const calls: Call[] = [];
  const write = vi.fn(async (changed: Partial<F>, how: { keepalive: boolean }) => {
    calls.push({ changed, keepalive: how.keepalive });
  });
  const hook = renderHook((p: Partial<UseAutosaveRecordOptions<F>>) => useAutosaveRecord<F>({ stored: STORED, write, ...over, ...p }), {
    initialProps: {} as Partial<UseAutosaveRecordOptions<F>>,
  });
  return { calls, write, ...hook };
}
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useAutosaveRecord: when it writes", () => {
  test("three keystrokes inside the delay, then quiet: one write with only that field", async () => {
    const { result, calls } = setup();
    act(() => result.current.set("name", "F"));
    await tick(100);
    act(() => result.current.set("name", "Fi"));
    await tick(100);
    act(() => result.current.set("name", "Fig tree"));
    expect(result.current.state).toBe("pending");
    await tick(AUTOSAVE_DELAY_MS - 1);
    expect(calls).toHaveLength(0);
    await tick(1);
    expect(calls).toEqual([{ changed: { name: "Fig tree" }, keepalive: false }]);
    expect(result.current.state).toBe("saved");
  });

  test("flush writes at once, before the delay", async () => {
    const { result, calls } = setup();
    act(() => result.current.set("name", "Plum"));
    await act(async () => void (await result.current.flush()));
    expect(calls).toEqual([{ changed: { name: "Plum" }, keepalive: false }]);
  });

  test("two fields changed inside the delay: one write carrying both", async () => {
    const { result, calls } = setup();
    act(() => result.current.set("name", "Plum"));
    act(() => result.current.set("place", "Oslo"));
    await tick(AUTOSAVE_DELAY_MS);
    expect(calls).toEqual([{ changed: { name: "Plum", place: "Oslo" }, keepalive: false }]);
  });

  test("a value set back to the stored value: no write", async () => {
    const { result, calls } = setup();
    act(() => result.current.set("name", "Plum"));
    act(() => result.current.set("name", "Fig"));
    expect(result.current.state).toBe("idle");
    await act(async () => void (await result.current.flush()));
    await tick(AUTOSAVE_DELAY_MS * 2);
    expect(calls).toHaveLength(0);
  });

  test("an object value is compared by value, not identity", async () => {
    const calls: unknown[] = [];
    const { result } = renderHook(() =>
      useAutosaveRecord<{ tags: string[] }>({ stored: { tags: ["a", "b"] }, write: async (c) => void calls.push(c) }),
    );
    act(() => result.current.set("tags", ["a", "b"]));
    await act(async () => void (await result.current.flush()));
    expect(calls).toHaveLength(0);
    act(() => result.current.set("tags", ["b", "a"]));
    await act(async () => void (await result.current.flush()));
    expect(calls).toEqual([{ tags: ["b", "a"] }]);
  });

  test("a custom delay is used", async () => {
    const { result, calls } = setup({ delayMs: 50 });
    act(() => result.current.set("name", "Plum"));
    await tick(50);
    expect(calls).toHaveLength(1);
  });
});

describe("useAutosaveRecord: nothing is written into what was not read", () => {
  test("stored null: set does nothing, and flush + pagehide + unmount write nothing", async () => {
    const { result, calls, unmount } = setup({ stored: null });
    expect(result.current.values).toEqual({});
    act(() => result.current.set("name", "Plum"));
    expect(result.current.state).toBe("idle");
    await tick(AUTOSAVE_DELAY_MS * 2);
    await act(async () => void (await result.current.flush()));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    unmount();
    await tick(10);
    expect(calls).toHaveLength(0);
  });

  test("an unsaved edit, then the stored value becomes unknown (a failed re-read): flush, pagehide and unmount write nothing", async () => {
    const { result, rerender, calls, unmount } = setup();
    act(() => result.current.set("name", "Plum"));
    rerender({ stored: null });
    await act(async () => void (await result.current.flush()));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    unmount();
    await tick(AUTOSAVE_DELAY_MS * 2);
    expect(calls).toHaveLength(0);
  });

  test("stored null: the fields cannot be typed in; once stored arrives they can", () => {
    const { result, rerender } = setup({ stored: null });
    expect(result.current.text("name").readOnly).toBe(true);
    rerender({ stored: STORED });
    expect(result.current.text("name").readOnly).toBe(false);
  });
});

describe("useAutosaveRecord: one write in flight", () => {
  test("a change while a write is in flight: the second starts only after the first resolves; never two at once", async () => {
    const gates: ReturnType<typeof deferred>[] = [];
    let live = 0;
    let most = 0;
    const started: Partial<F>[] = [];
    const write = async (changed: Partial<F>) => {
      started.push(changed);
      live++;
      most = Math.max(most, live);
      const g = deferred();
      gates.push(g);
      try {
        await g.promise;
      } finally {
        live--;
      }
    };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: STORED, write }));
    act(() => result.current.set("name", "A"));
    await tick(AUTOSAVE_DELAY_MS);
    expect(started).toEqual([{ name: "A" }]);
    expect(result.current.state).toBe("saving");
    act(() => result.current.set("name", "AB"));
    await tick(AUTOSAVE_DELAY_MS * 3);
    expect(started).toHaveLength(1); // held back
    await act(async () => gates[0].resolve());
    await tick(0);
    expect(started).toEqual([{ name: "A" }, { name: "AB" }]);
    await act(async () => gates[1].resolve());
    await tick(0);
    expect(most).toBe(1);
    expect(result.current.state).toBe("saved");
  });

  test("pagehide then visibilitychange hidden with the same edit: one write, keepalive true", async () => {
    const d = deferred();
    const calls: Call[] = [];
    const write = async (changed: Partial<F>, how: { keepalive: boolean }) => {
      calls.push({ changed, keepalive: how.keepalive });
      await d.promise;
    };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: STORED, write }));
    act(() => result.current.set("name", "Plum"));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    vis.mockRestore();
    await tick(0);
    expect(calls).toEqual([{ changed: { name: "Plum" }, keepalive: true }]);
    await act(async () => d.resolve());
  });

  test("visibilitychange to visible writes nothing", async () => {
    const { result, calls } = setup();
    act(() => result.current.set("name", "Plum"));
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await tick(0);
    expect(calls).toHaveLength(0);
  });

  test("unmount with an unsaved edit: one write with keepalive true, and no state update warning", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, calls, unmount } = setup();
    act(() => result.current.set("name", "Plum"));
    unmount();
    await tick(AUTOSAVE_DELAY_MS * 2);
    expect(calls).toEqual([{ changed: { name: "Plum" }, keepalive: true }]);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  test("a change made while a write is in flight, then unmount: the follow-up write uses keepalive true", async () => {
    const gates: ReturnType<typeof deferred>[] = [];
    const calls: Call[] = [];
    const write = async (changed: Partial<F>, how: { keepalive: boolean }) => {
      calls.push({ changed, keepalive: how.keepalive });
      const g = deferred();
      gates.push(g);
      await g.promise;
    };
    const { result, unmount } = renderHook(() => useAutosaveRecord<F>({ stored: STORED, write }));
    act(() => result.current.set("name", "A"));
    await tick(AUTOSAVE_DELAY_MS);
    act(() => result.current.set("place", "Oslo"));
    unmount(); // its flush finds a write in flight and asks for another
    expect(calls).toHaveLength(1);
    await act(async () => gates[0].resolve());
    await tick(0);
    expect(calls).toEqual([
      { changed: { name: "A" }, keepalive: false },
      { changed: { place: "Oslo" }, keepalive: true },
    ]);
    await act(async () => gates[1].resolve());
  });

  test("a write that fails after unmount sets no state either", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deferred();
    const { result, unmount } = renderHook(() => useAutosaveRecord<F>({ stored: STORED, write: () => d.promise }));
    act(() => result.current.set("name", "Plum"));
    unmount();
    await act(async () => d.reject(new Error("late")));
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  test("the listeners are registered once, however often the screen renders, and removed at unmount", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const { result, rerender, unmount } = setup();
    const n = () => add.mock.calls.filter((c) => c[0] === "pagehide").length;
    const first = n();
    act(() => result.current.set("name", "P"));
    act(() => result.current.set("name", "Pl"));
    rerender({ write: async () => {} });
    expect(n()).toBe(first);
    const remove = vi.spyOn(window, "removeEventListener");
    unmount();
    expect(remove.mock.calls.filter((c) => c[0] === "pagehide")).toHaveLength(1);
    add.mockRestore();
    remove.mockRestore();
  });

  test("an inline write passed on a later render is the one used", async () => {
    const second = vi.fn(async () => {});
    const { result, rerender, calls } = setup();
    rerender({ write: second });
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    expect(second).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });
});

describe("useAutosaveRecord: a refused write", () => {
  test("state error with the text verbatim, the edit stays, retry writes again and ends saved", async () => {
    let refuse = true;
    const calls: Partial<F>[] = [];
    const write = async (changed: Partial<F>) => {
      calls.push(changed);
      if (refuse) throw new Error("Refused by the vault");
    };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: STORED, write }));
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("Refused by the vault");
    expect(result.current.values.name).toBe("Plum");
    refuse = false;
    await act(async () => void (await result.current.retry()));
    expect(calls).toEqual([{ name: "Plum" }, { name: "Plum" }]);
    expect(result.current.state).toBe("saved");
    expect(result.current.error).toBeNull();
  });

  test("a thrown non-Error is shown as a string", async () => {
    const { result } = renderHook(() =>
      useAutosaveRecord<F>({
        stored: STORED,
        write: async () => {
          throw "plain words";
        },
      }),
    );
    act(() => result.current.set("name", "Plum"));
    await act(async () => void (await result.current.flush()));
    expect(result.current.error).toBe("plain words");
  });

  test("the next set() after a failure writes again", async () => {
    let refuse = true;
    const calls: Partial<F>[] = [];
    const write = async (c: Partial<F>) => {
      calls.push(c);
      if (refuse) throw new Error("no");
    };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: STORED, write }));
    act(() => result.current.set("name", "P"));
    await act(async () => void (await result.current.flush()));
    refuse = false;
    act(() => result.current.set("name", "Pl"));
    expect(result.current.error).toBeNull();
    await tick(AUTOSAVE_DELAY_MS);
    expect(calls).toEqual([{ name: "P" }, { name: "Pl" }]);
  });

  test("onSaved is not called on failure", async () => {
    const onSaved = vi.fn();
    const { result } = renderHook(() =>
      useAutosaveRecord<F>({
        stored: STORED,
        write: async () => {
          throw new Error("no");
        },
        onSaved,
      }),
    );
    act(() => result.current.set("name", "P"));
    await act(async () => void (await result.current.flush()));
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("useAutosaveRecord: check", () => {
  const check = (name: keyof F, value: unknown) => (name === "score" && (value as number) > 10 ? "Score must be 0 to 10" : null);

  test("an invalid field is not written; state invalid with its sentence", async () => {
    const { result, calls } = setup({ check });
    act(() => result.current.set("score", 11));
    expect(result.current.state).toBe("invalid");
    expect(result.current.problems.score).toBe("Score must be 0 to 10");
    expect(result.current.text("score")["aria-invalid"]).toBe(true);
    await tick(AUTOSAVE_DELAY_MS * 2);
    await act(async () => void (await result.current.flush()));
    expect(calls).toHaveLength(0);
  });

  test("a valid field changed at the same time is written without the invalid one", async () => {
    const { result, calls } = setup({ check });
    act(() => result.current.set("score", 11));
    act(() => result.current.set("name", "Plum"));
    expect(result.current.state).toBe("pending");
    await tick(AUTOSAVE_DELAY_MS);
    expect(calls).toEqual([{ changed: { name: "Plum" }, keepalive: false }]);
    expect(result.current.problems.score).toBe("Score must be 0 to 10");
    expect(result.current.values.score).toBe(11);
  });

  test("fixing the value clears the problem and writes it", async () => {
    const { result, calls } = setup({ check });
    act(() => result.current.set("score", 11));
    act(() => result.current.set("score", 7));
    expect(result.current.problems.score).toBeUndefined();
    await tick(AUTOSAVE_DELAY_MS);
    expect(calls).toEqual([{ changed: { score: 7 }, keepalive: false }]);
  });

  test("check is given the field, the value and every value", () => {
    const seen = vi.fn(() => null);
    const { result } = setup({ check: seen });
    act(() => result.current.set("place", "Oslo"));
    expect(seen).toHaveBeenCalledWith("place", "Oslo", { ...STORED, place: "Oslo" });
  });
});

// Typecheck only: a non-generic check is given the field name as a string and the value.
void (() => {
  const stored = { score: "5", name: "Fig" };
  return useAutosaveRecord<{ score: string; name: string }>({
    stored,
    write: async () => {},
    check: (name, value) => (name === "score" && Number(value) > 10 ? "Score must be 0 to 10" : null),
  });
});

describe("useAutosaveRecord: read-only, re-read, onSaved, text()", () => {
  test("readOnly: set() changes nothing and writes nothing", async () => {
    const { result, calls } = setup({ readOnly: true });
    act(() => result.current.set("name", "Plum"));
    expect(result.current.values).toEqual(STORED);
    expect(result.current.state).toBe("idle");
    await act(async () => void (await result.current.flush()));
    await tick(AUTOSAVE_DELAY_MS * 2);
    expect(calls).toHaveLength(0);
  });

  test("stored re-read to a new object: an unsaved edit stays; an edit equal to the new value is dropped", async () => {
    const d = deferred();
    const calls: Partial<F>[] = [];
    // hold the write so the edits stay unsaved while the re-read arrives
    const write = async (c: Partial<F>) => {
      calls.push(c);
      await d.promise;
    };
    const { result, rerender } = renderHook((p: { stored: F }) => useAutosaveRecord<F>({ stored: p.stored, write }), {
      initialProps: { stored: STORED },
    });
    act(() => result.current.set("name", "Plum"));
    act(() => result.current.set("place", "Oslo"));
    rerender({ stored: { ...STORED, place: "Oslo" } });
    expect(result.current.values).toEqual({ name: "Plum", place: "Oslo", score: 5 });
    act(() => void result.current.flush());
    expect(calls).toEqual([{ name: "Plum" }]); // place was dropped: it equals what the vault now holds
    await act(async () => d.resolve());
  });

  test("a re-read shows new values for fields the person has not edited", () => {
    const { result, rerender } = setup();
    rerender({ stored: { ...STORED, score: 9 } });
    expect(result.current.values.score).toBe(9);
  });

  test("stored arriving after null: the hook then writes", async () => {
    const { result, rerender, calls } = setup({ stored: null });
    rerender({ stored: STORED });
    expect(result.current.values).toEqual(STORED);
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    expect(calls).toHaveLength(1);
  });

  test("onSaved gets exactly the landed fields, also after unmount", async () => {
    const onSaved = vi.fn();
    const { result, unmount } = setup({ onSaved });
    act(() => result.current.set("name", "Plum"));
    act(() => result.current.set("place", "Oslo"));
    await tick(AUTOSAVE_DELAY_MS);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith({ name: "Plum", place: "Oslo" });
    act(() => result.current.set("score", 8));
    unmount();
    await tick(10);
    expect(onSaved).toHaveBeenLastCalledWith({ score: 8 });
  });

  test("onSaved is not called when the write is only scheduled", async () => {
    const onSaved = vi.fn();
    const { result } = setup({ onSaved });
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS - 1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  test("text(name) is wired: value, onChange, onBlur, readOnly, aria-invalid", async () => {
    const { result, calls } = setup({ check: (n, v) => (n === "place" && v === "" ? "Place is needed" : null) });
    const t = result.current.text("name");
    expect(t.value).toBe("Fig");
    expect(t.readOnly).toBe(false);
    expect(t["aria-invalid"]).toBe(false);
    act(() => t.onChange({ target: { value: "Plum" } }));
    expect(result.current.text("name").value).toBe("Plum");
    expect(result.current.state).toBe("pending");
    await act(async () => result.current.text("name").onBlur());
    expect(calls).toEqual([{ changed: { name: "Plum" }, keepalive: false }]);
    act(() => result.current.text("place").onChange({ target: { value: "" } }));
    expect(result.current.text("place")["aria-invalid"]).toBe(true);
    expect(result.current.text("place").value).toBe("");
  });

  test("text(name) of a missing value is an empty string; readOnly is passed through", () => {
    const { result } = renderHook(() => useAutosaveRecord<{ a?: string }>({ stored: {}, write: async () => {}, readOnly: true }));
    expect(result.current.text("a").value).toBe("");
    expect(result.current.text("a").readOnly).toBe(true);
  });
});
