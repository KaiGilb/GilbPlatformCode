// Units (short list wording, the count of employments), Part of (no edit controls for a viewer who cannot write; concurrent parent writes: re-check after the write and take it back when it made a loop).
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

// eslint-disable-next-line import/first
import { OrgPartOfSection, OrgUnitsSection, setParentOrganization } from "./OrgHierarchySections";
// eslint-disable-next-line import/first
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
// eslint-disable-next-line import/first
import { Hosts } from "../test/fakeHost";

const VAULT = "https://v.example.test/base";
const e = (id: string) => `${VAULT}/e/${id}`;
const SELF = { id: "c", entityUri: e("c") };

function table(rows: Record<string, string | null>): ParentReader {
  return async (uri) => {
    const id = uri.split("/").pop()!;
    if (!(id in rows)) return { state: "unreadable" };
    return { state: "ok", parent: rows[id] === null ? null : e(rows[id]!), label: `Org ${id.toUpperCase()}` };
  };
}
beforeEach(() => {
  unitsPage.mockReset();
  for (const k of Object.keys(unitCounts)) delete unitCounts[k];
});
afterEach(() => cleanup());

describe("Units: a page nobody may read, and the count wording", () => {
  const unit = (id: string, name: string, employees: number | null) => {
    unitCounts[id] = employees;
    return { uri: e(id), id, name, logo: null };
  };
  const page = (over: Record<string, unknown>) => ({ units: [], total: 0, nextOffset: null, notListed: 0, ...over });
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
  it("a first page of units the reader may not read keeps the group, a sentence and Show more", async () => {
    unitsPage.mockImplementation(async (...a: unknown[]) => {
      const p = (a[2] ?? {}) as { offset?: number };
      return (p.offset ?? 0) === 0 ? page({ total: 120, nextOffset: 50, notListed: 50 }) : page({ units: [unit("late", "Late Unit", 2)], total: 120 });
    });
    mountUnits();
    await screen.findByTestId("org-units-showall");
    const section = screen.getByTestId("org-units-section");
    expect(within(section).getByTestId("org-units-truncated").textContent).toMatch(/none of the units read so far could be shown to you/i);
    expect(within(section).getByTestId("org-units-truncated").textContent).not.toMatch(/\d/);
    // "Show all" opens the full list, which loads the next page
    await userEvent.click(within(section).getByTestId("org-units-showall"));
    const sheet = await screen.findByTestId("org-units-sheet");
    await waitFor(() => expect(within(sheet).getAllByTestId("org-unit")).toHaveLength(1));
    expect(screen.queryByTestId("org-units-truncated")).toBeNull();
  });
  it("'N units shown of T' while more pages exist", async () => {
    unitsPage.mockResolvedValue(page({ units: [unit("u1", "A", 1), unit("u2", "B", 1)], total: 200, nextOffset: 50 }));
    mountUnits();
    expect((await screen.findByTestId("org-units-count")).textContent).toBe("2 units shown of 200");
  });
  it("just the number when all are read", async () => {
    unitsPage.mockResolvedValue(page({ units: [unit("u1", "A", 1)], total: 1 }));
    mountUnits();
    expect((await screen.findByTestId("org-units-count")).textContent).toBe("1 unit");
  });
  it("the unit's count says EMPLOYMENTS (it counts employment records, not people)", async () => {
    unitsPage.mockResolvedValue(page({ units: [unit("u1", "A", 12), unit("u2", "B", 1)], total: 2 }));
    mountUnits();
    await waitFor(() => expect(screen.getAllByTestId("org-unit-count").map((n) => n.textContent)).toEqual(["12 employments", "1 employment"]));
  });
});

describe("Part of: no edit controls for a viewer who cannot write", () => {
  function mountPartOf(canEdit: boolean, managed: boolean) {
    parentReader.current = table({ c: "b", b: null }) as never;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const body = (
      <Hosts>
        <OrgPartOfSection record={SELF} vaultId={VAULT} parentRef={e("b")} canEdit={canEdit} onOpen={vi.fn()} onSaved={vi.fn()} />
      </Hosts>
    );
    render(<QueryClientProvider client={qc}>{managed ? <CardModeProvider canEdit={canEdit}>{body}</CardModeProvider> : body}</QueryClientProvider>);
  }
  it.each([[false, false], [false, true]])("canEdit=%s managed=%s: no remove, change or add control", async (canEdit, managed) => {
    mountPartOf(canEdit, managed);
    const chain = await screen.findByTestId("org-chain");
    await waitFor(() => expect(within(chain).getAllByTestId("org-chain-node")).toHaveLength(1));
    expect(screen.queryByTestId("org-partof-change")).toBeNull();
    expect(screen.queryByTestId("org-partof-add")).toBeNull();
    expect(screen.queryByLabelText(/Remove parent/)).toBeNull();
  });
  it("canEdit=true outside a managed card still offers the controls (control)", async () => {
    mountPartOf(true, false);
    await screen.findByTestId("org-chain");
    expect(screen.getByTestId("org-partof-change")).toBeTruthy();
  });
});

describe("setParentOrganization: concurrent writers", () => {
  it("after the write it reads the chain again; when the write made a loop it puts the old parent back and says so", async () => {
    const rows: Record<string, string | null> = { c: null, b: null };
    // The other writer's edge lands between our check and our write: b is already under c once we have written c under b.
    const read: ParentReader = async (uri) => {
      const id = uri.split("/").pop()!;
      return { state: "ok", parent: rows[id] === null || rows[id] === undefined ? null : e(rows[id]!), label: id };
    };
    const patch = vi.fn(async (_id: string, facts: Record<string, unknown>) => {
      const v = facts.parentOrganization as { "@id": string } | null;
      rows.c = v === null ? null : v["@id"].split("/").pop()!;
      rows.b = "c"; // the other session's write, landing now
      return { etag: '"2"' };
    });
    const res = await setParentOrganization({ record: SELF, parent: e("b"), previous: null, read, patch: patch as never });
    expect(res).toMatch(/another change|loop/i);
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenLastCalledWith("c", { parentOrganization: null }, e("c"));
  });
  it("a write that made no loop is left alone (one write, no take-back)", async () => {
    const rows: Record<string, string | null> = { c: null, b: null };
    const read: ParentReader = async (uri) => {
      const id = uri.split("/").pop()!;
      return { state: "ok", parent: rows[id] === null || rows[id] === undefined ? null : e(rows[id]!), label: id };
    };
    const patch = vi.fn(async () => {
      rows.c = "b";
      return { etag: '"2"' };
    });
    expect(await setParentOrganization({ record: SELF, parent: e("b"), previous: null, read, patch: patch as never })).toBeNull();
    expect(patch).toHaveBeenCalledTimes(1);
  });
  it("clearing the parent needs no re-check", async () => {
    const read = vi.fn(async () => ({ state: "unreadable" as const }));
    const patch = vi.fn(async () => ({ etag: '"2"' }));
    expect(await setParentOrganization({ record: SELF, parent: null, previous: e("b"), read, patch: patch as never })).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});
