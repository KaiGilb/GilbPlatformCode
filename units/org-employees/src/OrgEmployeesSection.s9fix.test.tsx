// Cycle214 s9 organization card FIX ROUND — the Employees group (Agent.Scaling C1 C7).
// C1: when the first page names only people the reader may not read, the group must NOT vanish: it keeps "Show more" and says,
// without a number, that nothing read so far could be shown. C7: the total the reader returns is shown, not "50+".
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
const person = (id: string, name: string, titles: string[] = []) => ({ person: `${VAULT}/e/${id}`, id, name, titles, photoRef: null });
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

describe("C1: the group does not vanish when the first page lists nobody the reader may read", () => {
  const trap = async (...a: unknown[]) => {
    const p = (a[2] ?? {}) as { offset?: number | null };
    return (p.offset ?? 0) === 0
      ? page({ employees: [], total: 300, nextOffset: 50, notListed: 50 })
      : page({ employees: [person("late", "Late Reader")], total: 300, nextOffset: null, notListed: 0 });
  };
  it("shows the group, a plain sentence, and Show more", async () => {
    readPage.mockImplementation(trap);
    mount();
    await screen.findByTestId("org-employees-showall");
    const section = screen.getByTestId("org-employees-section");
    expect(within(section).getByTestId("org-employees-truncated").textContent).toMatch(/nothing read so far could be shown to you/i);
    expect(within(section).getByTestId("org-employees-truncated").textContent).not.toMatch(/\d/);
  });
  it("Show more reaches the readable person on a later page, and the sentence goes", async () => {
    readPage.mockImplementation(trap);
    mount();
    await userEvent.click(await screen.findByTestId("org-employees-showall"));
    const sheet = await screen.findByTestId("org-employees-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(1));
    expect(screen.queryByTestId("org-employees-truncated")).toBeNull();
    expect(screen.queryByTestId("org-employees-more")).toBeNull();
  });
  it("passes the cursor of BOTH sources to the next read", async () => {
    readPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number | null };
      return p.offset === undefined ? page({ employees: [person("a", "Ann")], total: 60, memberTotal: 70, nextOffset: 50, nextMemberOffset: 50 }) : page({ employees: [person("b", "Bea")], nextOffset: null, nextMemberOffset: null });
    });
    mount();
    await userEvent.click(await screen.findByTestId("org-employees-showall"));
    await waitFor(() => expect(readPage).toHaveBeenCalledTimes(2));
    expect(readPage).toHaveBeenLastCalledWith(ORG, VAULT, { offset: 50, memberOffset: 50 });
  });
  it("keeps offering Show more while only the MEMBER source has more (the employments are finished)", async () => {
    readPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number | null };
      return p.offset === undefined
        ? page({ employees: [person("a", "Ann")], total: 1, memberTotal: 70, nextOffset: null, nextMemberOffset: 50 })
        : page({ employees: [person("b", "Bea")], total: 1, memberTotal: 70 });
    });
    mount();
    await userEvent.click(await screen.findByTestId("org-employees-showall"));
    const sheet = await screen.findByTestId("org-employees-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee")).toHaveLength(2));
    expect(readPage).toHaveBeenLastCalledWith(ORG, VAULT, { offset: null, memberOffset: 50 });
  });
  it("with nothing to read and nothing more, a reader with no readable person still sees no group (it is not truncated)", async () => {
    readPage.mockResolvedValue(page({ notListed: 3 }));
    mount();
    await waitFor(() => expect(readPage).toHaveBeenCalled());
    await turns();
    expect(screen.queryByTestId("org-employees-section")).toBeNull();
  });
  it("some people listed and some left out says so without a number", async () => {
    readPage.mockResolvedValue(page({ employees: [person("a", "Ann")], total: 2, notListed: 1 }));
    mount();
    const note = await screen.findByTestId("org-employees-leftout");
    expect(note.textContent).toMatch(/not listed/i);
    expect(note.textContent).not.toMatch(/\d/);
  });
});

describe("C7: the total the reader returns is shown", () => {
  it("while more pages exist: 'N people shown of T records'", async () => {
    readPage.mockResolvedValue(page({ employees: [person("a", "Ann"), person("b", "Bea")], total: 20000, memberTotal: 5, nextOffset: 50 }));
    mount();
    expect((await screen.findByTestId("org-employees-count")).textContent).toBe("2 people shown of 20,005 records");
  });
  it("when everything is read it is just the number of people", async () => {
    readPage.mockResolvedValue(page({ employees: [person("a", "Ann"), person("b", "Bea")], total: 2 }));
    mount();
    expect((await screen.findByTestId("org-employees-count")).textContent).toBe("2 people");
  });
});

describe("M2: the note about employments that only name the company", () => {
  it("tells the reader that an employment naming the company only in text is not linked and is not listed", async () => {
    readPage.mockResolvedValue(page({ employees: [person("a", "Ann")], total: 1 }));
    mount();
    expect((await screen.findByTestId("org-employees-textonly")).textContent).toMatch(/only by name|only names the company/i);
  });
});
