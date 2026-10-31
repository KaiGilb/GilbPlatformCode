// The autosave state machine of one holder-only field, over the real annotations client and a stubbed platform. Fake timers; no wall-clock waits.
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANNOTATION_AUTOSAVE_MS, NOTES_VAULT_UNTIED_COPY, useAnnotationDraft, type UseAnnotationDraftOptions } from "./index";
import { HOME, PARTY, THEIRS, readAnswer, record, setUp, tearDown, type Call } from "../test/support";

beforeEach(() => {
  setUp();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  tearDown();
});

/** A platform with a held-back PUT: `release(n)` answers the n-th PUT. GETs answer `read`. */
function platform(opts: { read?: () => Response | Promise<Response>; putStatus?: number; hold?: boolean } = {}) {
  const calls: Call[] = [];
  const puts: Call[] = [];
  const waiting: Array<() => void> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const c = record(url, init);
    calls.push(c);
    if (c.method === "PUT") {
      puts.push(c);
      if (opts.hold) await new Promise<void>((r) => waiting.push(r));
      const status = opts.putStatus ?? 201;
      return new Response(status < 300 ? JSON.stringify({ changed: true }) : "refused", { status });
    }
    return opts.read ? opts.read() : new Response(JSON.stringify(readAnswer()), { status: 200 });
  });
  return {
    calls,
    puts,
    bodies: () => puts.map((p) => JSON.parse(p.body!)),
    release: async (n = 1) => {
      for (let i = 0; i < n; i++) waiting.shift()?.();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    },
  };
}

type Opts = Partial<UseAnnotationDraftOptions>;
function mount(o: Opts = {}) {
  return renderHook(
    (p: Opts) =>
      useAnnotationDraft({ memberPrincipal: PARTY, vaultId: HOME, field: "note", loadErrorCopy: "Could not load your note.", initialLoad: "empty", ...p }),
    { initialProps: o },
  );
}
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("autosave while typing", () => {
  it("fires ONCE after ANNOTATION_AUTOSAVE_MS of quiet, not before", async () => {
    const p = platform();
    const h = mount();
    act(() => h.result.current.onChange("Met at the Oslo summit"));
    expect(h.result.current.save).toBe("pending");
    await tick(ANNOTATION_AUTOSAVE_MS - 1);
    expect(p.puts).toHaveLength(0);
    await tick(1);
    expect(p.puts).toHaveLength(1);
    expect(p.bodies()[0]).toEqual({ heldParty: PARTY, vaultId: HOME, note: "Met at the Oslo summit" });
    expect(h.result.current.save).toBe("saved");
    await tick(5 * ANNOTATION_AUTOSAVE_MS);
    expect(p.puts).toHaveLength(1);
  });
  it("is 400 ms", () => expect(ANNOTATION_AUTOSAVE_MS).toBe(400));
  it("each keystroke restarts the wait: one write, of the last text", async () => {
    const p = platform();
    const h = mount();
    for (const t of ["M", "Me", "Met", "Met a"]) {
      act(() => h.result.current.onChange(t));
      await tick(ANNOTATION_AUTOSAVE_MS - 50);
    }
    expect(p.puts).toHaveLength(0);
    await tick(50);
    expect(p.puts).toHaveLength(1);
    expect(p.bodies()[0].note).toBe("Met a");
  });
  it("the origin field writes `origin` and never `note`", async () => {
    const p = platform();
    const h = mount({ field: "origin" });
    act(() => h.result.current.onChange("Madrid"));
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(p.bodies()[0]).toEqual({ heldParty: PARTY, vaultId: HOME, origin: "Madrid" });
  });
  it("blur writes at once, and the timer it cancels does not write again", async () => {
    const p = platform();
    const h = mount();
    act(() => h.result.current.onChange("hello"));
    act(() => h.result.current.onBlur());
    await tick(0);
    expect(p.puts).toHaveLength(1);
    await tick(2 * ANNOTATION_AUTOSAVE_MS);
    expect(p.puts).toHaveLength(1);
  });
  it("text equal to what the server holds writes nothing (typing back to the stored value, tabbing through)", async () => {
    const p = platform();
    const h = mount({ initialLoad: "ok", initialText: "kept" });
    act(() => h.result.current.onBlur());
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(p.puts).toHaveLength(0);
    act(() => h.result.current.onChange("kept "));
    expect(h.result.current.save).toBe("idle");
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(p.puts).toHaveLength(0);
  });
  it("once a write has landed, the same text is not written again", async () => {
    const p = platform();
    const h = mount();
    act(() => h.result.current.onChange("landed"));
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(p.puts).toHaveLength(1);
    act(() => h.result.current.onChange("landed "));
    expect(h.result.current.save).toBe("idle");
    act(() => h.result.current.onBlur());
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(p.puts).toHaveLength(1);
  });
  it("clearing a stored note writes the empty string, and the surface becomes empty", async () => {
    const p = platform();
    const onSaved = vi.fn();
    const h = mount({ initialLoad: "ok", initialText: "old", onSaved });
    act(() => h.result.current.onChange(""));
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(p.bodies()[0].note).toBe("");
    expect(h.result.current.surface).toEqual({ kind: "empty" });
    expect(onSaved).toHaveBeenCalledWith(null);
  });
  it("onSaved gets the landed value, only when a write lands", async () => {
    platform();
    const onSaved = vi.fn();
    const h = mount({ onSaved });
    act(() => h.result.current.onChange("a"));
    expect(onSaved).not.toHaveBeenCalled();
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith("a");
  });
});

describe("a failed save", () => {
  it("shows the error state with the platform's words, keeps the text, and calls onSaved never", async () => {
    const p = platform({ putStatus: 500 });
    const onSaved = vi.fn();
    const h = mount({ onSaved });
    act(() => h.result.current.onChange("will fail"));
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(p.puts).toHaveLength(1);
    expect(h.result.current.save).toBe("error");
    expect(h.result.current.saveError).toBe("Annotation 500 — refused");
    expect(h.result.current.draft).toBe("will fail");
    expect(onSaved).not.toHaveBeenCalled();
  });
  it("stays retryable: blur writes the same text again", async () => {
    const p = platform({ putStatus: 500 });
    const h = mount();
    act(() => h.result.current.onChange("again"));
    await tick(ANNOTATION_AUTOSAVE_MS);
    act(() => h.result.current.onBlur());
    await tick(0);
    expect(p.puts).toHaveLength(2);
    expect(p.bodies().map((b) => b.note)).toEqual(["again", "again"]);
  });
  it("the next keystroke clears the error and schedules a write", async () => {
    platform({ putStatus: 500 });
    const h = mount();
    act(() => h.result.current.onChange("a"));
    await tick(ANNOTATION_AUTOSAVE_MS);
    act(() => h.result.current.onChange("ab"));
    expect(h.result.current.save).toBe("pending");
    expect(h.result.current.saveError).toBeNull();
  });
});

describe("typing during a save", () => {
  it("queues exactly one more save, of the newer text", async () => {
    const p = platform({ hold: true });
    const h = mount();
    act(() => h.result.current.onChange("a"));
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(p.puts).toHaveLength(1);
    expect(h.result.current.save).toBe("saving");
    act(() => h.result.current.onChange("ab"));
    expect(h.result.current.save).toBe("pending");
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(p.puts).toHaveLength(2);
    await p.release(2);
    expect(p.bodies().map((b) => b.note)).toEqual(["a", "ab"]);
    await tick(3 * ANNOTATION_AUTOSAVE_MS);
    expect(p.puts).toHaveLength(2);
    expect(h.result.current.save).toBe("saved");
  });
  it("the same bytes are not sent twice while one write carries them (blur during a save)", async () => {
    const p = platform({ hold: true });
    const h = mount();
    act(() => h.result.current.onChange("same"));
    await tick(ANNOTATION_AUTOSAVE_MS);
    act(() => h.result.current.onBlur());
    act(() => h.result.current.onBlur());
    await tick(0);
    expect(p.puts).toHaveLength(1);
    await p.release();
  });
});

describe("never clear what was not read", () => {
  it("before the read lands, an empty draft writes nothing (open the card, tap back)", async () => {
    const p = platform({ read: () => new Promise<Response>(() => undefined) });
    const h = mount({ initialLoad: undefined });
    expect(h.result.current.surface).toEqual({ kind: "loading" });
    act(() => h.result.current.onBlur());
    await tick(ANNOTATION_AUTOSAVE_MS);
    h.unmount();
    await tick(0);
    expect(p.puts).toHaveLength(0);
  });
  it("after a failed read the surface is an error, never empty, and an empty draft still writes nothing", async () => {
    const p = platform({ read: () => new Response("x", { status: 500 }) });
    const h = mount({ initialLoad: undefined });
    await tick(0);
    expect(h.result.current.surface).toEqual({ kind: "error", message: "Could not load your note." });
    act(() => h.result.current.onBlur());
    await tick(0);
    expect(p.puts).toHaveLength(0);
  });
  it("after a failed read nothing is assumed about the server: clearing what was typed is still 'not saved yet', and writes nothing", async () => {
    const p = platform({ read: () => new Response("x", { status: 500 }) });
    const h = mount({ initialLoad: undefined });
    await tick(0);
    act(() => h.result.current.onChange("x"));
    act(() => h.result.current.onChange(""));
    expect(h.result.current.save).toBe("pending");
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(p.puts).toHaveLength(0);
  });
  it("a read that cannot be tied to the card's vault says so in the card's words, and shows no box", async () => {
    platform({ read: () => new Response(JSON.stringify(readAnswer({ vault: THEIRS })), { status: 200 }) });
    const h = mount({ initialLoad: undefined });
    await tick(0);
    expect(h.result.current.surface).toEqual({ kind: "error", message: NOTES_VAULT_UNTIED_COPY });
  });
  it("reload() reads again and fills the draft from the vault", async () => {
    let n = 0;
    const p = platform({ read: () => (n++ === 0 ? new Response("x", { status: 500 }) : new Response(JSON.stringify(readAnswer({ note: "from the vault", others: [{ entity: "e2", text: "other app" }] })), { status: 200 })) });
    const h = mount({ initialLoad: undefined });
    await tick(0);
    expect(h.result.current.surface.kind).toBe("error");
    await act(async () => {
      await h.result.current.reload();
    });
    expect(h.result.current.surface).toEqual({ kind: "ready", text: "from the vault" });
    expect(h.result.current.draft).toBe("from the vault");
    expect(h.result.current.others).toEqual([{ entity: "e2", text: "other app" }]);
    expect(p.puts).toHaveLength(0);
  });
  it("a read of nothing is the empty surface", async () => {
    platform();
    const h = mount({ initialLoad: undefined });
    await tick(0);
    expect(h.result.current.surface).toEqual({ kind: "empty" });
  });
  it("with the parent's read given, the hook makes no read of its own", async () => {
    const p = platform();
    mount({ initialLoad: "ok", initialText: "x" });
    await tick(0);
    expect(p.calls).toHaveLength(0);
  });
  it("a failed parent read starts as the error surface", () => {
    platform();
    const h = mount({ initialLoad: "error" });
    expect(h.result.current.surface).toEqual({ kind: "error", message: "Could not load your note." });
  });
});

describe("leaving the page with unsaved text", () => {
  it("unmount flushes the text with keepalive", async () => {
    const p = platform();
    const h = mount();
    act(() => h.result.current.onChange("typed just now"));
    h.unmount();
    await tick(0);
    expect(p.puts).toHaveLength(1);
    expect(p.puts[0]!.keepalive).toBe(true);
    expect(p.bodies()[0].note).toBe("typed just now");
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(p.puts).toHaveLength(1);
  });
  it("pagehide flushes with keepalive; a second hide event with the same text sends nothing more", async () => {
    const p = platform({ hold: true });
    const h = mount();
    act(() => h.result.current.onChange("x"));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await tick(0);
    expect(p.puts).toHaveLength(1);
    expect(p.puts[0]!.keepalive).toBe(true);
    await p.release();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    h.unmount();
  });
  it("a visibility change to visible writes nothing", async () => {
    const p = platform();
    const h = mount();
    act(() => h.result.current.onChange("x"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await tick(0);
    expect(p.puts).toHaveLength(0);
    h.unmount();
  });
  it("nothing typed, nothing flushed", async () => {
    const p = platform();
    const h = mount({ initialLoad: "ok", initialText: "kept" });
    h.unmount();
    await tick(0);
    expect(p.puts).toHaveLength(0);
  });
});

describe("where its requests go", () => {
  it("the write goes to the holder's vault node only, naming that vault in the body", async () => {
    const p = platform();
    const h = mount();
    act(() => h.result.current.onChange("private"));
    await tick(ANNOTATION_AUTOSAVE_MS);
    expect(p.puts.map((c) => new URL(c.url).origin)).toEqual([new URL(HOME).origin]);
    expect(p.bodies()[0].vaultId).toBe(HOME);
  });
});
