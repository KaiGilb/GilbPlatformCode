// "Part of" and "Units": the chain up to the head office with its 'not visible' and 'loop' states, the writer that refuses a loop and writes the CHILD's side only, and the units below with name, logo and count.
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
import { OrgPartOfSection, OrgUnitsSection, chainEndText, setParentOrganization } from "./OrgHierarchySections";
// eslint-disable-next-line import/first
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
// eslint-disable-next-line import/first
import { Hosts } from "../test/fakeHost";
// eslint-disable-next-line import/first
import { turns } from "../test/timing";

const VAULT = "https://v.example.test/base";
const e = (id: string) => `${VAULT}/e/${id}`;
const SELF = { id: "c", entityUri: e("c") };

/** A table reader: org id -> parent id (or null); an id not in the table is unreadable. */
function table(rows: Record<string, string | null>): ParentReader {
  return async (uri) => {
    const id = uri.split("/").pop()!;
    if (!(id in rows)) return { state: "unreadable" };
    return { state: "ok", parent: rows[id] === null ? null : e(rows[id]!), label: `Org ${id.toUpperCase()}` };
  };
}

beforeEach(() => {
  unitsPage.mockReset();
});
afterEach(() => cleanup());

describe("setParentOrganization — the writer", () => {
  const patch = vi.fn(async () => ({ etag: '"2"' }));
  beforeEach(() => patch.mockClear());

  it("writes ONE scalar link on the CHILD's record only (never the parent, never an array)", async () => {
    const r = await setParentOrganization({ record: SELF, parent: e("b"), read: table({ c: null, b: "a", a: null }), patch });
    expect(r).toBeNull();
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith("c", { parentOrganization: { "@id": e("b") } }, e("c"));
  });
  it("REFUSES an organization as its own parent, and writes nothing", async () => {
    expect(await setParentOrganization({ record: SELF, parent: e("c"), read: table({ c: null }), patch })).toMatch(/own parent/);
    expect(patch).not.toHaveBeenCalled();
  });
  it("REFUSES a child and a grandchild as the parent (a loop), and writes nothing", async () => {
    const rows = { c: null, d: "c", f: "d" };
    expect(await setParentOrganization({ record: SELF, parent: e("d"), read: table(rows), patch })).toMatch(/loop/);
    expect(await setParentOrganization({ record: SELF, parent: e("f"), read: table(rows), patch })).toMatch(/loop/);
    expect(patch).not.toHaveBeenCalled();
  });
  it("REFUSES when a link above the proposed parent cannot be read (no guessing)", async () => {
    expect(await setParentOrganization({ record: SELF, parent: e("b"), read: table({ c: null, b: "zzz" }), patch })).toMatch(/cannot be read/);
    expect(patch).not.toHaveBeenCalled();
  });
  it("REFUSES a chain past the depth cap", async () => {
    const rows: Record<string, string | null> = { c: null };
    for (let i = 0; i < 40; i++) rows[`o${i}`] = `o${i + 1}`;
    rows.o40 = null;
    expect(await setParentOrganization({ record: SELF, parent: e("o0"), read: table(rows), patch })).toMatch(/deeper than 20/);
    expect(patch).not.toHaveBeenCalled();
  });
  it("clearing the parent writes a null on the child (and needs no read)", async () => {
    expect(await setParentOrganization({ record: SELF, parent: null, read: table({}), patch })).toBeNull();
    expect(patch).toHaveBeenCalledWith("c", { parentOrganization: null }, e("c"));
  });
});

describe("chainEndText", () => {
  it("names the states that are not a head office", () => {
    expect(chainEndText("head")).toBeNull();
    expect(chainEndText("not-visible")).toMatch(/Not visible/);
    expect(chainEndText("loop")).toMatch(/Loop/);
    expect(chainEndText("too-deep")).toMatch(/20 levels/);
  });
});

function mountPartOf(rows: Record<string, string | null>, over: Partial<React.ComponentProps<typeof OrgPartOfSection>> = {}, reader?: (u: string) => Promise<unknown>) {
  parentReader.current = (reader ?? table(rows)) as never;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpen = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <CardModeProvider canEdit>
        <Hosts>
          <OrgPartOfSection record={SELF} vaultId={VAULT} parentRef={rows.c ? e(rows.c) : ""} canEdit onOpen={onOpen} onSaved={vi.fn()} {...over} />
        </Hosts>
      </CardModeProvider>
    </QueryClientProvider>,
  );
  return { onOpen };
}

describe("OrgPartOfSection — the chain up to the head office", () => {
  it("shows the chain nearest first, ends at the head office, and each level opens", async () => {
    const { onOpen } = mountPartOf({ c: "b", b: "a", a: null });
    const chain = await screen.findByTestId("org-chain");
    await waitFor(() => expect(within(chain).getAllByTestId("org-chain-node")).toHaveLength(2));
    expect(within(chain).getAllByTestId("org-chain-link").map((n) => n.textContent)).toEqual(["Org B", "Org A"]);
    expect(chain.getAttribute("data-end")).toBe("head");
    expect(within(chain).getByText("head office")).toBeTruthy();
    await userEvent.click(within(chain).getAllByTestId("org-chain-link")[1]!);
    expect(onOpen).toHaveBeenCalledWith("a");
  });
  it("shows 'Not visible' where a level cannot be read, and does not guess above it", async () => {
    mountPartOf({ c: "b", b: "hidden" });
    const chain = await screen.findByTestId("org-chain");
    await waitFor(() => expect(within(chain).getAllByTestId("org-chain-node")).toHaveLength(2));
    expect(within(chain).getByTestId("org-chain-hidden").textContent).toBe("Not visible");
    expect(within(chain).getByTestId("org-chain-end").textContent).toMatch(/Not visible/);
    expect(within(chain).queryByText("head office")).toBeNull();
  });
  it("shows 'Loop' for a stored loop and does not follow it", async () => {
    mountPartOf({ c: "b", b: "a", a: "c" });
    const chain = await screen.findByTestId("org-chain");
    await waitFor(() => expect(chain.getAttribute("data-end")).toBe("loop"));
    expect(within(chain).getByTestId("org-chain-end").textContent).toMatch(/Loop/);
    expect(within(chain).getAllByTestId("org-chain-node")).toHaveLength(2);
  });
  it("draws nothing for a head office with no parent in presentation", async () => {
    mountPartOf({ c: null });
    await waitFor(() => expect(parentReader.current).toBeTruthy());
    await turns();
    expect(screen.queryByTestId("org-partof-section")).toBeNull();
  });
  it("a chain that could not be read at all is said, ⛔ not drawn as 'no parent'", async () => {
    // The walker turns a throwing reader into 'not-visible'; the group still names that state.
    mountPartOf({ c: "b" }, {}, async () => {
      throw new Error("boom");
    });
    const chain = await screen.findByTestId("org-chain");
    await waitFor(() => expect(chain.getAttribute("data-end")).toBe("not-visible"));
  });
});

describe("OrgUnitsSection", () => {
  const page = (units: unknown[], over: Record<string, unknown> = {}) => ({ units, total: units.length, nextOffset: null, notListed: 0, ...over });
  const unit = (id: string, name: string, employees: number | null, logo: string | null = null) => {
    unitCounts[id] = employees;
    return { uri: e(id), id, name, logo };
  };
  function mountUnits() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onOpen = vi.fn();
    render(
      <QueryClientProvider client={qc}>
        <CardModeProvider canEdit>
          <Hosts>
            <OrgUnitsSection orgUri={e("hq")} vaultId={VAULT} onOpen={onOpen} />
          </Hosts>
        </CardModeProvider>
      </QueryClientProvider>,
    );
    return { onOpen };
  }
  it("lists the units with name, a mark, and the employee count where visible; a unit opens its own card", async () => {
    unitsPage.mockResolvedValue(page([unit("u1", "Butikk Oslo", 12, e("logo1")), unit("u2", "Butikk Bergen", 1), unit("u3", "Butikk Nord", null)]));
    const { onOpen } = mountUnits();
    const section = await screen.findByTestId("org-units-section");
    await waitFor(() => expect(within(section).getAllByTestId("org-unit")).toHaveLength(3));
    expect(within(section).getAllByTestId("org-unit-name").map((n) => n.textContent)).toEqual(["Butikk Oslo", "Butikk Bergen", "Butikk Nord"]);
    await waitFor(() => expect(within(section).getAllByTestId("org-unit-count").map((n) => n.textContent)).toEqual(["12 employments", "1 employment"]));
    expect(within(section).getAllByTestId("org-mark")).toHaveLength(3);
    await userEvent.click(within(section).getAllByTestId("org-unit")[0]!);
    expect(onOpen).toHaveBeenCalledWith("u1");
  });
  it("draws nothing when there is no unit", async () => {
    unitsPage.mockResolvedValue(page([]));
    mountUnits();
    await waitFor(() => expect(unitsPage).toHaveBeenCalled());
    await turns();
    expect(screen.queryByTestId("org-units-section")).toBeNull();
  });
  it("says a failed read, ⛔ not 'no units'", async () => {
    unitsPage.mockImplementation(async () => {
      throw new Error("503");
    });
    mountUnits();
    expect((await screen.findByTestId("org-units-error")).textContent).toMatch(/not a statement that there are none/);
  });
  it("is not offered by the chooser (units are added by setting the parent on the child)", async () => {
    unitsPage.mockResolvedValue(page([unit("u1", "A", 0)]));
    mountUnits();
    expect((await screen.findByTestId("org-units-section")).getAttribute("data-group")).toBe("units");
  });
});
