// Spec: Solution TableView.SameRecords, Write ("each cell edit is one merge-patch with If-Match", "on a conflict in the same field, the
// cell shows both values and asks", "a value outside a closed list is refused in the cell, and the list is shown"); Function
// Table.DataEnter; and the table view step 2 brief (2026-11-25), "How a cell edit works" 2 (Commit), 3 (Show), 4 (On a 412), 5 (Failure),
// 6 (Refusals), 7 (Closed list), 8 (Clear), 10 (Read-only), 11 (Keyboard). RuleUiSaveAsYouType: "A value that may not be stored is not
// written: the field says why, and the person's text stays."
//
// REAL: `RecordTable` with `editing`, its editor, its saves (the code library's `useAutosaveRecord` with `saveOn: "commit"`) and
// table-core's rules. The HOST is a stand-in: `write` is a function of this test, which applies a write to the records the table is
// built from (as a host's record cache would after the vault confirmed), or refuses it as the test says. It makes no claim about what a
// vault allows: the app's own tests hold the fake platform. Every attribute name is a live GilbVeda term (veda.gilb.com, read
// 2026-11-25T09:23Z); their labels and the list of the closed one (Red, Green) are set for the cases here, not the live terms' own. jsdom lays nothing out and has no finger: real keys and touches are the
// app's browser proof.
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import axe from "axe-core";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { buildTable, problemOf, type CellValue } from "@kaigilb/gilbplatformcode-table-core";
import { fieldsOfType, type FieldDeclarations } from "@kaigilb/gilbplatformcode-type-fields";
import { RecordTable } from "./RecordTable";
import { CellWriteError, type CellWriteRequest } from "./cellSaves";

const MASTER = "https://ontology.platform.example.test";
const VAULT = "https://vault.example.test";
const TYPE = `${MASTER}/base/t/GarmentStockLine`;
const term = (name: string, binding: string, label: string, encoding: string, cardinality: string, extra: Record<string, unknown> = {}) => ({
  "@id": `${MASTER}/base/t/${name}`,
  "a:predicateAttribute": binding,
  "a:label": label,
  "a:encoding": encoding,
  "a:cardinality": cardinality,
  "a:fieldOf": { "@id": TYPE },
  ...extra,
});
const declarations: FieldDeclarations = {
  origin: MASTER,
  fieldTerms: [
    term("AltText", "a:altText", "stock note", "inline-literal:text", "single"),
    term("BerthCount", "a:berthCount", "stock count", "inline-literal:integer", "single"),
    term("MenuStartDate", "a:menuStartDate", "restock date", "inline-literal:date", "single"),
    term("MadeForKids", "a:madeForKids", "made for kids", "inline-literal:boolean", "single"),
    term("ExerciseKind", "a:exerciseKind", "exerciseKind", "inline-literal:token", "single", { "a:valueSet": ["Red", "Green"], "a:valueSetClosure": "closed" }),
    term("ApprovedPostPicture", "a:approvedPostPicture", "approved post picture", "reference", "single"),
    term("BrandName", "a:brandName", "item code", "inline-literal:text", "single"),
  ],
  requiredTerms: [{ "@id": TYPE, "a:requiredSlot": [{ "a:slot": "a:brandName", "a:card": "1" }] }],
  complete: true,
  incompleteAt: [],
};
// Columns, in label order: Name, approved post picture, exerciseKind, item code, made for kids, restock date, stock count, stock note.
const fields = fieldsOfType(declarations, "GarmentStockLine");
const record = (id: string, name: string, served: Record<string, unknown>): BaseRecord => ({
  id,
  entityUri: `${VAULT}/base/e/${id}`,
  typeUri: TYPE,
  facts: { label: name },
  opaqueFacts: [],
  etag: null,
  served: { facts: { label: name, ...served }, context: null, etag: null },
});
const START = [
  record("r1", "Parka", { altText: "warm", berthCount: 3, madeForKids: true, exerciseKind: "Red", brandName: "P-1", approvedPostPicture: { "@id": `${VAULT}/base/e/pic01` } }),
  record("r2", "Knit", { altText: "soft", brandName: "K-2" }),
  record("r3", "Boots", { brandName: "B-3" }),
];

/** What the host was asked to write, in order, and how it answers the next asks. */
let asked: CellWriteRequest[] = [];
let answer: (request: CellWriteRequest) => Promise<void> | void = () => undefined;
const bare = (writeKey: string) => writeKey.replace(/^a:/, "");

function Host({ narrow = false, readOnly = null as string | null, start = START, hostsOwn = null as string | null }: { narrow?: boolean; readOnly?: string | null; start?: BaseRecord[]; hostsOwn?: string | null }) {
  const [records, setRecords] = useState(start);
  hostSet = setRecords;
  const table = buildTable({ fields, records, nameOf: (r) => r.facts["label"] ?? "" });
  return (
    <RecordTable
      table={table}
      onOpenRow={(id) => opened.push(id)}
      narrow={narrow}
      label="Garment stock lines"
      editing={{
        locale: "en-US",
        ...(readOnly ? { rowReadOnly: () => readOnly } : {}),
        ...(hostsOwn ? { cellReadOnly: (_row, column) => (column.id === hostsOwn ? "The name is changed on the card for now" : null) } : {}),
        write: async (request) => {
          asked.push(request);
          await answer(request);
          // The vault confirmed: the record the table is built from now holds the value (a host's cache does this).
          store(request.rowId, bare(request.plan.writeKey), request.value);
        },
      }}
    />
  );
}
let hostSet: (fn: (prev: BaseRecord[]) => BaseRecord[]) => void = () => undefined;
let opened: string[] = [];
/** Puts a value into the records, as a confirmed write or as someone else's change that a re-read brought. */
const store = (rowId: string, key: string, value: CellValue | null) =>
  act(() =>
    hostSet((prev) =>
      prev.map((r) => {
        if (r.id !== rowId || !r.served) return r;
        const facts: Record<string, unknown> = { ...r.served.facts };
        if (value === null) delete facts[key];
        else facts[key] = value;
        return { ...r, served: { ...r.served, facts } };
      }),
    ),
  );

beforeAll(() => {
  // jsdom has no PointerEvent, so a pointer event made here would carry no pointer type. This gives it the one field the table reads.
  if (typeof window.PointerEvent !== "function") {
    class PointerEventForTest extends MouseEvent {
      readonly pointerType: string;
      constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "";
      }
    }
    Object.defineProperty(window, "PointerEvent", { configurable: true, writable: true, value: PointerEventForTest });
  }
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 100_000 });
  HTMLElement.prototype.scrollTo = function (this: HTMLElement, to?: ScrollToOptions | number) {
    if (typeof to === "object" && typeof to.top === "number") this.scrollTop = to.top;
    this.dispatchEvent(new Event("scroll"));
  } as typeof HTMLElement.prototype.scrollTo;
});
afterEach(() => {
  cleanup();
  asked = [];
  opened = [];
  answer = () => undefined;
  vi.restoreAllMocks();
});

const rowEl = (id: string) => document.querySelector(`[data-row-id="${id}"]`) as HTMLElement;
const cellEl = (id: string, column: string) => (column === "name" ? rowEl(id).querySelector('[role="rowheader"]') : rowEl(id).querySelector(`[data-column-id="a:${column}"]`)) as HTMLElement;
const editor = () => screen.getByTestId("record-table-editor") as HTMLInputElement | HTMLTextAreaElement;
const hasEditor = () => screen.queryByTestId("record-table-editor") !== null;
const status = () => screen.getByTestId("record-table-cell-status").textContent ?? "";
/** Select a cell as a click does, and put the keys on its row. */
const go = (id: string, column: string) => {
  fireEvent.click(cellEl(id, column));
  act(() => rowEl(id).focus());
};
const key = (id: string, k: string, init: Record<string, unknown> = {}) => fireEvent.keyDown(rowEl(id), { key: k, ...init });
const type = (text: string) => fireEvent.change(editor(), { target: { value: text } });
const selected = () => {
  const el = document.querySelector("[data-selected]") as HTMLElement | null;
  return el ? [el.closest("[data-row-id]")?.getAttribute("data-row-id"), el.getAttribute("data-column-id") ?? "name"] : null;
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("table-react: editing a cell", () => {
  describe("the selection", () => {
    test("with no editing passed no cell can be selected and nothing is offered to edit", () => {
      const table = buildTable({ fields, records: START, nameOf: (r) => r.facts["label"] ?? "" });
      render(<RecordTable table={table} onOpenRow={() => {}} />);
      fireEvent.click(cellEl("r1", "altText"));
      expect(document.querySelector("[data-selected]")).toBeNull();
      expect(screen.queryByTestId("record-table-bar")).toBeNull();
    });

    test("a click selects a cell; the arrows move the selection and stop at the table's edges", () => {
      render(<Host />);
      go("r1", "altText");
      expect(selected()).toEqual(["r1", "a:altText"]);
      expect(cellEl("r1", "altText").getAttribute("aria-selected")).toBe("true");
      key("r1", "ArrowLeft");
      expect(selected()).toEqual(["r1", "a:berthCount"]);
      key("r1", "ArrowDown");
      expect(selected()).toEqual(["r2", "a:berthCount"]);
      // The keys follow the selection to its row.
      expect(document.activeElement).toBe(rowEl("r2"));
      key("r2", "ArrowRight");
      key("r2", "ArrowRight");
      expect(selected()).toEqual(["r2", "a:altText"]);
      key("r2", "End");
      expect(selected()).toEqual(["r3", "a:altText"]);
      key("r3", "ArrowDown");
      expect(selected()).toEqual(["r3", "a:altText"]);
      key("r3", "Home");
      expect(selected()).toEqual(["r1", "a:altText"]);
    });

    // In a browser a mouse press brings the focus to the row before its click arrives (proved with a real mouse in the app's browser
    // proof). The press itself selects the cell, so the row's selection on focus cannot fall on the column selected before.
    test("a mouse press selects its cell before the focus it brings, in another row and another column than the selection", () => {
      render(<Host />);
      go("r1", "altText");
      const target = cellEl("r2", "berthCount");
      fireEvent.pointerDown(target, { pointerType: "mouse" });
      expect(selected()).toEqual(["r2", "a:berthCount"]);
      act(() => rowEl("r2").focus());
      expect(selected()).toEqual(["r2", "a:berthCount"]);
      fireEvent.click(target);
      // It was not the selected cell when the press began: the click selects, and opens no box.
      expect(selected()).toEqual(["r2", "a:berthCount"]);
      expect(hasEditor()).toBe(false);
      // A second press on it, now the selected cell, opens its box.
      fireEvent.pointerDown(target, { pointerType: "mouse" });
      fireEvent.click(target);
      expect(hasEditor()).toBe(true);
    });

    test("a row that takes the keys has a selected cell: Name, or the column last selected", () => {
      render(<Host />);
      act(() => rowEl("r2").focus());
      expect(selected()).toEqual(["r2", "name"]);
      expect(rowEl("r2").getAttribute("aria-activedescendant")).toBe(cellEl("r2", "name").id);
    });

    test("Space opens the row's record from any cell that is not a yes-or-no cell", () => {
      render(<Host />);
      go("r2", "altText");
      key("r2", " ");
      expect(opened).toEqual(["r2"]);
      expect(hasEditor()).toBe(false);
    });
  });

  describe("an edit", () => {
    test("Enter opens the box on the stored text; Enter again saves that one field and moves down; the value shows at once and is ticked when confirmed", async () => {
      let confirm!: () => void;
      answer = () => new Promise<void>((r) => { confirm = r; });
      render(<Host />);
      go("r1", "altText");
      key("r1", "Enter");
      expect(editor().value).toBe("warm");
      type("warm and dry");
      fireEvent.keyDown(editor(), { key: "Enter" });
      // The box is gone, the selection moved down, the typed value shows before the vault has answered.
      expect(hasEditor()).toBe(false);
      expect(selected()).toEqual(["r2", "a:altText"]);
      await waitFor(() => expect(asked.length).toBe(1));
      expect(asked[0]).toMatchObject({ rowId: "r1", columnId: "a:altText", value: "warm and dry", base: "warm" });
      expect(asked[0]?.plan.writeKey).toBe("a:altText");
      expect(cellEl("r1", "altText").textContent).toContain("warm and dry");
      expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("saving");
      await act(async () => { confirm(); });
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("saved"));
      expect(cellEl("r1", "altText").querySelector('[data-cell-mark="saved"]')?.getAttribute("aria-label")).toBe("Saved");
      await settle();
      expect(asked.length).toBe(1);
    });

    test("Tab saves and moves right; Shift+Tab and Shift+Enter move the other way", async () => {
      render(<Host />);
      go("r2", "berthCount");
      key("r2", "Enter");
      type("12");
      fireEvent.keyDown(editor(), { key: "Tab" });
      expect(selected()).toEqual(["r2", "a:altText"]);
      await waitFor(() => expect(asked.map((a) => [a.columnId, a.value, a.base])).toEqual([["a:berthCount", 12, null]]));
      key("r2", "Enter");
      type("softer");
      fireEvent.keyDown(editor(), { key: "Tab", shiftKey: true });
      expect(selected()).toEqual(["r2", "a:berthCount"]);
      key("r2", "Enter");
      fireEvent.keyDown(editor(), { key: "Enter", shiftKey: true });
      expect(selected()).toEqual(["r1", "a:berthCount"]);
      await waitFor(() => expect(asked.length).toBe(2));
    });

    test("Escape gives the edit up: the stored value is back and nothing is written", async () => {
      render(<Host />);
      go("r1", "altText");
      key("r1", "Enter");
      type("something else");
      fireEvent.keyDown(editor(), { key: "Escape" });
      expect(hasEditor()).toBe(false);
      expect(cellEl("r1", "altText").textContent).toBe("warm");
      expect(selected()).toEqual(["r1", "a:altText"]);
      await settle();
      expect(asked).toEqual([]);
    });

    test("a typed character starts an edit that replaces the value", async () => {
      render(<Host />);
      go("r1", "altText");
      key("r1", "x");
      expect(editor().value).toBe("x");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(asked[0]).toMatchObject({ value: "x", base: "warm" }));
    });

    test("leaving the box saves; a value that was not changed is not written", async () => {
      render(<Host />);
      go("r1", "altText");
      key("r1", "Enter");
      type("warm, lined");
      fireEvent.blur(editor());
      await waitFor(() => expect(asked.length).toBe(1));
      expect(asked[0]?.value).toBe("warm, lined");
      go("r2", "altText");
      key("r2", "Enter");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await settle();
      expect(asked.length).toBe(1);
    });

    test("text is stored exactly as typed: spaces and line breaks are kept, and shown", async () => {
      render(<Host />);
      go("r2", "altText");
      key("r2", "Enter");
      type("  two lines\nof text  ");
      fireEvent.keyDown(editor(), { key: "Tab" });
      await waitFor(() => expect(asked[0]?.value).toBe("  two lines\nof text  "));
      await waitFor(() => expect(cellEl("r2", "altText").getAttribute("data-cell-state")).toBe("saved"));
      expect(cellEl("r2", "altText").querySelector("span")?.textContent).toBe("  two lines\nof text  ");
    });

    test("a second click on the selected cell opens its box", () => {
      render(<Host />);
      fireEvent.click(cellEl("r1", "altText"));
      expect(hasEditor()).toBe(false);
      fireEvent.click(cellEl("r1", "altText"));
      expect(editor().value).toBe("warm");
    });

    test("the page being hidden finishes the edit under way: what is typed is sent, not lost", async () => {
      render(<Host />);
      go("r1", "altText");
      key("r1", "Enter");
      type("typed, then the tab was closed");
      act(() => void window.dispatchEvent(new Event("pagehide")));
      await waitFor(() => expect(asked[0]?.value).toBe("typed, then the tab was closed"));
    });
  });

  describe("clearing", () => {
    test("Delete removes the value: the write carries no value (null), never an empty text", async () => {
      render(<Host />);
      go("r1", "altText");
      key("r1", "Delete");
      await waitFor(() => expect(asked.length).toBe(1));
      expect(asked[0]).toMatchObject({ columnId: "a:altText", value: null, base: "warm" });
      await waitFor(() => expect(cellEl("r1", "altText").textContent).not.toContain("warm"));
    });

    test("emptying the box and saving is the same clear", async () => {
      render(<Host />);
      go("r1", "altText");
      key("r1", "Enter");
      type("");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(asked[0]).toMatchObject({ value: null, base: "warm" }));
    });

    test("a cell with no value is not written when cleared; a required field is not cleared and says so", async () => {
      render(<Host />);
      go("r2", "berthCount");
      key("r2", "Delete");
      go("r1", "brandName");
      key("r1", "Backspace");
      expect(status()).toBe("item code: item code is required");
      key("r1", "Enter");
      type("");
      fireEvent.keyDown(editor(), { key: "Enter" });
      expect(screen.getByTestId("record-table-editor-why").textContent).toBe("item code is required");
      await settle();
      expect(asked).toEqual([]);
    });
  });

  describe("each kind of value", () => {
    test("a number is read by the locale's marks and written as a number; what is not a number stays in the box with the reason", async () => {
      render(<Host />);
      go("r1", "berthCount");
      key("r1", "Enter");
      expect(editor().getAttribute("inputmode")).toBe("decimal");
      type("abc");
      fireEvent.keyDown(editor(), { key: "Enter" });
      expect(hasEditor()).toBe(true);
      expect(screen.getByTestId("record-table-editor-why").textContent).toBe('"abc" is not a number');
      expect(editor().getAttribute("aria-invalid")).toBe("true");
      type("1.5");
      fireEvent.keyDown(editor(), { key: "Enter" });
      expect(screen.getByTestId("record-table-editor-why").textContent).toBe('"1.5" is not a whole number');
      type("1,234");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(asked.length).toBe(1));
      expect(asked[0]?.value).toBe(1234);
      expect(asked[0]?.base).toBe(3);
    });

    test("a date is picked in a date box and written as the text that was picked", async () => {
      render(<Host />);
      go("r1", "menuStartDate");
      key("r1", "Enter");
      expect(editor().getAttribute("type")).toBe("date");
      type("2026-12-31");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(asked[0]).toMatchObject({ value: "2026-12-31", base: null }));
    });

    test("a yes-or-no cell is changed by Space and by Enter, and saved at once; Space does not open the record there", async () => {
      render(<Host />);
      go("r1", "madeForKids");
      expect(cellEl("r1", "madeForKids").querySelector('[role="checkbox"]')?.getAttribute("aria-checked")).toBe("true");
      key("r1", " ");
      await waitFor(() => expect(asked.length).toBe(1));
      expect(asked[0]).toMatchObject({ columnId: "a:madeForKids", value: false, base: true });
      expect(opened).toEqual([]);
      await waitFor(() => expect(cellEl("r1", "madeForKids").getAttribute("data-cell-state")).toBe("saved"));
      key("r1", "Enter");
      await waitFor(() => expect(asked.length).toBe(2));
      expect(asked[1]).toMatchObject({ value: true, base: false });
      // A yes-or-no cell with no value becomes yes.
      go("r2", "madeForKids");
      key("r2", " ");
      await waitFor(() => expect(asked[2]).toMatchObject({ rowId: "r2", value: true, base: null }));
    });

    test("a click on the box of a yes-or-no cell changes it", async () => {
      render(<Host />);
      fireEvent.click(cellEl("r1", "madeForKids").querySelector("[data-check]") as HTMLElement);
      await waitFor(() => expect(asked[0]).toMatchObject({ value: false, base: true }));
    });

    // Spec: step 2 brief 7 and its end-to-end case: "The refused 'Purple' in Red/Green."
    test("a choice opens its list; Purple in Red/Green turns the box red, is not written, and the list stays open with the reason", async () => {
      render(<Host />);
      go("r1", "exerciseKind");
      key("r1", "Enter");
      const list = () => [...screen.getByTestId("record-table-choice-list").querySelectorAll('[role="option"]')].map((o) => o.textContent);
      expect(list()).toEqual(["Red", "Green"]);
      type("Purple");
      fireEvent.keyDown(editor(), { key: "Enter" });
      expect(screen.getByTestId("record-table-editor-why").textContent).toBe("Purple is not in this list");
      expect(document.querySelector("[data-editor-kind='choice']")?.getAttribute("data-invalid")).toBe("true");
      expect(list()).toEqual(["Red", "Green"]);
      await settle();
      expect(asked).toEqual([]);
      // A value of the list is taken: by a click on it.
      fireEvent.click(screen.getByRole("option", { name: "Green" }));
      await waitFor(() => expect(asked[0]).toMatchObject({ columnId: "a:exerciseKind", value: "Green", base: "Red" }));
      expect(hasEditor()).toBe(false);
    });

    test("in a choice the arrows mark a value and Enter takes it; typing narrows the list", async () => {
      render(<Host />);
      go("r2", "exerciseKind");
      key("r2", "Enter");
      type("gr");
      expect([...screen.getByTestId("record-table-choice-list").querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(["Green"]);
      fireEvent.keyDown(editor(), { key: "ArrowDown" });
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(asked[0]).toMatchObject({ value: "Green", base: null }));
    });

    test("text that cannot be stored stays in its cell, in red with the reason, when its box is left; Escape there drops it and says so", async () => {
      render(<Host />);
      go("r1", "berthCount");
      key("r1", "Enter");
      type("three");
      fireEvent.blur(editor());
      expect(hasEditor()).toBe(false);
      expect(cellEl("r1", "berthCount").getAttribute("data-cell-state")).toBe("invalid");
      expect(cellEl("r1", "berthCount").textContent).toContain("three");
      expect(cellEl("r1", "berthCount").getAttribute("title")).toBe('"three" is not a number');
      go("r1", "berthCount");
      expect(status()).toBe('stock count: Not saved: "three" is not a number');
      // Opening the box again finds the text and the reason.
      key("r1", "Enter");
      expect(editor().value).toBe("three");
      fireEvent.keyDown(editor(), { key: "Escape" });
      expect(cellEl("r1", "berthCount").textContent).toBe("3");
      expect(status()).toBe("stock count: Change dropped");
      await settle();
      expect(asked).toEqual([]);
    });
  });

  describe("a write that does not land", () => {
    const offline = () => new CellWriteError({ problem: problemOf({ kind: "network", message: "Failed to fetch" }, { label: "stock note", typed: "x" }) });

    test("no connection: the cell keeps the typed value with a red edge and says so; Retry sends the same value again", async () => {
      let fail = true;
      answer = () => { if (fail) throw offline(); };
      render(<Host />);
      go("r1", "altText");
      key("r1", "Enter");
      type("typed offline");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("failed"));
      const cell = cellEl("r1", "altText");
      expect(cell.textContent).toContain("typed offline");
      expect(cell.className).toContain("shadow-[inset_0_0_0_2px_var(--bad,#9c4438)]");
      expect(cell.getAttribute("title")).toBe("Not saved: no connection. Retry");
      // The line under the table says how many cells are not saved, whichever cell is selected.
      expect(screen.getByTestId("record-table-save-state").textContent).toContain("Not saved: 1 cell");
      go("r1", "altText");
      expect(status()).toBe("stock note: Not saved: no connection. Retry");
      // With the unsaved cell selected, the line offers "Try again" for every cell that can be tried again.
      expect(screen.getByTestId("record-table-save-state").textContent).toBe("Not saved: 1 cell Try again");
      fail = false;
      fireEvent.click(screen.getByTestId("record-table-retry"));
      await waitFor(() => expect(asked.length).toBe(2));
      expect(asked.map((a) => [a.value, a.base])).toEqual([["typed offline", "warm"], ["typed offline", "warm"]]);
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("saved"));
    });

    test("Escape on a failed cell restores the stored value and says 'Change dropped'; nothing more is sent", async () => {
      answer = () => { throw offline(); };
      render(<Host />);
      go("r1", "altText");
      key("r1", "Enter");
      type("typed offline");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("failed"));
      go("r1", "altText");
      key("r1", "Escape");
      await waitFor(() => expect(cellEl("r1", "altText").textContent).toBe("warm"));
      expect(status()).toBe("stock note: Change dropped");
      await settle();
      expect(asked.length).toBe(1);
    });

    test("while a cell is not saved the browser asks before the page is left, and not once every cell is saved", async () => {
      let fail = true;
      answer = () => { if (fail) throw offline(); };
      render(<Host />);
      const leaving = () => {
        const e = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(e);
        return e.defaultPrevented;
      };
      expect(leaving()).toBe(false);
      go("r1", "altText");
      key("r1", "x");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("failed"));
      expect(leaving()).toBe(true);
      fail = false;
      fireEvent.click(screen.getByTestId("record-table-retry"));
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("saved"));
      expect(leaving()).toBe(false);
    });

    test("a refusal that cannot be tried again with the same value (the record is gone) puts the stored value back and says why", async () => {
      answer = () => { throw new CellWriteError({ problem: problemOf({ kind: "http", status: 404 }, { label: "stock note", typed: "x" }) }); };
      render(<Host />);
      go("r1", "altText");
      key("r1", "x");
      fireEvent.keyDown(editor(), { key: "Tab" });
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("note"));
      expect(cellEl("r1", "altText").textContent).toBe("warm");
      go("r1", "altText");
      expect(status()).toBe("stock note: This record is no longer there");
      expect(screen.queryByTestId("record-table-retry")).toBeNull();
    });

    test("the vault's refusal of a value keeps what was typed and shows the vault's words, with no Retry", async () => {
      answer = () => { throw new CellWriteError({ problem: problemOf({ kind: "http", status: 409, error: "UndefinedTermError", message: "a:altText is not a defined term" }, { label: "stock note", typed: "x" }) }); };
      render(<Host />);
      go("r1", "altText");
      key("r1", "x");
      fireEvent.keyDown(editor(), { key: "Tab" });
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("failed"));
      expect(cellEl("r1", "altText").textContent).toContain("x");
      expect(cellEl("r1", "altText").getAttribute("title")).toBe("Not saved: a:altText is not a defined term");
      expect(screen.queryByTestId("record-table-retry")).toBeNull();
    });
  });

  // Spec: step 2 brief 4: 'The cell shows "Changed by someone else: <theirs>" and "Yours: <mine>", with "Keep mine" and "Use theirs".
  // "Keep mine" is a new PATCH with the fresh ETag. Never overwrite without asking.'
  describe("a field someone else changed", () => {
    /** The host finds the field changed: it re-read the record (the table now shows theirs) and asks. */
    const conflictOnce = (theirs: string) => {
      let first = true;
      answer = (request) => {
        if (!first) return;
        first = false;
        store(request.rowId, bare(request.plan.writeKey), theirs);
        throw new CellWriteError({ theirs });
      };
    };

    test("the cell says both values and offers the two choices; nothing was overwritten", async () => {
      conflictOnce("dry");
      render(<Host />);
      go("r1", "altText");
      key("r1", "Enter");
      type("wet");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("conflict"));
      expect(cellEl("r1", "altText").getAttribute("title")).toBe("Changed by someone else: dry. Yours: wet");
      go("r1", "altText");
      expect(screen.getByTestId("record-table-theirs").textContent).toBe("Changed by someone else: dry");
      expect(screen.getByTestId("record-table-mine").textContent).toBe("Yours: wet");
      // The row of two buttons: the one that writes is at the right.
      expect([...screen.getByTestId("record-table-conflict-acts").querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Use theirs", "Keep mine"]);
      await settle();
      expect(asked.length).toBe(1);
    });

    test("'Keep mine' writes the person's value over the value they were shown", async () => {
      conflictOnce("dry");
      render(<Host />);
      go("r1", "altText");
      key("r1", "Enter");
      type("wet");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("conflict"));
      go("r1", "altText");
      fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
      await waitFor(() => expect(asked.length).toBe(2));
      expect(asked.map((a) => [a.value, a.base])).toEqual([["wet", "warm"], ["wet", "dry"]]);
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("saved"));
      expect(cellEl("r1", "altText").textContent).toContain("wet");
    });

    test("'Use theirs' shows their value and writes nothing", async () => {
      conflictOnce("dry");
      render(<Host />);
      go("r1", "altText");
      key("r1", "Enter");
      type("wet");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("conflict"));
      go("r1", "altText");
      fireEvent.click(screen.getByRole("button", { name: "Use theirs" }));
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBeNull());
      expect(cellEl("r1", "altText").textContent).toBe("dry");
      await settle();
      expect(asked.length).toBe(1);
    });

    test("with the conflict on another cell, the line under the table says a cell is not saved and 'Show' goes to it", async () => {
      conflictOnce("dry");
      render(<Host />);
      go("r1", "altText");
      key("r1", "Enter");
      type("wet");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("conflict"));
      expect(selected()).toEqual(["r2", "a:altText"]);
      expect(screen.getByTestId("record-table-save-state").textContent).toContain("Not saved: 1 cell");
      fireEvent.click(screen.getByTestId("record-table-show-unsaved"));
      expect(selected()).toEqual(["r1", "a:altText"]);
      expect(screen.getByTestId("record-table-theirs").textContent).toBe("Changed by someone else: dry");
    });
  });

  // Spec: step 2 brief 10: "Every read-only cell selects and copies, and gives its reason on focus and on hover or tap. Never show a bare
  // disabled control." And Scope: a link cell is shown "read-only, with the reason 'Links are changed on the card for now'".
  describe("cells that cannot be edited", () => {
    test("a link cell can be selected, says why on selection and on hover, and Enter, a character and Delete change nothing", async () => {
      render(<Host />);
      go("r1", "approvedPostPicture");
      expect(selected()).toEqual(["r1", "a:approvedPostPicture"]);
      expect(status()).toBe("approved post picture: Links are changed on the card for now");
      const cell = cellEl("r1", "approvedPostPicture");
      expect(cell.getAttribute("title")).toBe("Links are changed on the card for now");
      expect(cell.getAttribute("aria-readonly")).toBe("true");
      for (const k of ["Enter", "a", "Delete"]) key("r1", k);
      expect(hasEditor()).toBe(false);
      // The value is ordinary text in the page (it can be selected and copied); no control in the cell is disabled.
      expect(cell.querySelector("[disabled]")).toBeNull();
      await settle();
      expect(asked).toEqual([]);
    });

    test("the Name cell says the name is changed on the card", () => {
      render(<Host />);
      go("r1", "name");
      expect(status()).toBe("Name: The name is changed on the card for now");
    });

    test("a cell the host saves by a rule of its own is read-only with the host's reason, and the cells beside it are not", async () => {
      render(<Host hostsOwn="a:brandName" />);
      go("r1", "brandName");
      expect(status()).toBe("item code: The name is changed on the card for now");
      key("r1", "Enter");
      expect(hasEditor()).toBe(false);
      go("r1", "altText");
      key("r1", "Enter");
      expect(hasEditor()).toBe(true);
    });

    test("a row the person may not write is read-only in every cell, with the host's reason", async () => {
      render(<Host readOnly="You can read this item but not edit it." />);
      go("r1", "altText");
      expect(status()).toBe("stock note: You can read this item but not edit it.");
      key("r1", "Enter");
      key("r1", "x");
      key("r1", "Delete");
      expect(hasEditor()).toBe(false);
      // A yes-or-no cell there is not a control: it reads Yes, and Space opens the record as on any cell.
      expect(cellEl("r1", "madeForKids").querySelector('[role="checkbox"]')).toBeNull();
      expect(cellEl("r1", "madeForKids").textContent).toBe("Yes");
      await settle();
      expect(asked).toEqual([]);
    });
  });

  describe("a narrow screen", () => {
    /** The value of one field in a row of the list: the part a finger taps. */
    const line = (id: string, column: string) => document.querySelector(`[data-row-id="${id}"]`)?.closest('[role="listitem"]')?.querySelector(`[data-column-id="a:${column}"] > span:last-child`) as HTMLElement;

    test("a tap on a value selects its cell and does not open the record; a second tap opens its box", async () => {
      render(<Host narrow />);
      // A row of the list shows the first three columns it holds a value under: for r1 the picture, the exerciseKind and the item code.
      const cell = line("r1", "brandName");
      fireEvent.click(cell);
      expect(opened).toEqual([]);
      expect(cell.getAttribute("data-selected")).toBe("true");
      expect(hasEditor()).toBe(false);
      fireEvent.click(cell);
      expect(editor().value).toBe("P-1");
      type("P-10");
      fireEvent.blur(editor());
      await waitFor(() => expect(asked[0]).toMatchObject({ rowId: "r1", columnId: "a:brandName", value: "P-10", base: "P-1" }));
    });

    test("a row of the list is as tall as its lines, each 28 px where values can be edited (found in a browser: 20 px lines ran into the next row)", () => {
      render(<Host narrow />);
      // r1 lists three values, r2 two (stock note, item code), r3 one (item code): 30 + lines x 28 + 10.
      expect((screen.getAllByRole("listitem") as HTMLElement[]).map((i) => i.style.height)).toEqual(["124px", "96px", "68px"]);
    });

    test("a tap on a read-only value says why; a tap on the name still opens the record", () => {
      render(<Host narrow />);
      fireEvent.click(line("r1", "approvedPostPicture"));
      expect(status()).toBe("approved post picture: Links are changed on the card for now");
      fireEvent.click(screen.getByRole("button", { name: "Parka" }));
      expect(opened).toEqual(["r1"]);
    });
  });

  describe("what is kept, and where", () => {
    test("nothing an edit holds is put on the device: no storage is written by an edit, a failure or a refused text", async () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      let fail = true;
      answer = () => { if (fail) throw new CellWriteError({ problem: problemOf({ kind: "network" }, { label: "stock note", typed: "x" }) }); };
      render(<Host />);
      go("r1", "altText");
      key("r1", "x");
      fireEvent.keyDown(editor(), { key: "Tab" });
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("failed"));
      go("r1", "berthCount");
      key("r1", "Enter");
      type("three");
      fireEvent.blur(editor());
      fail = false;
      fireEvent.click(screen.getByTestId("record-table-retry"));
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("saved"));
      expect(setItem).not.toHaveBeenCalled();
    });

    test("the unit's code names no device store at all", async () => {
      const { readFileSync } = await import("node:fs");
      for (const file of ["RecordTable.tsx", "CellEditor.tsx", "cellSaves.tsx"]) {
        const code = readFileSync(`${process.cwd()}/src/${file}`, "utf8");
        expect(code, file).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|caches\./);
      }
    });
  });

  // Spec: Rule_Code_accessibility RuleA11yUnitTest.
  describe("accessibility rules", () => {
    const violations = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(" | ")}`);

    test("the table with a selected cell, with a box open, with a choice list open and with a conflict shown breaks none", async () => {
      let first = true;
      answer = (request) => {
        if (!first) return;
        first = false;
        store(request.rowId, bare(request.plan.writeKey), "dry");
        throw new CellWriteError({ theirs: "dry" });
      };
      render(<Host />);
      go("r1", "altText");
      expect(await violations()).toEqual([]);
      key("r1", "Enter");
      expect(await violations()).toEqual([]);
      type("wet");
      fireEvent.keyDown(editor(), { key: "Enter" });
      await waitFor(() => expect(cellEl("r1", "altText").getAttribute("data-cell-state")).toBe("conflict"));
      go("r1", "altText");
      expect(await violations()).toEqual([]);
      go("r1", "exerciseKind");
      key("r1", "Enter");
      type("Purple");
      fireEvent.keyDown(editor(), { key: "Enter" });
      expect(await violations()).toEqual([]);
    });

    test("the narrow list with a selected read-only value and with a box open breaks none", async () => {
      render(<Host narrow />);
      const value = (column: string) => document.querySelector(`[data-row-id="r1"]`)?.closest('[role="listitem"]')?.querySelector(`[data-column-id="a:${column}"] > span:last-child`) as HTMLElement;
      fireEvent.click(value("approvedPostPicture"));
      expect(await violations()).toEqual([]);
      fireEvent.click(value("brandName"));
      fireEvent.click(value("brandName"));
      expect(hasEditor()).toBe(true);
      expect(await violations()).toEqual([]);
    });
  });
});
