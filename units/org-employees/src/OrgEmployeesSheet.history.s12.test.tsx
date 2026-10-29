// Cycle214 s12 (Kai-Zen decision 2026-10-16): the "Show all" sheet is a HISTORY ENTRY. On a phone the system Back closes the sheet and does not
// leave the card; closing from inside removes the entry; opening a person leaves no dead entry behind; a reload with the sheet open does not break.
// jsdom keeps a real history list (pushState, back, popstate), so the marker and the calls are read from it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
import { __resetSheetHistory } from "../test/sheetHistory";

const ORG = "https://v.example.test/base/e/org1";
const VAULT = "https://v.example.test/base";
const person = (id: string, name: string) => ({ person: `${VAULT}/e/${id}`, id, name, titles: [], photoRef: null });
const many = (from: number, n: number) => Array.from({ length: n }, (_, i) => person(`p${from + i}`, `Emp${String(from + i).padStart(4, "0")}`));
const page = (over: Record<string, unknown>) => ({ employees: [], total: 0, memberTotal: 0, nextOffset: null, nextMemberOffset: null, notListed: 0, ...over });
const stateOf = () => (window.history.state ?? {}) as Record<string, unknown>;
const marked = () => !!stateOf().gilbSheet;
const clock = virtualTimers();
const tick = (ms: number) => act(async () => { clock.advance(ms); await turns(); });

function mount(strict = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpen = vi.fn(() => seenMarkAtOpen.push(marked()));
  const tree = (
    <QueryClientProvider client={qc}>
      <OrgEmployeesHostContext.Provider value={fakeHost()}>
      <CardModeProvider canEdit>
        <OrgEmployeesSection orgUri={ORG} vaultId={VAULT} onOpen={onOpen} />
      </CardModeProvider>
      </OrgEmployeesHostContext.Provider>
    </QueryClientProvider>
  );
  const r = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { onOpen, ...r };
}
let seenMarkAtOpen: boolean[] = [];
const openSheet = async () => {
  await userEvent.click(await screen.findByTestId("org-employees-showall"));
  return screen.findByTestId("org-employees-sheet");
};

beforeEach(() => {
  clock.install();
  __resetSheetHistory();
  seenMarkAtOpen = [];
  readPage.mockReset();
  readPage.mockImplementation(async (...a: unknown[]) => {
    const p = (a[2] ?? {}) as { offset?: number | null; limit?: number };
    const at = p.offset ?? 0;
    const n = Math.min(p.limit ?? 50, 100 - at);
    return page({ employees: many(at, n), total: 100, nextOffset: at + n < 100 ? at + n : null });
  });
  // a router-like state, as BrowserRouter keeps it
  window.history.replaceState({ usr: null, key: "k0", idx: 3 }, "", "/app/?rec=org1");
});
afterEach(() => {
  clock.uninstall();
  cleanup();
  vi.restoreAllMocks();
});

describe("opening", () => {
  it("pushes ONE entry for the sheet, keeps the router's own state in it, and does not change the address", async () => {
    const push = vi.spyOn(window.history, "pushState");
    mount();
    expect(marked()).toBe(false);
    await openSheet();
    expect(push).toHaveBeenCalledTimes(1);
    expect(stateOf()).toMatchObject({ usr: null, key: "k0", idx: 3, gilbSheet: true });
    expect(window.location.pathname + window.location.search).toBe("/app/?rec=org1");
  });
  it("StrictMode (the dev double effect) still leaves one open sheet on one marked entry", async () => {
    mount(true);
    await openSheet();
    await tick(60);
    expect(screen.getByTestId("org-employees-sheet")).toBeTruthy();
    expect(marked()).toBe(true);
    await userEvent.click(screen.getByTestId("org-employees-sheet-back"));
    await waitFor(() => expect(marked()).toBe(false));
    expect(screen.queryByTestId("org-employees-sheet")).toBeNull();
  });
});

describe("the system Back button", () => {
  it("closes the sheet and nothing else: the card is still there, the focus is on 'Show all', no person was opened", async () => {
    const { onOpen } = mount();
    await openSheet();
    await act(async () => { window.history.back(); });
    await waitFor(() => expect(screen.queryByTestId("org-employees-sheet")).toBeNull());
    expect(marked()).toBe(false);
    expect(screen.getByTestId("org-employees-section")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId("org-employees-showall"));
    expect(onOpen).not.toHaveBeenCalled();
    expect(stateOf()).toMatchObject({ key: "k0", idx: 3 });
  });
  it("does not go back a SECOND time (it would leave the card): exactly one entry was popped", async () => {
    mount();
    await openSheet();
    const back = vi.spyOn(window.history, "back");
    await act(async () => { window.history.back(); });
    await waitFor(() => expect(screen.queryByTestId("org-employees-sheet")).toBeNull());
    await tick(500);
    expect(back).toHaveBeenCalledTimes(1); // the test's own call only
  });
});

describe("closing from inside removes the entry the sheet pushed", () => {
  it("the Back button: the sheet is gone at once, the entry goes (one history.back), the focus returns", async () => {
    mount();
    await openSheet();
    const back = vi.spyOn(window.history, "back");
    await userEvent.click(screen.getByTestId("org-employees-sheet-back"));
    expect(screen.queryByTestId("org-employees-sheet")).toBeNull();
    await waitFor(() => expect(marked()).toBe(false));
    expect(back).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByTestId("org-employees-showall"));
  });
  it("Escape: the same", async () => {
    mount();
    await openSheet();
    const back = vi.spyOn(window.history, "back");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("org-employees-sheet")).toBeNull();
    await waitFor(() => expect(marked()).toBe(false));
    expect(back).toHaveBeenCalledTimes(1);
  });
  it("opening and closing again and again leaves no entry behind and never goes back past the card", async () => {
    mount();
    const back = vi.spyOn(window.history, "back");
    for (let i = 0; i < 3; i++) {
      await openSheet();
      await userEvent.click(screen.getByTestId("org-employees-sheet-back"));
      await waitFor(() => expect(marked()).toBe(false));
    }
    expect(back).toHaveBeenCalledTimes(3);
    expect(stateOf()).toMatchObject({ key: "k0", idx: 3 });
  });
  it("it never calls back() when its entry is not the current one (it must not leave the card)", async () => {
    const { unmount } = mount();
    await openSheet();
    window.history.pushState({ usr: null, key: "k1", idx: 4 }, "", "/app/?rec=other"); // something else navigated meanwhile
    const back = vi.spyOn(window.history, "back");
    unmount();
    await tick(100);
    expect(back).not.toHaveBeenCalled();
  });
  it("unmounted while open (the card changes under it): its entry is removed", async () => {
    const { unmount } = mount();
    await openSheet();
    unmount();
    await waitFor(() => expect(marked()).toBe(false));
  });
});

describe("a tap on a person", () => {
  it("removes the sheet's entry FIRST and opens the person after, so the card is the entry before the person", async () => {
    const { onOpen } = mount();
    const sheet = await openSheet();
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee").length).toBeGreaterThan(3));
    await userEvent.click(within(sheet).getAllByTestId("org-employee")[3]!);
    expect(screen.queryByTestId("org-employees-sheet")).toBeNull();
    await tick(400); // the 400 ms fallback of the history hook, run on the test clock
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    expect(onOpen).toHaveBeenCalledWith("p3");
    expect(seenMarkAtOpen).toEqual([false]); // the marker was already gone when the person opened
  });
  it("opens the person even when the browser never answers the back (a timer finishes it), once", async () => {
    vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const { onOpen } = mount();
    const sheet = await openSheet();
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee").length).toBeGreaterThan(1));
    await userEvent.click(within(sheet).getAllByTestId("org-employee")[1]!);
    expect(screen.queryByTestId("org-employees-sheet")).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
    await tick(600);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("a reload (or a forward press) that lands on the sheet's entry", () => {
  it("shows the card with no sheet and steps back off the marked entry once", async () => {
    window.history.replaceState({ usr: null, key: "k0", idx: 3, gilbSheet: true }, "", "/app/?rec=org1");
    const back = vi.spyOn(window.history, "back");
    mount();
    await screen.findByTestId("org-employees-section");
    expect(screen.queryByTestId("org-employees-sheet")).toBeNull();
    await tick(50);
    expect(back).toHaveBeenCalledTimes(1);
  });
  it("two cards mounting together (or StrictMode) step back ONCE, not twice", async () => {
    window.history.replaceState({ usr: null, key: "k0", idx: 3, gilbSheet: true }, "", "/app/?rec=org1");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    mount(true);
    await tick(50);
    expect(back).toHaveBeenCalledTimes(1);
  });
  it("a card with no marker never goes back on mounting", async () => {
    const back = vi.spyOn(window.history, "back");
    mount();
    await screen.findByTestId("org-employees-section");
    await tick(50);
    expect(back).not.toHaveBeenCalled();
  });
});

describe("the history guard (Tester s17: mutant H11 was killed only by a load-flaky test): never go back unless the sheet's entry is the current one", () => {
  it("closing from inside, with something else navigated meanwhile, closes the sheet and does NOT call back()", async () => {
    mount();
    await openSheet();
    window.history.pushState({ usr: null, key: "k9", idx: 9 }, "", "/app/?rec=other"); // someone else navigated: the sheet's entry is not the current one
    const back = vi.spyOn(window.history, "back");
    await userEvent.click(screen.getByTestId("org-employees-sheet-back"));
    expect(screen.queryByTestId("org-employees-sheet")).toBeNull();
    await tick(500);
    expect(back).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?rec=other");
  });
  it("Escape, the same", async () => {
    mount();
    await openSheet();
    window.history.pushState({ usr: null, key: "k9", idx: 9 }, "", "/app/?rec=other");
    const back = vi.spyOn(window.history, "back");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("org-employees-sheet")).toBeNull();
    await tick(500);
    expect(back).not.toHaveBeenCalled();
  });
  it("a tap on a person then opens the person AT ONCE (no 400 ms wait for a pop that is not coming)", async () => {
    const { onOpen } = mount();
    const sheet = await openSheet();
    await waitFor(() => expect(within(sheet).getAllByTestId("org-employee").length).toBeGreaterThan(2));
    window.history.pushState({ usr: null, key: "k9", idx: 9 }, "", "/app/?rec=other");
    const back = vi.spyOn(window.history, "back");
    await userEvent.click(within(sheet).getAllByTestId("org-employee")[1]!);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });
});
