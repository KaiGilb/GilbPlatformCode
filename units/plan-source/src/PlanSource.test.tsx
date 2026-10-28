// PlanSource against a fake host. The first two cases are the app's PlanSource.vaultsMissed cases with the same inputs and
// expectations (the app's search function is the fake host's findStakeholderRecords); the rest pin what the source did.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { PLAN_SOURCE_DOCUMENTS, PLAN_SOURCE_PLACEHOLDER, PlanSource, PlanSourceHostContext } from "./index";
import type { PlanSourceHost } from "./index";
import { ANN, BEN, DOC, Frame, VAULT, file, makeHost, newClient, whole } from "../test/fakeHost";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const MISSED = "Some vaults could not be searched.";
const record = { id: "fn1", entityUri: "https://h.example.test/base/e/fn1", typeUri: "t:Function", facts: { unitTag: "Door" }, opaqueFacts: [], etag: '"e"' } as BaseRecord;

type Props = Partial<Parameters<typeof PlanSource>[0]>;

function setup(props: Props = {}, h = makeHost()) {
  const onCommit = vi.fn();
  const onOpen = vi.fn();
  const client = newClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Frame host={h.host} client={client}>
      {children}
    </Frame>
  );
  const ui = (p: Props = props) => (
    <PlanSource value={{}} editing vaultId={VAULT} record={record} inputLabel="Older description source" onOpen={onOpen} onCommit={onCommit} {...p} />
  );
  const view = render(ui(), { wrapper });
  return { ...h, onCommit, onOpen, view, again: (p: Props = props) => view.rerender(ui(p)) };
}

const callsFor = (find: { mock: { calls: unknown[][] } }, text: string) => find.mock.calls.filter((c) => c[2] === text);
const box = () => screen.getByRole("textbox", { name: "Older description source" });
async function typeInto(text: string) {
  const user = userEvent.setup();
  await user.click(box());
  await user.type(box(), text);
  return user;
}

describe("search (ported)", () => {
  it("says when some vaults could not be searched", async () => {
    const h = makeHost();
    h.find.mockResolvedValue({ hits: [], complete: true, vaultsMissed: true });
    h.state.shell.vaults = [];
    setup({}, h);
    expect(await screen.findByText(MISSED)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ New stakeholder" })).toBeTruthy();
  });

  it("says nothing about missed vaults when the search reached them", async () => {
    const h = makeHost();
    h.find.mockResolvedValue({ hits: [], complete: true, vaultsMissed: false });
    h.state.shell.vaults = [];
    setup({}, h);
    await waitFor(() => expect(h.find).toHaveBeenCalled());
    await act(async () => {
      await Promise.all(h.find.mock.results.map((result) => result.value));
    });
    expect(screen.queryByText(MISSED)).toBeNull();
  });
});

describe("what it draws", () => {
  it("exports the placeholder and the documents heading", () => {
    expect(PLAN_SOURCE_PLACEHOLDER).toBe("Source");
    expect(PLAN_SOURCE_DOCUMENTS).toBe("Documents");
  });

  it("draws nothing when nothing was said and the line is not being edited", () => {
    const { view } = setup({ editing: false, value: {} });
    expect(view.container.innerHTML).toBe("");
  });

  it("treats a blank string, an array and undefined as nothing said", () => {
    for (const value of ["   ", undefined, null, [] as unknown as string]) {
      cleanup();
      const { view } = setup({ editing: false, value });
      expect(view.container.innerHTML).toBe("");
    }
  });

  it("marks the box with the input label and whether it is being edited", () => {
    const { view } = setup({ editing: true });
    const box1 = view.container.querySelector("[data-plan-source]")!;
    expect(box1.getAttribute("data-plan-source")).toBe("Older description source");
    expect(box1.getAttribute("data-editing")).toBe("true");
    cleanup();
    const reading = setup({ editing: false, value: { text: "Ben said" }, inputLabel: "Source of the walk" });
    const box2 = reading.view.container.querySelector("[data-plan-source]")!;
    expect(box2.getAttribute("data-plan-source")).toBe("Source of the walk");
    expect(box2.getAttribute("data-editing")).toBe("false");
  });

  it("reading: the person, with no picker, no Remove and no new-stakeholder button", () => {
    setup({ editing: false, value: { statedBy: ANN } });
    expect(screen.getByText("Source:")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ann Co" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove source" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ New stakeholder" })).toBeNull();
    expect(screen.queryByText(ANN)).toBeNull();
  });

  it("reading: person and document read 'Source: Ann Co · from Plan document'", () => {
    const { view } = setup({ editing: false, value: { statedBy: ANN, derivedFrom: DOC } });
    expect(view.container.textContent).toBe("Source: Ann Co · from Plan document".replace(/ /g, " ").replace("Source: Ann Co · from", "Source: Ann Co · from"));
  });

  it("reading: a document alone reads 'Source: from Plan document', and words come last", () => {
    const only = setup({ editing: false, value: { derivedFrom: DOC } });
    expect(only.view.container.textContent).toBe("Source: from Plan document");
    cleanup();
    const all = setup({ editing: false, value: { statedBy: ANN, derivedFrom: DOC, text: "per Ben" } });
    expect(all.view.container.textContent).toBe("Source: Ann Co · from Plan document per Ben");
    cleanup();
    const words = setup({ editing: false, value: "an old note" });
    expect(words.view.container.textContent).toBe("Source: an old note");
  });

  it("editing: Remove source shows only when something is said", () => {
    setup({ editing: true, value: {} });
    expect(screen.queryByRole("button", { name: "Remove source" })).toBeNull();
    cleanup();
    setup({ editing: true, value: { statedBy: ANN } });
    expect(screen.getByRole("button", { name: "Remove source" })).toBeTruthy();
  });

  it("the picker has the input label as its name and 'Source' as its placeholder", () => {
    setup();
    expect(box().getAttribute("placeholder")).toBe("Source");
  });

  it("offers '+ New stakeholder' by default and not with offerNewStakeholder false", () => {
    setup();
    expect(screen.getByRole("button", { name: "+ New stakeholder" })).toBeTruthy();
    cleanup();
    setup({ offerNewStakeholder: false });
    expect(screen.queryByRole("button", { name: "+ New stakeholder" })).toBeNull();
  });
});

describe("committing", () => {
  it("picking a person commits it as statedBy, and a document as derivedFrom", async () => {
    const h = makeHost();
    h.find.mockResolvedValue(whole([{ uri: ANN, label: "Ann Co" }]));
    const t = setup({ value: { text: "old words", derivedFrom: DOC } }, h);
    await typeInto("ann");
    await userEvent.click(await screen.findByRole("button", { name: /Ann Co/ }));
    expect(t.onCommit).toHaveBeenCalledWith({ derivedFrom: DOC, statedBy: ANN });
  });

  it("a hit in the Documents group is derivedFrom and keeps the person and the words", async () => {
    const h = makeHost();
    h.state.files = { data: [file("plan-doc", "Plan notes")], isPending: false, error: null };
    const t = setup({ value: { statedBy: ANN, text: "per Ben" } }, h);
    await typeInto("plan");
    await userEvent.click(await screen.findByRole("button", { name: /Plan notes/ }));
    expect(t.onCommit).toHaveBeenCalledWith({ statedBy: ANN, derivedFrom: "https://h.example.test/base/e/plan-doc", text: "per Ben" });
  });

  it("'Use as text' commits the typed words, keeping a link already there", async () => {
    const t = setup({ value: { statedBy: ANN } });
    await typeInto("someone new");
    await userEvent.click(await screen.findByRole("button", { name: 'Use "someone new" as text' }));
    expect(t.onCommit).toHaveBeenCalledWith({ statedBy: ANN, text: "someone new" });
  });

  it("Remove source commits an empty source and the picker starts afresh", async () => {
    const t = setup({ value: { text: "kept in the prop" } });
    const user = await typeInto("half typed");
    expect((box() as HTMLInputElement).value).toBe("half typed");
    await user.click(screen.getByRole("button", { name: "Remove source" }));
    expect(t.onCommit).toHaveBeenCalledWith({});
    expect((box() as HTMLInputElement).value).toBe("");
  });

  it("the buttons under the picker do not take the focus from it on a mouse press", async () => {
    setup();
    await typeInto("zz");
    const asText = await screen.findByRole("button", { name: 'Use "zz" as text' });
    expect(fireEvent.mouseDown(asText)).toBe(false);
    const add = screen.getByRole("button", { name: "+ New stakeholder" });
    expect(fireEvent.mouseDown(add)).toBe(false);
  });
});

describe("the search", () => {
  it("asks the host's stakeholder search with the held vaults, the kind names and the typed text", async () => {
    const h = makeHost();
    h.state.shell.vaults = [
      { vaultId: VAULT, held: true },
      { vaultId: "https://q.example.test/vault", held: false },
      { vaultId: "https://r.example.test/vault", held: true },
    ];
    setup({}, h);
    await typeInto("ann");
    await waitFor(() => expect(h.find).toHaveBeenCalledWith([VAULT, "https://r.example.test/vault"], ["Person"], "ann"));
  });

  it("lists the people first, then the documents, under a Documents heading", async () => {
    const h = makeHost();
    h.find.mockResolvedValue(whole([{ uri: ANN, label: "Ann plan" }]));
    h.state.files = { data: [file("plan-doc", "Plan notes", { typeUri: "https://types.example.test/base/t/Report" })], isPending: false, error: null };
    setup({}, h);
    await typeInto("plan");
    await screen.findByText("Plan notes");
    const list = screen.getByTestId("org-record-hits");
    const hits = within(list).getAllByTestId("org-record-hit");
    expect(hits).toHaveLength(2);
    expect(hits[0]!.textContent).toContain("Ann plan");
    expect(hits[1]!.textContent).toContain("Plan notes");
    expect(hits[1]!.textContent).toContain("Report");
    expect(within(list).getAllByTestId("org-record-group").map((g) => g.textContent)).toEqual([PLAN_SOURCE_DOCUMENTS]);
  });

  it("offers a file once, and none without an address, and nothing for an empty search", async () => {
    const h = makeHost();
    h.state.files = {
      data: [file("a", "Plan A"), file("a2", "Plan A again", { entityUri: file("a", "").entityUri }), file("b", "Plan B", { entityUri: null }), file("c", "Plan C", { typeUri: null })],
      isPending: false,
      error: null,
    };
    setup({}, h);
    await typeInto("plan");
    const list = await screen.findByTestId("org-record-hits");
    const names = within(list).getAllByTestId("org-record-hit").map((x) => x.textContent ?? "");
    expect(names.some((n) => n.includes("Plan A again"))).toBe(false);
    expect(names.some((n) => n.includes("Plan B"))).toBe(false);
    expect(names.some((n) => n.includes("Plan A"))).toBe(true);
    expect(names.some((n) => n.includes("Plan C") && n.includes("File"))).toBe(true);
  });

  it("offers no document for an empty search, whatever the host's matcher answers for it", async () => {
    const h = makeHost();
    h.host.matchWorkingSetQuery = (items) => [...items];
    h.state.files = { data: [file("a", "Plan A")], isPending: false, error: null };
    setup({}, h);
    await userEvent.click(box());
    await waitFor(() => expect(callsFor(h.find, "")).toHaveLength(1));
    await act(async () => {});
    expect(screen.queryByText("Plan A")).toBeNull();
    await userEvent.type(box(), "p");
    expect(await screen.findByText("Plan A")).toBeTruthy();
  });

  it("is whole only when the people search and the files are", async () => {
    const h = makeHost();
    h.state.files = { data: [], isPending: true, error: null };
    setup({}, h);
    await typeInto("zz");
    expect(await screen.findByText("No match among the stakeholder records read; the list may not be whole.")).toBeTruthy();
    cleanup();
    const h2 = makeHost();
    h2.state.files = { data: [], isPending: false, error: new Error("files down") };
    setup({}, h2);
    await typeInto("zz");
    expect(await screen.findByText("No match among the stakeholder records read; the list may not be whole.")).toBeTruthy();
    cleanup();
    const h3 = makeHost();
    h3.find.mockResolvedValue({ hits: [], complete: false, vaultsMissed: false });
    setup({}, h3);
    await typeInto("zz");
    expect(await screen.findByText("No match among the stakeholder records read; the list may not be whole.")).toBeTruthy();
    cleanup();
    const h4 = makeHost();
    setup({}, h4);
    await typeInto("zz");
    expect(await screen.findByText("No stakeholder or document matches.")).toBeTruthy();
  });

  it("says it could not search when the host's search fails", async () => {
    const h = makeHost();
    h.find.mockRejectedValue(new Error("down"));
    setup({}, h);
    await typeInto("ann");
    expect(await screen.findByText("Could not search stakeholders. That is not a statement that there are none.")).toBeTruthy();
  });

  it("passes no kind names while they are being read, and the host's empty answer is incomplete, not 'none'", async () => {
    const h = makeHost();
    h.state.kinds = {};
    h.find.mockImplementation(async (_v, names) => (names.length === 0 ? { hits: [], complete: false, vaultsMissed: false } : whole()));
    setup({}, h);
    await typeInto("ann");
    await waitFor(() => expect(h.find).toHaveBeenCalledWith([VAULT], [], "ann"));
    expect(await screen.findByText("No match among the stakeholder records read; the list may not be whole.")).toBeTruthy();
    expect(screen.queryByText("No stakeholder or document matches.")).toBeNull();
  });

  it("asks again when the files change state, because the key carries it", async () => {
    const h = makeHost();
    h.state.files = { data: [], isPending: true, error: null };
    const t = setup({}, h);
    await typeInto("plan");
    await waitFor(() => expect(callsFor(h.find, "plan")).toHaveLength(1));
    t.again();
    await act(async () => {});
    expect(callsFor(h.find, "plan")).toHaveLength(1);
    h.state.files = { data: [file("plan-doc", "Plan notes")], isPending: false, error: null };
    t.again();
    await waitFor(() => expect(callsFor(h.find, "plan")).toHaveLength(2));
    expect(await screen.findByText("Plan notes")).toBeTruthy();
  });

  it("asks again when the kinds or the vaults change", async () => {
    const h = makeHost();
    const t = setup({}, h);
    await typeInto("ann");
    await waitFor(() => expect(callsFor(h.find, "ann")).toHaveLength(1));
    h.state.kinds = { data: { names: ["Person", "Organization"] } };
    t.again();
    await waitFor(() => expect(callsFor(h.find, "ann")).toHaveLength(2));
    expect(callsFor(h.find, "ann")[1]).toEqual([[VAULT], ["Person", "Organization"], "ann"]);
    h.state.shell = { ...h.state.shell, vaults: [...h.state.shell.vaults, { vaultId: "https://r.example.test/vault", held: true }] };
    t.again();
    await waitFor(() => expect(callsFor(h.find, "ann")).toHaveLength(3));
    expect(callsFor(h.find, "ann")[2]).toEqual([[VAULT, "https://r.example.test/vault"], ["Person", "Organization"], "ann"]);
  });

  it("reads the files list at search time: a changed list of the same state is seen by the next search", async () => {
    const h = makeHost();
    h.state.files = { data: [file("a", "Plan A")], isPending: false, error: null };
    const t = setup({}, h);
    const user = await typeInto("plan");
    expect(await screen.findByText("Plan A")).toBeTruthy();
    h.state.files = { data: [file("b", "Plan B")], isPending: false, error: null };
    t.again();
    await user.clear(box());
    await user.type(box(), "plan b");
    expect(await screen.findByText("Plan B")).toBeTruthy();
    expect(screen.queryByText("Plan A")).toBeNull();
  });
});

describe("what it asks the host while it renders", () => {
  it("reads the kinds and the files only while editing", () => {
    const h = makeHost();
    setup({ editing: false, value: { text: "x" } }, h);
    expect(h.log).toContain("useStakeholderTypes false");
    expect(h.log).toContain("useVaultFilesMulti [] live");
    cleanup();
    const e = makeHost();
    setup({ editing: true }, e);
    expect(e.log).toContain("useStakeholderTypes true");
    expect(e.log).toContain(`useVaultFilesMulti ["${VAULT}"] live`);
  });

  it("calls the shell hook twice a render, and the held-vaults function once", () => {
    const h = makeHost();
    setup({ editing: true }, h);
    const first = h.log.slice(0, h.log.indexOf("heldVaultIds") + 1);
    expect(first).toEqual(["useShell", "useShell", "heldVaultIds"]);
  });

  it("works out the held vaults again only when the shell's vaults change", () => {
    const h = makeHost();
    const t = setup({ editing: true }, h);
    const count = () => h.log.filter((x) => x === "heldVaultIds").length;
    expect(count()).toBe(1);
    t.again();
    expect(count()).toBe(1);
    h.state.shell = { ...h.state.shell, vaults: [...h.state.shell.vaults] };
    t.again();
    expect(count()).toBe(2);
  });

  it("treats a shell with no vaults as none held", async () => {
    const h = makeHost();
    (h.state.shell as { vaults?: unknown }).vaults = undefined;
    setup({}, h);
    await typeInto("ann");
    await waitFor(() => expect(h.find).toHaveBeenCalledWith([], ["Person"], "ann"));
  });
});

describe("opening a record", () => {
  it("opens it in its own vault, pushed, when the shell can", async () => {
    const h = makeHost();
    const open = vi.fn();
    h.state.shell.openRecordInVault = open;
    const t = setup({ editing: false, value: { statedBy: ANN, derivedFrom: BEN } }, h);
    await userEvent.click(screen.getByRole("button", { name: "Ann Co" }));
    expect(open).toHaveBeenCalledWith("https://h.example.test/base", "ann", { push: true });
    await userEvent.click(screen.getByRole("button", { name: "Ben Co" }));
    expect(open).toHaveBeenLastCalledWith("https://h.example.test/vault", "ben", { push: true });
    expect(t.onOpen).not.toHaveBeenCalled();
  });

  it("falls back to onOpen with the id when the shell cannot open in a vault", async () => {
    const t = setup({ editing: false, value: { statedBy: ANN } });
    await userEvent.click(screen.getByRole("button", { name: "Ann Co" }));
    expect(t.onOpen).toHaveBeenCalledWith("ann");
  });

  it("falls back to onOpen when the address names no vault, and does nothing for text that is no record", async () => {
    const h = makeHost();
    const open = vi.fn();
    h.state.shell.openRecordInVault = open;
    const t = setup({ editing: false, value: { derivedFrom: "https://h.example.test/doc/e/plain" } }, h);
    expect(screen.queryByRole("button")).toBeNull();
    expect(t.onOpen).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});

describe("+ New stakeholder", () => {
  const press = () => userEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));

  it("opens the create dialog on the Stakeholders form, drawing this vault, and closes it", async () => {
    const t = setup();
    expect(screen.queryByTestId("create-dialog")).toBeNull();
    await press();
    expect(screen.getByTestId("create-dialog")).toBeTruthy();
    const props = t.state.dialogProps.at(-1)!;
    expect(props.open).toBe(true);
    expect(props.stakeholders).toBe(true);
    expect(props.source).toBeNull();
    expect(props.drawnVaultIds).toEqual([VAULT]);
    await userEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByTestId("create-dialog")).toBeNull();
    expect(t.onCommit).not.toHaveBeenCalled();
  });

  it("makes a created record with an address the source, without reading it", async () => {
    const t = setup({ value: { derivedFrom: DOC } });
    await press();
    await userEvent.click(screen.getByRole("button", { name: "Created address" }));
    expect(screen.queryByTestId("create-dialog")).toBeNull();
    await waitFor(() => expect(t.onCommit).toHaveBeenCalledWith({ derivedFrom: DOC, statedBy: "https://h.example.test/base/e/new-ben" }));
    expect(t.readRecord).not.toHaveBeenCalled();
  });

  it("reads a created bare id at the record's own address and uses the address that comes back", async () => {
    const h = makeHost();
    h.readRecord.mockResolvedValue({ id: "new-ann", entityUri: "https://h.example.test/base/e/new-ann", typeUri: "t:Person", facts: {}, opaqueFacts: [], etag: null });
    const t = setup({}, h);
    await press();
    await userEvent.click(screen.getByRole("button", { name: "Created bare id" }));
    await waitFor(() => expect(t.onCommit).toHaveBeenCalledWith({ statedBy: "https://h.example.test/base/e/new-ann" }));
    expect(h.readRecord).toHaveBeenCalledWith("new-ann", record.entityUri);
    expect(h.memberEntityUri).not.toHaveBeenCalled();
  });

  it("reads at the vault when the record has no address, and composes the address when the read finds nothing or fails", async () => {
    const h = makeHost();
    const bare = { ...record, entityUri: undefined } as BaseRecord;
    const t = setup({ record: bare }, h);
    await press();
    await userEvent.click(screen.getByRole("button", { name: "Created bare id" }));
    await waitFor(() => expect(t.onCommit).toHaveBeenCalledWith({ statedBy: `${VAULT}/e/new-ann` }));
    expect(h.readRecord).toHaveBeenCalledWith("new-ann", VAULT);
    expect(h.memberEntityUri).toHaveBeenCalledWith("new-ann", null, VAULT);

  });

  it("composes the address when the read rejects", async () => {
    const h = makeHost();
    h.readRecord.mockRejectedValue(new Error("down"));
    const t = setup({}, h);
    await press();
    await userEvent.click(screen.getByRole("button", { name: "Created bare id" }));
    await waitFor(() => expect(t.onCommit).toHaveBeenCalledWith({ statedBy: `${VAULT}/e/new-ann` }));
  });
});

describe("the host", () => {
  it("is required: without a provider the error names it", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<PlanSource value={{}} editing vaultId={VAULT} record={record} inputLabel="x" onOpen={() => {}} onCommit={() => {}} />)).toThrow(
      "plan-source: wrap the app in <PlanSourceHostContext.Provider value={host}>",
    );
    expect(() =>
      render(
        <PlanSourceHostContext.Provider value={null}>
          <PlanSource value={{}} editing vaultId={VAULT} record={record} inputLabel="x" onOpen={() => {}} onCommit={() => {}} />
        </PlanSourceHostContext.Provider>,
      ),
    ).toThrow(/PlanSourceHostContext/);
    quiet.mockRestore();
  });

  it("is used as given: a host with only what this render needs works", () => {
    const h = makeHost();
    const host: PlanSourceHost = h.host;
    expect(Object.keys(host).sort()).toEqual(
      ["ConnectedCreateDialog", "findStakeholderRecords", "heldVaultIds", "matchWorkingSetQuery", "memberEntityUri", "readRecord", "useShell", "useStakeholderTypes", "useVaultFilesMulti"].sort(),
    );
  });
});
