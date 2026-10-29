// Cycle214 s12 follow-up (Agent.Tester s17 F1 + F2, ruled BLOCKING for landing): an organization whose people are linked BOTH ways ("Tri Source AS": 60
// employments + 160 member-of; "Dual Source AS": 100 + 30) drew 10 rows under "20 people shown of 220 records" with a "Showing the first 10 of 20 matches"
// line nobody asked for. The reader is replaced by pages shaped as the real one now returns them (ONE page = `limit` records across both sources).
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
const person = (id: string, name: string) => ({ person: `${VAULT}/e/${id}`, id, name, titles: [], photoRef: null });
const named = (prefix: string, from: number, n: number) => Array.from({ length: n }, (_, i) => person(`${prefix}${from + i}`, `${prefix.toUpperCase()}${String(from + i).padStart(3, "0")} Person`));
const page = (over: Record<string, unknown>) => ({ employees: [], total: 0, memberTotal: 0, nextOffset: null, nextMemberOffset: null, notListed: 0, ...over });

/** A reader that answers like the real one now does: ONE page holds `limit` people across the two sources (the employments first half, members the rest). */
function bothSources(nEmp: number, nMem: number) {
  readPage.mockImplementation(async (...a: unknown[]) => {
    const p = (a[2] ?? {}) as { offset?: number | null; memberOffset?: number | null; limit?: number };
    const limit = p.limit ?? 50;
    const eo = p.offset === undefined ? 0 : p.offset;
    const mo = p.memberOffset === undefined ? 0 : p.memberOffset;
    const eLeft = eo === null ? 0 : nEmp - eo;
    const mLeft = mo === null ? 0 : nMem - mo;
    const takeE = Math.min(eLeft, Math.max(Math.ceil(limit / 2), limit - mLeft));
    const takeM = Math.min(mLeft, limit - takeE);
    const empNext = eo === null || eLeft === 0 ? null : eo + takeE < nEmp ? eo + takeE : null;
    const memNext = mo === null || mLeft === 0 ? null : mo + takeM < nMem ? mo + takeM : null;
    return page({
      employees: [...named("e", eo ?? 0, takeE), ...named("m", mo ?? 0, takeM)],
      total: nEmp,
      memberTotal: nMem,
      nextOffset: empNext,
      nextMemberOffset: memNext,
    });
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
const type = (box: HTMLElement, v: string) => fireEvent.change(box, { target: { value: v } });
const clock = virtualTimers();
beforeEach(() => clock.install());
afterEach(() => clock.uninstall());
const settle = () => act(async () => { clock.advance(SEARCH_DEBOUNCE_MS + 60); await turns(); });
const zOf = (el: Element | null): number => {
  const m = /(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?:\s|$)/.exec(el?.getAttribute("class") ?? "");
  return m ? Number(m[1] ?? m[2]) : 0;
};

beforeEach(() => readPage.mockReset());
afterEach(() => cleanup());

describe("F1: an organization linked both ways draws ONE honest count over exactly 10 rows", () => {
  it("Tri Source AS: '10 people shown of 220 records', 10 rows, no matches line, 'Show all 220 records'", async () => {
    bothSources(60, 160);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    expect(screen.getByTestId("org-employees-count").textContent).toBe("10 people shown of 220 records");
    expect(screen.queryByTestId("org-employees-matchcount")).toBeNull();
    expect(screen.getByTestId("org-employees-showall").textContent).toBe("Show all 220 records");
    expect(readPage.mock.calls[0]![2]).toEqual({ limit: 10 });
  });
  it("Dual Source AS: the same, '10 people shown of 130 records'", async () => {
    bothSources(100, 30);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    expect(screen.getByTestId("org-employees-count").textContent).toBe("10 people shown of 130 records");
    expect(screen.queryByTestId("org-employees-matchcount")).toBeNull();
  });
  it("the first page is 5 employments and 5 members (both sources, not 10 and 10)", async () => {
    bothSources(60, 160);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    const names = screen.getAllByTestId("org-employee-name").map((n) => n.textContent!);
    expect(names.filter((n) => n.startsWith("E"))).toHaveLength(5);
    expect(names.filter((n) => n.startsWith("M"))).toHaveLength(5);
  });
  it("'Show all' opens a list that grows by 50 people a step (not 100): 60, then 110", async () => {
    bothSources(60, 160);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    await userEvent.click(screen.getByTestId("org-employees-showall"));
    const sheet = await screen.findByTestId("org-employees-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(60));
    expect(within(sheet).getByTestId("org-employees-sheet-count").textContent).toBe("60 people shown of 220 records");
    await userEvent.click(within(sheet).getByTestId("org-employees-more"));
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(110));
    expect(within(sheet).getByTestId("org-employees-sheet-count").textContent).toBe("110 people shown of 220 records");
  });
  it("back on the card after the list has read more: still 10 rows and the count of those rows, never '110 people' over 10 rows", async () => {
    bothSources(60, 160);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    await userEvent.click(screen.getByTestId("org-employees-showall"));
    const sheet = await screen.findByTestId("org-employees-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(60));
    await userEvent.click(screen.getByTestId("org-employees-sheet-back"));
    await waitFor(() => expect(screen.queryByTestId("org-employees-sheet")).toBeNull());
    expect(screen.getAllByTestId("org-employee")).toHaveLength(10);
    expect(screen.getByTestId("org-employees-count").textContent).toBe("10 people shown of 220 records");
    expect(screen.queryByTestId("org-employees-matchcount")).toBeNull();
  });
  /** Open the list, let it read everything (12 people), come back to the card. */
  const readAllThenBack = async () => {
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    await userEvent.click(screen.getByTestId("org-employees-showall"));
    const sheet = await screen.findByTestId("org-employees-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(12));
    await userEvent.click(screen.getByTestId("org-employees-sheet-back"));
    await waitFor(() => expect(screen.queryByTestId("org-employees-sheet")).toBeNull());
  };
  it("everything read (12 people): '10 of 12 people shown' over 10 rows, 'Show all 12 people', and no matches line while nothing is typed", async () => {
    bothSources(8, 4);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    expect(screen.getByTestId("org-employees-count").textContent).toBe("10 people shown of 12 records"); // 2 records are still to be read
    await readAllThenBack();
    expect(screen.getAllByTestId("org-employee")).toHaveLength(10);
    expect(screen.getByTestId("org-employees-count").textContent).toBe("10 of 12 people shown");
    expect(screen.getByTestId("org-employees-showall").textContent).toBe("Show all 12 people");
    expect(screen.queryByTestId("org-employees-matchcount")).toBeNull();
  });
  it("the 'first 10 of N matches' line appears only when a search is typed", async () => {
    bothSources(8, 4);
    mount();
    await readAllThenBack();
    type(screen.getByTestId("org-employees-search"), "person");
    await settle();
    expect(screen.getByTestId("org-employees-matchcount").textContent).toBe("Showing the first 10 of 12 matches.");
    type(screen.getByTestId("org-employees-search"), "");
    await settle();
    expect(screen.queryByTestId("org-employees-matchcount")).toBeNull();
  });
  it("the total is never below the rows (a record added meanwhile) and never contradicts them", async () => {
    readPage.mockResolvedValue(page({ employees: named("e", 0, 10), total: 3, memberTotal: 0, nextOffset: 10 }));
    mount();
    expect((await screen.findByTestId("org-employees-count")).textContent).toBe("10 people shown of 10 records");
  });
});

describe("F2: the gaps the Tester found", () => {
  it("the sheet stacks above the phone drawer (z 50) and the bottom nav (z 60): its layer is 70", async () => {
    bothSources(60, 160);
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    await userEvent.click(screen.getByTestId("org-employees-showall"));
    const sheet = await screen.findByTestId("org-employees-sheet");
    expect(zOf(sheet)).toBe(70);
    expect(sheet.parentElement).toBe(document.body);
  });
  it("a typed accented capital is folded: 'BJØRN' finds 'Bjørn', 'ASE' finds 'Åse', 'å' finds 'Åse' (the query is folded as the names are)", async () => {
    readPage.mockResolvedValue(page({ employees: [person("a", "Bjørn Dahl"), person("b", "Åse Lie"), ...named("e", 0, 10)], total: 12 }));
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee").length).toBeGreaterThan(0));
    const box = screen.getByTestId("org-employees-search");
    for (const [typed, want] of [["BJØRN", "Bjørn Dahl"], ["ASE", "Åse Lie"], ["å", "Åse Lie"], ["ø", "Bjørn Dahl"]] as const) {
      type(box, typed);
      await settle();
      expect(screen.getAllByTestId("org-employee-name").map((n) => n.textContent)).toContain(want);
    }
  });
  it("while the next page is still being read a search with no hit says it is still reading, never 'no one matches'", async () => {
    let release: () => void = () => undefined;
    readPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number | null };
      if ((p.offset ?? 0) === 0) return page({ employees: named("e", 0, 10), total: 100, nextOffset: 10 });
      await new Promise<void>((r) => { release = r; });
      return page({ employees: named("e", 10, 50), total: 100, nextOffset: 60 });
    });
    mount();
    await waitFor(() => expect(screen.getAllByTestId("org-employee")).toHaveLength(10));
    await userEvent.click(screen.getByTestId("org-employees-showall"));
    const sheet = await screen.findByTestId("org-employees-sheet");
    type(within(sheet).getByTestId("org-employees-sheet-search"), "zzz");
    await settle();
    expect(within(sheet).getByTestId("org-employees-loading").textContent).toBe("Still reading the next 50. No one among the 10 people loaded matches yet.");
    expect(within(sheet).queryByTestId("org-employees-nomatch")).toBeNull();
    await act(async () => { release(); });
    await waitFor(() => expect(within(sheet).getByTestId("org-employees-nomatch")).toBeTruthy());
    expect(within(sheet).queryByTestId("org-employees-loading")).toBeNull();
    expect(within(sheet).getByTestId("org-employees-nomatch").textContent).toBe("No one among the 60 people loaded matches. Show more loads the next 50.");
  });
});
