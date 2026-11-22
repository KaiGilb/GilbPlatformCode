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

  test("with a write in flight, unmount with a newer value: a keepalive write of it is sent before the first resolves", async () => {
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
    unmount();
    expect(calls).toEqual([
      { changed: { name: "A" }, keepalive: false },
      { changed: { name: "A", place: "Oslo" }, keepalive: true }, // everything unsaved: the first write may not have landed
    ]);
    window.dispatchEvent(new Event("pagehide")); // already gone: no third write
    await act(async () => gates[0].resolve());
    await act(async () => gates[1].resolve());
    expect(calls).toHaveLength(2);
  });

  test("a second pagehide with a write in flight and a newer edit sends it once", async () => {
    const calls: Call[] = [];
    const g = deferred();
    const write = async (changed: Partial<F>, how: { keepalive: boolean }) => {
      calls.push({ changed, keepalive: how.keepalive });
      await g.promise;
    };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: STORED, write }));
    act(() => result.current.set("name", "A"));
    await tick(AUTOSAVE_DELAY_MS);
    act(() => result.current.set("name", "AB"));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(calls).toEqual([
      { changed: { name: "A" }, keepalive: false },
      { changed: { name: "AB" }, keepalive: true },
    ]);
    await act(async () => g.resolve());
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
    expect(result.current.state).toBe("invalid");
    await tick(AUTOSAVE_DELAY_MS);
    expect(calls).toEqual([{ changed: { name: "Plum" }, keepalive: false }]);
    expect(result.current.state).toBe("invalid"); // never "Saved" while a field is unsaved and invalid
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

describe("useAutosaveRecord: a stored value that is rebuilt or re-read", () => {
  type P = { s: F };
  const hook = (s: F, write: (c: Partial<F>) => Promise<void> = async () => {}) =>
    renderHook((p: P) => useAutosaveRecord<F>({ stored: p.s, write }), { initialProps: { s } });

  test("a new object with the same values is not a re-read: a landed write stays", async () => {
    const { result, rerender } = hook({ ...STORED });
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    rerender({ s: { ...STORED } });
    rerender({ s: { ...STORED } });
    expect(result.current.values.name).toBe("Plum");
  });

  test("a stale re-read (the old values, a new object) after a landed write keeps the new value", async () => {
    const { result, rerender } = hook(STORED);
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    rerender({ s: { ...STORED, score: 5 } });
    expect(result.current.values.name).toBe("Plum");
    expect(result.current.state).toBe("saved");
  });

  test("a stale re-read that differs in ANOTHER field: that field shows, the written field keeps its new value", async () => {
    const { result, rerender } = hook(STORED);
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    rerender({ s: { ...STORED, place: "Paris" } });
    expect(result.current.values).toEqual({ name: "Plum", place: "Paris", score: 5 });
  });

  test("a re-read that shows the written value clears the memory of it: a later change by someone else shows", async () => {
    const { result, rerender } = hook(STORED);
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    rerender({ s: { ...STORED, name: "Plum" } });
    expect(result.current.values.name).toBe("Plum");
    rerender({ s: { ...STORED, name: "Pear" } });
    expect(result.current.values.name).toBe("Pear");
  });

  test("another writer changed the field to a third value: the third value shows", async () => {
    const { result, rerender } = hook(STORED);
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    rerender({ s: { ...STORED, name: "Pear" } });
    expect(result.current.values.name).toBe("Pear");
    expect(result.current.state).toBe("saved");
  });

  test("another writer changed a field the person is editing: the person's unsaved edit stays on screen", async () => {
    const calls: Partial<F>[] = [];
    const { result, rerender } = hook(STORED, async (c) => void calls.push(c));
    act(() => result.current.set("name", "Plum"));
    rerender({ s: { ...STORED, name: "Pear" } });
    expect(result.current.values.name).toBe("Plum");
    await tick(AUTOSAVE_DELAY_MS);
    expect(calls).toEqual([{ name: "Plum" }]);
  });

  test("stored goes null (a failed re-read) and back with the same values: a landed write stays", async () => {
    const { result, rerender } = renderHook((p: { s: F | null }) => useAutosaveRecord<F>({ stored: p.s, write: async () => {} }), {
      initialProps: { s: STORED as F | null },
    });
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    rerender({ s: null });
    expect(result.current.text("name").readOnly).toBe(true);
    rerender({ s: { ...STORED } });
    expect(result.current.values.name).toBe("Plum");
  });
});

describe("useAutosaveRecord: read-only turning on, failures, cross-field checks", () => {
  test("readOnly turning true: the timer is cleared, nothing is written, unsaved edits and problems are dropped, state idle", async () => {
    const write = vi.fn(async () => {});
    const { result, rerender } = renderHook((p: { ro: boolean }) => useAutosaveRecord<F>({ stored: STORED, write, readOnly: p.ro, check: (n, v) => (n === "score" && (v as number) > 10 ? "too big" : null) }), {
      initialProps: { ro: false },
    });
    act(() => result.current.set("name", "Plum"));
    act(() => result.current.set("score", 11));
    rerender({ ro: true });
    expect(result.current.values).toEqual(STORED);
    expect(result.current.problems).toEqual({});
    expect(result.current.state).toBe("idle");
    await tick(AUTOSAVE_DELAY_MS * 2);
    await act(async () => void (await result.current.flush()));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(write).not.toHaveBeenCalled();
  });

  test("a failure while a follow-up edit waits: error, no hidden write; retry sends both fields", async () => {
    const first = deferred();
    const calls: Partial<F>[] = [];
    let n = 0;
    const write = vi.fn((c: Partial<F>) => {
      calls.push(c);
      return n++ === 0 ? first.promise : Promise.resolve();
    });
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: STORED, write }));
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    act(() => result.current.set("place", "Oslo"));
    await tick(AUTOSAVE_DELAY_MS); // the timer fired during the flight: write again is waiting
    await act(async () => first.reject(new Error("offline")));
    await tick(AUTOSAVE_DELAY_MS * 3);
    expect(result.current.state).toBe("error");
    expect(calls).toHaveLength(1);
    await act(async () => void (await result.current.retry()));
    expect(calls[1]).toEqual({ name: "Plum", place: "Oslo" });
    expect(result.current.state).toBe("saved");
  });

  test("check is run again for every unsaved field with the new values (a rule across fields)", () => {
    const rule = (n: string, _v: unknown, all: F) => (n === "place" && all.name === "" && all.place !== "" ? "Place needs a name" : null);
    const { result } = setup({ check: rule as never });
    act(() => result.current.set("place", "Oslo"));
    expect(result.current.problems.place).toBeUndefined();
    act(() => result.current.set("name", ""));
    expect(result.current.problems.place).toBe("Place needs a name");
    expect(result.current.state).toBe("invalid");
    act(() => result.current.set("name", "Fig2"));
    expect(result.current.problems.place).toBeUndefined();
  });
});

describe("useAutosaveRecord: the state after a re-read, and several writes of one field", () => {
  type P = { s: F };
  test("a write fails, the re-read shows the old value (not committed): the state stays error, and retry writes", async () => {
    let n = 0;
    const calls: Partial<F>[] = [];
    const write = async (c: Partial<F>) => {
      calls.push(c);
      if (n++ === 0) throw new Error("timeout");
    };
    const { result, rerender } = renderHook((p: P) => useAutosaveRecord<F>({ stored: p.s, write }), { initialProps: { s: STORED } });
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    expect(result.current.state).toBe("error");
    rerender({ s: { ...STORED, place: "Paris" } });
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("timeout");
    await tick(AUTOSAVE_DELAY_MS * 3);
    expect(calls).toHaveLength(1); // nothing hidden
    await act(async () => void (await result.current.retry()));
    expect(calls[1]).toEqual({ name: "Plum" });
    expect(result.current.state).toBe("saved");
  });

  test("an error, then a re-read that holds the edit: the error ends (idle) and the error text is cleared", async () => {
    let n = 0;
    const write = async () => {
      if (n++ === 0) throw new Error("timeout");
    };
    const { result, rerender } = renderHook((p: P) => useAutosaveRecord<F>({ stored: p.s, write }), { initialProps: { s: STORED } });
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    rerender({ s: { ...STORED, name: "Plum" } });
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  test("retry with nothing unsaved clears an error to idle", async () => {
    const write = vi.fn(async () => {});
    const { result, rerender } = renderHook((p: P) => useAutosaveRecord<F>({ stored: p.s, write }), { initialProps: { s: STORED } });
    // an error whose edit the vault then took in another way
    write.mockRejectedValueOnce(new Error("no"));
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    expect(result.current.state).toBe("error");
    rerender({ s: { ...STORED, name: "Plum", place: "X" } });
    act(() => result.current.set("name", "Plum2"));
    act(() => result.current.set("name", "Plum"));
    await act(async () => void (await result.current.retry()));
    expect(result.current.state).toBe("idle");
    expect(write).toHaveBeenCalledTimes(1);
  });

  test("a field written twice: a stale read of the first value keeps the second; the second clears it; a third value from another writer shows", async () => {
    const { result, rerender } = renderHook((p: P) => useAutosaveRecord<F>({ stored: p.s, write: async () => {} }), { initialProps: { s: STORED } });
    act(() => result.current.set("name", "A"));
    await tick(AUTOSAVE_DELAY_MS);
    act(() => result.current.set("name", "B"));
    await tick(AUTOSAVE_DELAY_MS);
    rerender({ s: { ...STORED, name: "A" } });
    expect(result.current.values.name).toBe("B");
    rerender({ s: { ...STORED, name: "B" } });
    expect(result.current.values.name).toBe("B");
    rerender({ s: { ...STORED, name: "C" } });
    expect(result.current.values.name).toBe("C");
  });

  test("an older write that answers after a newer one never puts its value on screen", async () => {
    const gates: ReturnType<typeof deferred>[] = [];
    const saved: Partial<F>[] = [];
    const write = (c: Partial<F>) => {
      const g = deferred();
      gates.push(g);
      return g.promise;
    };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: STORED, write, onSaved: (w) => void saved.push(w) }));
    act(() => result.current.set("name", "Plum"));
    await tick(AUTOSAVE_DELAY_MS);
    act(() => result.current.set("name", "Plum pie"));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    await act(async () => gates[1]!.resolve());
    await act(async () => gates[0]!.resolve());
    expect(result.current.values.name).toBe("Plum pie");
    expect(saved).toEqual([{ name: "Plum pie" }, { name: "Plum" }]); // onSaved still hears both
  });
});
