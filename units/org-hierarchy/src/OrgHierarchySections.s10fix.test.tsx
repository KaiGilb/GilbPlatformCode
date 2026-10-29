// Units (clicked through to the end with nobody readable: said; the paging cursor carries the counts); Part of: the take-back through the real group (it restores the OLD parent, and the group hands it over).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ParentReader } from "./orgHierarchy";

const unitsPage = vi.hoisted(() => vi.fn());
const unitCounts = vi.hoisted(() => ({}) as Record<string, number | null>);
// A unit's count is its own lazy read (`readUnitEmployments`), answered here from what each test's fixture says the unit has.
vi.mock("./orgUnits", () => ({ readOrgUnitsPage: unitsPage, readUnitEmployments: async (uri: string) => unitCounts[uri.split("/").pop()!] ?? null, UNITS_PAGE: 50 }));
const parentReader = vi.hoisted(() => ({ current: null as null | ((u: string) => Promise<unknown>) }));
vi.mock("./orgRecords", async (orig) => {
  const real = await orig<typeof import("./orgRecords")>();
  return { ...real, organizationParentReader: () => (u: string) => parentReader.current!(u) };
});
vi.mock("@kaigilb/gilbplatformcode-org-terms", async (orig) => {
  const real = await orig<typeof import("@kaigilb/gilbplatformcode-org-terms")>();
  return { ...real, resolveOrgTerms: async () => ({ logo: "logo", parentOrganization: "parentOrganization", employer: "employer" }) };
});
const patch = vi.hoisted(() => vi.fn());
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-records")>()), patchRecord: patch }));
// The picker is replaced by one button that chooses organization "b" (what the picker returns for a click).
vi.mock("@kaigilb/gilbplatformcode-record-picker", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-record-picker")>()),
  OrgRecordPicker: ({ onPick }: { onPick: (h: { uri: string; label: string }) => void }) => (
    <button type="button" data-testid="pick-b" onClick={() => onPick({ uri: "https://v.example.test/base/e/b", label: "B" })}>
      pick b
    </button>
  ),
}));

// eslint-disable-next-line import/first
import { OrgPartOfSection, OrgUnitsSection } from "./OrgHierarchySections";
// eslint-disable-next-line import/first
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
// eslint-disable-next-line import/first
import { Hosts } from "../test/fakeHost";

const VAULT = "https://v.example.test/base";
const e = (id: string) => `${VAULT}/e/${id}`;
beforeEach(() => {
  unitsPage.mockReset();
  patch.mockReset();
  for (const k of Object.keys(unitCounts)) delete unitCounts[k];
});
afterEach(() => cleanup());

describe("Units: clicked through to the end, and the paging cursor", () => {
  const page = (over: Record<string, unknown>) => ({ units: [], total: 0, counts: [0, 0], nextOffset: null, notListed: 0, ...over });
  function mountUnits() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <CardModeProvider canEdit>
          <Hosts>
            <OrgUnitsSection orgUri={e("hq")} vaultId={VAULT} onOpen={vi.fn()} />
          </Hosts>
        </CardModeProvider>
      </QueryClientProvider>,
    );
  }
  it("clicked through to the end with no readable unit, the group stays with a closing sentence", async () => {
    unitsPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number };
      return (p.offset ?? 0) === 0 ? page({ total: 120, nextOffset: 50, notListed: 50 }) : page({ total: 120, notListed: 50 });
    });
    mountUnits();
    await userEvent.click(await screen.findByTestId("org-units-showall"));
    const sheet = await screen.findByTestId("org-units-sheet");
    const none = await within(sheet).findByTestId("org-units-none");
    expect(none.textContent).toMatch(/none of the units could be shown to you/i);
    expect(none.textContent).not.toMatch(/\d/);
    expect(screen.queryByTestId("org-units-more")).toBeNull();
  });
  it("the next page is asked with the counts the last page returned", async () => {
    unitsPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number };
      return (p.offset ?? 0) === 0 ? page({ units: [{ uri: e("u1"), id: "u1", name: "A", logo: null, employees: 1 }], total: 100, counts: [60, 40], nextOffset: 50 }) : page({ units: [{ uri: e("u2"), id: "u2", name: "B", logo: null, employees: 1 }], total: 100, counts: [60, 40] });
    });
    mountUnits();
    await userEvent.click(await screen.findByTestId("org-units-showall"));
    await waitFor(() => expect(unitsPage).toHaveBeenCalledTimes(2));
    expect(unitsPage).toHaveBeenLastCalledWith(e("hq"), VAULT, { offset: 50, counts: [60, 40] });
  });
  it("the total is the first page's, whatever a later page says", async () => {
    unitsPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number };
      return (p.offset ?? 0) === 0 ? page({ units: [{ uri: e("u1"), id: "u1", name: "A", logo: null, employees: 1 }], total: 200, nextOffset: 50 }) : page({ units: [{ uri: e("u2"), id: "u2", name: "B", logo: null, employees: 1 }], total: 3, nextOffset: 100 });
    });
    mountUnits();
    await userEvent.click(await screen.findByTestId("org-units-showall"));
    const sheet = await screen.findByTestId("org-units-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-unit")).toHaveLength(2));
    expect(screen.getByTestId("org-units-count").textContent).toBe("2 units shown of 200");
  });
});

describe("Part of: a lost race puts the OLD parent back (not null), and the group hands the old parent over", () => {
  it("child c under old parent a; choosing b makes a loop with another writer: the take-back writes a, the sentence is shown", async () => {
    const rows: Record<string, string | null> = { c: "a", a: null, b: null };
    const read: ParentReader = async (uri) => {
      const id = uri.split("/").pop()!;
      return { state: "ok", parent: rows[id] === null || rows[id] === undefined ? null : e(rows[id]!), label: id };
    };
    parentReader.current = read as never;
    patch.mockImplementation(async (_id: string, facts: Record<string, unknown>) => {
      const v = facts.parentOrganization as { "@id": string } | null;
      rows.c = v === null ? null : v["@id"].split("/").pop()!;
      if (rows.c === "b") rows.b = "c"; // the other session's write lands at the same moment
      return { etag: '"2"' };
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <CardModeProvider canEdit startEditing>
          <Hosts>
            <OrgPartOfSection record={{ id: "c", entityUri: e("c") }} vaultId={VAULT} parentRef={e("a")} canEdit onOpen={vi.fn()} onSaved={vi.fn()} />
          </Hosts>
        </CardModeProvider>
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByTestId("org-partof-change"));
    await userEvent.click(await screen.findByTestId("pick-b"));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch).toHaveBeenNthCalledWith(1, "c", { parentOrganization: { "@id": e("b") } }, e("c"));
    expect(patch).toHaveBeenNthCalledWith(2, "c", { parentOrganization: { "@id": e("a") } }, e("c"));
    expect((await screen.findByTestId("org-partof-error")).textContent).toMatch(/put back/);
  });
});
