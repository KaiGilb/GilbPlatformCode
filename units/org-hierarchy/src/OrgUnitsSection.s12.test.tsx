// The Units group is a SHORT list like Employees: 10 rows, the honest count, a search over the units loaded, "Show all N units" on a sheet with paging, and a unit's employment count asked LAZILY and ONLY
// for the ten rows of the card (never for a row of the sheet, never for a row beyond the ten). The reader is replaced by what one viewer's read returned.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const unitsPage = vi.hoisted(() => vi.fn());
const unitCount = vi.hoisted(() => vi.fn());
vi.mock("./orgUnits", () => ({ readOrgUnitsPage: unitsPage, readUnitEmployments: unitCount, UNITS_PAGE: 50 }));

// eslint-disable-next-line import/first
import { OrgUnitsSection } from "./OrgHierarchySections";
// eslint-disable-next-line import/first
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
// eslint-disable-next-line import/first
import { Hosts } from "../test/fakeHost";
// eslint-disable-next-line import/first
import { turns, virtualTimers } from "../test/timing";
// eslint-disable-next-line import/first
import { SEARCH_DEBOUNCE_MS } from "@kaigilb/gilbplatformcode-org-employees";

const VAULT = "https://v.example.test/base";
const e = (id: string) => `${VAULT}/e/${id}`;
const unit = (i: number) => ({ uri: e(`u${i}`), id: `u${i}`, name: `Unit${String(i).padStart(4, "0")}`, logo: null });
const units = (from: number, n: number) => Array.from({ length: n }, (_, i) => unit(from + i));
const page = (over: Record<string, unknown>) => ({ units: [], total: 0, counts: [0, 0], nextOffset: null, notListed: 0, ...over });

function bigReader(total: number) {
  unitsPage.mockImplementation(async (...a: unknown[]) => {
    const p = (a[2] ?? {}) as { offset?: number; limit?: number };
    const at = p.offset ?? 0;
    const n = Math.min(p.limit ?? 50, total - at);
    return page({ units: units(at, n), total, nextOffset: at + n < total ? at + n : null });
  });
}
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpen = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <CardModeProvider canEdit>
        <Hosts>
          <OrgUnitsSection orgUri={e("hq")} vaultId={VAULT} onOpen={onOpen} />
        </Hosts>
      </CardModeProvider>
    </QueryClientProvider>,
  );
  return { onOpen };
}
const type = (box: HTMLElement, v: string) => fireEvent.change(box, { target: { value: v } });
const clock = virtualTimers();
beforeEach(() => clock.install());
afterEach(() => clock.uninstall());
const settle = () => act(async () => { clock.advance(SEARCH_DEBOUNCE_MS + 60); await turns(); });

beforeEach(() => {
  unitsPage.mockReset();
  unitCount.mockReset();
  unitCount.mockImplementation(async (uri: string) => Number(uri.split("/").pop()!.slice(1)) % 5);
});
afterEach(() => cleanup());

describe("the short list of units", () => {
  it("asks for 10 on opening, not 50", async () => {
    bigReader(200);
    mount();
    await waitFor(() => expect(unitsPage).toHaveBeenCalledTimes(1));
    expect(unitsPage.mock.calls[0]![2]).toEqual({ offset: 0, limit: 10 });
  });
  it("shows 10 rows of 200, the honest count, the search box and 'Show all 200 units'", async () => {
    bigReader(200);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-unit")).toHaveLength(10));
    expect(screen.getByTestId("org-units-count").textContent).toBe("10 units shown of 200");
    expect(screen.getByTestId("org-units-search").getAttribute("aria-label")).toBe("Search units");
    expect(screen.getByTestId("org-units-showall").textContent).toBe("Show all 200 units");
    expect(screen.queryByTestId("org-units-more")).toBeNull();
  });
  it("10 or fewer units and nothing more: no search box and no Show all", async () => {
    unitsPage.mockResolvedValue(page({ units: units(0, 7), total: 7 }));
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-unit")).toHaveLength(7));
    expect(screen.queryByTestId("org-units-search")).toBeNull();
    expect(screen.queryByTestId("org-units-showall")).toBeNull();
  });
  it("a tap on a row opens that unit", async () => {
    bigReader(40);
    const { onOpen } = mount();
    await waitFor(() => expect(screen.getAllByTestId("org-unit")).toHaveLength(10));
    await userEvent.click(screen.getAllByTestId("org-unit")[4]!);
    expect(onOpen).toHaveBeenCalledWith("u4");
  });
});

describe("a unit's employment count is lazy and only for the ten rows of the card", () => {
  it("the rows are drawn before any count has come back, and each count appears when it arrives", async () => {
    let release: (n: number) => void = () => undefined;
    unitCount.mockImplementation(() => new Promise<number>((r) => { release = r; }));
    bigReader(200);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-unit")).toHaveLength(10));
    expect(screen.queryAllByTestId("org-unit-count")).toHaveLength(0);
    expect(screen.getAllByTestId("org-unit-name")[0]!.textContent).toBe("Unit0000");
    await act(async () => { release(3); });
    await waitFor(() => expect(screen.getAllByTestId("org-unit-count").length).toBeGreaterThan(0));
    expect(screen.getAllByTestId("org-unit-count")[0]!.textContent).toBe("3 employments");
  });
  it("200 units: exactly ten count reads on opening", async () => {
    bigReader(200);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-unit-count")).toHaveLength(10)); // a real 0 is shown as "0 employments"
    await waitFor(() => expect(unitCount).toHaveBeenCalledTimes(10));
    expect(unitCount.mock.calls.map((c) => (c[0] as string).split("/").pop())).toEqual(Array.from({ length: 10 }, (_, i) => `u${i}`));
  });
  it("Show all and Show more make NO new count read, and the sheet's rows carry no count", async () => {
    bigReader(200);
    mount();
    await waitFor(() => expect(unitCount).toHaveBeenCalledTimes(10));
    await userEvent.click(screen.getByTestId("org-units-showall"));
    const sheet = await screen.findByTestId("org-units-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-unit")).toHaveLength(60));
    await userEvent.click(within(sheet).getByTestId("org-units-more"));
    await waitFor(() => expect(within(sheet).getAllByTestId("org-unit")).toHaveLength(110));
    expect(unitCount).toHaveBeenCalledTimes(10);
    expect(within(sheet).queryAllByTestId("org-unit-count")).toHaveLength(0);
  });
  it("a count that could not be read is simply not shown (never 0)", async () => {
    unitCount.mockResolvedValue(null);
    bigReader(30);
    mount();
    await waitFor(() => expect(unitCount).toHaveBeenCalledTimes(10));
    await turns();
    expect(screen.queryAllByTestId("org-unit-count")).toHaveLength(0);
  });
  it("a search that brings other rows into the ten reads only those, once each (cached)", async () => {
    bigReader(30);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-unit")).toHaveLength(10));
    await waitFor(() => expect(unitCount).toHaveBeenCalledTimes(10));
    // first page = 10 loaded only: a search can only show those, so no new reads
    type(screen.getByTestId("org-units-search"), "Unit0003");
    await settle();
    expect(screen.getAllByTestId("org-unit")).toHaveLength(1);
    expect(unitCount).toHaveBeenCalledTimes(10);
  });
});

describe("the search over the units loaded", () => {
  it("filters after the pause and makes no request while typing, and says what it searched", async () => {
    bigReader(200);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-unit")).toHaveLength(10));
    const reads = unitsPage.mock.calls.length;
    const counts = unitCount.mock.calls.length;
    type(screen.getByTestId("org-units-search"), "Unit0005");
    expect(screen.getAllByTestId("org-unit")).toHaveLength(10);
    expect(screen.getByTestId("org-units-scope").textContent).toBe("Searching the 10 units loaded, not everyone. Show all to load more.");
    await settle();
    expect(screen.getAllByTestId("org-unit-name").map((n) => n.textContent)).toEqual(["Unit0005"]);
    expect(unitsPage.mock.calls.length).toBe(reads);
    expect(unitCount.mock.calls.length).toBe(counts);
  });
  it("a name not among the loaded says so without a claim about everyone", async () => {
    bigReader(200);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-unit")).toHaveLength(10));
    type(screen.getByTestId("org-units-search"), "zzz");
    await settle();
    expect(screen.getByTestId("org-units-nomatch").textContent).toBe("No one among the 10 units loaded matches. Show all to load more.");
  });
  it("in the sheet: its own box, the sentence for the list, Show more, and nothing per keystroke", async () => {
    bigReader(200);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-unit")).toHaveLength(10));
    await userEvent.click(screen.getByTestId("org-units-showall"));
    const sheet = await screen.findByTestId("org-units-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-unit")).toHaveLength(60));
    expect(within(sheet).getByRole("heading", { name: "Units" })).toBeTruthy();
    expect(within(sheet).getByTestId("org-units-sheet-count").textContent).toBe("60 units shown of 200");
    const calls = unitsPage.mock.calls.length;
    type(within(sheet).getByTestId("org-units-sheet-search"), "Unit0042");
    expect(within(sheet).getByTestId("org-units-sheet-scope").textContent).toBe("Searching the 60 units loaded, not everyone. Show more loads the next 50.");
    await settle();
    expect(within(sheet).getAllByTestId("org-unit-name").map((n) => n.textContent)).toEqual(["Unit0042"]);
    expect(unitsPage.mock.calls.length).toBe(calls);
  });
  it("a tap on a unit in the sheet opens it, closes the sheet, and the card is the entry before it", async () => {
    bigReader(200);
    const { onOpen } = mount();
    await waitFor(() => expect(screen.getAllByTestId("org-unit")).toHaveLength(10));
    await userEvent.click(screen.getByTestId("org-units-showall"));
    const sheet = await screen.findByTestId("org-units-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-unit")).toHaveLength(60));
    await userEvent.click(within(sheet).getAllByTestId("org-unit")[33]!);
    expect(screen.queryByTestId("org-units-sheet")).toBeNull();
    // the sheet's history entry is removed first, the unit opens right after (the 400 ms fallback of the history hook, run on the test clock)
    await act(async () => { clock.advance(400); await turns(); });
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("u33"));
    expect(window.history.state?.gilbSheet).toBeFalsy();
  });
  it("the sheet is a history entry: the system Back closes only the sheet", async () => {
    bigReader(200);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-unit")).toHaveLength(10));
    await userEvent.click(screen.getByTestId("org-units-showall"));
    await screen.findByTestId("org-units-sheet");
    expect(window.history.state?.gilbSheet).toBe(true);
    await act(async () => { window.history.back(); });
    await waitFor(() => expect(screen.queryByTestId("org-units-sheet")).toBeNull());
    expect(document.activeElement).toBe(screen.getByTestId("org-units-showall"));
  });
});

describe("the count and the rows stay honest (one unit under two address spellings)", () => {
  it("more units shown than the first page's total says the number shown, never 'N shown of fewer'", async () => {
    unitsPage.mockResolvedValue(page({ units: units(0, 3), total: 1, nextOffset: 10 }));
    mount();
    expect((await screen.findByTestId("org-units-count")).textContent).toBe("3 units shown of 3");
  });
  it("a unit read under both address spellings (on two pages) is one row", async () => {
    unitsPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number };
      return (p.offset ?? 0) === 0
        ? page({ units: [{ uri: e("u1"), id: "u1", name: "Same Unit", logo: null }], total: 60, nextOffset: 10 })
        : page({ units: [{ uri: "https://v.example.test/vault/e/u1", id: "u1", name: "Same Unit", logo: null }], total: 60 });
    });
    mount();
    await userEvent.click(await screen.findByTestId("org-units-showall"));
    const sheet = await screen.findByTestId("org-units-sheet");
    await waitFor(() => expect(unitsPage).toHaveBeenCalledTimes(2));
    await turns();
    expect(within(sheet).getAllByTestId("org-unit")).toHaveLength(1);
  });
});

describe("the units of a reader whose first page lists none", () => {
  it("keeps the group, the plain sentence and 'Show all 120 units', with no search box over nobody", async () => {
    unitsPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number };
      return (p.offset ?? 0) === 0 ? page({ total: 120, nextOffset: 10, notListed: 10 }) : page({ units: [unit(7)], total: 120, notListed: 10 });
    });
    mount();
    await screen.findByTestId("org-units-showall");
    expect(screen.queryByTestId("org-units-search")).toBeNull();
    const t = screen.getByTestId("org-units-truncated").textContent!;
    expect(t).toMatch(/none of the units read so far could be shown to you/i);
    expect(t).not.toMatch(/\d/);
    expect(screen.getByTestId("org-units-showall").textContent).toBe("Show all 120 units");
  });
});

describe("Units: the sheet's layer, no request while typing, the card's count", () => {
  const zOf = (el: Element | null): number => {
    const m = /(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?:\s|$)/.exec(el?.getAttribute("class") ?? "");
    return m ? Number(m[1] ?? m[2]) : 0;
  };
  it("the units sheet stacks at layer 70, on the body", async () => {
    bigReader(200);
    mount();
    await userEvent.click(await screen.findByTestId("org-units-showall"));
    const sheet = await screen.findByTestId("org-units-sheet");
    expect(zOf(sheet)).toBe(70);
    expect(sheet.parentElement).toBe(document.body);
  });
  it("typing makes ZERO requests even after the list has read more units: a unit outside the first ten loaded is shown with no count and none is read", async () => {
    bigReader(200);
    mount();
    await waitFor(() => expect(unitCount).toHaveBeenCalledTimes(10));
    await userEvent.click(screen.getByTestId("org-units-showall"));
    const sheet = await screen.findByTestId("org-units-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-unit")).toHaveLength(60));
    await userEvent.click(screen.getByTestId("org-units-sheet-back"));
    await waitFor(() => expect(screen.queryByTestId("org-units-sheet")).toBeNull());
    const pages = unitsPage.mock.calls.length;
    const counts = unitCount.mock.calls.length;
    expect(counts).toBe(10);
    type(screen.getByTestId("org-units-search"), "Unit003");
    await settle();
    expect(screen.getAllByTestId("org-unit").length).toBeGreaterThan(1);
    expect(screen.queryAllByTestId("org-unit-count")).toHaveLength(0);
    expect(unitCount.mock.calls.length).toBe(counts);
    expect(unitsPage.mock.calls.length).toBe(pages);
    // and the unit that IS among the first ten still shows its (cached) count
    type(screen.getByTestId("org-units-search"), "Unit0003");
    await settle();
    expect(screen.getAllByTestId("org-unit-count")).toHaveLength(1);
    expect(unitCount.mock.calls.length).toBe(counts);
  });
  it("the card's count is of the rows it draws once the list has read more", async () => {
    bigReader(12);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-unit")).toHaveLength(10));
    expect(screen.getByTestId("org-units-count").textContent).toBe("10 units shown of 12");
    await userEvent.click(screen.getByTestId("org-units-showall"));
    const sheet = await screen.findByTestId("org-units-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-unit")).toHaveLength(12));
    await userEvent.click(screen.getByTestId("org-units-sheet-back"));
    await waitFor(() => expect(screen.queryByTestId("org-units-sheet")).toBeNull());
    expect(screen.getByTestId("org-units-count").textContent).toBe("10 of 12 units shown");
    expect(screen.queryByTestId("org-units-matchcount")).toBeNull();
  });
  it("while the next page is read a search with no hit says it is still reading", async () => {
    let release: () => void = () => undefined;
    unitsPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number };
      if ((p.offset ?? 0) === 0) return page({ units: units(0, 10), total: 100, nextOffset: 10 });
      await new Promise<void>((r) => { release = r; });
      return page({ units: units(10, 50), total: 100, nextOffset: 60 });
    });
    mount();
    await userEvent.click(await screen.findByTestId("org-units-showall"));
    const sheet = await screen.findByTestId("org-units-sheet");
    type(within(sheet).getByTestId("org-units-sheet-search"), "zzz");
    await settle();
    expect(within(sheet).getByTestId("org-units-loading").textContent).toBe("Still reading the next 50. No one among the 10 units loaded matches yet.");
    expect(within(sheet).queryByTestId("org-units-nomatch")).toBeNull();
    await act(async () => { release(); });
    await waitFor(() => expect(within(sheet).getByTestId("org-units-nomatch")).toBeTruthy());
  });
});
