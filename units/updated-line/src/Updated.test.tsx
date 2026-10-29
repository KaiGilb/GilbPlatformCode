// Renders the shipped code in jsdom. "ported" tests come from the source app's test of its stale copy
// (the "a stale copy says so" block: whenText, StaleNote), with the same inputs and expectations.
// The others pin every export with its defaults, and each parameter this unit adds.
import { afterEach, describe, expect, test } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { DEFAULT_CLASSES, DEFAULT_LABELS, RefreshNoteLine, STALE_NOTE_AFTER_MS, StaleNote, UpdatedLine, plainWhy, useRefreshNote, whenText } from "./index";

afterEach(cleanup);

describe("whenText and StaleNote (ported)", () => {
  test("the label shows the day when the copy is not from today, the time alone when it is", () => {
    const now = new Date(2026, 9, 29, 12, 0).getTime();
    expect(whenText(new Date(2026, 9, 29, 1, 53).getTime(), now)).toBe("01:53");
    expect(whenText(new Date(2026, 9, 26, 1, 53).getTime(), now)).toBe("Mon 26 Oct, 01:53");
    expect(whenText(new Date(2025, 11, 31, 23, 5).getTime(), now)).toMatch(/^Wed,? 31 Dec 2025, 23:05$/);
  });

  test("the note shows only when the update failed AND the copy is older than an hour, with when and why", () => {
    const now = new Date(2026, 9, 29, 12, 0).getTime();
    const old = new Date(2026, 9, 26, 1, 53).getTime();
    const { rerender } = render(<StaleNote error={new Error("Failed to fetch")} updatedAt={old} now={now} />);
    expect(screen.getByTestId("stale-note").textContent).toBe("Showing what was loaded on Mon 26 Oct, 01:53; could not reach your workspace. Failed to fetch.");
    rerender(<StaleNote error={undefined} updatedAt={old} now={now} />);
    expect(screen.queryByTestId("stale-note")).toBeNull();
    rerender(<StaleNote error={new Error("x")} updatedAt={now - 30 * 60_000} now={now} />);
    expect(screen.queryByTestId("stale-note")).toBeNull(); // 30 minutes old: not worth a line
    rerender(<StaleNote error={new Error("https://secret.example.test/vault answered 502")} updatedAt={old} now={now} />);
    expect(screen.getByTestId("stale-note").textContent).not.toMatch(/https?:/);
  });
});

describe("the exports with their defaults", () => {
  test("STALE_NOTE_AFTER_MS is an hour; a copy exactly an hour old shows the note, one a millisecond younger does not", () => {
    expect(STALE_NOTE_AFTER_MS).toBe(3_600_000);
    const now = new Date(2026, 9, 29, 12, 0).getTime();
    const { rerender } = render(<StaleNote error="x" updatedAt={now - STALE_NOTE_AFTER_MS} now={now} />);
    expect(screen.getByTestId("stale-note")).toBeTruthy();
    rerender(<StaleNote error="x" updatedAt={now - STALE_NOTE_AFTER_MS + 1} now={now} />);
    expect(screen.queryByTestId("stale-note")).toBeNull();
  });

  test("StaleNote shows nothing without a copy", () => {
    render(<StaleNote error="x" updatedAt={null} now={0} />);
    expect(screen.queryByTestId("stale-note")).toBeNull();
  });

  test("StaleNote is a status region with the default id and class", () => {
    const now = new Date(2026, 9, 29, 12, 0).getTime();
    render(<StaleNote error="x" updatedAt={now - 2 * STALE_NOTE_AFTER_MS} now={now} />);
    const el = screen.getByTestId("stale-note");
    expect(el.getAttribute("role")).toBe("status");
    expect(el.className).toBe("text-[14px] font-semibold text-[var(--ink)]");
  });

  test("UpdatedLine is a polite status region: Updating while it runs, Updated <time> after, empty before the first answer", () => {
    const at = new Date().setHours(9, 5, 0, 0);
    const { rerender } = render(<UpdatedLine updating={true} updatedAt={at} />);
    const el = screen.getByTestId("updated-line");
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
    expect(el.className).toBe("text-[12px] text-[var(--ink-faint)]");
    expect(el.textContent).toBe("Updating…");
    rerender(<UpdatedLine updating={false} updatedAt={at} />);
    expect(el.textContent).toBe("Updated 09:05");
    rerender(<UpdatedLine updating={false} updatedAt={null} />);
    expect(el.textContent).toBe("");
    rerender(<UpdatedLine updating={false} updatedAt={undefined} testid="mine" />);
    expect(screen.getByTestId("mine").textContent).toBe("");
  });

  test("plainWhy: an Error's or a string's words without addresses; a long, empty or other reason falls back", () => {
    expect(plainWhy(new Error("Failed to fetch"))).toBe("Failed to fetch");
    expect(plainWhy("  down at https://a.example.test/x now.  ")).toBe("down at now");
    expect(plainWhy(new Error("a".repeat(121)))).toBe("the platform did not answer");
    expect(plainWhy(new Error("a".repeat(120)))).toBe("a".repeat(120));
    expect(plainWhy(new Error("   "))).toBe("the platform did not answer");
    expect(plainWhy(42)).toBe("the platform did not answer");
    expect(plainWhy(undefined)).toBe("the platform did not answer");
  });

  test("RefreshNoteLine: nothing for no note; an error is an alert; the others are a polite status", () => {
    const { rerender } = render(<RefreshNoteLine note={null} />);
    expect(screen.queryByTestId("refresh-note")).toBeNull();
    rerender(<RefreshNoteLine note={{ kind: "error", text: "Down" }} />);
    let el = screen.getByTestId("refresh-note");
    expect(el.getAttribute("role")).toBe("alert");
    expect(el.className).toBe("text-[14px] font-semibold text-[var(--bad)]");
    expect(el.textContent).toBe("Down");
    for (const kind of ["updating", "new", "same"] as const) {
      rerender(<RefreshNoteLine note={{ kind, text: "T" }} testid="n" />);
      el = screen.getByTestId("n");
      expect(el.getAttribute("role")).toBe("status");
      expect(el.getAttribute("aria-live")).toBe("polite");
      expect(el.className).toBe("text-[13px] text-[var(--ink-soft)]");
    }
  });

  test("the defaults are the English words and classes of the source app", () => {
    expect(DEFAULT_LABELS.updating).toBe("Updating…");
    expect(DEFAULT_LABELS.updated("X")).toBe("Updated X");
    expect(DEFAULT_LABELS.justUpdated).toBe("Updated just now");
    expect(DEFAULT_LABELS.nothingNew).toBe("Nothing new");
    expect(DEFAULT_LABELS.couldNotUpdate).toBe("Could not update just now. What you see is as it was. Try again in a minute.");
    expect(Object.keys(DEFAULT_CLASSES).sort()).toEqual(["error", "line", "note", "stale"]);
  });
});

describe("useRefreshNote", () => {
  const ok = (sig: string) => async () => ({ ok: true as const, sig });
  test("Updating…, then Nothing new when the signature is the same, Updated just now when it moved, the reason when it failed", async () => {
    let sig = "a";
    const { result, rerender } = renderHook(({ run }) => useRefreshNote(run, () => sig), { initialProps: { run: ok("a") } });
    expect(result.current.note).toBeNull();
    await act(async () => { await result.current.press(); });
    expect(result.current.note).toEqual({ kind: "same", text: "Nothing new" });
    rerender({ run: ok("b") });
    await act(async () => { await result.current.press(); });
    expect(result.current.note).toEqual({ kind: "new", text: "Updated just now" });
    sig = "b";
    rerender({ run: (async () => ({ ok: false as const, why: "the worker is down" })) as never });
    await act(async () => { await result.current.press(); });
    expect(result.current.note).toEqual({ kind: "error", text: "the worker is down" });
    act(() => result.current.clear());
    expect(result.current.note).toBeNull();
  });

  test("shows Updating… while the run is open", async () => {
    let finish: (v: { ok: true; sig: string }) => void = () => undefined;
    const { result } = renderHook(() => useRefreshNote(() => new Promise((r) => { finish = r; }), () => "a"));
    let pressed: Promise<void> = Promise.resolve();
    act(() => { pressed = result.current.press(); });
    expect(result.current.note).toEqual({ kind: "updating", text: "Updating…" });
    await act(async () => { finish({ ok: true, sig: "a" }); await pressed; });
    expect(result.current.note?.kind).toBe("same");
  });

  test("a second press while one runs does nothing", async () => {
    let runs = 0;
    let finish: (v: { ok: true; sig: string }) => void = () => undefined;
    const { result } = renderHook(() => useRefreshNote(() => { runs++; return new Promise((r) => { finish = r; }); }, () => "a"));
    let first: Promise<void> = Promise.resolve();
    act(() => { first = result.current.press(); });
    await act(async () => { await result.current.press(); });
    expect(runs).toBe(1);
    await act(async () => { finish({ ok: true, sig: "a" }); await first; });
    await act(async () => { const second = result.current.press(); await Promise.resolve(); finish({ ok: true, sig: "a" }); await second; });
    expect(runs).toBe(2);
  });

  test("a run that throws gives the could-not-update alert, and the next press works", async () => {
    let boom = true;
    const { result } = renderHook(() => useRefreshNote(async () => { if (boom) throw new Error("x"); return { ok: true as const, sig: "a" }; }, () => "a"));
    await act(async () => { await result.current.press(); });
    expect(result.current.note).toEqual({ kind: "error", text: "Could not update just now. What you see is as it was. Try again in a minute." });
    boom = false;
    await act(async () => { await result.current.press(); });
    expect(result.current.note?.kind).toBe("same");
  });

  test("press keeps its identity while run and sigNow stay the same, with or without new labels", () => {
    const run = ok("a");
    const sigNow = () => "a";
    const { result, rerender } = renderHook(({ labels }) => useRefreshNote(run, sigNow, { labels }), { initialProps: { labels: { nothingNew: "A" } as object } });
    const first = result.current.press;
    rerender({ labels: { nothingNew: "B" } });
    expect(result.current.press).toBe(first);
  });
});

describe("the parameters this unit adds", () => {
  const now = new Date(2026, 9, 29, 12, 0).getTime();
  const old = new Date(2026, 9, 26, 1, 53).getTime();

  test("whenText with a locale writes the day in it", () => {
    expect(whenText(old, now, "de-DE")).toMatch(/^Mo\.?,? 26\. Okt\.?,? 01:53$/);
    expect(whenText(old, now, "en-GB")).toBe(whenText(old, now));
  });

  test("UpdatedLine takes its words, its locale and its class", () => {
    const { rerender } = render(<UpdatedLine updating={true} updatedAt={null} labels={{ updating: "Aktualisiere…" }} className="mine" />);
    const el = screen.getByTestId("updated-line");
    expect(el.textContent).toBe("Aktualisiere…");
    expect(el.className).toBe("mine");
    rerender(<UpdatedLine updating={false} updatedAt={old} labels={{ updated: (w) => `Stand ${w}` }} locale="de-DE" />);
    expect(el.textContent).toMatch(/^Stand .*01:53$/);
    expect(el.className).toBe(DEFAULT_CLASSES.line);
  });

  test("StaleNote takes its sentence, its reason, its locale and its class; a label not passed keeps its default", () => {
    render(<StaleNote error={new Error("a".repeat(200))} updatedAt={old} now={now} labels={{ stale: (w, y) => `Alt (${w}): ${y}`, noReason: "keine Antwort" }} locale="en-GB" className="mine" />);
    const el = screen.getByTestId("stale-note");
    expect(el.textContent).toBe("Alt (Mon 26 Oct, 01:53): keine Antwort");
    expect(el.className).toBe("mine");
  });

  test("plainWhy takes its fallback", () => {
    expect(plainWhy(undefined, "none")).toBe("none");
  });

  test("RefreshNoteLine takes a class for the note and one for the alert", () => {
    const { rerender } = render(<RefreshNoteLine note={{ kind: "same", text: "T" }} className="calm" errorClassName="loud" />);
    expect(screen.getByTestId("refresh-note").className).toBe("calm");
    rerender(<RefreshNoteLine note={{ kind: "error", text: "T" }} className="calm" errorClassName="loud" />);
    expect(screen.getByTestId("refresh-note").className).toBe("loud");
  });

  test("useRefreshNote takes its words, and reads them at press time", async () => {
    const { result, rerender } = renderHook(({ labels }) => useRefreshNote(async () => ({ ok: true as const, sig: "b" }), () => "a", { labels }), { initialProps: { labels: { justUpdated: "Gerade aktualisiert" } as object } });
    await act(async () => { await result.current.press(); });
    expect(result.current.note?.text).toBe("Gerade aktualisiert");
    rerender({ labels: { justUpdated: "Neu" } });
    await act(async () => { await result.current.press(); });
    expect(result.current.note?.text).toBe("Neu");
  });

  test("useRefreshNote takes its words for Updating…, Nothing new and the throw", async () => {
    let mode: "same" | "throw" = "same";
    const labels = { updating: "U", nothingNew: "N", couldNotUpdate: "C" };
    const { result } = renderHook(() => useRefreshNote(async () => { if (mode === "throw") throw new Error("x"); return { ok: true as const, sig: "a" }; }, () => "a", { labels }));
    await act(async () => { await result.current.press(); });
    expect(result.current.note?.text).toBe("N");
    mode = "throw";
    await act(async () => { await result.current.press(); });
    await waitFor(() => expect(result.current.note?.text).toBe("C"));
  });
});
