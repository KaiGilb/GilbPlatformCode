// Spec: Solution TableView.SameRecords, Read.Grid ("the grid is virtualized"), OneDataSet.Pane ("opening a row shows the existing card"),
// and the step 1 brief's table-react items: Name is the first column and always frozen; loading shows a skeleton of the header and rows
// in the real layout; an empty table shows the column headers only; link cells are drawn by the host; Space, or the button at the left
// of the row, opens the record; below the breakpoint a list of rows, each with Name and the first 2 to 3 columns, and a tap opens.
//
// The table is built by table-core from fields the field reader derives from term documents cut down from the live master's
// (veda.gilb.com, GET /base/vocab?status=all&carries=a:fieldOf, 2026-11-25; an example.test host). jsdom lays nothing out, so the
// viewport's size is given to it below; what a browser paints (the frozen column staying in place) is proved in a browser, not here.
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { buildTable, type TableModel } from "@kaigilb/gilbplatformcode-table-core";
import { fieldsOfType, type FieldDeclarations } from "@kaigilb/gilbplatformcode-type-fields";
// The viewport size below is not a platform fake: jsdom lays nothing out, so the grid is told how tall and wide its box is.
import { RecordTable } from "./RecordTable";

const MASTER = "https://ontology.platform.example.test";
const VAULT = "https://vault.example.test";
const TYPE = `${MASTER}/base/t/GarmentStockLine`;

const term = (name: string, binding: string, label: string, encoding: string, cardinality: string) => ({
  "@id": `${MASTER}/base/t/${name}`,
  "a:predicateAttribute": binding,
  "a:label": label,
  "a:encoding": encoding,
  "a:cardinality": cardinality,
  "a:fieldOf": { "@id": TYPE },
});
const declarations: FieldDeclarations = {
  origin: MASTER,
  fieldTerms: [
    term("ClothingSize", "a:clothingSize", "clothing size", "inline-literal:text", "single"),
    term("Account", "a:account", "Online Account", "inline-literal:text", "multi"),
    term("ApprovedPostPicture", "a:approvedPostPicture", "approved post picture", "reference", "single"),
    term("MadeForKids", "a:madeForKids", "made for kids", "inline-literal:boolean", "single"),
  ],
  requiredTerms: [],
  complete: true,
  incompleteAt: [],
};
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
const nameOf = (r: BaseRecord) => r.facts["label"] ?? "";
const three = [
  record("r1", "Parka, green", { clothingSize: "L", account: ["x", "y"], madeForKids: true }),
  record("r2", "Knit, grey", { approvedPostPicture: { "@id": `${VAULT}/base/e/pic01` } }),
  record("r3", "Boots", {}),
];
const tableOf = (records: BaseRecord[]): TableModel => buildTable({ fields, records, nameOf });

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
  // jsdom has no layout: give every element the size of a desktop viewport, so the rows in view can be worked out.
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1000 });
  // jsdom has no content height either: without one, every scroll the table asks for would be held at the top.
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 100_000 });
  // jsdom does not scroll: a scroll the table asks for moves the box's scroll position and tells the table, as a browser does.
  HTMLElement.prototype.scrollTo = function (this: HTMLElement, to?: ScrollToOptions | number) {
    if (typeof to === "object" && typeof to.top === "number") this.scrollTop = to.top;
    this.dispatchEvent(new Event("scroll"));
  } as typeof HTMLElement.prototype.scrollTo;
});
afterEach(cleanup);

const headers = () => screen.getAllByRole("columnheader").map((h) => h.textContent);
const dataRows = () => screen.getAllByRole("row").filter((r) => r.hasAttribute("data-row-id"));

describe("table-react", () => {
  // Spec: Solution TableView.SameRecords, Read.Grid and Mapping; step 1 brief, table-react: "Name is the first column and is always frozen", "link cells are drawn by the existing EntityRefValue, or its equal passed in by the host".
  describe("the grid", () => {
    test("draws Name first, then one column per field, and one row per record", () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} label="Garment stock lines" />);
      expect(headers()).toEqual(["Name", "approved post picture", "clothing size", "made for kids", "Online Account"]);
      expect(dataRows().map((r) => r.getAttribute("data-row-id"))).toEqual(["r1", "r2", "r3"]);
      expect(screen.getByRole("grid", { name: "Garment stock lines" }).getAttribute("aria-rowcount")).toBe("4");
    });

    test("the Name column is the frozen one: its header and every name cell stay at the left edge", () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} />);
      const nameHeader = screen.getAllByRole("columnheader")[0];
      expect(nameHeader?.getAttribute("data-column-id")).toBe("name");
      expect(nameHeader?.className).toMatch(/\bsticky\b/);
      expect(nameHeader?.className).toMatch(/\bleft-0\b/);
      const names = screen.getAllByRole("rowheader");
      expect(names.map((n) => n.textContent)).toEqual(["Parka, green", "Knit, grey", "Boots"]);
      for (const n of names) expect(n.className).toMatch(/\bsticky\b.*\bleft-0\b/);
      // No other column is frozen.
      for (const h of screen.getAllByRole("columnheader").slice(1)) expect(h.className).not.toMatch(/\bsticky\b/);
    });

    test("a cell shows its fact, and a cell with no fact holds nothing at all", () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} />);
      const cellsOf = (id: string) => within(dataRows().find((r) => r.getAttribute("data-row-id") === id) as HTMLElement).getAllByRole("gridcell");
      // The multi-valued cell shows its first value and says one more is held ("+1").
      expect(cellsOf("r1").map((c) => c.textContent)).toEqual(["", "L", "Yes", "x+1"]);
      const boots = cellsOf("r3");
      expect(boots.length).toBe(4);
      for (const cell of boots) {
        expect(cell.textContent).toBe("");
        expect(cell.childElementCount).toBe(0);
      }
    });

    test("a list cell keeps every member", () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} />);
      const list = document.querySelector('[data-row-id="r1"] [data-column-id="a:account"] [data-list-count]');
      expect(list?.getAttribute("data-list-count")).toBe("2");
    });

    test("a link cell is drawn by the host, which is given the stored address and the record id", () => {
      const renderRef = vi.fn((ref: { uri: string; id: string | null }) => <b data-testid="named">name of {ref.id}</b>);
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} renderRef={renderRef} />);
      expect(screen.getByTestId("named").textContent).toBe("name of pic01");
      expect(renderRef).toHaveBeenCalledWith({ uri: `${VAULT}/base/e/pic01`, id: "pic01" });
    });

    test("with no host to name it, a link shows its stored address and says it is unresolved, never a made-up name", () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} />);
      const cell = document.querySelector('[data-row-id="r2"] [data-column-id="a:approvedPostPicture"] [data-ref-state]');
      expect(cell?.getAttribute("data-ref-state")).toBe("unresolved");
      expect(cell?.textContent).toBe(`${VAULT}/base/e/pic01`);
    });

    // Spec: fix pass 1b item 1 (Agent.UserExperience, Kai-Zen 2026-11-25): "Every link value is a chip, whether the cell holds one value
    // or several. Plain text is only for values that are not links."
    test("every link is a chip: a cell with one link, a cell with several, and each link in the list of all values", () => {
      const many = [1, 2, 3].map((n) => ({ "@id": `${VAULT}/base/e/pic0${n}` }));
      // `a:account` is a text field; a stored link under it is still a link (a link is a link under any column).
      const records = [record("r2", "Knit, grey", { approvedPostPicture: { "@id": `${VAULT}/base/e/pic01` } }), record("r5", "Links", { account: many }), record("r1", "Parka", { clothingSize: "L" })];
      render(<RecordTable table={tableOf(records)} onOpenRow={() => {}} renderRef={(ref) => <span>name of {ref.id}</span>} />);
      const one = document.querySelector('[data-row-id="r2"] [data-column-id="a:approvedPostPicture"]') as HTMLElement;
      expect(one.querySelectorAll('[data-chip="link"]').length).toBe(1);
      expect(one.querySelector('[data-chip="link"]')?.textContent).toBe("name of pic01");
      // The cell with several: its first link is in the cell's one chip (not a chip inside a chip).
      const several = document.querySelector('[data-row-id="r5"] [data-column-id="a:account"]') as HTMLElement;
      expect(several.querySelectorAll(".border").length).toBeGreaterThan(0);
      expect(several.querySelectorAll('[data-chip="link"] [data-chip="link"]').length).toBe(0);
      // A value that is not a link is plain text: no chip.
      const text = document.querySelector('[data-row-id="r1"] [data-column-id="a:clothingSize"]') as HTMLElement;
      expect(text.querySelector('[data-chip="link"]')).toBeNull();
      expect(text.textContent).toBe("L");
      // In the list of all values each link is a chip.
      fireEvent.click(within(several).getByTestId("record-table-more"));
      expect(screen.getByTestId("record-table-all-values").querySelectorAll('[data-chip="link"]').length).toBe(3);
    });

    // Spec: fix pass 1b item 6: a link whose name was not read "is read only when the person focuses, hovers or taps that cell".
    test("going to a cell that holds a link tells the host which link: a mouse over it, and a click or tap on it; a touch is not a hover", () => {
      const onRefIntent = vi.fn();
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} onRefIntent={onRefIntent} />);
      const link = document.querySelector('[data-row-id="r2"] [data-column-id="a:approvedPostPicture"]') as HTMLElement;
      const want = { uri: `${VAULT}/base/e/pic01`, id: "pic01" };
      fireEvent.pointerEnter(link, { pointerType: "touch" });
      expect(onRefIntent).not.toHaveBeenCalled();
      fireEvent.pointerEnter(link, { pointerType: "mouse" });
      expect(onRefIntent.mock.calls).toEqual([[want]]);
      fireEvent.click(link);
      expect(onRefIntent.mock.calls).toEqual([[want], [want]]);
      // A cell with no link says nothing.
      fireEvent.pointerEnter(document.querySelector('[data-row-id="r1"] [data-column-id="a:clothingSize"]') as HTMLElement, { pointerType: "mouse" });
      fireEvent.click(document.querySelector('[data-row-id="r3"] [data-column-id="a:approvedPostPicture"]') as HTMLElement);
      expect(onRefIntent).toHaveBeenCalledTimes(2);
    });

    test("the open record's row is marked selected", () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} selectedId="r2" />);
      expect(dataRows().map((r) => r.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    });
  });

  // Spec: Solution TableView.SameRecords, OneDataSet.Pane; step 1 brief, item 5: "Space, or the expand icon at the left of the row, opens the existing card".
  describe("opening a row", () => {
    test("Space on a row opens that record, once", () => {
      const onOpenRow = vi.fn();
      render(<RecordTable table={tableOf(three)} onOpenRow={onOpenRow} />);
      const row = dataRows()[1] as HTMLElement;
      row.focus();
      fireEvent.keyDown(row, { key: " " });
      expect(onOpenRow.mock.calls).toEqual([["r2"]]);
    });

    test("the button at the left of the row opens that record", () => {
      const onOpenRow = vi.fn();
      render(<RecordTable table={tableOf(three)} onOpenRow={onOpenRow} />);
      fireEvent.click(screen.getByRole("button", { name: "Open Boots" }));
      expect(onOpenRow.mock.calls).toEqual([["r3"]]);
    });

    test("other keys do not open, and a click on a row does not open", () => {
      const onOpenRow = vi.fn();
      render(<RecordTable table={tableOf(three)} onOpenRow={onOpenRow} />);
      const row = dataRows()[0] as HTMLElement;
      fireEvent.keyDown(row, { key: "a" });
      fireEvent.keyDown(row, { key: "Enter" });
      fireEvent.click(row);
      expect(onOpenRow).not.toHaveBeenCalled();
    });

    test("the arrow keys move between rows, and one row holds the Tab stop", () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} />);
      expect(dataRows().map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
      const first = dataRows()[0] as HTMLElement;
      first.focus();
      fireEvent.keyDown(first, { key: "ArrowDown" });
      expect(document.activeElement?.getAttribute("data-row-id")).toBe("r2");
      expect(dataRows().map((r) => r.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
      expect(document.activeElement?.getAttribute("data-row-id")).toBe("r1");
    });
  });

  // Spec: step 1 brief, table-react: "loading shows a skeleton of the header and rows in the real layout".
  describe("loading", () => {
    test("with the columns known, the real header is drawn and the rows are a skeleton in the same column layout", () => {
      render(<RecordTable table={tableOf([])} loading onOpenRow={() => {}} />);
      expect(screen.getByRole("grid").getAttribute("aria-busy")).toBe("true");
      expect(headers()).toEqual(["Name", "approved post picture", "clothing size", "made for kids", "Online Account"]);
      const headerRow = screen.getAllByRole("row")[0] as HTMLElement;
      const skeletonRows = [...document.querySelectorAll<HTMLElement>("[data-skeleton-row]")];
      expect(skeletonRows.length).toBe(12);
      for (const r of skeletonRows) {
        expect(r.style.gridTemplateColumns).toBe(headerRow.style.gridTemplateColumns);
        expect(r.childElementCount).toBe(5);
      }
      expect(headerRow.style.gridTemplateColumns).toBe("280px 190px 190px 190px 190px");
      expect(dataRows()).toEqual([]);
    });

    test("with no columns yet, the header is a skeleton too, and no heading is guessed", () => {
      render(<RecordTable table={null} loading onOpenRow={() => {}} />);
      expect(screen.queryAllByRole("columnheader")).toEqual([]);
      expect(document.querySelectorAll("[data-skeleton-header]").length).toBe(6);
      expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(12);
      expect(screen.getByRole("grid").textContent).toBe("");
    });

    test("rows given while loading are not drawn as if they were the answer", () => {
      render(<RecordTable table={tableOf(three)} loading onOpenRow={() => {}} />);
      expect(dataRows()).toEqual([]);
    });
  });

  // Spec: step 1 brief, table-react: "an empty table shows the column headers only. Nothing is guessed."
  describe("an empty table", () => {
    test("shows the column headers only: no row, no skeleton, no words in their place", () => {
      render(<RecordTable table={tableOf([])} onOpenRow={() => {}} />);
      expect(headers()).toEqual(["Name", "approved post picture", "clothing size", "made for kids", "Online Account"]);
      expect(dataRows()).toEqual([]);
      expect(document.querySelector("[data-skeleton-row]")).toBeNull();
      expect(screen.getByRole("grid").textContent).toBe("Nameapproved post pictureclothing sizemade for kidsOnline Account");
      expect(screen.getByRole("grid").getAttribute("aria-busy")).toBeNull();
    });
  });


  // Spec: Solution TableView.SameRecords, Read.Grid: "the grid is virtualized".
  describe("many rows", () => {
    test("1000 rows are 1000 rows to a screen reader, and only the rows in view are drawn", () => {
      const many = Array.from({ length: 1000 }, (_, i) => record(`m${i}`, `Line ${i}`, { clothingSize: "M" }));
      render(<RecordTable table={tableOf(many)} onOpenRow={() => {}} />);
      expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("1001");
      const drawn = dataRows();
      expect(drawn.length).toBeGreaterThan(10);
      expect(drawn.length).toBeLessThan(60);
      expect(drawn[0]?.getAttribute("data-row-id")).toBe("m0");
      expect(drawn[0]?.getAttribute("aria-rowindex")).toBe("2");
    });
  });

  // Spec: step 1 brief, item 6: "Phone: a list of rows, each showing Name and the first 2 to 3 columns. A tap opens the card."
  describe("a narrow screen", () => {
    // Spec: fix pass 1b item 2 (Agent.UserExperience, Kai-Zen 2026-11-25): "Phone rows show only columns that hold a value in that row:
    // the first up to 3, in column order, each with its label. A row with no values shows only its Name."
    test("is a list of rows and no grid; each row lists only the columns it holds a value under, the first three in column order", () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} narrow label="Garment stock lines" />);
      expect(screen.queryByRole("grid")).toBeNull();
      expect(screen.getByTestId("record-table").getAttribute("data-layout")).toBe("list");
      const items = screen.getAllByRole("listitem") as HTMLElement[];
      expect(items.length).toBe(3);
      const listed = (item: HTMLElement) => [...item.querySelectorAll("[data-column-id]")].map((e) => e.getAttribute("data-column-id"));
      // r1 holds a size, an account list and "made for kids", and no picture: the picture column is not listed.
      expect(listed(items[0]!)).toEqual(["a:clothingSize", "a:madeForKids", "a:account"]);
      expect(items[0]!.textContent).toBe("Parka, greenclothing sizeLmade for kidsYesOnline Accountx+1");
      // r2 holds a picture only.
      expect(listed(items[1]!)).toEqual(["a:approvedPostPicture"]);
      // r3 holds nothing: its name alone, and no field label.
      expect(listed(items[2]!)).toEqual([]);
      expect(items[2]!.textContent).toBe("Boots");
    });

    test("a row that holds more than three values lists the first three, in column order", () => {
      const full = record("r9", "Full", { approvedPostPicture: { "@id": `${VAULT}/base/e/pic01` }, clothingSize: "M", madeForKids: false, account: ["a"] });
      render(<RecordTable table={tableOf([full])} onOpenRow={() => {}} narrow />);
      expect([...(screen.getAllByRole("listitem")[0] as HTMLElement).querySelectorAll("[data-column-id]")].map((e) => e.getAttribute("data-column-id"))).toEqual([
        "a:approvedPostPicture",
        "a:clothingSize",
        "a:madeForKids",
      ]);
    });

    test("a value that is only blank text is not a value to list", () => {
      render(<RecordTable table={tableOf([record("r8", "Blank", { clothingSize: "  " })])} onOpenRow={() => {}} narrow />);
      expect((screen.getAllByRole("listitem")[0] as HTMLElement).querySelectorAll("[data-column-id]").length).toBe(0);
    });

    test("a row is as tall as what it lists: its name alone is 40 px, each listed line adds 20", () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} narrow />);
      const heights = (screen.getAllByRole("listitem") as HTMLElement[]).map((i) => i.style.height);
      // r1: three lines, one of them many-valued (44 px in place of 20); r2: one line; r3: none.
      expect(heights).toEqual(["124px", "60px", "40px"]);
    });

    // Spec: fix pass 1b item 3: "Column labels come from one source, in the label's own case. The phone must not lower-case a label.
    // Desktop keeps spaced capitals only if the app's design system sets that for table headers; the letters are the field's label."
    test("a field's label is the same letters, in its own case, and drawn in the same label style, in the list and in the grid's header", () => {
      const { unmount } = render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} narrow />);
      const inList = [...document.querySelectorAll<HTMLElement>("[data-field-label]")];
      expect(inList.map((l) => l.textContent)).toEqual(["clothing size", "made for kids", "Online Account", "approved post picture"]);
      const styleOf = (el: HTMLElement) => ["uppercase", "tracking-wide", "font-semibold"].filter((c) => el.classList.contains(c));
      for (const label of inList) {
        expect(styleOf(label)).toEqual(["uppercase", "tracking-wide", "font-semibold"]);
        expect(label.classList.contains("lowercase")).toBe(false);
      }
      unmount();
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} />);
      const inGrid = screen.getAllByRole("columnheader") as HTMLElement[];
      expect(inGrid.map((h) => h.textContent)).toEqual(["Name", "approved post picture", "clothing size", "made for kids", "Online Account"]);
      for (const header of inGrid) expect(styleOf(header)).toEqual(["uppercase", "tracking-wide", "font-semibold"]);
    });

    test("a tap on a row opens that record", () => {
      const onOpenRow = vi.fn();
      render(<RecordTable table={tableOf(three)} onOpenRow={onOpenRow} narrow />);
      fireEvent.click(screen.getByRole("button", { name: /Knit, grey/ }));
      expect(onOpenRow.mock.calls).toEqual([["r2"]]);
    });

    test("loading is a skeleton of list rows", () => {
      render(<RecordTable table={null} loading onOpenRow={() => {}} narrow />);
      expect(screen.getByRole("list").getAttribute("aria-busy")).toBe("true");
      expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(12);
      expect(screen.queryAllByRole("listitem")).toEqual([]);
    });
  });

  // Spec: Kai-Zen's decision of 2026-11-25 on TableView.SameRecords, Mapping.Column: a fact a loaded row holds outside the type's own fields is a column.
  describe("columns that are not fields of the type", () => {
    test("a heading says where its column comes from, and a stored fact's heading says no field describes it", () => {
      // arrange: one record holds a fact under a key no field describes
      const held = [record("r1", "Parka, green", { clothingSize: "L", shelf: "B4" }), record("r2", "Boots", {})];
      // act
      render(<RecordTable table={tableOf(held)} onOpenRow={() => {}} />);
      // assert
      const headings = screen.getAllByRole("columnheader");
      expect(headings.map((h) => h.getAttribute("data-column-source"))).toEqual(["name", "type", "type", "type", "type", "stored"]);
      const stored = headings[5] as HTMLElement;
      expect(stored.textContent).toBe("shelf");
      expect(stored.getAttribute("title")).toBe("shelf: a stored fact that no field describes, shown as stored");
      expect(document.querySelector('[data-row-id="r1"] [data-column-id="stored:shelf"]')?.textContent).toBe("B4");
      expect(document.querySelector('[data-row-id="r2"] [data-column-id="stored:shelf"]')?.textContent).toBe("");
    });
  });

  // Spec: step 1 brief, item 5 (Space opens the card) and Kai-Zen's decision of 2026-11-25 (tester finding F2): "there is always exactly one focusable row among the drawn rows; arrows, PageUp/PageDown, Home/End move it and scroll it into view; Space opens the card from the focused row".
  describe("the keyboard on a long table", () => {
    const many = Array.from({ length: 200 }, (_, i) => record(`m${i}`, `Line ${i}`, { clothingSize: "M" }));
    const tabStops = () => dataRows().filter((r) => r.getAttribute("tabindex") === "0");
    const focused = () => document.activeElement?.getAttribute("data-row-id") ?? null;
    const key = (k: string) => act(() => { fireEvent.keyDown(document.activeElement as HTMLElement, { key: k }); });
    /** A wheel scroll: the box moves and says so. */
    const wheelTo = (top: number) => act(() => { const box = screen.getByRole("grid"); box.scrollTop = top; fireEvent.scroll(box); });

    test("with the open record far down the list, its row is brought into view and is the one Tab stop", async () => {
      // arrange + act: a link that opens on record 150 of 200
      render(<RecordTable table={tableOf(many)} onOpenRow={() => {}} selectedId="m150" />);
      // assert: at every moment one drawn row holds the Tab stop; once the scroll has landed it is the open record's row
      expect(tabStops().length).toBe(1);
      await waitFor(() => expect(tabStops().map((r) => r.getAttribute("data-row-id"))).toEqual(["m150"]));
      expect(screen.getByRole("grid").scrollTop).toBeGreaterThan(3000);
    });

    test("after a wheel scroll with no row focused, the one Tab stop is a row in view", () => {
      render(<RecordTable table={tableOf(many)} onOpenRow={() => {}} />);
      expect(tabStops().map((r) => r.getAttribute("data-row-id"))).toEqual(["m0"]);
      wheelTo(3000);
      const stops = tabStops();
      expect(stops.length).toBe(1);
      // 3000 px down, under a 34 px header, rows of 36 px: the first row in view is row 82 or 83.
      expect(["m82", "m83"]).toContain(stops[0]?.getAttribute("data-row-id"));
    });

    test("Page down three times keeps focus on a row and moves it by three pages; Arrow down then moves one more", () => {
      render(<RecordTable table={tableOf(many)} onOpenRow={() => {}} />);
      (dataRows()[0] as HTMLElement).focus();
      // (600 - 34) / 36 = 15 rows fit; a page is 14.
      key("PageDown");
      expect(focused()).toBe("m14");
      key("PageDown");
      key("PageDown");
      expect(focused()).toBe("m42");
      key("ArrowDown");
      expect(focused()).toBe("m43");
      expect(tabStops().map((r) => r.getAttribute("data-row-id"))).toEqual(["m43"]);
      key("PageUp");
      expect(focused()).toBe("m29");
    });

    test("End moves to the last row and Home to the first, and Space opens the row the keys moved to", () => {
      const onOpenRow = vi.fn();
      render(<RecordTable table={tableOf(many)} onOpenRow={onOpenRow} />);
      (dataRows()[0] as HTMLElement).focus();
      key("End");
      expect(focused()).toBe("m199");
      key(" ");
      expect(onOpenRow.mock.calls).toEqual([["m199"]]);
      key("Home");
      expect(focused()).toBe("m0");
      key("ArrowUp");
      expect(focused()).toBe("m0");
    });

    test("a focused row stays in the page and keeps the Tab stop while the table is scrolled away from it", () => {
      render(<RecordTable table={tableOf(many)} onOpenRow={() => {}} />);
      (dataRows()[2] as HTMLElement).focus();
      wheelTo(5000);
      expect(focused()).toBe("m2");
      expect(tabStops().map((r) => r.getAttribute("data-row-id"))).toEqual(["m2"]);
      // The keys still act from it.
      key("ArrowDown");
      expect(focused()).toBe("m3");
    });
  });

  // Spec: Solution TableView.SameRecords, Mapping.Cell, and Kai-Zen's decision of 2026-11-25 (tester finding F4): "a cell that cannot show all its values says how many more there are ("+4"), and all of them can be reached from the cell (on focus, hover and tap) without opening the card. Nothing is cut silently."
  describe("a cell with several values", () => {
    const six = [record("r1", "Parka, green", { account: ["one", "two", "three", "four", "five", "six"] }), record("r2", "Boots", { account: "only" })];
    const more = () => screen.getByTestId("record-table-more");
    const all = () => screen.queryByRole("group", { name: "All 6 values" });

    test("shows its first value and how many more it holds", () => {
      render(<RecordTable table={tableOf(six)} onOpenRow={() => {}} />);
      const cell = document.querySelector('[data-row-id="r1"] [data-column-id="a:account"]');
      expect(cell?.textContent).toBe("one+5");
      expect(more().getAttribute("aria-label")).toBe("5 more values: show all 6");
    });

    test("a cell with one value has no count", () => {
      render(<RecordTable table={tableOf(six)} onOpenRow={() => {}} />);
      expect(document.querySelector('[data-row-id="r2"] [data-column-id="a:account"]')?.textContent).toBe("only");
      expect(screen.getAllByTestId("record-table-more").length).toBe(1);
    });

    test("focus on the count lists every value, and leaving it puts the list away", () => {
      render(<RecordTable table={tableOf(six)} onOpenRow={() => {}} />);
      expect(all()).toBeNull();
      act(() => more().focus());
      expect([...(all()?.querySelectorAll("li") ?? [])].map((li) => li.textContent)).toEqual(["one", "two", "three", "four", "five", "six"]);
      act(() => more().blur());
      expect(all()).toBeNull();
    });

    test("a mouse pointer over the count lists every value, and leaving puts the list away", async () => {
      render(<RecordTable table={tableOf(six)} onOpenRow={() => {}} />);
      fireEvent.pointerEnter(more(), { pointerType: "mouse" });
      expect(all()?.querySelectorAll("li").length).toBe(6);
      fireEvent.pointerLeave(more(), { pointerType: "mouse" });
      await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
      expect(all()).toBeNull();
    });

    // Spec: Kai-Zen's decision of 2026-11-25 on Agent.Tester round 2, F-N1: "on a touch device the list opens on a tap of the cell or
    // its "+N"; a second tap on the same cell closes it; any scroll of the table closes it; a tap elsewhere closes it and does NOT also
    // open that row's record (the first tap outside only dismisses). Escape and blur close it with a keyboard."
    // ⚠ jsdom has no finger: `tap` sends what a real tap sends, in its order (the press, the focus the press brings, the click). The
    // proof with real touch events is the app's browser proof (GilbApp scripts/measure-sheet.mjs, the phone leg).
    describe("how the list is put away", () => {
      /** What a real tap or mouse click on an element sends, in order. */
      const press = (el: Element, pointerType: "touch" | "mouse") => {
        fireEvent.pointerDown(el, { pointerType });
        // The browser moves focus to a button that is pressed; a press on anything else takes focus away from the button.
        act(() => {
          if (el instanceof HTMLButtonElement) el.focus();
          else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
        fireEvent.pointerUp(el, { pointerType });
        return fireEvent.click(el);
      };
      const tap = (el: Element) => press(el, "touch");
      const cell = () => document.querySelector('[data-row-id="r1"] [data-list-count="6"]') as HTMLElement;

      test("a tap on the count lists every value and does not open the record; a second tap puts the list away", () => {
        const onOpenRow = vi.fn();
        render(<RecordTable table={tableOf(six)} onOpenRow={onOpenRow} />);
        tap(more());
        expect(all()?.querySelectorAll("li").length).toBe(6);
        tap(more());
        expect(all()).toBeNull();
        tap(more());
        expect(all()?.querySelectorAll("li").length).toBe(6);
        expect(onOpenRow).not.toHaveBeenCalled();
      });

      test("a tap on the cell beside the count opens the list too, and a second tap on the same cell puts it away", () => {
        render(<RecordTable table={tableOf(six)} onOpenRow={() => {}} />);
        const firstValue = cell().firstElementChild as HTMLElement;
        tap(firstValue);
        expect(all()?.querySelectorAll("li").length).toBe(6);
        tap(more());
        expect(all()).toBeNull();
      });

      // Spec: Kai-Zen's decision on Agent.Tester round 3, F-R1: "a second tap anywhere on the same cell closes the list ... all six
      // orders of two taps (cell, chip, "+N", cell edge, in any pair on the same cell) end closed, and a third tap opens again."
      // In jsdom the cell and its edge are one target (the cell's own element); the real positions are tapped in the browser proof.
      test("two taps on the same cell, in every order of the count, the value beside it and the cell itself, end closed; a third opens again", () => {
        render(<RecordTable table={tableOf(six)} onOpenRow={() => {}} />);
        const targets: Record<string, () => HTMLElement> = { count: more, value: () => cell().firstElementChild as HTMLElement, cell };
        const seen: string[] = [];
        const wrong: string[] = [];
        for (const a of Object.keys(targets)) {
          for (const b of Object.keys(targets)) {
            tap((targets[a] as () => HTMLElement)());
            const first = all() !== null;
            tap((targets[b] as () => HTMLElement)());
            const second = all() !== null;
            tap((targets[a] as () => HTMLElement)());
            const third = all() !== null;
            // Put it away for the next order, by the same cell.
            tap((targets[b] as () => HTMLElement)());
            const fourth = all() !== null;
            seen.push(`${a} then ${b}`);
            if (!first || second || !third || fourth) wrong.push(`${a} then ${b}: ${[first, second, third, fourth].map((o) => (o ? "open" : "closed")).join(", ")}`);
          }
        }
        expect(seen.length).toBe(9);
        expect(wrong).toEqual([]);
      });

      test("the same orders with a mouse end closed once the pointer has left the count", () => {
        render(<RecordTable table={tableOf(six)} onOpenRow={() => {}} />);
        press(more(), "mouse");
        expect(all()).not.toBeNull();
        press(cell().firstElementChild as HTMLElement, "mouse");
        expect(all()).toBeNull();
      });

      // Agent.Tester round 3, F-R4: opened from the value (so the count never had the focus, and no blur helps), then a press elsewhere.
      test("a list opened from the value beside the count is put away by a press elsewhere: a finger's is held back, a mouse's is delivered", () => {
        const onOpenRow = vi.fn();
        render(<RecordTable table={tableOf(six)} onOpenRow={onOpenRow} />);
        const elsewhere = screen.getByRole("button", { name: "Open Boots" });
        // a finger
        tap(cell().firstElementChild as HTMLElement);
        expect(all()).not.toBeNull();
        expect(document.activeElement).not.toBe(more());
        expect(tap(elsewhere)).toBe(false);
        expect(all()).toBeNull();
        expect(onOpenRow).not.toHaveBeenCalled();
        // a mouse
        press(cell().firstElementChild as HTMLElement, "mouse");
        expect(all()).not.toBeNull();
        press(elsewhere, "mouse");
        expect(all()).toBeNull();
        expect(onOpenRow).toHaveBeenCalledWith("r2");
      });

      test("a hover that a browser makes up after a touch does not hold the list open", () => {
        render(<RecordTable table={tableOf(six)} onOpenRow={() => {}} />);
        fireEvent.pointerEnter(more(), { pointerType: "touch" });
        expect(all()).toBeNull();
      });

      test("a scroll of the table puts the list away, after a tap and after keyboard focus, though the button keeps focus", () => {
        render(<RecordTable table={tableOf(six)} onOpenRow={() => {}} />);
        tap(more());
        expect(all()).not.toBeNull();
        fireEvent.scroll(screen.getByRole("grid"));
        expect(all()).toBeNull();
        // The keyboard: focus opens it, a scroll puts it away, and the focus has not moved.
        act(() => more().blur());
        act(() => more().focus());
        expect(all()).not.toBeNull();
        fireEvent.scroll(screen.getByRole("grid"));
        expect(all()).toBeNull();
        expect(document.activeElement).toBe(more());
      });

      test("a scroll inside the list, and a press on it, do not put it away", () => {
        render(<RecordTable table={tableOf(six)} onOpenRow={() => {}} />);
        tap(more());
        const list = all() as HTMLElement;
        fireEvent.scroll(list);
        fireEvent.pointerDown(list.querySelector("li") as Element, { pointerType: "touch" });
        act(() => more().blur());
        expect(all()).not.toBeNull();
      });

      test("on a narrow screen a finger's tap elsewhere only puts the list away: the row under it does not open, and the next tap does", () => {
        // arrange
        const onOpenRow = vi.fn();
        const two = [record("r1", "Parka, green", { approvedPostPicture: [{ "@id": `${VAULT}/base/e/p1` }, { "@id": `${VAULT}/base/e/p2` }] }), record("r2", "Boots", {})];
        render(<RecordTable table={tableOf(two)} onOpenRow={onOpenRow} narrow />);
        const all = () => screen.queryByRole("group", { name: "All 2 values" });
        const otherRow = document.querySelector('button[data-row-id="r2"]') as HTMLElement;
        tap(more());
        expect(all()).not.toBeNull();
        // act: the first tap outside
        const delivered = tap(otherRow);
        // assert: the list is away, and that tap's click reached nobody
        expect(all()).toBeNull();
        expect(delivered).toBe(false);
        expect(onOpenRow).not.toHaveBeenCalled();
        // The next tap is an ordinary one.
        tap(otherRow);
        expect(onOpenRow).toHaveBeenCalledWith("r2");
      });

      test("a mouse press elsewhere puts the list away, and its click is delivered", () => {
        const onOpenRow = vi.fn();
        render(<RecordTable table={tableOf(six)} onOpenRow={onOpenRow} />);
        press(more(), "mouse");
        expect(all()).not.toBeNull();
        press(screen.getByRole("button", { name: "Open Boots" }), "mouse");
        expect(all()).toBeNull();
        expect(onOpenRow).toHaveBeenCalledWith("r2");
      });

      test("with a keyboard, Escape puts the list away, and so does the focus leaving after Enter pinned it", () => {
        const onOpenRow = vi.fn();
        render(<RecordTable table={tableOf(six)} onOpenRow={onOpenRow} />);
        act(() => more().focus());
        fireEvent.keyDown(more(), { key: "Escape" });
        expect(all()).toBeNull();
        // Enter on the button clicks it (the browser's own act): the list is pinned open, and the row is not opened by the key.
        fireEvent.keyDown(more(), { key: "Enter" });
        fireEvent.click(more());
        expect(all()).not.toBeNull();
        act(() => more().blur());
        expect(all()).toBeNull();
        fireEvent.keyDown(more(), { key: " " });
        expect(onOpenRow).not.toHaveBeenCalled();
      });
    });

    test("the count takes a Tab stop in the row that holds the row Tab stop, and in no other", () => {
      const both = [record("r1", "One", { account: ["a", "b"] }), record("r2", "Two", { account: ["c", "d"] })];
      render(<RecordTable table={tableOf(both)} onOpenRow={() => {}} />);
      expect(screen.getAllByTestId("record-table-more").map((b) => b.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    });

    // Tester round 2, F-N7: the chip stays its size; the line it is on is 44 px high, so the row is taller by 24 px for each such line.
    test("on a narrow screen a row with a many-valued cell is 24 px taller, so a finger has 44 px on that cell", () => {
      const two = [record("r1", "Parka, green", { approvedPostPicture: [{ "@id": `${VAULT}/base/e/p1` }, { "@id": `${VAULT}/base/e/p2` }] }), record("r2", "Boots", { approvedPostPicture: { "@id": `${VAULT}/base/e/p1` } })];
      render(<RecordTable table={tableOf(two)} onOpenRow={() => {}} narrow />);
      const heights = screen.getAllByRole("listitem").map((li) => parseInt((li as HTMLElement).style.height, 10));
      expect((heights[0] as number) - (heights[1] as number)).toBe(24);
      expect(document.querySelector('[data-list-count="2"]')?.className).toContain("min-h-[44px]");
    });

    test("on a narrow screen a tap on the count lists the values and does not open the record", () => {
      const onOpenRow = vi.fn();
      const first = [record("r1", "Parka, green", { approvedPostPicture: [{ "@id": `${VAULT}/base/e/p1` }, { "@id": `${VAULT}/base/e/p2` }] })];
      render(<RecordTable table={tableOf(first)} onOpenRow={onOpenRow} narrow renderRef={(ref) => <b>name of {ref.id}</b>} />);
      expect(more().textContent).toBe("+1");
      fireEvent.click(more());
      expect([...(screen.getByRole("group", { name: "All 2 values" }).querySelectorAll("li"))].map((li) => li.textContent)).toEqual(["name of p1", "name of p2"]);
      expect(onOpenRow).not.toHaveBeenCalled();
    });
  });

  // Internal edge case (tester finding F13): tied to no spec item.
  describe("a very long value", () => {
    test("is in the page once: in its cell, not again in a tooltip", () => {
      const long = "x".repeat(20_000);
      render(<RecordTable table={tableOf([record("r1", "Long", { clothingSize: long })])} onOpenRow={() => {}} />);
      const cell = document.querySelector('[data-row-id="r1"] [data-column-id="a:clothingSize"]') as HTMLElement;
      expect(cell.textContent).toBe(long);
      expect(cell.outerHTML.split(long).length - 1).toBe(1);
    });

    test("a short value keeps its tooltip", () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} />);
      expect(document.querySelector('[data-row-id="r1"] [data-column-id="a:clothingSize"] span')?.getAttribute("title")).toBe("L");
    });
  });

  // Spec: Contrast WCAG-AA is measured in a browser; this is the rest of the accessibility rules a page can be checked for without layout (RuleA11yUnitTest).
  describe("accessibility rules", () => {
    const violations = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.length}`);

    test("the grid breaks none", async () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} selectedId="r2" label="Garment stock lines" />);
      expect(await violations()).toEqual([]);
    });

    test("the list on a narrow screen breaks none", async () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} narrow label="Garment stock lines" />);
      expect(await violations()).toEqual([]);
    });

    test("the list of all values breaks none", async () => {
      const six = [record("r1", "Parka, green", { account: ["one", "two", "three"] })];
      render(<RecordTable table={tableOf(six)} onOpenRow={() => {}} />);
      act(() => screen.getByTestId("record-table-more").focus());
      expect(await violations()).toEqual([]);
    });
  });
});
