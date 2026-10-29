// Cycle214 s10 organization card FIX — Agent.Scaling N3 (the total never contradicts itself), Agent.Tester N11 (the total is not
// changed by the left-out) and F6 (a group the reader clicked through to the end with nobody readable says so, it does not vanish).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

const ORG = "https://v.example.test/base/e/org1";
const VAULT = "https://v.example.test/base";
const person = (id: string, name: string) => ({ person: `${VAULT}/e/${id}`, id, name, titles: [], photoRef: null });
const page = (over: Record<string, unknown>) => ({ employees: [], total: 0, memberTotal: 0, nextOffset: null, nextMemberOffset: null, notListed: 0, ...over });

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <OrgEmployeesHostContext.Provider value={fakeHost()}>
      <CardModeProvider canEdit>
        <OrgEmployeesSection orgUri={ORG} vaultId={VAULT} onOpen={vi.fn()} />
      </CardModeProvider>
      </OrgEmployeesHostContext.Provider>
    </QueryClientProvider>,
  );
}
beforeEach(() => readPage.mockReset());
afterEach(() => cleanup());

describe("N3: the total is the same on every page, whichever source finishes first", () => {
  it("the employment source finishes (its total comes back 0) while members go on: the text keeps '1,850 records' and never shows more people than records", async () => {
    const texts: string[] = [];
    readPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number | null; memberOffset?: number | null };
      if (p.offset === undefined) return page({ employees: [person("a", "Ann")], total: 1200, memberTotal: 650, nextOffset: 50, nextMemberOffset: 50 });
      if (p.offset === 50) return page({ employees: [person("b", "Bea")], total: 1200, memberTotal: 650, nextOffset: null, nextMemberOffset: 100 });
      // the employment source is finished: it is not asked, so its total is 0 on this page
      return page({ employees: [person("c", "Cy")], total: 0, memberTotal: 650, nextOffset: null, nextMemberOffset: 150 });
    });
    mount();
    texts.push((await screen.findByTestId("org-employees-count")).textContent!);
    // s12: "Show all" opens the full list (it loads the next page), then "Show more" in the list loads the one after
    await userEvent.click(await screen.findByTestId("org-employees-showall"));
    const sheet = await screen.findByTestId("org-employees-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(2));
    texts.push(screen.getByTestId("org-employees-count").textContent!);
    await userEvent.click(within(sheet).getByTestId("org-employees-more"));
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(3));
    texts.push(screen.getByTestId("org-employees-count").textContent!);
    expect(texts).toEqual(["1 person shown of 1,850 records", "2 people shown of 1,850 records", "3 people shown of 1,850 records"]);
  });
  it("more people shown than the first page's total (a record was added meanwhile) says the number shown, never 'N shown of fewer'", async () => {
    readPage.mockResolvedValue(page({ employees: [person("a", "Ann"), person("b", "Bea"), person("c", "Cy")], total: 1, nextOffset: 50 }));
    mount();
    expect((await screen.findByTestId("org-employees-count")).textContent).toBe("3 people shown of 3 records");
  });
});

describe("the cursor carries the counts of both sources to the next page", () => {
  it("the next read is given employmentCounts and memberCounts as the last page returned them", async () => {
    readPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number | null };
      return p.offset === undefined
        ? page({ employees: [person("a", "Ann")], total: 100, memberTotal: 70, nextOffset: 50, nextMemberOffset: 50, employmentCounts: [60, 40], memberCounts: [70, 0] })
        : page({ employees: [person("b", "Bea")], total: 100, memberTotal: 70 });
    });
    mount();
    await userEvent.click(await screen.findByTestId("org-employees-showall"));
    await waitFor(() => expect(readPage).toHaveBeenCalledTimes(2));
    expect(readPage).toHaveBeenLastCalledWith(ORG, VAULT, { offset: 50, memberOffset: 50, employmentCounts: [60, 40], memberCounts: [70, 0] });
  });
});

describe("N11: the left-out do not change the total", () => {
  it("'1 person shown of 1,200 records' with 5 entries left out on the page", async () => {
    readPage.mockResolvedValue(page({ employees: [person("a", "Ann")], total: 1200, nextOffset: 50, notListed: 5 }));
    mount();
    expect((await screen.findByTestId("org-employees-count")).textContent).toBe("1 person shown of 1,200 records");
  });
});

describe("F6: clicked through to the end and nobody was readable", () => {
  it("the group stays with a closing sentence (no Show more), it does not vanish", async () => {
    readPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number | null };
      return p.offset === undefined ? page({ total: 120, nextOffset: 50, notListed: 50 }) : page({ total: 120, nextOffset: null, notListed: 50 });
    });
    mount();
    await userEvent.click(await screen.findByTestId("org-employees-showall"));
    const sheet = await screen.findByTestId("org-employees-sheet");
    const none = await within(sheet).findByTestId("org-employees-none");
    expect(none.textContent).toMatch(/none of the records could be shown to you/i);
    expect(none.textContent).not.toMatch(/\d/);
    expect(screen.queryByTestId("org-employees-more")).toBeNull();
    expect(screen.queryByTestId("org-employees-truncated")).toBeNull();
  });
  it("a single page with nobody readable and nothing more still draws nothing (nothing was left unread)", async () => {
    readPage.mockResolvedValue(page({ notListed: 3 }));
    mount();
    await waitFor(() => expect(readPage).toHaveBeenCalled());
    await turns();
    expect(screen.queryByTestId("org-employees-section")).toBeNull();
  });
});
