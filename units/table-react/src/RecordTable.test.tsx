// Spec: Solution TableView.SameRecords, Read.Grid ("the grid is virtualized"), OneDataSet.Pane ("opening a row shows the existing card"),
// and the step 1 brief's table-react items: Name is the first column and always frozen; loading shows a skeleton of the header and rows
// in the real layout; an empty table shows the column headers only; link cells are drawn by the host; Space, or the button at the left
// of the row, opens the record; below the breakpoint a list of rows, each with Name and the first 2 to 3 columns, and a tap opens.
//
// The table is built by table-core from fields the field reader derives from term documents cut down from the live master's
// (veda.gilb.com, GET /base/vocab?status=all&carries=a:fieldOf, 2026-11-25; an example.test host). jsdom lays nothing out, so the
// viewport's size is given to it below; what a browser paints (the frozen column staying in place) is proved in a browser, not here.
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  // jsdom has no layout: give every element the size of a desktop viewport, so the rows in view can be worked out.
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1000 });
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
      expect(cellsOf("r1").map((c) => c.textContent)).toEqual(["", "L", "Yes", "xy"]);
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
    test("is a list of rows, each with its Name and the first three field columns, and no grid", () => {
      render(<RecordTable table={tableOf(three)} onOpenRow={() => {}} narrow label="Garment stock lines" />);
      expect(screen.queryByRole("grid")).toBeNull();
      expect(screen.getByTestId("record-table").getAttribute("data-layout")).toBe("list");
      const items = screen.getAllByRole("listitem");
      expect(items.length).toBe(3);
      const first = within(items[0] as HTMLElement);
      expect(first.getByText("Parka, green")).toBeTruthy();
      expect([...(items[0] as HTMLElement).querySelectorAll("[data-column-id]")].map((e) => e.getAttribute("data-column-id"))).toEqual([
        "a:approvedPostPicture",
        "a:clothingSize",
        "a:madeForKids",
      ]);
      expect((items[0] as HTMLElement).textContent).toBe("Parka, greenapproved post pictureclothing sizeLmade for kidsYes");
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
});
