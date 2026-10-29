// Pins on the counts of the Units card and on the remove control of Part of, beyond the app's own tests.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ParentReader } from "./orgHierarchy";

const unitsPage = vi.hoisted(() => vi.fn());
const unitCount = vi.hoisted(() => vi.fn());
vi.mock("./orgUnits", () => ({ readOrgUnitsPage: unitsPage, readUnitEmployments: unitCount, UNITS_PAGE: 50 }));
const parentReader = vi.hoisted(() => ({ current: null as null | ((u: string) => Promise<unknown>) }));
vi.mock("./orgRecords", async (orig) => ({ ...(await orig<typeof import("./orgRecords")>()), organizationParentReader: () => (u: string) => parentReader.current!(u) }));

// eslint-disable-next-line import/first
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
// eslint-disable-next-line import/first
import { SEARCH_DEBOUNCE_MS } from "@kaigilb/gilbplatformcode-org-employees";
// eslint-disable-next-line import/first
import { OrgPartOfSection, OrgUnitsSection } from "./OrgHierarchySections";
// eslint-disable-next-line import/first
import { Hosts } from "../test/fakeHost";
// eslint-disable-next-line import/first
import { turns, virtualTimers } from "../test/timing";

const VAULT = "https://v.example.test/base";
const e = (id: string) => `${VAULT}/e/${id}`;
const clock = virtualTimers();
const settle = () => act(async () => { clock.advance(SEARCH_DEBOUNCE_MS + 60); await turns(); });
beforeEach(() => {
  clock.install();
  unitsPage.mockReset();
  unitCount.mockReset();
  unitCount.mockResolvedValue(2);
});
afterEach(() => {
  cleanup();
  clock.uninstall();
});

const units = (n: number) => Array.from({ length: n }, (_, i) => ({ uri: e(`u${i}`), id: `u${i}`, name: `Unit${String(i).padStart(4, "0")}`, logo: null }));

describe("the Units card counts", () => {
  it("a unit among the 11th to 20th loaded, brought into the card by a search, shows no count and none is read", async () => {
    unitsPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number; limit?: number };
      const at = p.offset ?? 0;
      const n = Math.min(p.limit ?? 50, 200 - at);
      return { units: units(200).slice(at, at + n), total: 200, counts: [100, 100], nextOffset: at + n, notListed: 0 };
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CardModeProvider canEdit>
          <Hosts>
            <OrgUnitsSection orgUri={e("hq")} vaultId={VAULT} onOpen={vi.fn()} />
          </Hosts>
        </CardModeProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(unitCount).toHaveBeenCalledTimes(10));
    await userEvent.click(await screen.findByTestId("org-units-showall"));
    const sheet = await screen.findByTestId("org-units-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-unit")).toHaveLength(60));
    await userEvent.click(screen.getByTestId("org-units-sheet-back"));
    await waitFor(() => expect(screen.queryByTestId("org-units-sheet")).toBeNull());
    fireEvent.change(screen.getByTestId("org-units-search"), { target: { value: "Unit001" } });
    await settle();
    expect(screen.getAllByTestId("org-unit").length).toBe(10);
    expect(screen.queryAllByTestId("org-unit-count")).toHaveLength(0);
    expect(unitCount).toHaveBeenCalledTimes(10);
  });
});

describe("Part of: only the first parent can be removed", () => {
  it("a chain of three levels draws one remove control, on the nearest", async () => {
    const rows: Record<string, string | null> = { c: "b", b: "a", a: null };
    const read: ParentReader = async (uri) => {
      const id = uri.split("/").pop()!;
      return { state: "ok", parent: rows[id] === null ? null : e(rows[id]!), label: `Org ${id.toUpperCase()}` };
    };
    parentReader.current = read as never;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CardModeProvider canEdit startEditing>
          <Hosts>
            <OrgPartOfSection record={{ id: "c", entityUri: e("c") }} vaultId={VAULT} parentRef={e("b")} canEdit onOpen={vi.fn()} onSaved={vi.fn()} />
          </Hosts>
        </CardModeProvider>
      </QueryClientProvider>,
    );
    const chain = await screen.findByTestId("org-chain");
    await waitFor(() => expect(within(chain).getAllByTestId("org-chain-node")).toHaveLength(2));
    expect(screen.getAllByLabelText(/^Remove parent/)).toHaveLength(1);
    expect(screen.getByLabelText("Remove parent Org B")).toBeTruthy();
  });
});
