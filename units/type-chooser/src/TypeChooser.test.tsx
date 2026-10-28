import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { TermDefinitionContext } from "@kaigilb/gilbplatformcode-type-term-popover";
import type { ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { TypeChooser as Chooser } from "./index";
import type { TypeChooserProps } from "./index";
import type { TypeOption, TypeSearchResult } from "./index";

const BLANK = "The types the host ships. Type to search all of GilbVeda.";
const read = vi.hoisted(() => vi.fn());
const readTerm: ReadTermDefinition = (name) => read(name);

beforeEach(() => {
  setTermOrigin("https://ontology.example.test");
  read.mockReset();
  read.mockResolvedValue({ state: "none" });
});
afterEach(() => {
  cleanup();
  resetTermOrigin();
  vi.useRealTimers();
});

// The tests below render the chooser with the host's reader provided once, as an app does.
function TypeChooser(props: Omit<TypeChooserProps, "blankReach"> & { blankReach?: string }) {
  return (
    <TermDefinitionContext.Provider value={readTerm}>
      <Chooser blankReach={BLANK} {...props} />
    </TermDefinitionContext.Provider>
  );
}

const HITS: TypeOption[] = [
  { id: "note", label: "Note", typeName: "NoteDocument", spec: null, kind: "type" },
  { id: "veda:House", label: "House", typeName: "House", spec: null, kind: "type" },
  { id: "veda:ApplyHouseWrap", label: "apply house wrap", typeName: "ApplyHouseWrap", spec: null, kind: "function" },
  { id: "veda:Closeness", label: "Closeness", typeName: "Closeness", spec: null, kind: "value" },
];

const search = vi.fn(async (q: string): Promise<TypeSearchResult> => {
  const n = q.trim().toLowerCase();
  const options = n
    ? HITS.filter((h) => h.label.toLowerCase().includes(n) || h.typeName.toLowerCase().includes(n))
    : HITS.filter((h) => h.kind === "type");
  return { options, reach: "test", degraded: false };
});
const answer = (options: readonly TypeOption[], reach = "test", degraded = false) =>
  vi.fn(async (): Promise<TypeSearchResult> => ({ options, reach, degraded }));
const opt = (id: string, label: string, kind: TypeOption["kind"] = "type", extra: Partial<TypeOption> = {}): TypeOption => ({
  id,
  label,
  typeName: label.replace(/\s+/g, ""),
  spec: null,
  kind,
  ...extra,
});
const listed = (box: HTMLElement) => [...box.querySelectorAll("[role=option]")].map((e) => e.getAttribute("data-testid"));

describe("TypeChooser plane filter (ported from the source)", () => {
  it("the default search box carries the ACCENT AT REST, and keeps focus merely distinguishable", () => {
    const { rerender } = render(<TypeChooser search={search} onPick={() => undefined} planes={["things"]} />);
    const cls = () => screen.getByTestId("type-chooser-search").className;
    expect(cls()).toMatch(/\bborder-2\b/);
    expect(cls()).toMatch(/\bborder-\[var\(--accent\)\]/);
    expect(cls()).toMatch(/\bbg-\[var\(--surface\)\]/);
    expect(cls()).not.toMatch(/focus:border-\[var\(--accent\)\]/);
    expect(cls()).toMatch(/focus:shadow-\[/);
    expect(cls()).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    rerender(
      <TypeChooser search={search} onPick={() => undefined} planes={["things"]} searchClassName="w-full border-2 border-[var(--ink-ghost)]" />,
    );
    expect(cls()).toBe("w-full border-2 border-[var(--ink-ghost)]");
  });

  it("searchPlaceholder overrides the plane default so a vault mint does not look like a thing search", () => {
    render(
      <TypeChooser
        search={search}
        onPick={() => undefined}
        planes={["things"]}
        searchPlaceholder="Search GilbVeda types — any type that currently resolves"
      />,
    );
    expect(screen.getByTestId("type-chooser-search").getAttribute("placeholder")).toBe(
      "Search GilbVeda types — any type that currently resolves",
    );
  });

  it("planes={['things']} hides the plane tabs so a vault mint cannot pick a Function", async () => {
    render(<TypeChooser search={search} onPick={() => undefined} planes={["things"]} />);
    expect(screen.queryByTestId("type-chooser-plane")).toBeNull();
    const box = screen.getByTestId("type-chooser-search");
    await userEvent.type(box, "house");
    await waitFor(() => expect(screen.getByTestId("type-chooser-option-veda:House")).toBeTruthy());
    expect(screen.queryByTestId("type-chooser-option-veda:ApplyHouseWrap")).toBeNull();
  });

  it("defaults to Things — a house shows, a skill-function does not", async () => {
    render(<TypeChooser search={search} onPick={() => undefined} />);
    expect((await screen.findByTestId("type-chooser-plane-things")).getAttribute("aria-selected")).toBe("true");
    const box = screen.getByTestId("type-chooser-search");
    await userEvent.type(box, "house");
    await waitFor(() => expect(screen.getByTestId("type-chooser-option-veda:House")).toBeTruthy());
    expect(screen.queryByTestId("type-chooser-option-veda:ApplyHouseWrap")).toBeNull();
  });

  it("Functions shows only functions; All goes wider", async () => {
    render(<TypeChooser search={search} onPick={() => undefined} />);
    const box = screen.getByTestId("type-chooser-search");
    await userEvent.type(box, "house");
    await waitFor(() => expect(screen.getByTestId("type-chooser-option-veda:House")).toBeTruthy());

    await userEvent.click(screen.getByTestId("type-chooser-plane-function"));
    await waitFor(() => expect(screen.getByTestId("type-chooser-option-veda:ApplyHouseWrap")).toBeTruthy());
    expect(screen.queryByTestId("type-chooser-option-veda:House")).toBeNull();

    await userEvent.click(screen.getByTestId("type-chooser-plane-all"));
    await waitFor(() => expect(screen.getByTestId("type-chooser-option-veda:House")).toBeTruthy());
    expect(screen.getByTestId("type-chooser-option-veda:ApplyHouseWrap")).toBeTruthy();
  });

  it("hides the more-than-20 reach note once fewer than 20 rows are shown", async () => {
    const wide = vi.fn(async (): Promise<TypeSearchResult> => ({
      options: HITS,
      reach: "More than 20 GilbVeda terms match “vault ident” — keep typing to narrow it.",
      degraded: false,
    }));
    render(<TypeChooser search={wide} onPick={() => undefined} />);
    await userEvent.type(screen.getByTestId("type-chooser-search"), "vault ident");
    await waitFor(() => expect(screen.getByTestId("type-chooser-option-note")).toBeTruthy());
    expect(screen.queryByTestId("type-chooser-scope")).toBeNull();
  });

  it("keeps the more-than-20 note when 20 or more rows are shown", async () => {
    const many: TypeOption[] = Array.from({ length: 20 }, (_, i) => ({
      id: `veda:T${i}`,
      label: `Term ${i}`,
      typeName: `Term${i}`,
      spec: null,
      kind: "type" as const,
    }));
    const wide = vi.fn(async (): Promise<TypeSearchResult> => ({
      options: many,
      reach: "More than 20 GilbVeda terms match “term” — keep typing to narrow it.",
      degraded: false,
    }));
    render(<TypeChooser search={wide} onPick={() => undefined} />);
    await userEvent.type(screen.getByTestId("type-chooser-search"), "term");
    await waitFor(() => expect(screen.getByTestId("type-chooser-option-veda:T0")).toBeTruthy());
    expect(screen.getByTestId("type-chooser-scope").textContent).toMatch(/More than 20/);
  });

  it("a pick hides the other hits and shows the definition; × returns to the list", async () => {
    const house: TypeOption = { ...HITS[1]!, definition: "A building people live in." };
    const hut: TypeOption = { id: "veda:Warehouse", label: "Warehouse", typeName: "Warehouse", spec: null, kind: "type" };
    const withDef = vi.fn(async (q: string): Promise<TypeSearchResult> => {
      const n = q.trim().toLowerCase();
      const options = n
        ? [house, hut].filter((h) => h.label.toLowerCase().includes(n) || h.typeName.toLowerCase().includes(n))
        : [house];
      return { options, reach: "test", degraded: false };
    });
    const onPick = vi.fn();
    render(<TypeChooser search={withDef} onPick={onPick} />);
    await userEvent.type(screen.getByTestId("type-chooser-search"), "house");
    await waitFor(() => expect(screen.getByTestId("type-chooser-option-veda:House")).toBeTruthy());
    expect(screen.getByTestId("type-chooser-option-veda:Warehouse")).toBeTruthy();

    await userEvent.click(screen.getByTestId("type-chooser-option-veda:House"));
    expect(onPick).toHaveBeenCalled();
    expect(screen.getByTestId("type-chooser-detail")).toBeTruthy();
    expect(screen.getByTestId("type-chooser-definition").textContent).toMatch(/building people live in/);
    expect(screen.queryByTestId("type-chooser-option-veda:Warehouse")).toBeNull();

    await userEvent.click(screen.getByTestId("type-chooser-detail-back"));
    expect(screen.getByTestId("type-chooser-option-veda:House")).toBeTruthy();
    expect(screen.getByTestId("type-chooser-option-veda:Warehouse")).toBeTruthy();
    expect(screen.queryByTestId("type-chooser-detail")).toBeNull();
  });
});

describe("TypeChooser t: link (ported from the source's popover test file)", () => {
  const rows: TypeOption[] = [
    { id: "note", label: "Note", typeName: "NoteDocument", spec: null, kind: "type" },
    { id: "veda:Person", label: "Person", typeName: "Person", spec: null, kind: "type" },
  ];
  const find = async (): Promise<TypeSearchResult> => ({ options: rows, reach: "test", degraded: false });

  it("the trigger opens the popover and does NOT pick the row; the t: name stays in the row text; Person has a trigger too", async () => {
    read.mockResolvedValue({ state: "defined", does: "A note." });
    const onPick = vi.fn();
    render(<TypeChooser search={find} onPick={onPick} />);
    const trig = await screen.findByTestId("type-chooser-term-note");
    expect(screen.getByTestId("type-chooser-option-note").textContent).toContain("t:NoteDocument");
    expect(screen.getByTestId("type-chooser-term-veda:Person")).toBeTruthy();
    fireEvent.click(trig);
    await screen.findByText("A note.");
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /Open in GilbVeda/ }).getAttribute("href")).toBe(
      "https://ontology.example.test/base/t/NoteDocument",
    );
    await waitFor(() => expect(read).toHaveBeenCalledWith("NoteDocument"));
    fireEvent.click(screen.getByTestId("type-chooser-option-note"));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("the row's trigger is labelled 'About t:<Name>', shows an arrow, and its popover has the chooser's testid", async () => {
    render(<TypeChooser search={find} onPick={() => undefined} />);
    const trig = await screen.findByTestId("type-chooser-term-veda:Person");
    expect(trig.getAttribute("aria-label")).toBe("About t:Person");
    expect(trig.textContent).toBe("↗");
    expect(trig.getAttribute("class")).toBe("shrink-0 min-h-[44px] px-2 text-[12px] text-[var(--accent)]");
    fireEvent.click(trig);
    const pop = await screen.findByTestId("type-chooser-term-popover");
    expect(pop.getAttribute("aria-label")).toBe("Person definition");
  });
});

describe("the provider and the required props", () => {
  it("a missing TermDefinitionContext provider throws an error naming it", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Chooser search={search} blankReach={BLANK} onPick={() => undefined} />)).toThrow(
      "type-chooser: wrap the app in <TermDefinitionContext.Provider value={readTermDefinition}>",
    );
    quiet.mockRestore();
  });
});

describe("searching", () => {
  it("settles typing for 140 ms: one search for the blank box at mount, then one per pause, with the query as typed", async () => {
    vi.useFakeTimers();
    const find = vi.fn(async (): Promise<TypeSearchResult> => ({ options: [], reach: "r", degraded: false }));
    render(<TypeChooser search={find} onPick={() => undefined} />);
    expect(find).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(139);
    });
    expect(find).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(find.mock.calls).toEqual([[""]]);
    const box = screen.getByTestId("type-chooser-search");
    for (const text of ["h", "ho", " hou "]) {
      fireEvent.change(box, { target: { value: text } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    }
    expect(find).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
    expect(find.mock.calls).toEqual([[""], [" hou "]]);
  });

  it("says 'Searching…' and the blank reach until the first answer, then the answer's own reach", async () => {
    let release: (r: TypeSearchResult) => void = () => {};
    const slow = vi.fn(() => new Promise<TypeSearchResult>((r) => (release = r)));
    render(<TypeChooser search={slow} onPick={() => undefined} />);
    expect(screen.getByText("Searching…")).toBeTruthy();
    expect(screen.getByTestId("type-chooser-scope").textContent).toBe(BLANK);
    await waitFor(() => expect(slow).toHaveBeenCalled());
    await act(async () => release({ options: [opt("a", "Alpha")], reach: "Searched the host list.", degraded: false }));
    await waitFor(() => expect(screen.getByTestId("type-chooser-option-a")).toBeTruthy());
    expect(screen.queryByText("Searching…")).toBeNull();
    expect(screen.getByTestId("type-chooser-scope").textContent).toBe("Searched the host list.");
  });

  it("drops a slow answer for an older query: 'ta' cannot overwrite 'task'", async () => {
    const releases: Record<string, (r: TypeSearchResult) => void> = {};
    const find = vi.fn((q: string) => new Promise<TypeSearchResult>((r) => (releases[q] = r)));
    render(<TypeChooser search={find} onPick={() => undefined} />);
    const box = screen.getByTestId("type-chooser-search");
    fireEvent.change(box, { target: { value: "ta" } });
    await waitFor(() => expect(find).toHaveBeenCalledWith("ta"));
    fireEvent.change(box, { target: { value: "task" } });
    await waitFor(() => expect(find).toHaveBeenCalledWith("task"));
    await act(async () => releases["task"]!({ options: [opt("task", "Task")], reach: "for task", degraded: false }));
    await waitFor(() => expect(screen.getByTestId("type-chooser-option-task")).toBeTruthy());
    await act(async () => releases["ta"]!({ options: [opt("tag", "Tag")], reach: "for ta", degraded: false }));
    expect(screen.queryByTestId("type-chooser-option-tag")).toBeNull();
    expect(screen.getByTestId("type-chooser-scope").textContent).toBe("for task");
  });

  it("a search that throws shows nothing, says so, and does not read as 'no such type'", async () => {
    const boom = vi.fn(async (): Promise<TypeSearchResult> => {
      throw new Error("offline");
    });
    render(<TypeChooser search={boom} onPick={() => undefined} />);
    const empty = await screen.findByTestId("type-chooser-empty");
    expect(empty.textContent).toBe("GilbVeda could not be searched just now, so nothing can be shown.");
    expect(screen.getByTestId("type-chooser-scope").textContent).toBe(
      "The type search failed, so nothing could be looked up. This is not a statement that the type does not exist.",
    );
    expect(screen.getByTestId("type-chooser-scope").className).toContain("text-[var(--ink-faint)]");
  });

  it("a degraded answer with no options says it could not be searched, even for a typed query; the reach is shown in the faint colour", async () => {
    render(<TypeChooser search={answer([], "Only the shipped types were searched.", true)} onPick={() => undefined} />);
    await userEvent.type(screen.getByTestId("type-chooser-search"), "zzz");
    await waitFor(() =>
      expect(screen.getByTestId("type-chooser-empty").textContent).toBe("GilbVeda could not be searched just now, so nothing can be shown."),
    );
    const scope = screen.getByTestId("type-chooser-scope");
    expect(scope.textContent).toBe("Only the shipped types were searched.");
    expect(scope.className).toBe("shrink-0 text-[10.5px] text-[var(--ink-faint)]");
  });

  it("a whole answer's reach is shown in the ghost colour", async () => {
    render(<TypeChooser search={answer([opt("a", "Alpha")], "ok")} onPick={() => undefined} />);
    await screen.findByTestId("type-chooser-option-a");
    expect(screen.getByTestId("type-chooser-scope").className).toBe("shrink-0 text-[10.5px] text-[var(--ink-ghost)]");
  });

  it("a new `search` function asks again with the current text", async () => {
    const first = answer([opt("a", "Alpha")], "one");
    const second = answer([opt("b", "Beta")], "two");
    const { rerender } = render(<TypeChooser search={first} onPick={() => undefined} />);
    await screen.findByTestId("type-chooser-option-a");
    rerender(<TypeChooser search={second} onPick={() => undefined} />);
    await screen.findByTestId("type-chooser-option-b");
    expect(screen.queryByTestId("type-chooser-option-a")).toBeNull();
    expect(second).toHaveBeenCalledWith("");
  });
});

describe("the reach note and its hidden contract", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => opt(`veda:T${i}`, `Term ${i}`));
  const note = (text: string, rows: readonly TypeOption[]) => answer(rows, text);

  it("the text a search must return to have the note hidden below the limit is `More than <digits> GilbVeda terms match`", async () => {
    render(<TypeChooser search={note("More than 5 GilbVeda terms match “x” — keep typing.", many(3))} onPick={() => undefined} />);
    await screen.findByTestId("type-chooser-option-veda:T0");
    expect(screen.queryByTestId("type-chooser-scope")).toBeNull();
  });

  it("a reach that merely resembles it is shown: no digits, or no 'GilbVeda'", async () => {
    const a = render(<TypeChooser search={note("More than twenty GilbVeda terms match “x”.", many(3))} onPick={() => undefined} />);
    await screen.findByTestId("type-chooser-option-veda:T0");
    expect(screen.getByTestId("type-chooser-scope").textContent).toBe("More than twenty GilbVeda terms match “x”.");
    a.unmount();
    const c = render(<TypeChooser search={note("More than  GilbVeda terms match “x”.", many(3))} onPick={() => undefined} />);
    await screen.findByTestId("type-chooser-option-veda:T0");
    expect(screen.getByTestId("type-chooser-scope")).toBeTruthy();
    c.unmount();
    render(<TypeChooser search={note("More than 20 terms match “x”.", many(3))} onPick={() => undefined} />);
    await screen.findByTestId("type-chooser-option-veda:T0");
    expect(screen.getByTestId("type-chooser-scope").textContent).toBe("More than 20 terms match “x”.");
  });

  it("the note is kept at exactly LIVE_TERM_LIMIT rows (20) and hidden at 19", async () => {
    const text = "More than 20 GilbVeda terms match “t”.";
    const a = render(<TypeChooser search={note(text, many(19))} onPick={() => undefined} />);
    await screen.findByTestId("type-chooser-option-veda:T0");
    expect(screen.queryByTestId("type-chooser-scope")).toBeNull();
    a.unmount();
    render(<TypeChooser search={note(text, many(20))} onPick={() => undefined} />);
    await screen.findByTestId("type-chooser-option-veda:T0");
    expect(screen.getByTestId("type-chooser-scope")).toBeTruthy();
  });

  it("a degraded answer keeps the note whatever the count", async () => {
    render(<TypeChooser search={answer(many(2), "More than 20 GilbVeda terms match “t”.", true)} onPick={() => undefined} />);
    await screen.findByTestId("type-chooser-option-veda:T0");
    expect(screen.getByTestId("type-chooser-scope")).toBeTruthy();
  });

  it("counts the rows shown in the plane, not the answer: 25 functions in the Things plane are 0 rows", async () => {
    const functions = Array.from({ length: 25 }, (_, i) => opt(`veda:F${i}`, `Fn ${i}`, "function"));
    render(<TypeChooser search={note("More than 20 GilbVeda terms match “f”.", functions)} onPick={() => undefined} />);
    await screen.findByTestId("type-chooser-empty");
    expect(screen.queryByTestId("type-chooser-scope")).toBeNull();
    fireEvent.click(screen.getByTestId("type-chooser-plane-function"));
    expect(screen.getByTestId("type-chooser-scope")).toBeTruthy();
  });

  it("the note is hidden while the detail view is open, and comes back with the list", async () => {
    render(<TypeChooser search={note("A plain reach.", many(2))} onPick={() => undefined} />);
    fireEvent.click(await screen.findByTestId("type-chooser-option-veda:T0"));
    expect(screen.queryByTestId("type-chooser-scope")).toBeNull();
    fireEvent.click(screen.getByTestId("type-chooser-detail-back"));
    expect(screen.getByTestId("type-chooser-scope").textContent).toBe("A plain reach.");
  });
});
