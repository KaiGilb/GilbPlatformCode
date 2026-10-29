// Cycle214 s12 iteration 4 — the Employees group as a SHORT list with a search and 'Show all N' (Kai 2026-10-16, hands-on, verbatim:
// "what happens if an org has 1000 employees, does it turn into a search? We can not have a list of hundreds").
// The reader is replaced by what one viewer's read returned (its own suites prove what each reader may see). What is proved here:
//   · the card asks for 10 first, shows at most 10, and never a long list inline;
//   · a search box once there are more than 10; typing filters what is LOADED, after a pause, with ZERO requests, and says what it searched;
//   · a search never names, counts or hints at a person the reader was not given;
//   · 'Show all N' opens the full list on its own sheet (search at the top, paged by 'Show more', Back/Escape returns, focus returns).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const readPage = vi.hoisted(() => vi.fn());
vi.mock("./orgEmployees", () => ({ readOrgEmployeesPage: (_host: unknown, ...rest: unknown[]) => readPage(...rest), EMPLOYEES_PAGE: 50 }));

// eslint-disable-next-line import/first
import { OrgEmployeesSection } from "./OrgEmployeesSection";
// eslint-disable-next-line import/first
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
// eslint-disable-next-line import/first
import { OrgEmployeesHostContext } from "./orgEmployeesHost";
// eslint-disable-next-line import/first
import { fakeHost } from "../test/fakeHost";
// eslint-disable-next-line import/first
import { turns, virtualTimers } from "../test/timing";
// eslint-disable-next-line import/first
import { SEARCH_DEBOUNCE_MS } from "./orgEmployeeSearch";

const ORG = "https://v.example.test/base/e/org1";
const VAULT = "https://v.example.test/base";
const person = (id: string, name: string, titles: string[] = []) => ({ person: `${VAULT}/e/${id}`, id, name, titles, photoRef: null });
const many = (from: number, n: number, surname = "Person") => Array.from({ length: n }, (_, i) => person(`p${from + i}`, `Emp${String(from + i).padStart(4, "0")} ${surname}`));
const page = (over: Record<string, unknown>) => ({ employees: [], total: 0, memberTotal: 0, nextOffset: null, nextMemberOffset: null, notListed: 0, ...over });

/** A reader that answers like the real one: the first page 10 records, then the default 50, over `total` records. */
function bigReader(total: number, opts: { notListed?: number } = {}) {
  readPage.mockImplementation(async (...a: unknown[]) => {
    const p = (a[2] ?? {}) as { offset?: number | null; limit?: number };
    const at = p.offset ?? 0;
    const n = Math.min(p.limit ?? 50, total - at);
    const next = at + n < total ? at + n : null;
    return page({ employees: many(at, n), total, nextOffset: next, notListed: opts.notListed ?? 0 });
  });
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpen = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <OrgEmployeesHostContext.Provider value={fakeHost()}>
      <CardModeProvider canEdit>
        <OrgEmployeesSection orgUri={ORG} vaultId={VAULT} onOpen={onOpen} />
      </CardModeProvider>
      </OrgEmployeesHostContext.Provider>
    </QueryClientProvider>,
  );
  return { onOpen };
}
const clock = virtualTimers();
beforeEach(() => clock.install());
afterEach(() => clock.uninstall());
const type = (box: HTMLElement, v: string) => fireEvent.change(box, { target: { value: v } });
const settle = () => act(async () => { clock.advance(SEARCH_DEBOUNCE_MS + 60); await turns(); });

beforeEach(() => readPage.mockReset());
afterEach(() => cleanup());

describe("the short list", () => {
  it("asks for 10 on opening, not 50", async () => {
    bigReader(1000);
    mount();
    await screen.findByTestId("org-employees-section");
    await waitFor(() => expect(readPage).toHaveBeenCalledTimes(1));
    expect(readPage.mock.calls[0]![2]).toEqual({ limit: 10 });
  });
  it("shows 10 rows of 1,000, the honest count, the search box and 'Show all 1,000 records'", async () => {
    bigReader(1000);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    expect(screen.getByTestId("org-employees-count").textContent).toBe("10 people shown of 1,000 records");
    expect(screen.getByTestId("org-employees-search")).toBeTruthy();
    expect(screen.getByTestId("org-employees-showall").textContent).toBe("Show all 1,000 records");
    expect(screen.queryByTestId("org-employees-more")).toBeNull();
  });
  it("never more than 10 rows inline even when more are loaded", async () => {
    readPage.mockResolvedValue(page({ employees: many(0, 14), total: 14 }));
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    expect(screen.getByTestId("org-employees-showall").textContent).toBe("Show all 14 people");
    expect(screen.getByTestId("org-employees-count").textContent).toBe("10 of 14 people shown");
  });
  it("10 or fewer people and nothing more: no search box and no Show all (a short list needs neither)", async () => {
    readPage.mockResolvedValue(page({ employees: many(0, 7), total: 7 }));
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(7));
    expect(screen.queryByTestId("org-employees-search")).toBeNull();
    expect(screen.queryByTestId("org-employees-showall")).toBeNull();
  });
  it("exactly 10 people and nothing more still has neither", async () => {
    readPage.mockResolvedValue(page({ employees: many(0, 10), total: 10 }));
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    expect(screen.queryByTestId("org-employees-search")).toBeNull();
    expect(screen.queryByTestId("org-employees-showall")).toBeNull();
  });
  it("a tap on a row opens that person", async () => {
    bigReader(40);
    const { onOpen } = mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    await userEvent.click(screen.getAllByTestId("org-employee")[2]!);
    expect(onOpen).toHaveBeenCalledWith("p2");
  });
});

describe("a reader whose first page lists nobody (every record names a person they may not read)", () => {
  const trap = async (...a: unknown[]) => {
    const p = (a[2] ?? {}) as { offset?: number | null };
    return (p.offset ?? 0) === 0
      ? page({ employees: [], total: 300, nextOffset: 10, notListed: 10 })
      : page({ employees: [person("late", "Late Reader")], total: 300, nextOffset: null, notListed: 0 });
  };
  it("the card has no search box over nobody, but 'Show all 300' is there and says nothing of who was left out", async () => {
    readPage.mockImplementation(trap);
    mount();
    await screen.findByTestId("org-employees-showall");
    expect(screen.queryByTestId("org-employees-search")).toBeNull();
    expect(screen.getByTestId("org-employees-showall").textContent).toBe("Show all 300 records");
    expect(screen.getByTestId("org-employees-count").textContent).toBe("0 people shown of 300 records");
  });
  it("the sheet has its own box and reaches the one readable person; a search finds only that person", async () => {
    readPage.mockImplementation(trap);
    mount();
    await userEvent.click(await screen.findByTestId("org-employees-showall"));
    const sheet = await screen.findByTestId("org-employees-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(1));
    type(within(sheet).getByTestId("org-employees-sheet-search"), "late");
    await settle();
    expect(within(sheet).getAllByTestId("org-employee-name").map((n) => n.textContent)).toEqual(["Late Reader"]);
  });
});

describe("the search on the card", () => {
  it("filters only after the pause, and makes no request while typing", async () => {
    bigReader(1000);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    const box = screen.getByTestId("org-employees-search");
    const calls = readPage.mock.calls.length;
    type(box, "Emp0003");
    // before the pause: the list is still the whole short list (a filter on every key would already have narrowed it)
    expect(screen.getAllByTestId("org-employee")).toHaveLength(10);
    await settle();
    expect(screen.getAllByTestId("org-employee")).toHaveLength(1);
    expect(screen.getByTestId("org-employee-name").textContent).toBe("Emp0003 Person");
    expect(readPage.mock.calls.length).toBe(calls);
  });
  it("many keystrokes in a row filter once, to the last word, with zero requests", async () => {
    bigReader(1000);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    const box = screen.getByTestId("org-employees-search");
    const calls = readPage.mock.calls.length;
    for (const v of ["E", "Em", "Emp", "Emp0", "Emp00", "Emp000", "Emp0005"]) type(box, v);
    await settle();
    expect(screen.getAllByTestId("org-employee").map((n) => n.textContent)).toHaveLength(1);
    expect(readPage.mock.calls.length).toBe(calls);
  });
  it("says it searched the people loaded, not everyone, and points at Show all", async () => {
    bigReader(1000);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    type(screen.getByTestId("org-employees-search"), "emp");
    expect(screen.getByTestId("org-employees-scope").textContent).toBe("Searching the 10 people loaded, not everyone. Show all to load more.");
    expect(screen.getByTestId("org-employees-scope").textContent).not.toMatch(/searching all/i);
  });
  it("a name that is not among the loaded says so without any claim about everyone, and offers Show all", async () => {
    bigReader(1000);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    type(screen.getByTestId("org-employees-search"), "zzz");
    await settle();
    const none = screen.getByTestId("org-employees-nomatch");
    expect(none.textContent).toMatch(/No one among the 10 people loaded matches/);
    expect(none.textContent).toMatch(/Show all/);
    expect(none.textContent).not.toMatch(/there is no|nobody (here )?is named/i);
    expect(screen.queryAllByTestId("org-employee")).toHaveLength(0);
  });
  it("when everything is loaded the sentence says all, and no more is offered", async () => {
    readPage.mockResolvedValue(page({ employees: many(0, 12), total: 12 }));
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    type(screen.getByTestId("org-employees-search"), "emp");
    expect(screen.getByTestId("org-employees-scope").textContent).toBe("Searching the 12 people here.");
  });
  it("🔴 a search never shows, counts or hints at a person the reader was not given", async () => {
    // the reader dropped 7 records it could not show (a person this viewer may not read); the card must not carry that into a search
    readPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number | null };
      return (p.offset ?? 0) === 0
        ? page({ employees: [person("a", "Ann Visible"), person("b", "Bo Visible")], total: 300, nextOffset: 10, notListed: 7 })
        : page({ employees: [], total: 300, nextOffset: null, notListed: 0 });
    });
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(2));
    const box = screen.getByTestId("org-employees-search");
    type(box, "secret");
    await settle();
    const section = screen.getByTestId("org-employees-section");
    expect(within(section).queryAllByTestId("org-employee")).toHaveLength(0);
    // nothing about the 7 anywhere in the search's words (no digit but the loaded count, no "hidden" / "private" / "may not see")
    // exactly what was searched (the 2 people given), no more and no less: a mutant that adds the 7 left out to the loaded number says "9"
    expect(screen.getByTestId("org-employees-scope").textContent).toBe("Searching the 2 people loaded, not everyone. Show all to load more.");
    expect(screen.getByTestId("org-employees-nomatch").textContent).toBe("No one among the 2 people loaded matches. Show all to load more.");
    const words = [screen.getByTestId("org-employees-scope").textContent, screen.getByTestId("org-employees-nomatch").textContent].join(" ");
    expect(words).not.toMatch(/\b7\b/);
    expect(words).not.toMatch(/hidden|private|may not|restricted|not (be )?shown|left out|not listed/i);
    // and a query that matches a visible person shows exactly that person
    type(box, "ann");
    await settle();
    expect(screen.getAllByTestId("org-employee-name").map((n) => n.textContent)).toEqual(["Ann Visible"]);
  });
  it("more matches than the short list holds: says how many it shows of how many, from the people loaded", async () => {
    readPage.mockResolvedValue(page({ employees: many(0, 12), total: 12 }));
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    type(screen.getByTestId("org-employees-search"), "emp");
    await settle();
    expect(screen.getAllByTestId("org-employee")).toHaveLength(10);
    expect(screen.getByTestId("org-employees-matchcount").textContent).toBe("Showing the first 10 of 12 matches.");
    type(screen.getByTestId("org-employees-search"), "emp0003");
    await settle();
    expect(screen.queryByTestId("org-employees-matchcount")).toBeNull();
  });
  it("clearing the box returns the short list", async () => {
    bigReader(1000);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    const box = screen.getByTestId("org-employees-search");
    type(box, "Emp0001");
    await settle();
    expect(screen.getAllByTestId("org-employee")).toHaveLength(1);
    type(box, "");
    await settle();
    expect(screen.getAllByTestId("org-employee")).toHaveLength(10);
    expect(screen.queryByTestId("org-employees-scope")).toBeNull();
  });
  it("the box is a labelled search field a keyboard and a phone can use", async () => {
    bigReader(1000);
    mount();
    const box = (await screen.findByTestId("org-employees-search")) as HTMLInputElement;
    expect(box.getAttribute("aria-label")).toBe("Search people");
    expect(box.getAttribute("placeholder")).toBe("Search people");
    expect(box.type).toBe("search");
    expect(box.className).toMatch(/min-h-11/);
    expect(box.className).toMatch(/text-base|text-\[16px\]/); // 16px or more: no zoom on a phone
  });
});

describe("Show all N: the full list on its own sheet", () => {
  const openAll = async () => {
    const btn = await screen.findByTestId("org-employees-showall");
    await userEvent.click(btn);
    return { btn, sheet: await screen.findByTestId("org-employees-sheet") };
  };
  it("opens a full-window dialog with a title, a Back button and the search box at the top", async () => {
    bigReader(1000);
    mount();
    const { sheet } = await openAll();
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(within(sheet).getByRole("heading", { name: "Employees" })).toBeTruthy();
    expect(within(sheet).getByTestId("org-employees-sheet-back").textContent).toMatch(/Back/);
    const box = within(sheet).getByTestId("org-employees-sheet-search");
    expect(box.getAttribute("aria-label")).toBe("Search people");
    // the search comes before the list in the document
    const list = within(sheet).getByTestId("org-employees-sheet-list");
    expect(box.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("loads the next 50 on opening (one request), paged by 'Show more' by 50 after that, never all at once", async () => {
    bigReader(1000);
    mount();
    await waitFor(() => expect(readPage).toHaveBeenCalledTimes(1));
    const { sheet } = await openAll();
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(60));
    expect(readPage).toHaveBeenCalledTimes(2);
    expect(readPage.mock.calls[1]![2]).toMatchObject({ offset: 10 });
    expect(readPage.mock.calls[1]![2].limit).toBeUndefined(); // the reader's own page of 50
    await userEvent.click(within(sheet).getByTestId("org-employees-more"));
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(110));
    expect(readPage).toHaveBeenCalledTimes(3);
  });
  it("shows the count and the scope sentence for the list", async () => {
    bigReader(1000);
    mount();
    const { sheet } = await openAll();
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(60));
    expect(within(sheet).getByTestId("org-employees-sheet-count").textContent).toBe("60 people shown of 1,000 records");
    type(within(sheet).getByTestId("org-employees-sheet-search"), "emp");
    expect(within(sheet).getByTestId("org-employees-sheet-scope").textContent).toBe("Searching the 60 people loaded, not everyone. Show more loads the next 50.");
  });
  it("searches the loaded list and can load more to keep searching; no request per keystroke", async () => {
    bigReader(1000);
    mount();
    const { sheet } = await openAll();
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(60));
    const calls = readPage.mock.calls.length;
    const box = within(sheet).getByTestId("org-employees-sheet-search");
    for (const v of ["E", "Em", "Emp0", "Emp00", "Emp0055"]) type(box, v);
    await settle();
    expect(within(sheet).getAllByTestId("org-employee-name").map((n) => n.textContent)).toEqual(["Emp0055 Person"]);
    expect(readPage.mock.calls.length).toBe(calls);
    // a name further down is not found until it is loaded, and Show more is still offered with the search on
    type(box, "Emp0100");
    await settle();
    expect(within(sheet).queryAllByTestId("org-employee")).toHaveLength(0);
    expect(within(sheet).getByTestId("org-employees-nomatch").textContent).toMatch(/No one among the 60 people loaded matches/);
    await userEvent.click(within(sheet).getByTestId("org-employees-more"));
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee-name").map((n) => n.textContent)).toEqual(["Emp0100 Person"]));
  });
  it("in the sheet too, the list filters only after the pause", async () => {
    bigReader(1000);
    mount();
    const { sheet } = await openAll();
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(60));
    type(within(sheet).getByTestId("org-employees-sheet-search"), "Emp0007");
    expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(60);
    await settle();
    expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(1);
  });
  it("🔴 in the sheet too, a search says nothing of the people the reader was not given", async () => {
    readPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number | null };
      return (p.offset ?? 0) === 0
        ? page({ employees: [person("a", "Ann Visible"), person("b", "Bo Visible")], total: 300, nextOffset: 10, notListed: 7 })
        : page({ employees: [person("c", "Cy Visible")], total: 300, nextOffset: 20, notListed: 7 });
    });
    mount();
    const { sheet } = await openAll();
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(3));
    const box = within(sheet).getByTestId("org-employees-sheet-search");
    type(box, "secret");
    await settle();
    expect(within(sheet).getByTestId("org-employees-sheet-scope").textContent).toBe("Searching the 3 people loaded, not everyone. Show more loads the next 50.");
    expect(within(sheet).getByTestId("org-employees-nomatch").textContent).toBe("No one among the 3 people loaded matches. Show more loads the next 50.");
    // the standing note about entries left out carries no number
    const note = within(sheet).getByTestId("org-employees-leftout").textContent!;
    expect(note).toBe("Some entries name people you may not see; they are not listed.");
    expect(note).not.toMatch(/\d/);
    type(box, "cy");
    await settle();
    expect(within(sheet).getAllByTestId("org-employee-name").map((n) => n.textContent)).toEqual(["Cy Visible"]);
  });
  it("carries the words typed on the card into the sheet", async () => {
    bigReader(1000);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    type(screen.getByTestId("org-employees-search"), "Emp0004");
    await settle();
    const { sheet } = await openAll();
    expect((within(sheet).getByTestId("org-employees-sheet-search") as HTMLInputElement).value).toBe("Emp0004");
    expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(1);
  });
  it("once every record is loaded the sheet says 'all', and 'Show more' is gone", async () => {
    bigReader(75);
    mount();
    const { sheet } = await openAll();
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(60));
    await userEvent.click(within(sheet).getByTestId("org-employees-more"));
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(75));
    expect(within(sheet).queryByTestId("org-employees-more")).toBeNull();
    type(within(sheet).getByTestId("org-employees-sheet-search"), "emp");
    expect(within(sheet).getByTestId("org-employees-sheet-scope").textContent).toBe("Searching all 75 people.");
    expect(within(sheet).getByTestId("org-employees-sheet-count").textContent).toBe("75 people");
  });
  it("Back closes the sheet and the focus returns to 'Show all'", async () => {
    bigReader(1000);
    mount();
    const { btn } = await openAll();
    await userEvent.click(screen.getByTestId("org-employees-sheet-back"));
    expect(screen.queryByTestId("org-employees-sheet")).toBeNull();
    expect(document.activeElement).toBe(btn);
    // the card is as it was: the short list
    expect(screen.getAllByTestId("org-employee")).toHaveLength(10);
  });
  it("Escape closes the sheet (and only the sheet), focus back on 'Show all'", async () => {
    bigReader(1000);
    mount();
    const { btn } = await openAll();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    await userEvent.keyboard("{Escape}");
    document.removeEventListener("keydown", outer);
    expect(screen.queryByTestId("org-employees-sheet")).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(btn);
  });
  it("focus goes into the sheet on opening and Tab stays inside it", async () => {
    bigReader(1000);
    mount();
    const { sheet } = await openAll();
    expect(sheet.contains(document.activeElement)).toBe(true);
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(60));
    // Tab from the LAST control wraps to the FIRST, and Shift+Tab from the first wraps to the last (the page behind is unreachable)
    const back = within(sheet).getByTestId("org-employees-sheet-back");
    const more = within(sheet).getByTestId("org-employees-more");
    more.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(back);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(more);
    for (let i = 0; i < 4; i++) {
      await userEvent.tab();
      expect(sheet.contains(document.activeElement)).toBe(true);
    }
  });
  it("a tap on a person in the sheet opens that person and closes the sheet", async () => {
    bigReader(1000);
    const { onOpen } = mount();
    const { sheet } = await openAll();
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(60));
    await userEvent.click(within(sheet).getAllByTestId("org-employee")[12]!);
    expect(screen.queryByTestId("org-employees-sheet")).toBeNull();
    // the sheet's history entry is removed first, the person opens right after (the 400 ms fallback of the history hook, run on the test clock)
    await act(async () => { clock.advance(400); await turns(); });
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("p12"));
  });
  it("the count is not beside the title (on a phone it cut the title to 'Emplo…'): the title is whole, the count has its own line", async () => {
    bigReader(1000);
    mount();
    const { sheet } = await openAll();
    const title = within(sheet).getByRole("heading", { name: "Employees" });
    const count = within(sheet).getByTestId("org-employees-sheet-count");
    expect(title.className).not.toMatch(/truncate/);
    expect(title.parentElement!.contains(count)).toBe(false);
  });
  it("the sheet's controls are phone-sized (44 px) and its box is 16 px text", async () => {
    bigReader(1000);
    mount();
    const { sheet } = await openAll();
    expect(within(sheet).getByTestId("org-employees-sheet-back").className).toMatch(/min-h-11/);
    expect(within(sheet).getByTestId("org-employees-sheet-search").className).toMatch(/min-h-11/);
    expect(within(sheet).getByTestId("org-employees-sheet-search").className).toMatch(/text-base|text-\[16px\]/);
  });
});
