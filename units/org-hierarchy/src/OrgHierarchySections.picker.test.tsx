// The unit's own pins for what the extraction changed or the host reaches: the parent picker is handed the organization find (the source's default),
// the query keys and options of the three reads, and the success path of choosing a parent. All new; the app has no test of the picker through the group.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ParentReader } from "./orgHierarchy";

const finder = vi.hoisted(() => vi.fn());
const parentReader = vi.hoisted(() => ({ current: null as null | ((u: string) => Promise<unknown>) }));
vi.mock("./orgRecords", async (orig) => ({
  ...(await orig<typeof import("./orgRecords")>()),
  findOrganizationRecords: finder,
  organizationParentReader: () => (u: string) => parentReader.current!(u),
}));
const unitsPage = vi.hoisted(() => vi.fn());
vi.mock("./orgUnits", () => ({ readOrgUnitsPage: unitsPage, readUnitEmployments: async () => 4, UNITS_PAGE: 50 }));
const patch = vi.hoisted(() => vi.fn());
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-records")>()), patchRecord: patch }));
vi.mock("@kaigilb/gilbplatformcode-org-terms", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-org-terms")>()),
  resolveOrgTerms: async () => ({ logo: "logo", parentOrganization: "parentOrganization", employer: "employer" }),
}));

// eslint-disable-next-line import/first
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
// eslint-disable-next-line import/first
import { SEARCH_DEBOUNCE_MS } from "@kaigilb/gilbplatformcode-org-employees";
// eslint-disable-next-line import/first
import { FOCUS, OrgPartOfSection, OrgUnitsSection, PARENT_RACE_TEXT, chainEndText } from "./OrgHierarchySections";
// eslint-disable-next-line import/first
import { Hosts } from "../test/fakeHost";
// eslint-disable-next-line import/first
import { turns, virtualTimers } from "../test/timing";

const VAULT = "https://v.example.test/base";
const e = (id: string) => `${VAULT}/e/${id}`;
const SELF = { id: "c", entityUri: e("c") };
const clock = virtualTimers();

const table = (rows: Record<string, string | null>): ParentReader => async (uri) => {
  const id = uri.split("/").pop()!;
  if (!(id in rows)) return { state: "unreadable" };
  return { state: "ok", parent: rows[id] === null ? null : e(rows[id]!), label: `Org ${id.toUpperCase()}` };
};

const staleOf = (q: { options: unknown } | undefined) => (q?.options as { staleTime?: number } | undefined)?.staleTime;

let qc: QueryClient;
beforeEach(() => {
  clock.install();
  finder.mockReset();
  patch.mockReset();
  unitsPage.mockReset();
  finder.mockResolvedValue({ hits: [{ uri: e("b"), label: "Nordlys AS" }, { uri: e("c"), label: "Self AS" }], complete: true });
  patch.mockResolvedValue({ etag: '"2"' });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  clock.uninstall();
});

function mountPartOf(parentRef: string, rows: Record<string, string | null>, onSaved = vi.fn()) {
  parentReader.current = table(rows) as never;
  render(
    <QueryClientProvider client={qc}>
      <CardModeProvider canEdit startEditing>
        <Hosts>
          <OrgPartOfSection record={SELF} vaultId={VAULT} parentRef={parentRef} canEdit onOpen={vi.fn()} onSaved={onSaved} />
        </Hosts>
      </CardModeProvider>
    </QueryClientProvider>,
  );
  return { onSaved };
}

describe("Part of: the parent picker is the organization picker with the organization find", () => {
  it("opens the picker labelled 'Parent organization' and searches the organizations of THIS vault with the empty text at once", async () => {
    mountPartOf(e("a"), { c: "a", a: null });
    await userEvent.click(await screen.findByTestId("org-partof-change"));
    expect(await screen.findByLabelText("Parent organization")).toBeTruthy();
    await waitFor(() => expect(finder).toHaveBeenCalledWith(VAULT, ""));
  });
  it("offers the hits except the record itself (exclude), and a typed word is searched after the pause, with that word", async () => {
    mountPartOf(e("a"), { c: "a", a: null });
    await userEvent.click(await screen.findByTestId("org-partof-change"));
    const hits = await screen.findByTestId("org-record-hits");
    expect(within(hits).getAllByTestId("org-record-hit").map((h) => h.textContent)).toEqual(["Nordlys AS"]);
    fireEvent.change(screen.getByLabelText("Parent organization"), { target: { value: "nord" } });
    await act(async () => { clock.advance(SEARCH_DEBOUNCE_MS + 10); await turns(); });
    await waitFor(() => expect(finder).toHaveBeenCalledWith(VAULT, "nord"));
  });
  it("Cancel closes the picker and the change button is back", async () => {
    mountPartOf(e("a"), { c: "a", a: null });
    await userEvent.click(await screen.findByTestId("org-partof-change"));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByTestId("org-partof-change")).toBeTruthy();
  });
  it("choosing a hit writes the parent on THIS record, closes the picker, refreshes the chain and tells the card it was saved", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { onSaved } = mountPartOf(e("a"), { c: "a", a: null, b: null });
    await userEvent.click(await screen.findByTestId("org-partof-change"));
    await userEvent.click(await screen.findByText("Nordlys AS"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith("c", { parentOrganization: { "@id": e("b") } }, e("c"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["mynet", "org-chain"] });
    expect(screen.queryByLabelText("Parent organization")).toBeNull();
  });
  it("a refusal (a loop) is shown in the group, writes nothing, leaves the picker open and does not tell the card it was saved", async () => {
    const { onSaved } = mountPartOf(e("a"), { c: "a", a: null, b: "c" });
    await userEvent.click(await screen.findByTestId("org-partof-change"));
    await userEvent.click(await screen.findByText("Nordlys AS"));
    expect((await screen.findByTestId("org-partof-error")).textContent).toMatch(/loop/);
    expect(patch).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Parent organization")).toBeTruthy();
  });
  it("a write that throws is shown by its message", async () => {
    patch.mockRejectedValue(new Error("403 forbidden"));
    mountPartOf(e("a"), { c: "a", a: null, b: null });
    await userEvent.click(await screen.findByTestId("org-partof-change"));
    await userEvent.click(await screen.findByText("Nordlys AS"));
    expect((await screen.findByTestId("org-partof-error")).textContent).toBe("403 forbidden");
  });
  it("removing the first parent clears it on this record (a null), refreshes the chain and tells the card", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { onSaved } = mountPartOf(e("b"), { c: "b", b: null });
    await userEvent.click(await screen.findByLabelText("Remove parent Org B"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith("c", { parentOrganization: null }, e("c"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["mynet", "org-chain"] });
  });
});

describe("the reads' query keys and options (what the app's cache holds)", () => {
  it("the chain: key ['mynet','org-chain', record, parentRef], fresh for 15 s; no parent: not read at all", async () => {
    const reader = vi.fn(table({ c: "b", b: null }));
    parentReader.current = reader as never;
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <CardModeProvider canEdit>
          <Hosts>
            <OrgPartOfSection record={SELF} vaultId={VAULT} parentRef={e("b")} canEdit onOpen={vi.fn()} onSaved={vi.fn()} />
          </Hosts>
        </CardModeProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(reader).toHaveBeenCalled());
    const q = qc.getQueryCache().find({ queryKey: ["mynet", "org-chain", e("c"), e("b")] });
    expect(q).toBeTruthy();
    expect(staleOf(q)).toBe(15_000);
    unmount();
    reader.mockClear();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CardModeProvider canEdit>
          <Hosts>
            <OrgPartOfSection record={SELF} vaultId={VAULT} parentRef="" canEdit onOpen={vi.fn()} onSaved={vi.fn()} />
          </Hosts>
        </CardModeProvider>
      </QueryClientProvider>,
    );
    await turns();
    expect(reader).not.toHaveBeenCalled();
  });
  it("the units: key ['mynet','org-units', vault, organization], fresh for 30 s; each count: key ['mynet','org-unit-employments', vault, unit], 30 s", async () => {
    unitsPage.mockResolvedValue({ units: [{ uri: e("u1"), id: "u1", name: "A", logo: null }], total: 1, counts: [1, 0], nextOffset: null, notListed: 0 });
    render(
      <QueryClientProvider client={qc}>
        <CardModeProvider canEdit>
          <Hosts>
            <OrgUnitsSection orgUri={e("hq")} vaultId={VAULT} onOpen={vi.fn()} />
          </Hosts>
        </CardModeProvider>
      </QueryClientProvider>,
    );
    await screen.findByTestId("org-unit");
    await waitFor(() => expect(screen.getByTestId("org-unit-count").textContent).toBe("4 employments"));
    const units = qc.getQueryCache().find({ queryKey: ["mynet", "org-units", VAULT, e("hq")] });
    expect(staleOf(units)).toBe(30_000);
    const count = qc.getQueryCache().find({ queryKey: ["mynet", "org-unit-employments", VAULT, e("u1")] });
    expect(staleOf(count)).toBe(30_000);
  });
});

describe("what the file exports for the person card and its words", () => {
  it("FOCUS is the ring of a row that opens a record", () => {
    expect(FOCUS).toBe("focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]");
  });
  it("PARENT_RACE_TEXT and the chain-end words are exact", () => {
    expect(PARENT_RACE_TEXT).toBe("That would make a loop with another change made at the same moment, so the parent was put back as it was. Choose again.");
    expect(chainEndText("not-visible")).toBe("Not visible: you may not read the next level up.");
    expect(chainEndText("loop")).toBe("Loop: this chain comes back to an organization already in it, so it is not followed further.");
    expect(chainEndText("too-deep")).toBe("Stopped: the chain is longer than 20 levels.");
    expect(chainEndText("reading")).toBeNull();
    expect(chainEndText("head")).toBeNull();
  });
});
