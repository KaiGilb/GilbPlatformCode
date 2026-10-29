// Cycle214 s8 organization card — the EMPLOYEES group as the real component (the list reader is replaced by what one viewer's
// read returned: its own suite, `orgEmployees.s8org.test.ts`, proves what each reader may see).
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
const person = (id: string, name: string, titles: string[]) => ({ person: `${VAULT}/e/${id}`, id, name, titles, photoRef: null });

function mount(canEdit = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpen = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <OrgEmployeesHostContext.Provider value={fakeHost()}>
      <CardModeProvider canEdit={canEdit}>
        <OrgEmployeesSection orgUri={ORG} vaultId={VAULT} onOpen={onOpen} />
      </CardModeProvider>
      </OrgEmployeesHostContext.Provider>
    </QueryClientProvider>,
  );
  return { onOpen, qc };
}

beforeEach(() => { readPage.mockReset(); });
afterEach(() => cleanup());

describe("OrgEmployeesSection", () => {
  it("lists each person with name and title, a count, and opens that person on a click", async () => {
    readPage.mockResolvedValue({ employees: [person("ann", "Ann Visible", ["CEO"]), person("cy", "Cy Member", ["CFO", "Board"])], total: 2, nextOffset: null, notListed: 0 });
    const { onOpen } = mount();
    const section = await screen.findByTestId("org-employees-section");
    await waitFor(() => expect(within(section).getAllByTestId("org-employee")).toHaveLength(2));
    expect(within(section).getAllByTestId("org-employee-name").map((n) => n.textContent)).toEqual(["Ann Visible", "Cy Member"]);
    expect(within(section).getAllByTestId("org-employee-title").map((n) => n.textContent)).toEqual(["CEO", "CFO · Board"]);
    expect(within(section).getByTestId("org-employees-count").textContent).toBe("2 people");
    await userEvent.click(within(section).getAllByTestId("org-employee")[1]!);
    expect(onOpen).toHaveBeenCalledWith("cy");
  });
  it("a single employee reads '1 person'", async () => {
    readPage.mockResolvedValue({ employees: [person("ann", "Ann", [])], total: 1, nextOffset: null, notListed: 0 });
    mount();
    expect((await screen.findByTestId("org-employees-count")).textContent).toBe("1 person");
  });
  it("is the card's titled frame, in the chooser's refusal list (nothing is added here)", async () => {
    readPage.mockResolvedValue({ employees: [person("ann", "Ann", [])], total: 1, nextOffset: null, notListed: 0 });
    mount();
    const s = await screen.findByTestId("org-employees-section");
    expect(s.querySelector("h3")?.textContent).toBe("Employees");
    expect(s.getAttribute("data-group")).toBe("employees");
  });
  it("with no employee read it draws NOTHING in presentation (no 'none' sentence)", async () => {
    readPage.mockResolvedValue({ employees: [], total: 0, nextOffset: null, notListed: 2 });
    mount();
    await waitFor(() => expect(readPage).toHaveBeenCalled());
    await turns();
    expect(screen.queryByTestId("org-employees-section")).toBeNull();
    expect(document.body.textContent).not.toMatch(/not listed|2 more|hidden/i);
  });
  it("never shows how many people were left out (the viewer is told only what they may read)", async () => {
    readPage.mockResolvedValue({ employees: [person("ann", "Ann", [])], total: 1, nextOffset: null, notListed: 5 });
    mount();
    await screen.findByTestId("org-employee");
    expect(document.body.textContent).not.toMatch(/\b5\b/);
  });
  it("says 'N+' while more pages exist, and 'Show more' reads the next one", async () => {
    readPage.mockImplementation(async (...a: unknown[]) => {
      const page = (a[2] ?? {}) as { offset?: number | null };
      return (page.offset ?? 0) === 0
        ? { employees: [person("a", "Ann", [])], total: 2, nextOffset: 50, nextMemberOffset: null, notListed: 0 }
        : { employees: [person("b", "Bea", [])], total: 2, nextOffset: null, notListed: 0 };
    });
    mount();
    expect((await screen.findByTestId("org-employees-count")).textContent).toBe("1 person shown of 2 records");
    // s12: the card shows the short list; "Show all" opens the full list, which loads the next page
    await userEvent.click(await screen.findByTestId("org-employees-showall"));
    const sheet = await screen.findByTestId("org-employees-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(2));
    expect(screen.getByTestId("org-employees-count").textContent).toBe("2 people");
    expect(readPage).toHaveBeenLastCalledWith(ORG, VAULT, { offset: 50, memberOffset: null });
  });
  it("a person on two pages is listed once", async () => {
    readPage.mockImplementation(async (...a: unknown[]) => {
      const page = (a[2] ?? {}) as { offset?: number | null };
      return (page.offset ?? 0) === 0 ? { employees: [person("a", "Ann", ["CEO"])], total: 2, nextOffset: 50, nextMemberOffset: null, notListed: 0 } : { employees: [person("a", "Ann", ["Chair"])], total: 2, nextOffset: null, notListed: 0 };
    });
    mount();
    await userEvent.click(await screen.findByTestId("org-employees-showall"));
    const sheet = await screen.findByTestId("org-employees-sheet");
    await waitFor(() => expect(within(sheet).getByTestId("org-employee-title").textContent).toBe("CEO · Chair"));
    expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(1);
  });
  it("a failed read is SAID ('not a statement that there are none'), ⛔ not drawn as an empty list or hidden", async () => {
    readPage.mockImplementation(async () => {
      throw new Error("find-by-attribute failed: 401");
    });
    mount();
    expect((await screen.findByTestId("org-employees-error")).textContent).toMatch(/could not be read.*401.*not a statement that there are none/s);
  });
});
