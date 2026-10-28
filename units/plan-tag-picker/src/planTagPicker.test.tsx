// PlanTagPicker and the pieces it shares with the link views, against a fake host. The source had no test of these on their
// own (they were drawn inside cards); every case here is new and pins what the source did, odd cases included.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PickerQueryContext } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { ReactNode } from "react";
import { PlanTagPicker, PlanTagPickerHostContext, SEARCH_ERROR, SEARCH_INCOMPLETE_CREATE, TagLink, chosenRow, httpStatus, noticeFor, planSearchKey, rowOnHit, tagShaped, usePlanPickerFind } from "./index";
import { Frame, VAULT, gridRow, hit, labels, makeHost, newClient, page, row, uri } from "../test/fakeHost";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const k of Object.keys(labels)) delete labels[k];
});

type Props = Partial<Parameters<typeof PlanTagPicker>[0]>;

function setup(props: Props = {}, h = makeHost(), client = newClient()) {
  const onChoose = vi.fn();
  const onCreate = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Frame host={h.host} client={client}>
      {children}
    </Frame>
  );
  const ui = (p: Props = props) => (
    <PlanTagPicker
      vaultId={VAULT}
      ariaLabel="Part of"
      placeholder="Search"
      kindLabel="Function"
      pool={[]}
      typeName="Function"
      excluded={new Set()}
      busy={false}
      onChoose={onChoose}
      onCreate={onCreate}
      {...p}
    />
  );
  const view = render(ui(), { wrapper });
  return { ...h, client, onChoose, onCreate, view, again: (p: Props = props) => view.rerender(ui(p)) };
}

const box = () => screen.getByRole("textbox", { name: "Part of" });
async function typeInto(text: string) {
  const user = userEvent.setup();
  await user.click(box());
  await user.type(box(), text);
  return user;
}
const create = () => screen.queryAllByTestId("plan-link-create");
const lastCall = (fn: { mock: { calls: unknown[][] } }, text: string) => fn.mock.calls.filter((c) => c[1] === text);

describe("the search", () => {
  it("draws the picker, asks nothing on mount, and asks the host with the plan vault, the text and the type name", async () => {
    const t = setup({ planVault: "https://q.example.test/vault" });
    expect(screen.getByTestId("plan-link-picker")).toBeTruthy();
    await act(async () => {});
    expect(t.find).not.toHaveBeenCalled();
    await typeInto("Door");
    await waitFor(() => expect(t.find).toHaveBeenCalledWith("https://q.example.test/vault", "Door", ["Function"]));
  });

  it("searches the plan vault, which is the vault id unless planVault is given", async () => {
    const t = setup();
    await typeInto("Door");
    await waitFor(() => expect(t.find).toHaveBeenCalledWith(VAULT, "Door", ["Function"]));
  });

  it("searches typeNames when they are given, and typeName otherwise", async () => {
    const t = setup({ typeNames: ["Function", "SubFunction"] });
    await typeInto("Door");
    await waitFor(() => expect(t.find).toHaveBeenCalledWith(VAULT, "Door", ["Function", "SubFunction"]));
  });

  it("asks once the box is clicked, with the empty text, and not before", async () => {
    const t = setup();
    await userEvent.click(box());
    await waitFor(() => expect(t.find).toHaveBeenCalledWith(VAULT, "", ["Function"]));
  });

  it("gives the picker's query hook the search key, a 30 s stale time, and no search until it is engaged", async () => {
    const calls: { key: readonly unknown[]; enabled: boolean; staleTime: number }[] = [];
    const h = makeHost();
    const recording = ({ key, enabled, staleTime }: { key: readonly unknown[]; enabled: boolean; staleTime: number }) => {
      calls.push({ key, enabled, staleTime });
      return { isFetching: false, isError: false, isSuccess: false };
    };
    render(
      <PickerQueryContext.Provider value={recording as never}>
        <RefLabelContext.Provider value={() => null}>
          <PlanTagPickerHostContext.Provider value={h.host}>
            <PlanTagPicker vaultId={VAULT} ariaLabel="Part of" placeholder="" kindLabel="Function" pool={[]} typeName="Function" excluded={new Set()} busy={false} onChoose={() => {}} onCreate={() => {}} />
          </PlanTagPickerHostContext.Provider>
        </RefLabelContext.Provider>
      </PickerQueryContext.Provider>,
    );
    const last = calls[calls.length - 1]!;
    expect(last.key).toEqual(["plan-search", VAULT, "Function", ""]);
    expect(last.staleTime).toBe(30_000);
    expect(last.enabled).toBe(false);
  });

  it("searches with no type names when typeNames is an empty list", async () => {
    const t = setup({ typeNames: [] });
    await typeInto("Door");
    await waitFor(() => expect(t.find).toHaveBeenCalledWith(VAULT, "Door", []));
  });

  it("shows the hits under plan-link-hits, by label", async () => {
    const h = makeHost();
    h.find.mockResolvedValue(page([hit("a", "Door.Open", "Door.Open"), hit("b", "Door.Close", "Door.Close")]));
    setup({}, h);
    await typeInto("Door");
    const list = await screen.findByTestId("plan-link-hits");
    expect(within(list).getAllByTestId("org-record-hit").map((x) => x.textContent)).toEqual(["Door.Open", "Door.Close"]);
  });

  it("accepts a host hit that carries more than the picker reads, and chooses its row", async () => {
    const h = makeHost();
    const a = { uri: uri("a"), id: "a", tag: "Door.Open", typeName: "Function", label: "Door.Open", row: row("a", "Door.Open") };
    h.find.mockResolvedValue({ hits: [a], complete: true } as never);
    const t = setup({}, h);
    await typeInto("Door");
    await screen.findByText("Door.Open");
    await userEvent.click(screen.getByText("Door.Open"));
    expect(t.onChoose).toHaveBeenCalledTimes(1);
    expect(t.onChoose.mock.calls[0]![0].id).toBe("a");
  });

  it("drops the excluded addresses from the hits", async () => {
    const h = makeHost();
    h.find.mockResolvedValue(page([hit("a", "Door.Open"), hit("b", "Door.Close")]));
    setup({ excluded: new Set([uri("a")]) }, h);
    await typeInto("Door");
    await screen.findByText("Door.Close");
    expect(screen.queryByText("Door.Open")).toBeNull();
  });

  it("says it could not search when the host's search fails", async () => {
    const h = makeHost();
    h.find.mockRejectedValue(new Error("down"));
    setup({}, h);
    await typeInto("Door");
    expect((await screen.findByRole("alert")).textContent).toBe(SEARCH_ERROR);
  });

  it("says nothing for no hit, whole or not: the none and partial words are empty", async () => {
    const h = makeHost();
    h.find.mockResolvedValue(page([], false));
    setup({}, h);
    await typeInto("speed");
    await waitFor(() => expect(lastCall(h.find, "speed")).toHaveLength(1));
    await act(async () => {});
    expect(screen.queryByTestId("org-record-none")).toBeNull();
  });

  it("is given the search key as the picker's query key, so the host can invalidate it", async () => {
    const t = setup({ typeNames: ["A", "B"] });
    await typeInto("Door");
    await waitFor(() => expect(lastCall(t.find, "Door")).toHaveLength(1));
    expect(t.client.getQueryCache().find({ queryKey: planSearchKey(VAULT, "A\0B", "Door") })).toBeDefined();
  });
});

describe("picking a hit", () => {
  it("chooses the live row of the pool when the pool has it", async () => {
    const h = makeHost();
    h.find.mockResolvedValue(page([hit("a", "Door.Open")]));
    const live = gridRow("a", "Door.Open");
    const t = setup({ pool: [gridRow("z", "Other"), live] }, h);
    await typeInto("Door");
    await userEvent.click(await screen.findByText("Door.Open"));
    expect(t.onChoose).toHaveBeenCalledWith(live);
    expect(t.onChoose.mock.calls[0]![0]).toBe(live);
  });

  it("chooses the row the search read, stamped with the time, when the pool does not have it", async () => {
    const h = makeHost();
    h.find.mockResolvedValue(page([hit("a", "Door.Open")]));
    const t = setup({}, h);
    await typeInto("Door");
    await userEvent.click(await screen.findByText("Door.Open"));
    expect(t.onChoose).toHaveBeenCalledTimes(1);
    const chosen = t.onChoose.mock.calls[0]![0];
    expect(chosen).toMatchObject({ id: "a", entityUri: uri("a"), facts: { unitTag: "Door.Open" } });
    expect(typeof chosen.updatedAt).toBe("number");
  });
});

describe("Create", () => {
  it("a tag-shaped text that no hit has asks the host whether the tag is used, and offers Create when it is free", async () => {
    const t = setup();
    await typeInto("Door.Close");
    const button = await screen.findByTestId("plan-link-create");
    expect(button.textContent).toBe('Create Function "Door.Close"');
    expect(t.tagUsed).toHaveBeenCalledWith(VAULT, "Door.Close");
    await userEvent.click(button);
    expect(t.onCreate).toHaveBeenCalledWith("Door.Close");
  });

  it("a tag-shaped text is offered even when the search was not whole", async () => {
    const h = makeHost();
    h.find.mockResolvedValue(page([], false));
    setup({}, h);
    await typeInto("Door");
    expect((await screen.findByTestId("plan-link-create")).textContent).toBe('Create Function "Door"');
    expect(screen.queryByText(SEARCH_INCOMPLETE_CREATE)).toBeNull();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("a tag that is used is not offered, and nothing is said", async () => {
    const h = makeHost();
    h.tagUsed.mockResolvedValue(true);
    setup({}, h);
    await typeInto("Door");
    await waitFor(() => expect(h.tagUsed).toHaveBeenCalledWith(VAULT, "Door"));
    await act(async () => {});
    expect(create()).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a tag check that fails offers nothing and says it could not search", async () => {
    const h = makeHost();
    h.tagUsed.mockRejectedValue(new Error("down"));
    setup({}, h);
    await typeInto("Door");
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent)).toContain(SEARCH_ERROR);
    expect(create()).toHaveLength(0);
  });

  it("another text is offered only when the search was whole, and does not ask whether a tag is used", async () => {
    const h = makeHost();
    setup({}, h);
    await typeInto("speed limit");
    expect((await screen.findByTestId("plan-link-create")).textContent).toBe('Create Function "speed limit"');
    expect(h.tagUsed).not.toHaveBeenCalled();
  });

  it("another text with a search that was not whole is not offered; it says so and offers Try again", async () => {
    const h = makeHost();
    h.find.mockResolvedValue(page([], false));
    setup({}, h);
    await typeInto("speed limit");
    expect(await screen.findByText(SEARCH_INCOMPLETE_CREATE)).toBeTruthy();
    expect(create()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(h.tagUsed).not.toHaveBeenCalled();
  });

  it("is not offered for a text a hit already has, by label or by the row's tag", async () => {
    const h = makeHost();
    h.find.mockResolvedValue(page([hit("a", "Door.Open")]));
    setup({}, h);
    await typeInto("Door.Open");
    await screen.findAllByText("Door.Open");
    await act(async () => {});
    expect(create()).toHaveLength(0);
    expect(h.tagUsed).not.toHaveBeenCalled();
    cleanup();
    const h2 = makeHost();
    h2.find.mockResolvedValue(page([hit("a", "Door.Open", "Open the door")]));
    setup({}, h2);
    await typeInto("Door.Open");
    await screen.findByText("Open the door");
    await act(async () => {});
    expect(create()).toHaveLength(0);
  });

  it("is not offered for empty or blank text", async () => {
    const t = setup();
    await userEvent.click(box());
    await userEvent.type(box(), "   ");
    await waitFor(() => expect(lastCall(t.find, "")).not.toHaveLength(0));
    await act(async () => {});
    expect(create()).toHaveLength(0);
    expect(t.tagUsed).not.toHaveBeenCalled();
  });

  it("uses the trimmed text", async () => {
    const t = setup();
    await typeInto("  Door.Close  ");
    const button = await screen.findByTestId("plan-link-create");
    expect(button.textContent).toBe('Create Function "Door.Close"');
    await userEvent.click(button);
    expect(t.onCreate).toHaveBeenCalledWith("Door.Close");
  });

  it("waits for the answer to the text on screen: nothing is offered while the search is open", async () => {
    const h = makeHost();
    let release!: (p: ReturnType<typeof page>) => void;
    h.find.mockImplementation((_v, text) => (text === "Door" ? new Promise((resolve) => (release = resolve)) : Promise.resolve(page())));
    setup({}, h);
    await typeInto("Door");
    await waitFor(() => expect(lastCall(h.find, "Door")).toHaveLength(1));
    expect(create()).toHaveLength(0);
    expect(h.tagUsed).not.toHaveBeenCalled();
    await act(async () => release(page()));
    expect((await screen.findByTestId("plan-link-create")).textContent).toBe('Create Function "Door"');
  });

  it("is disabled while busy, and a mouse press on it does not move the focus", async () => {
    const t = setup({ busy: true });
    await typeInto("Door");
    const button = (await screen.findByTestId("plan-link-create")) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    t.again({ busy: false });
    expect((screen.getByTestId("plan-link-create") as HTMLButtonElement).disabled).toBe(false);
    expect(fireEvent.mouseDown(screen.getByTestId("plan-link-create"))).toBe(false);
  });

  it("uses the kind label in the button", async () => {
    setup({ kindLabel: "Solution" });
    await typeInto("Door");
    expect((await screen.findByTestId("plan-link-create")).textContent).toBe('Create Solution "Door"');
  });

  it("creates replaces the one button with one per entry, each with its own handler", async () => {
    const a = vi.fn();
    const b = vi.fn();
    setup({ creates: [{ label: "Value", onCreate: a }, { label: "Function", onCreate: b }] });
    await typeInto("Door");
    await screen.findAllByTestId("plan-link-create");
    expect(create().map((x) => x.textContent)).toEqual(['Create Value "Door"', 'Create Function "Door"']);
    await userEvent.click(create()[1]!);
    expect(b).toHaveBeenCalledWith("Door");
    expect(a).not.toHaveBeenCalled();
  });

  it("an empty creates list falls back to the one button", async () => {
    const t = setup({ creates: [] });
    await typeInto("Door");
    expect(create()).toHaveLength(0);
    const only = await screen.findByTestId("plan-link-create");
    await userEvent.click(only);
    expect(t.onCreate).toHaveBeenCalledWith("Door");
  });
});

describe("Try again", () => {
  it("is outside the picker's keep-open rule, tells the host to invalidate the search under its key, and does not take the focus", async () => {
    const h = makeHost();
    h.find.mockResolvedValue(page([], false));
    setup({ typeNames: ["A", "B"] }, h);
    await typeInto("speed limit");
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(retry.getAttribute("data-picker-keep")).toBe("");
    expect(fireEvent.mouseDown(retry)).toBe(false);
    await userEvent.click(retry);
    expect(h.invalidate).toHaveBeenCalledTimes(1);
    expect(h.invalidate).toHaveBeenCalledWith(["plan-search", VAULT, "A\0B", "speed limit"]);
  });

  it("asks the search again when the host's invalidation reaches the picker's query", async () => {
    const client = newClient();
    const h = makeHost(client);
    let asked = 0;
    h.find.mockImplementation(async (_v, text) => (text === "speed limit" && asked++ === 0 ? page([], false) : page([], true)));
    setup({}, h, client);
    await typeInto("speed limit");
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(lastCall(h.find, "speed limit")).toHaveLength(2));
    expect((await screen.findByTestId("plan-link-create")).textContent).toBe('Create Function "speed limit"');
    expect(screen.queryByText(SEARCH_INCOMPLETE_CREATE)).toBeNull();
  });
});

describe("the host", () => {
  it("is required: without a provider the error names it", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = "plan-tag-picker: wrap the app in <PlanTagPickerHostContext.Provider value={host}>";
    expect(() => renderHook(() => usePlanPickerFind(VAULT, ["Function"], ""))).toThrow(message);
    expect(() =>
      render(
        <PlanTagPickerHostContext.Provider value={null}>
          <PlanTagPicker vaultId={VAULT} ariaLabel="x" placeholder="" kindLabel="Value" pool={[]} typeName="Value" excluded={new Set()} busy={false} onChoose={() => {}} onCreate={() => {}} />
        </PlanTagPickerHostContext.Provider>,
      ),
    ).toThrow(/PlanTagPickerHostContext/);
    quiet.mockRestore();
  });
});

describe("usePlanPickerFind", () => {
  const frame = (h = makeHost()) => ({ h, wrapper: ({ children }: { children: ReactNode }) => <PlanTagPickerHostContext.Provider value={h.host}>{children}</PlanTagPickerHostContext.Provider> });

  it("returns the search key of the trimmed draft and the type names, joined by NUL", () => {
    const { wrapper } = frame();
    const { result } = renderHook(() => usePlanPickerFind(VAULT, ["A", "B"], "  Door  "), { wrapper });
    expect(result.current.queryKey).toEqual(["plan-search", VAULT, "A\0B", "Door"]);
    expect(result.current.canCreate).toBe(false);
    expect(result.current.showIncomplete).toBe(false);
    expect(result.current.tagFailed).toBe(false);
    expect(result.current.rowFor("nothing")).toBeNull();
  });

  it("find maps the host's hits to uri, label and row, and keeps complete", async () => {
    const h = makeHost();
    const a = hit("a", "Door.Open");
    h.find.mockResolvedValue({ hits: [{ ...a, extra: 1 } as never], complete: false });
    const { wrapper } = frame(h);
    const { result } = renderHook(() => usePlanPickerFind(VAULT, ["Function"], "Door"), { wrapper });
    await expect(result.current.find("Door")).resolves.toEqual({ hits: [{ uri: a.uri, label: a.label, row: a.row }], complete: false });
    expect(h.find).toHaveBeenCalledWith(VAULT, "Door", ["Function"]);
  });

  it("rowFor finds a row by the hit's address or its id once the answer for the draft is in", async () => {
    const h = makeHost();
    const { wrapper } = frame(h);
    const a = hit("a", "Door.Open");
    const { result } = renderHook(() => usePlanPickerFind(VAULT, ["Function"], "Door"), { wrapper });
    expect(result.current.rowFor(a.uri)).toBeNull();
    act(() => result.current.onAnswer({ hits: [{ uri: a.uri, label: a.label, row: a.row }], complete: true }, "Door"));
    expect(result.current.rowFor(a.uri)).toBe(a.row);
    expect(result.current.rowFor("a")).toBe(a.row);
    expect(result.current.rowFor("b")).toBeNull();
  });

  it("ignores an answer for another text", async () => {
    const h = makeHost();
    const { wrapper } = frame(h);
    const a = hit("a", "Door.Open");
    const { result } = renderHook(() => usePlanPickerFind(VAULT, ["Function"], "Door"), { wrapper });
    act(() => result.current.onAnswer({ hits: [{ uri: a.uri, label: a.label, row: a.row }], complete: true }, "Doo"));
    expect(result.current.rowFor(a.uri)).toBeNull();
    expect(result.current.canCreate).toBe(false);
    await act(async () => {});
    expect(h.tagUsed).not.toHaveBeenCalled();
  });
});

describe("tagShaped", () => {
  it("is true when every dot part is one capital-led word of letters", () => {
    for (const ok of ["Door", "Door.Close", "X", "A.B.C", "DoorClose", "DOOR"]) expect(tagShaped(ok), ok).toBe(true);
  });
  it("is false for an empty part, a lower-case start, a digit, a space or a dash", () => {
    for (const bad of ["", "A.", ".A", "A..B", "speed", "door.Close", "Door.close", "Door.cLose", "Door2", "Door 1", "Door-Close", "Door Close", " Door", "Ünder"]) expect(tagShaped(bad), JSON.stringify(bad)).toBe(false);
  });
});

describe("planSearchKey", () => {
  it("is the key the search is cached under", () => {
    expect(planSearchKey(VAULT, "Function", "Door")).toEqual(["plan-search", VAULT, "Function", "Door"]);
  });
});

describe("rowOnHit and chosenRow", () => {
  it("rowOnHit is the hit's row, or null", () => {
    const r = row("a", "A");
    expect(rowOnHit({ uri: uri("a"), row: r })).toBe(r);
    expect(rowOnHit({ uri: uri("a") })).toBeNull();
  });

  it("chosenRow takes the pool row with the hit's address, then the hit's id, then the read row's id", () => {
    const byUri = gridRow("u", "U");
    const byId = { ...gridRow("i", "I"), entityUri: undefined };
    const byRead = gridRow("r", "R");
    const pool = [byUri, byId, byRead];
    expect(chosenRow(pool, uri("u"), null)).toBe(byUri);
    expect(chosenRow(pool, "i", null)).toBe(byId);
    expect(chosenRow(pool, "no-match", row("r", "R"))).toBe(byRead);
  });

  it("chosenRow stamps the read row with the time when the pool does not have it, and is null with neither", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
    const read = row("n", "N");
    expect(chosenRow([], uri("n"), read)).toEqual({ ...read, updatedAt: Date.parse("2026-01-02T03:04:05Z") });
    expect(chosenRow([gridRow("z", "Z")], uri("n"), null)).toBeNull();
  });

  it("chosenRow keeps an updatedAt the read row already has", () => {
    const read = { ...row("n", "N"), updatedAt: 7 } as never;
    expect((chosenRow([], uri("n"), read) as { updatedAt: number }).updatedAt).toBe(7);
  });
});

describe("httpStatus and noticeFor", () => {
  it("httpStatus is a numeric status on an object, else undefined", () => {
    expect(httpStatus({ status: 409 })).toBe(409);
    expect(httpStatus(Object.assign(new Error("x"), { status: 500 }))).toBe(500);
    expect(httpStatus({ status: "409" })).toBeUndefined();
    expect(httpStatus({})).toBeUndefined();
    expect(httpStatus(null)).toBeUndefined();
    expect(httpStatus(undefined)).toBeUndefined();
    expect(httpStatus("409")).toBeUndefined();
    expect(httpStatus(409)).toBeUndefined();
  });

  it("noticeFor a 409 is the duplicate-tag sentence, whatever the error is", () => {
    const sentence = 'The tag "Door.Close" is already used in this vault. Pick another.';
    expect(noticeFor(Object.assign(new Error("conflict"), { status: 409 }), "Door.Close")).toBe(sentence);
    expect(noticeFor({ status: 409 }, "Door.Close")).toBe(sentence);
  });

  it("noticeFor another error is its message; a thing that is not an Error is the rolled-back sentence", () => {
    expect(noticeFor(new Error("It broke"), "T")).toBe("It broke");
    expect(noticeFor(Object.assign(new Error("Server said no"), { status: 500 }), "T")).toBe("Server said no");
    expect(noticeFor({ status: "409" }, "T")).toBe("Couldn't save — your change was rolled back. Try again.");
    expect(noticeFor("text", "T")).toBe("Couldn't save — your change was rolled back. Try again.");
    expect(noticeFor(null, "T")).toBe("Couldn't save — your change was rolled back. Try again.");
  });
});

describe("TagLink", () => {
  it("with an address shows the record by the label hook and opens it by id; the address line is not drawn", async () => {
    labels[uri("a")] = "Door.Open";
    const onOpen = vi.fn();
    const client = newClient();
    const h = makeHost();
    render(<TagLink id="a" entityUri={uri("a")} facts={{ unitTag: "Ignored" }} vaultId={VAULT} onOpen={onOpen} />, { wrapper: ({ children }) => <Frame host={h.host} client={client}>{children}</Frame> });
    const button = screen.getByRole("button", { name: "Door.Open" });
    expect(screen.queryByText(uri("a"))).toBeNull();
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith("a");
  });

  it("with an address shows the live label: the tag changes when the label does", () => {
    labels[uri("a")] = "Door.Open";
    const client = newClient();
    const h = makeHost();
    const ui = () => <TagLink id="a" entityUri={uri("a")} facts={{}} vaultId={VAULT} onOpen={() => {}} />;
    const wrapper = ({ children }: { children: ReactNode }) => <Frame host={h.host} client={client}>{children}</Frame>;
    const view = render(ui(), { wrapper });
    expect(screen.getByRole("button", { name: "Door.Open" })).toBeTruthy();
    labels[uri("a")] = "Door.Shut";
    view.rerender(ui());
    expect(screen.getByRole("button", { name: "Door.Shut" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Door.Open" })).toBeNull();
  });

  it("with no address shows the record's tag, then its display name, and opens it by id", async () => {
    const onOpen = vi.fn();
    const client = newClient();
    const h = makeHost();
    const wrapper = ({ children }: { children: ReactNode }) => <Frame host={h.host} client={client}>{children}</Frame>;
    render(<TagLink id="a" facts={{ unitTag: "Door.Open", label: "Opens" }} vaultId={VAULT} onOpen={onOpen} />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: "Door.Open" }));
    expect(onOpen).toHaveBeenCalledWith("a");
    cleanup();
    render(<TagLink id="b" facts={{ label: "Just a label" }} vaultId={VAULT} onOpen={onOpen} />, { wrapper });
    expect(screen.getByRole("button", { name: "Just a label" })).toBeTruthy();
    cleanup();
    render(<TagLink id="c" facts={{}} vaultId={VAULT} onOpen={onOpen} />, { wrapper });
    expect(screen.getByRole("button", { name: "Untitled" })).toBeTruthy();
  });
});
