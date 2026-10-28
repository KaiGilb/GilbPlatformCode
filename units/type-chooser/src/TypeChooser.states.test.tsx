import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TermDefinitionContext } from "@kaigilb/gilbplatformcode-type-term-popover";
import type { ReadTermDefinition, TermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { TypeChooser as Chooser } from "./index";
import type { TypeChooserProps, TypeOption, TypeSearchResult } from "./index";

const BLANK = "blank reach";
const read = vi.fn<ReadTermDefinition>();

beforeEach(() => {
  setTermOrigin("https://ontology.example.test");
  read.mockReset();
  read.mockResolvedValue({ state: "none" });
});
afterEach(() => {
  cleanup();
  resetTermOrigin();
});

function TypeChooser(props: Omit<TypeChooserProps, "blankReach" | "search" | "onPick"> & { search?: TypeChooserProps["search"]; onPick?: TypeChooserProps["onPick"] }) {
  return (
    <TermDefinitionContext.Provider value={read}>
      <Chooser blankReach={BLANK} search={answer([])} onPick={() => undefined} {...props} />
    </TermDefinitionContext.Provider>
  );
}
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
const ids = (list: HTMLElement) => [...list.querySelectorAll("[role=option]")].map((e) => e.getAttribute("data-testid")!.replace("type-chooser-option-", ""));
const typeInto = (text: string) => fireEvent.change(screen.getByTestId("type-chooser-search"), { target: { value: text } });

describe("the empty list says what is true", () => {
  const empty = async () => (await screen.findByTestId("type-chooser-empty")).textContent;

  it("blank query: 'No thing is available.' in Things, 'Type to search.' in the other planes, or the caller's blankEmptyLabel", async () => {
    render(<TypeChooser planes={["things", "function", "value", "all"]} />);
    expect(await empty()).toBe("No thing is available.");
    fireEvent.click(screen.getByTestId("type-chooser-plane-function"));
    expect(await empty()).toBe("Type to search.");
    fireEvent.click(screen.getByTestId("type-chooser-plane-all"));
    expect(await empty()).toBe("Type to search.");
  });

  it("blankEmptyLabel replaces the blank wording in every plane", async () => {
    render(<TypeChooser blankEmptyLabel="Nothing here yet." />);
    expect(await empty()).toBe("Nothing here yet.");
    fireEvent.click(screen.getByTestId("type-chooser-plane-value"));
    expect(await empty()).toBe("Nothing here yet.");
  });

  it("a typed query that matched nothing: the wording follows the plane, and the query is trimmed", async () => {
    render(<TypeChooser />);
    await empty();
    typeInto("  zzz  ");
    await waitFor(() => expect(screen.getByTestId("type-chooser-empty").textContent).toBe("No thing matches “zzz”. Try Functions, Values, or All."));
    fireEvent.click(screen.getByTestId("type-chooser-plane-function"));
    expect(await empty()).toBe("No function matches “zzz”.");
    fireEvent.click(screen.getByTestId("type-chooser-plane-value"));
    expect(await empty()).toBe("No value matches “zzz”.");
    fireEvent.click(screen.getByTestId("type-chooser-plane-all"));
    expect(await empty()).toBe("No type, function or value matches “zzz”.");
  });

  it("with only the Things plane (no tabs) there is no 'Try Functions' advice", async () => {
    render(<TypeChooser planes={["things"]} />);
    await empty();
    typeInto("zzz");
    await waitFor(() => expect(screen.getByTestId("type-chooser-empty").textContent).toBe("No type matches “zzz”."));
  });

  it("a whole answer whose rows are all in another plane is empty here (and does not say it could not be searched)", async () => {
    render(<TypeChooser search={answer([opt("f", "Fn", "function")])} />);
    expect(await empty()).toBe("No thing is available.");
  });
});

describe("what is listed", () => {
  it("lists the rows of the plane in the order the search gave them", async () => {
    render(<TypeChooser search={answer([opt("b", "Bee"), opt("a", "Ant"), opt("f", "Fn", "function")])} />);
    await screen.findByTestId("type-chooser-option-a");
    expect(ids(screen.getByTestId("type-chooser-list"))).toEqual(["b", "a"]);
  });

  it("All draws a 'Functions' heading before each run of functions and a 'Values' heading before each run of values", async () => {
    render(
      <TypeChooser
        search={answer([opt("t1", "T1"), opt("f1", "F1", "function"), opt("f2", "F2", "function"), opt("t2", "T2"), opt("f3", "F3", "function"), opt("v1", "V1", "value")])}
      />,
    );
    await screen.findByTestId("type-chooser-option-t1");
    fireEvent.click(screen.getByTestId("type-chooser-plane-all"));
    const list = screen.getByTestId("type-chooser-list");
    const heads = [...list.querySelectorAll("p")].map((p) => p.textContent);
    expect(heads).toEqual(["Functions", "Functions", "Values"]);
    expect(ids(list)).toEqual(["t1", "f1", "f2", "t2", "f3", "v1"]);
    fireEvent.click(screen.getByTestId("type-chooser-plane-function"));
    expect([...list.querySelectorAll("p")]).toHaveLength(0);
  });

  it("shows the t: name when it is not the label with its spaces removed and lower-cased; hides it when it is", async () => {
    render(
      <TypeChooser
        search={answer([
          opt("note", "Note", "type", { typeName: "NoteDocument" }),
          opt("house", "House"),
          opt("wrap", "Apply House Wrap"),
        ])}
      />,
    );
    await screen.findByTestId("type-chooser-option-house");
    expect(screen.getByTestId("type-chooser-option-note").textContent).toContain("t:NoteDocument");
    expect(screen.getByTestId("type-chooser-option-house").textContent).not.toContain("t:");
    expect(screen.getByTestId("type-chooser-option-wrap").textContent).not.toContain("t:");
  });

  it("shows 'name only' for an option with no spec; not with a spec; not when showSpecHint is false", async () => {
    const rows = [opt("plain", "Plain"), opt("spec", "Spec", "type", { spec: { id: "spec" } })];
    const a = render(<TypeChooser search={answer(rows)} />);
    await screen.findByTestId("type-chooser-option-plain");
    expect(screen.getByTestId("type-chooser-option-plain").textContent).toContain("name only");
    expect(screen.getByTestId("type-chooser-option-spec").textContent).not.toContain("name only");
    a.unmount();
    render(<TypeChooser search={answer(rows)} showSpecHint={false} />);
    await screen.findByTestId("type-chooser-option-plain");
    expect(screen.getByTestId("type-chooser-option-plain").textContent).not.toContain("name only");
  });

  it("marks the row whose id is `value` as selected, with the selected classes", async () => {
    render(<TypeChooser search={answer([opt("a", "Ant"), opt("b", "Bee")])} value="b" />);
    const a = await screen.findByTestId("type-chooser-option-a");
    const b = screen.getByTestId("type-chooser-option-b");
    expect(b.getAttribute("aria-selected")).toBe("true");
    expect(a.getAttribute("aria-selected")).toBe("false");
    expect(b.className).toContain("bg-[var(--sel)] text-[var(--ink)] font-semibold");
    expect(a.className).toContain("hover:bg-[var(--sel)]");
    expect(b.getAttribute("role")).toBe("option");
    expect(b.className).toContain("min-h-[44px]");
  });

  it("an empty `value` selects nothing", async () => {
    render(<TypeChooser search={answer([opt("", "Blank")])} value="" />);
    expect((await screen.findByTestId("type-chooser-option-")).getAttribute("aria-selected")).toBe("false");
  });

  it("pinned is put first when the search did not return it, once, and only in its own plane", async () => {
    const pin = opt("veda:Rule", "Rule");
    const a = render(<TypeChooser search={answer([opt("a", "Ant")])} pinned={pin} value="veda:Rule" />);
    await screen.findByTestId("type-chooser-option-a");
    expect(ids(screen.getByTestId("type-chooser-list"))).toEqual(["veda:Rule", "a"]);
    expect(screen.getByTestId("type-chooser-option-veda:Rule").getAttribute("aria-selected")).toBe("true");
    a.unmount();
    render(<TypeChooser search={answer([opt("a", "Ant"), pin])} pinned={pin} />);
    await screen.findByTestId("type-chooser-option-a");
    expect(ids(screen.getByTestId("type-chooser-list"))).toEqual(["a", "veda:Rule"]);
    cleanup();
    render(<TypeChooser search={answer([opt("a", "Ant")])} pinned={opt("f", "Fn", "function")} />);
    await screen.findByTestId("type-chooser-option-a");
    expect(ids(screen.getByTestId("type-chooser-list"))).toEqual(["a"]);
  });

  it("extraOptions are listed after the search rows on a blank query, and on a query that is part of their label (any case)", async () => {
    const file = opt("file", "File");
    render(<TypeChooser search={answer([opt("a", "Ant")])} extraOptions={[file, opt("fn", "Fn File", "function")]} />);
    await screen.findByTestId("type-chooser-option-a");
    expect(ids(screen.getByTestId("type-chooser-list"))).toEqual(["a", "file"]);
    typeInto("  FIL ");
    await waitFor(() => expect(screen.getByTestId("type-chooser-option-file")).toBeTruthy());
    typeInto("zzz");
    await waitFor(() => expect(screen.queryByTestId("type-chooser-option-file")).toBeNull());
  });

  it("an extra option whose id the search also returned is not listed twice", async () => {
    render(<TypeChooser search={answer([opt("file", "File")])} extraOptions={[opt("file", "File")]} />);
    await screen.findByTestId("type-chooser-option-file");
    expect(screen.getAllByTestId("type-chooser-option-file")).toHaveLength(1);
  });

  it("extra options follow the plane filter", async () => {
    render(<TypeChooser search={answer([])} extraOptions={[opt("fn", "Fn", "function")]} />);
    await screen.findByTestId("type-chooser-empty");
    fireEvent.click(screen.getByTestId("type-chooser-plane-function"));
    expect(screen.getByTestId("type-chooser-option-fn")).toBeTruthy();
  });
});

describe("the icon", () => {
  const rows = [opt("a", "Ant"), opt("b", "Bee")];

  it("with no renderTypeIcon nothing is drawn where the icon was", async () => {
    render(<TypeChooser search={answer(rows)} />);
    const row = await screen.findByTestId("type-chooser-option-a");
    expect([...row.children].map((c) => c.tagName)).toEqual(["SPAN", "SPAN"]);
    expect(row.textContent).toBe("Antname only");
  });

  it("renderTypeIcon gets the option and the size and colour classes: faint for a row, accent for the selected row", async () => {
    const seen: Array<[string, string]> = [];
    render(
      <TypeChooser
        search={answer(rows)}
        value="b"
        renderTypeIcon={(o, className) => {
          seen.push([o.id, className]);
          return <i data-testid={`icon-${o.id}`} className={className} />;
        }}
      />,
    );
    const row = await screen.findByTestId("type-chooser-option-a");
    expect(row.firstElementChild!.getAttribute("data-testid")).toBe("icon-a");
    expect(seen).toContainEqual(["a", "w-4 h-4 shrink-0 text-[var(--ink-faint)]"]);
    expect(seen).toContainEqual(["b", "w-4 h-4 shrink-0 text-[var(--accent)]"]);
  });

  it("the detail view draws it too, with the accent and a top margin", async () => {
    render(<TypeChooser search={answer(rows)} renderTypeIcon={(o, className) => <i data-testid="detail-icon" data-for={o.id} className={className} />} />);
    fireEvent.click(await screen.findByTestId("type-chooser-option-a"));
    const detail = screen.getByTestId("type-chooser-detail");
    const icon = detail.querySelector("[data-testid=detail-icon]")!;
    expect(icon.getAttribute("class")).toBe("w-4 h-4 shrink-0 mt-0.5 text-[var(--accent)]");
    expect(icon.getAttribute("data-for")).toBe("a");
  });
});

describe("picking and the detail view", () => {
  const house = opt("veda:House", "House", "type", { definition: "A building people live in." });
  const note = opt("note", "Note", "type", { typeName: "NoteDocument" });

  it("onPick gets the very option object that was listed", async () => {
    const onPick = vi.fn();
    render(<TypeChooser search={answer([note])} onPick={onPick} />);
    fireEvent.click(await screen.findByTestId("type-chooser-option-note"));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0]).toBe(note);
  });

  it("a definition that came with the option is shown at once and the reader is not asked", async () => {
    render(<TypeChooser search={answer([house])} />);
    fireEvent.click(await screen.findByTestId("type-chooser-option-veda:House"));
    expect(screen.getByTestId("type-chooser-definition").textContent).toBe("A building people live in.");
    expect(screen.queryByText("Loading definition…")).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("the detail view names the label, the t: name when it differs, and 'Definition'", async () => {
    render(<TypeChooser search={answer([note])} />);
    fireEvent.click(await screen.findByTestId("type-chooser-option-note"));
    const detail = screen.getByTestId("type-chooser-detail");
    expect(detail.textContent).toContain("Note");
    expect(detail.textContent).toContain("t:NoteDocument");
    expect(detail.textContent).toContain("Definition");
    const back = screen.getByTestId("type-chooser-detail-back");
    expect(back.getAttribute("aria-label")).toBe("Back to search results");
    expect(back.textContent).toBe("×");
  });

  it("with no definition on the option it says 'Loading definition…' and then what the reader answered", async () => {
    let answerIt: (d: TermDefinition) => void = () => {};
    read.mockImplementation(() => new Promise<TermDefinition>((r) => (answerIt = r)));
    render(<TypeChooser search={answer([note])} />);
    fireEvent.click(await screen.findByTestId("type-chooser-option-note"));
    expect(screen.getByText("Loading definition…")).toBeTruthy();
    expect(read).toHaveBeenCalledWith("NoteDocument");
    answerIt({ state: "defined", does: "A document.\nSecond line." });
    await waitFor(() => expect(screen.getByTestId("type-chooser-definition").textContent).toBe("A document.\nSecond line."));
    expect(screen.getByTestId("type-chooser-definition").className).toContain("whitespace-pre-wrap");
    expect(screen.queryByText("Loading definition…")).toBeNull();
  });

  it("an empty-string definition on the option is no definition: the reader is asked", async () => {
    render(<TypeChooser search={answer([opt("x", "X", "type", { definition: "" })])} />);
    fireEvent.click(await screen.findByTestId("type-chooser-option-x"));
    await waitFor(() => expect(read).toHaveBeenCalledWith("X"));
  });

  it("a term that was read and has no definition says so", async () => {
    read.mockResolvedValue({ state: "none" });
    render(<TypeChooser search={answer([note])} />);
    fireEvent.click(await screen.findByTestId("type-chooser-option-note"));
    expect((await screen.findByTestId("type-chooser-definition-absent")).textContent).toBe("No definition on this term.");
    expect(screen.queryByTestId("type-chooser-definition-unreachable")).toBeNull();
  });

  it("a term that could not be read says that, with the reason as the title, and never 'no definition'", async () => {
    read.mockResolvedValue({ state: "unreachable", reason: "offline" });
    render(<TypeChooser search={answer([note])} />);
    fireEvent.click(await screen.findByTestId("type-chooser-option-note"));
    const el = await screen.findByTestId("type-chooser-definition-unreachable");
    expect(el.textContent).toBe("Definition could not be loaded — this says nothing about the term.");
    expect(el.getAttribute("title")).toBe("offline");
    expect(screen.queryByTestId("type-chooser-definition-absent")).toBeNull();
  });

  it("typing in the box while the detail is open returns to the list", async () => {
    render(<TypeChooser search={answer([note, house])} />);
    fireEvent.click(await screen.findByTestId("type-chooser-option-note"));
    expect(screen.getByTestId("type-chooser-detail")).toBeTruthy();
    typeInto("n");
    await waitFor(() => expect(screen.queryByTestId("type-chooser-detail")).toBeNull());
  });

  it("a slow definition read of an earlier pick lands on a later pick (nothing guards it)", async () => {
    const pending: Record<string, (d: TermDefinition) => void> = {};
    read.mockImplementation((name) => new Promise<TermDefinition>((r) => (pending[name] = r)));
    render(<TypeChooser search={answer([note, opt("t", "Tee")])} />);
    fireEvent.click(await screen.findByTestId("type-chooser-option-note"));
    fireEvent.click(screen.getByTestId("type-chooser-detail-back"));
    fireEvent.click(screen.getByTestId("type-chooser-option-t"));
    pending["Tee"]!({ state: "defined", does: "about Tee" });
    await screen.findByText("about Tee");
    pending["NoteDocument"]!({ state: "defined", does: "about Note" });
    await screen.findByText("about Note");
    expect(screen.queryByText("about Tee")).toBeNull();
  });
});

describe("the frame", () => {
  it("label defaults to 'Type', is tied to the search box by id, and the box controls the list", async () => {
    render(<TypeChooser />);
    const input = screen.getByTestId("type-chooser-search");
    const label = screen.getByText("Type");
    expect(label.tagName).toBe("LABEL");
    expect(label.getAttribute("for")).toBe(input.id);
    expect(input.id).toMatch(/^type-chooser-.+-search$/);
    const list = screen.getByTestId("type-chooser-list");
    expect(input.getAttribute("aria-controls")).toBe(list.id);
    expect(list.id).toMatch(/^type-chooser-.+-list$/);
    expect(list.getAttribute("role")).toBe("listbox");
    expect(input.getAttribute("type")).toBe("search");
    expect(input.getAttribute("role")).toBe("searchbox");
    expect(input.getAttribute("autocomplete")).toBe("off");
    await screen.findByTestId("type-chooser-empty");
  });

  it("two choosers get different ids; idPrefix sets them", async () => {
    render(
      <>
        <TypeChooser label="One" />
        <TypeChooser label="Two" idPrefix="pfx" />
        <TypeChooser label="Three" />
      </>,
    );
    const inputs = screen.getAllByTestId("type-chooser-search");
    expect(inputs[1]!.id).toBe("pfx-search");
    expect(screen.getAllByTestId("type-chooser-list")[1]!.id).toBe("pfx-list");
    expect(inputs[0]!.id).not.toBe(inputs[2]!.id);
    expect(screen.getByText("Two").getAttribute("for")).toBe("pfx-search");
    await waitFor(() => expect(screen.getAllByTestId("type-chooser-empty")).toHaveLength(3));
  });

  it("the plane tabs: a tablist of the planes offered, in the fixed order, with the first one given as the start", async () => {
    render(<TypeChooser planes={["value", "things"]} />);
    const tabs = screen.getByRole("tablist");
    expect(tabs.getAttribute("aria-label")).toBe("What to create");
    expect([...tabs.querySelectorAll("[role=tab]")].map((t) => t.textContent)).toEqual(["Things", "Values"]);
    expect(screen.getByTestId("type-chooser-plane-value").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("type-chooser-plane-things").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId("type-chooser-plane-value").className).toContain("border-[var(--accent)] bg-[var(--sel)] text-[var(--ink)]");
    expect(screen.getByTestId("type-chooser-plane-things").className).toContain("border-[var(--line)] bg-[var(--surface)]");
    await screen.findByTestId("type-chooser-empty");
  });

  it("no planes given, or an empty list, offers all four and starts on Things", async () => {
    const a = render(<TypeChooser planes={[]} />);
    expect([...screen.getByRole("tablist").querySelectorAll("[role=tab]")].map((t) => t.textContent)).toEqual(["Things", "Functions", "Values", "All"]);
    expect(screen.getByTestId("type-chooser-plane-things").getAttribute("aria-selected")).toBe("true");
    a.unmount();
    render(<TypeChooser />);
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    await screen.findByTestId("type-chooser-empty");
  });

  it("the placeholder and the list's accessible name follow the plane", async () => {
    render(<TypeChooser />);
    const input = screen.getByTestId("type-chooser-search");
    const list = screen.getByTestId("type-chooser-list");
    const want: Array<[string, string, string]> = [
      ["things", "Search things — a boat, a note, a chair, a person…", "Things"],
      ["function", "Search functions…", "Functions"],
      ["value", "Search values…", "Values"],
      ["all", "Search all types, functions and values…", "Types, functions and values"],
    ];
    for (const [plane, placeholder, name] of want) {
      fireEvent.click(screen.getByTestId(`type-chooser-plane-${plane}`));
      expect(input.getAttribute("placeholder")).toBe(placeholder);
      expect(list.getAttribute("aria-label")).toBe(name);
    }
    await screen.findByTestId("type-chooser-empty");
  });

  it("a single plane given starts there", async () => {
    render(<TypeChooser planes={["function"]} />);
    expect(screen.getByTestId("type-chooser-search").getAttribute("placeholder")).toBe("Search functions…");
    expect(screen.queryByTestId("type-chooser-plane")).toBeNull();
    await screen.findByTestId("type-chooser-empty");
  });

  it("the list is 176 px tall at most, or maxListHeight, or fills its host", async () => {
    const a = render(<TypeChooser />);
    expect(screen.getByTestId("type-chooser-list").style.maxHeight).toBe("176px");
    a.rerender(<TypeChooser maxListHeight={90} />);
    expect(screen.getByTestId("type-chooser-list").style.maxHeight).toBe("90px");
    expect(screen.getByTestId("type-chooser").className).toBe("flex flex-col gap-1");
    a.rerender(<TypeChooser fill maxListHeight={90} />);
    expect(screen.getByTestId("type-chooser-list").style.maxHeight).toBe("");
    expect(screen.getByTestId("type-chooser-list").className).toContain(" flex-1 min-h-0");
    expect(screen.getByTestId("type-chooser").className).toBe("flex flex-col gap-1 flex-1 min-h-0");
    await screen.findByTestId("type-chooser-empty");
  });

  it("autoFocus puts the focus in the search box; without it the focus stays put", async () => {
    const a = render(<TypeChooser autoFocus />);
    expect(document.activeElement).toBe(screen.getByTestId("type-chooser-search"));
    a.unmount();
    render(<TypeChooser />);
    expect(document.activeElement).toBe(document.body);
    await screen.findByTestId("type-chooser-empty");
  });

  it("disabled disables the box, the tabs, the rows and the back button", async () => {
    const find = answer([opt("a", "Ant")]);
    const a = render(<TypeChooser search={find} />);
    fireEvent.click(await screen.findByTestId("type-chooser-option-a"));
    a.rerender(<TypeChooser search={find} disabled />);
    expect((screen.getByTestId("type-chooser-search") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId("type-chooser-detail-back") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("type-chooser-plane-things") as HTMLButtonElement).disabled).toBe(true);
    a.rerender(<TypeChooser search={find} />);
    fireEvent.click(screen.getByTestId("type-chooser-detail-back"));
    a.rerender(<TypeChooser search={find} disabled />);
    expect((screen.getByTestId("type-chooser-option-a") as HTMLButtonElement).disabled).toBe(true);
  });

  it("keys and clicks in the search box do not reach a host menu around it", async () => {
    const onKey = vi.fn();
    const onClick = vi.fn();
    render(
      <div onKeyDown={onKey} onClick={onClick}>
        <TypeChooser />
      </div>,
    );
    const box = screen.getByTestId("type-chooser-search");
    fireEvent.keyDown(box, { key: "Escape" });
    fireEvent.click(box);
    expect(onKey).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("type-chooser-plane-things"));
    expect(onClick).toHaveBeenCalledTimes(1);
    await screen.findByTestId("type-chooser-empty");
  });
});

