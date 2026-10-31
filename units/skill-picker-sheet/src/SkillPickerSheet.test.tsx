// The picker sheet over a recording catalogue (a stand-in `fetch`) and fake timers. The source has no test of the sheet on
// its own: its picker-level assertions were made through the Skill section ("Add skills" opens a dialog; a search of "se";
// the skill already held is not offered again; a pick closes it). Those are ported here as the first block; the rest are new.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SkillPickerSheet } from "./SkillPickerSheet";
import { NURSING, ORIGIN, SELL, body, clearOrigin, hit, stubSearch, useOrigin, type Seen } from "../test/support";

beforeEach(() => {
  useOrigin();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearOrigin();
});

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(200); });
const type = (value: string, label = "Search skills") => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const answerWith = (hits: unknown[], extra: object = {}) => stubSearch(() => body({ ids: [], hits, ...extra }));
const NURSING_HIT = hit("nursing", NURSING, "care for patients", 1);
const SELL_HIT = hit("sell products", SELL, "", 2);

function open(props: Partial<React.ComponentProps<typeof SkillPickerSheet>> = {}) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const utils = render(<SkillPickerSheet onPick={onPick} onClose={onClose} {...props} />);
  return { onPick, onClose, ...utils };
}

describe("driven as the section drives it (the source's picker-level assertions)", () => {
  it("is a dialog named 'Add skills'; a search of 'se' lists the matches; a skill already held is not offered again; a pick is handed over", async () => {
    answerWith([NURSING_HIT, SELL_HIT], { total: { kind: "exact", value: 2 }, complete: true });
    const { onPick } = open({ excludeUris: [NURSING] });
    expect(screen.getByRole("dialog", { name: "Add skills" })).toBeTruthy();
    type("se");
    await settle();
    expect(screen.getByRole("button", { name: /sell products/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^nursing/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /sell products/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0]).toMatchObject({ tag: "sell products", typeUri: SELL });
  });
});

describe("the sheet", () => {
  it("is drawn where it is placed (the caller portals it): inside the container, fixed over the page", () => {
    const { container } = open();
    const dialog = screen.getByRole("dialog");
    expect(container.contains(dialog)).toBe(true);
    expect(dialog.className).toContain("fixed inset-0");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });
  it("skills: heading, description, placeholder and the box's name", () => {
    open();
    expect(screen.getByRole("heading", { name: "Add skills" })).toBeTruthy();
    expect(screen.getByText("Search the live skill catalogue (~16,000 concepts, 29 languages).")).toBeTruthy();
    const input = screen.getByLabelText("Search skills") as HTMLInputElement;
    expect(input.placeholder).toBe("Search skills (e.g. sykepleie, krankenpflege, phonetics)…");
    expect(input.type).toBe("search");
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("autocomplete")).toBe("off");
  });
  it("interests: the same sheet in other words", () => {
    open({ noun: "interest" });
    expect(screen.getByRole("dialog", { name: "Add interests" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Add interests" })).toBeTruthy();
    expect((screen.getByLabelText("Search interests") as HTMLInputElement).placeholder).toBe("Search interests…");
  });
  it("closes from the backdrop and from the Close button", () => {
    const { onClose } = open();
    const closers = screen.getAllByRole("button", { name: "Close" });
    expect(closers).toHaveLength(2);
    closers.forEach((c) => fireEvent.click(c));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("before a list", () => {
  it("nothing typed: the prompt, with five examples, and no request", () => {
    const seen = answerWith([]);
    open();
    expect(screen.getByText(/nothing is listed until you type/)).toBeTruthy();
    expect(screen.getByText(/Cross-language: Norwegian, German, Greek/)).toBeTruthy();
    for (const w of ["sykepleie", "krankenpflege", "phonetics", "project", "sell"]) expect(screen.getByRole("button", { name: w })).toBeTruthy();
    expect(seen).toHaveLength(0);
  });
  it("an example fills the box and searches", async () => {
    const seen = answerWith([NURSING_HIT]);
    open();
    fireEvent.click(screen.getByRole("button", { name: "phonetics" }));
    expect((screen.getByLabelText("Search skills") as HTMLInputElement).value).toBe("phonetics");
    await settle();
    expect(new URL(seen[0]!.url).searchParams.get("q")).toBe("phonetics");
  });
  it("one character: 'Keep typing', and no request; spaces only is the prompt again", async () => {
    const seen = answerWith([]);
    open();
    type("s");
    await settle();
    expect(screen.getByText(/Keep typing — enter at least 2 characters to see matches\./)).toBeTruthy();
    type("   ");
    await settle();
    expect(screen.getByText(/nothing is listed until you type/)).toBeTruthy();
    expect(seen).toHaveLength(0);
  });
  it("two characters: 'Searching the live catalogue…' at once, the request only after the quiet time", async () => {
    const seen = answerWith([NURSING_HIT]);
    open();
    type("nu");
    expect(screen.getByText("Searching the live catalogue…")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(139); });
    expect(seen).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(seen).toHaveLength(1);
  });
  it("the request is the anonymous catalogue search at the host's origin, with the cap as its page", async () => {
    const seen = answerWith([NURSING_HIT]);
    open();
    type("  nurs  ");
    await settle();
    expect(seen).toHaveLength(1);
    const u = new URL(seen[0]!.url);
    expect(u.origin).toBe(ORIGIN);
    expect(u.pathname).toBe("/base/search");
    expect(u.searchParams.get("q")).toBe("nurs");
    expect(u.searchParams.get("match")).toBe("prefix");
    expect(u.searchParams.get("prefer")).toBeNull();
    expect(seen[0]!.init.headers).toEqual({ Accept: "application/json" });
  });
});

describe("the list", () => {
  it("each match shows its name and what it does; one with no 'does' shows only the name", async () => {
    answerWith([NURSING_HIT, SELL_HIT], { total: { kind: "exact", value: 2 }, complete: true });
    open();
    type("ab");
    await settle();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toBe("nursingcare for patients");
    expect(rows[1]!.textContent).toBe("sell products");
    expect(rows[0]!.querySelectorAll("span")).toHaveLength(2);
    expect(rows[1]!.querySelectorAll("span")).toHaveLength(1);
  });
  it("two matches with the same name are two rows, without a duplicate-key warning", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    answerWith([hit("sales", `${ORIGIN}/base/t/SalesA`, null, 1), hit("sales", `${ORIGIN}/base/t/SalesB`, null, 2)], { total: { kind: "exact", value: 2 }, complete: true });
    open();
    type("sa");
    await settle();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
  it("the head says how many: '1 match' / '2 matches', complete, live corpus", async () => {
    answerWith([NURSING_HIT], { total: { kind: "exact", value: 1 }, complete: true });
    open();
    type("ab");
    await settle();
    expect(screen.getByText("1 match · complete · live corpus")).toBeTruthy();
    expect(screen.queryByText(/Showing a page of matches/)).toBeNull();
    cleanup();
    answerWith([NURSING_HIT, SELL_HIT], { total: { kind: "exact", value: 2 }, complete: true });
    open();
    type("ab");
    await settle();
    expect(screen.getByText("2 matches · complete · live corpus")).toBeTruthy();
  });
  it("an incomplete page says to type more, and says it is a page", async () => {
    answerWith([NURSING_HIT], { total: { kind: "atLeast", value: 200 } });
    open();
    type("ab");
    await settle();
    expect(screen.getByText("1 match · type more to narrow · live corpus")).toBeTruthy();
    expect(screen.getByText("Showing a page of matches for “ab”. Add characters to narrow.")).toBeTruthy();
  });
  const many = (n: number) => Array.from({ length: n }, (_, i) => hit(`skill ${i}`, `${ORIGIN}/base/t/S${i}`, null, i));
  it("a full page of 20 with a census total says 'Top 20 of 7,266 matches'", async () => {
    answerWith(many(30), { total: { kind: "exact", value: 7266 } });
    open();
    type("sk");
    await settle();
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(screen.getByText("Top 20 of 7,266 matches · type more to narrow · live corpus")).toBeTruthy();
  });
  it("a full page with a BOUND says 'more than 200', never a bare 200", async () => {
    answerWith(many(30), { total: { kind: "atLeast", value: 200 } });
    open();
    type("sk");
    await settle();
    expect(screen.getByText("Top 20 of more than 200 matches · type more to narrow · live corpus")).toBeTruthy();
    expect(screen.queryByText(/of 200 matches/)).toBeNull();
  });
  it("a full page with no total says no total (not a zero, not 20)", async () => {
    answerWith(many(30), { total: null });
    open();
    type("sk");
    await settle();
    expect(screen.getByText("Top 20 matches · type more to narrow · live corpus")).toBeTruthy();
  });
  it("a full page that is the whole answer says complete", async () => {
    answerWith(many(20), { total: { kind: "exact", value: 20 } });
    open();
    type("sk");
    await settle();
    expect(screen.getByText("Top 20 of 20 matches · complete · live corpus")).toBeTruthy();
  });
  it("an approximate total is phrased 'about'", async () => {
    answerWith(many(25), { total: { kind: "approximate", value: 3000 } });
    open();
    type("sk");
    await settle();
    expect(screen.getByText(/^Top 20 of about 3,000 matches/)).toBeTruthy();
  });
  it("a skill already held is not offered, by its storage address or by its type address", async () => {
    answerWith([NURSING_HIT, SELL_HIT, hit("third", `${ORIGIN}/base/t/Third`, null, 3)], { total: { kind: "exact", value: 3 }, complete: true });
    open({ excludeUris: [NURSING_HIT.entity, SELL] });
    type("ab");
    await settle();
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["third"]);
    expect(screen.getByText(/^1 match/)).toBeTruthy();
  });
  it("the exclusions in force are those of the last render, not those the sheet opened with", async () => {
    answerWith([NURSING_HIT, SELL_HIT], { total: { kind: "exact", value: 2 }, complete: true });
    const onPick = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<SkillPickerSheet onPick={onPick} onClose={onClose} excludeUris={[]} />);
    type("ab");
    rerender(<SkillPickerSheet onPick={onPick} onClose={onClose} excludeUris={[SELL]} />);
    await settle();
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["nursingcare for patients"]);
  });
  it("nothing left after the exclusions: 'No skills match'", async () => {
    answerWith([NURSING_HIT], { total: { kind: "exact", value: 1 }, complete: true });
    open({ excludeUris: [NURSING] });
    type("nurs");
    await settle();
    expect(screen.getByText("No skills match “nurs”. Try another word (any of 29 languages).")).toBeTruthy();
  });
  it("no hits at all is the same 'No skills match'", async () => {
    answerWith([]);
    open();
    type("zzz");
    await settle();
    expect(screen.getByText(/No skills match “zzz”/)).toBeTruthy();
  });
  it("a pick hands over the whole skill and does not close the sheet itself", async () => {
    answerWith([NURSING_HIT], { total: { kind: "exact", value: 1 }, complete: true });
    const { onPick, onClose } = open();
    type("nurs");
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /nursing/ }));
    expect(onPick).toHaveBeenCalledWith({ tag: "nursing", uri: NURSING_HIT.entity, typeUri: NURSING, does: "care for patients", escoUri: null, harnessRole: null });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("a failure", () => {
  it("says the search failed and that this is not a statement that the skill does not exist", async () => {
    stubSearch(() => new Response("down", { status: 503 }));
    open();
    type("nurs");
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Skill search failed: SkillSearch 503 — down. This is not a statement that the skill does not exist.");
  });
  it("a network failure says its own words", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    open();
    type("nurs");
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("Skill search failed: offline.");
  });
  it("something thrown that is not an Error is said as text", async () => {
    vi.stubGlobal("fetch", async () => {
      throw "plain text";
    });
    open();
    type("nurs");
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("Skill search failed: plain text.");
  });
  it("an abort is not shown as a failure", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("aborted", "AbortError");
    });
    open();
    type("nurs");
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("typing again after a failure searches again", async () => {
    let n = 0;
    stubSearch(() => (++n === 1 ? new Response("down", { status: 500 }) : body({ ids: [], hits: [NURSING_HIT], total: { kind: "exact", value: 1 }, complete: true })));
    open();
    type("nurs");
    await settle();
    expect(screen.getByRole("alert")).toBeTruthy();
    type("nurse");
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /nursing/ })).toBeTruthy();
  });
});

describe("typing on", () => {
  it("each keystroke restarts the quiet time: one request for a burst", async () => {
    const seen = answerWith([NURSING_HIT]);
    open();
    for (const v of ["nu", "nur", "nurs"]) {
      type(v);
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    }
    expect(seen).toHaveLength(0);
    await settle();
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0]!.url).searchParams.get("q")).toBe("nurs");
  });
  it("an older answer that arrives after a newer search began is not shown, and its request was aborted", async () => {
    const releases: Array<() => void> = [];
    const seen: Seen[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      seen.push({ url, init });
      const q = new URL(url).searchParams.get("q");
      return new Promise<Response>((resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        releases.push(() => resolve(body({ ids: [], hits: [q === "old" ? NURSING_HIT : SELL_HIT], total: { kind: "exact", value: 1 }, complete: true })));
      });
    });
    open();
    type("old");
    await settle();
    expect(seen).toHaveLength(1);
    type("new");
    await settle();
    expect(seen).toHaveLength(2);
    expect(seen[0]!.init.signal!.aborted).toBe(true);
    expect(seen[1]!.init.signal!.aborted).toBe(false);
    releases.forEach((r) => r());
    await settle();
    expect(screen.queryByRole("button", { name: /nursing/ })).toBeNull();
    expect(screen.getByRole("button", { name: /sell products/ })).toBeTruthy();
  });
  it("a request that cannot be cancelled and answers late is not shown over the newer search", async () => {
    const releases: Array<() => void> = [];
    vi.stubGlobal("fetch", (url: string) => {
      const q = new URL(url).searchParams.get("q");
      return new Promise<Response>((resolve) => {
        releases.push(() => resolve(body({ ids: [], hits: [q === "old" ? NURSING_HIT : SELL_HIT], total: { kind: "exact", value: 1 }, complete: true })));
      });
    });
    open();
    type("old");
    await settle();
    type("new");
    await settle();
    releases[1]!();
    await settle();
    releases[0]!();
    await settle();
    expect(screen.queryByRole("button", { name: /nursing/ })).toBeNull();
    expect(screen.getByRole("button", { name: /sell products/ })).toBeTruthy();
  });
  it("a request that cannot be cancelled and FAILS late does not replace the newer list with a failure", async () => {
    const fail: Array<() => void> = [];
    vi.stubGlobal("fetch", (url: string) => {
      const q = new URL(url).searchParams.get("q");
      if (q === "old") return new Promise<Response>((_r, reject) => fail.push(() => reject(new TypeError("late failure"))));
      return Promise.resolve(body({ ids: [], hits: [SELL_HIT], total: { kind: "exact", value: 1 }, complete: true }));
    });
    open();
    type("old");
    await settle();
    type("new");
    await settle();
    fail[0]!();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /sell products/ })).toBeTruthy();
  });
  it("emptying the box while a request is out aborts it and returns to the prompt", async () => {
    const seen: Seen[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Promise<Response>(() => {});
    });
    open();
    type("nurs");
    await settle();
    type("");
    expect(seen[0]!.init.signal!.aborted).toBe(true);
    expect(screen.getByText(/nothing is listed until you type/)).toBeTruthy();
  });
  it("closing the sheet while a request is out aborts it", async () => {
    const seen: Seen[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Promise<Response>(() => {});
    });
    const { unmount } = open();
    type("nurs");
    await settle();
    unmount();
    expect(seen[0]!.init.signal!.aborted).toBe(true);
  });
  it("closing the sheet before the quiet time is over sends no request", async () => {
    const seen = answerWith([NURSING_HIT]);
    const { unmount } = open();
    type("nurs");
    unmount();
    await settle();
    expect(seen).toHaveLength(0);
  });
});
