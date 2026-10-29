// What the components take from the host: the context and its missing-provider error, the optional face, and the two sheet-history members.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const readPage = vi.hoisted(() => vi.fn());
vi.mock("./orgEmployees", () => ({ readOrgEmployeesPage: (...a: unknown[]) => readPage(...a), EMPLOYEES_PAGE: 50 }));

// eslint-disable-next-line import/first
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
// eslint-disable-next-line import/first
import { OrgEmployeesSection } from "./OrgEmployeesSection";
// eslint-disable-next-line import/first
import { OrgEmployeeRow } from "./OrgEmployeeRow";
// eslint-disable-next-line import/first
import { OrgEmployeesHostContext, type OrgEmployeesHost, type RecordFaceProps } from "./orgEmployeesHost";
// eslint-disable-next-line import/first
import { fakeHost } from "../test/fakeHost";

const ORG = "https://v.example.test/base/e/org1";
const VAULT = "https://v.example.test/base";
const person = (id: string, name: string, titles: string[] = [], photoRef: string | null = null) => ({ person: `${VAULT}/e/${id}`, id, name, titles, photoRef });
const page = (over: Record<string, unknown>) => ({ employees: [], total: 0, memberTotal: 0, nextOffset: null, nextMemberOffset: null, notListed: 0, ...over });

function mount(host: OrgEmployeesHost | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (inner: ReactNode) => (host ? <OrgEmployeesHostContext.Provider value={host}>{inner}</OrgEmployeesHostContext.Provider> : inner);
  return render(
    <QueryClientProvider client={qc}>
      {tree(
        <CardModeProvider canEdit>
          <OrgEmployeesSection orgUri={ORG} vaultId={VAULT} onOpen={() => {}} />
        </CardModeProvider>,
      )}
    </QueryClientProvider>,
  );
}

beforeEach(() => readPage.mockReset());
afterEach(() => cleanup());

describe("the context", () => {
  it("a row with no provider throws an error that names the context", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<OrgEmployeeRow p={{ ...person("a", "Ann"), } as never} vaultId={VAULT} onOpen={() => {}} />)).toThrow(/OrgEmployeesHostContext\.Provider/);
    spy.mockRestore();
  });
  it("the group with no provider throws the same error (its hook reads the context first)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => mount(null)).toThrow(/OrgEmployeesHostContext\.Provider/);
    spy.mockRestore();
  });
  it("the reader is given the provider's host as its first argument, then the organization, the vault and the page", async () => {
    readPage.mockResolvedValue(page({ employees: [person("a", "Ann")], total: 1 }));
    const host = fakeHost();
    mount(host);
    await screen.findByTestId("org-employee");
    expect(readPage.mock.calls[0]![0]).toBe(host);
    expect(readPage.mock.calls[0]!.slice(1)).toEqual([ORG, VAULT, { limit: 10 }]);
  });
});

describe("the face (optional)", () => {
  it("is drawn with the props the row passes, and the fallback is the initial in a circle", async () => {
    const seen: RecordFaceProps[] = [];
    const host = fakeHost({
      RecordFace: (props) => {
        seen.push(props);
        return <span data-testid="face">{props.fallback}</span>;
      },
    });
    readPage.mockResolvedValue(page({ employees: [person("a", "Ann", ["CEO"], "/files/ann1")], total: 1 }));
    mount(host);
    await screen.findByTestId("face");
    expect(seen[0]).toMatchObject({ photoRef: "/files/ann1", readRecordFor: null, vaultId: VAULT, name: "Ann", className: "size-9 shrink-0" });
    expect(screen.getByTestId("face").textContent).toBe("A");
  });
  it("a person with no name gets an empty name and the '?' fallback", async () => {
    const seen: RecordFaceProps[] = [];
    const host = fakeHost({ RecordFace: (props) => (seen.push(props), <span data-testid="face">{props.fallback}</span>) });
    readPage.mockResolvedValue(page({ employees: [{ ...person("a", "x"), name: null }], total: 1 }));
    mount(host);
    await screen.findByTestId("face");
    expect(seen[0]!.name).toBe("");
    expect(screen.getByTestId("face").textContent).toBe("?");
    expect(screen.getByTestId("org-employee-name").textContent).toBe("(no name)");
  });
  it("absent: no face is drawn (not even the initial), and the name and titles are still shown and the row still opens the person", async () => {
    const host = fakeHost();
    delete host.RecordFace;
    readPage.mockResolvedValue(page({ employees: [person("a", "Ann", ["CEO", "Chair"])], total: 1 }));
    const onOpen = vi.fn();
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <OrgEmployeesHostContext.Provider value={host}>
          <CardModeProvider canEdit>
            <OrgEmployeesSection orgUri={ORG} vaultId={VAULT} onOpen={onOpen} />
          </CardModeProvider>
        </OrgEmployeesHostContext.Provider>
      </QueryClientProvider>,
    );
    const row = await screen.findByTestId("org-employee");
    expect(row.querySelector("[aria-hidden]")).toBeNull();
    expect(screen.getByTestId("org-employee-name").textContent).toBe("Ann");
    expect(screen.getByTestId("org-employee-title").textContent).toBe("CEO · Chair");
    await userEvent.click(row);
    expect(onOpen).toHaveBeenCalledWith("a");
  });
});

describe("the sheet history members", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => person(`p${i}`, `Person ${i}`));
  it("dropStaleSheetEntry is called once, when the short list mounts; useSheetHistory is called on every render, closed first", async () => {
    const drop = vi.fn();
    const hook = vi.fn((_open: boolean, _onClosed: () => void) => ({ requestClose: (after?: () => void) => after?.() }));
    readPage.mockResolvedValue(page({ employees: many(12), total: 12 }));
    mount(fakeHost({ dropStaleSheetEntry: drop, useSheetHistory: hook }));
    await screen.findAllByTestId("org-employee");
    expect(drop).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalled();
    expect(hook.mock.calls.every((c) => typeof c[1] === "function")).toBe(true);
    expect(hook.mock.calls[0]![0]).toBe(false);
    expect(hook.mock.calls.some((c) => c[0] === true)).toBe(false);
  });
  it("opening the sheet calls the hook with open = true, and the hook's requestClose closes it", async () => {
    let closeCb: (() => void) | null = null;
    const requestClose = vi.fn((after?: () => void) => {
      closeCb?.();
      after?.();
    });
    const hook = vi.fn((_open: boolean, onClosed: () => void) => {
      closeCb = onClosed;
      return { requestClose };
    });
    readPage.mockResolvedValue(page({ employees: many(12), total: 12 }));
    mount(fakeHost({ useSheetHistory: hook }));
    await userEvent.click(await screen.findByTestId("org-employees-showall"));
    await screen.findByTestId("org-employees-sheet");
    expect(hook.mock.calls.at(-1)![0]).toBe(true);
    await userEvent.click(screen.getByTestId("org-employees-sheet-back"));
    expect(requestClose).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("org-employees-sheet")).toBeNull());
  });
});
