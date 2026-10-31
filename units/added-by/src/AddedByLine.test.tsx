// What a click on "Added by <name>" does, and what the line draws. Replaces the five cases of GilbApp's AddedByLine.nameOnlyCard.sb1c.test.tsx at the
// edge of this unit: those mount the app's whole record screen (`RecordDetail`, its name-only card), which is not in the unit. What the unit owns of
// that behaviour is pinned here: the adder's card is opened at ITS OWN vault (the address `statedBy` carries), its door and name are remembered for the
// name-only card, and nothing opens when the address is not an entity address or there is no shell.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { addedByCardOf } from "@kaigilb/gilbplatformcode-record-detail-reads";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddedByHostContext, AddedByLine, type AddedByShell } from "./index";
import { installSourceName } from "../test/addedByTestkit";
import { ANNA, HYTTA, client, setUp, tearDown } from "../test/support";

beforeEach(setUp);
afterEach(() => {
  cleanup();
  tearDown();
});

const ITEM = `${HYTTA}/base/e/note-1`;
function mount(shell: AddedByShell | null, adder: { statedBy: string; name: string } | null = { statedBy: ANNA, name: "Anna Berg" }, own = false) {
  installSourceName(() => (adder ? { [ITEM]: adder } : ({} as Record<string, { statedBy: string | null; name: string | null }>)));
  const qc = client();
  const view = render(
    <AddedByHostContext.Provider value={{ useShell: () => shell }}>
      <QueryClientProvider client={qc}>
        <AddedByLine item={ITEM} own={own} />
      </QueryClientProvider>
    </AddedByHostContext.Provider>,
  );
  return { qc, view };
}

describe("what is drawn", () => {
  it("the viewer's own detail: 'Added by you', no link", () => {
    mount(null, null, true);
    expect(screen.getByTestId("added-by").textContent).toBe("Added by you");
    expect(screen.queryByTestId("added-by-link")).toBeNull();
  });
  it("another person's: 'Added by <name>' with the name as a link at the card's address", async () => {
    mount(null);
    const link = (await screen.findByTestId("added-by-link")) as HTMLAnchorElement;
    expect(screen.getByTestId("added-by").textContent).toBe("Added by Anna Berg");
    expect(link.href).toBe(ANNA);
  });
  it("not disclosed: nothing at all", async () => {
    const { view } = mount(null, null);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(view.container.innerHTML).toBe("");
  });
  it("no item: nothing is drawn and nothing is asked, even for an own detail", async () => {
    vi.useFakeTimers();
    const rig = installSourceName(() => ({}));
    const { container } = render(
      <AddedByHostContext.Provider value={{ useShell: () => null }}>
        <QueryClientProvider client={client()}>
          <AddedByLine item="" own={false} />
          <AddedByLine item="" own />
        </QueryClientProvider>
      </AddedByHostContext.Provider>,
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(container.innerHTML).toBe("");
    expect(rig.calls).toHaveLength(0);
  });
  it("a claim that names no source is not asked about", async () => {
    vi.useFakeTimers();
    const rig = installSourceName(() => ({}));
    render(
      <AddedByHostContext.Provider value={{ useShell: () => null }}>
        <QueryClientProvider client={client()}>
          <AddedByLine item={ITEM} own={false} hasSource={false} />
        </QueryClientProvider>
      </AddedByHostContext.Provider>,
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(rig.calls).toHaveLength(0);
  });
  it("a claim that names a source IS asked about (the same line, hasSource default)", async () => {
    vi.useFakeTimers();
    const rig = installSourceName(() => ({}));
    render(
      <AddedByHostContext.Provider value={{ useShell: () => null }}>
        <QueryClientProvider client={client()}>
          <AddedByLine item={ITEM} own={false} />
        </QueryClientProvider>
      </AddedByHostContext.Provider>,
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(rig.calls).toEqual([[ITEM]]);
  });
});

describe("a click opens the adder's card at its own vault", () => {
  it("openRecordInVault(vault of the card, id, { push: true }) and the door and name are remembered", async () => {
    const openRecordInVault = vi.fn();
    const openRecordFromList = vi.fn();
    const { qc } = mount({ openRecordInVault, openRecordFromList });
    const link = await screen.findByTestId("added-by-link");
    expect(fireEvent.click(link)).toBe(false); // default prevented
    expect(openRecordInVault.mock.calls).toEqual([["https://anna.platform.example.test/base", "vsc-anna", { push: true }]]);
    expect(openRecordFromList).not.toHaveBeenCalled();
    expect(addedByCardOf(qc, "vsc-anna")).toEqual({ door: ANNA, name: "Anna Berg" });
  });
  it("a shell with no openRecordInVault opens the record from the list by id", async () => {
    const openRecordFromList = vi.fn();
    mount({ openRecordFromList });
    fireEvent.click(await screen.findByTestId("added-by-link"));
    expect(openRecordFromList.mock.calls).toEqual([["vsc-anna"]]);
  });
  it("a card address that is not an entity address opens nothing and remembers nothing", async () => {
    const openRecordInVault = vi.fn();
    const openRecordFromList = vi.fn();
    const { qc } = mount({ openRecordInVault, openRecordFromList }, { statedBy: "https://anna.platform.example.test/somewhere", name: "Anna Berg" });
    fireEvent.click(await screen.findByTestId("added-by-link"));
    expect(openRecordInVault).not.toHaveBeenCalled();
    expect(openRecordFromList).not.toHaveBeenCalled();
    expect(addedByCardOf(qc, "somewhere")).toBeNull();
  });
  it("a card address that names no vault is opened from the list", async () => {
    const openRecordInVault = vi.fn();
    const openRecordFromList = vi.fn();
    mount({ openRecordInVault, openRecordFromList }, { statedBy: "http://x/base/e/abc", name: "Anna Berg" });
    fireEvent.click(await screen.findByTestId("added-by-link"));
    expect(openRecordInVault).toHaveBeenCalledWith("http://x/base", "abc", { push: true });
  });
  it.each([["meta", { metaKey: true }], ["ctrl", { ctrlKey: true }], ["shift", { shiftKey: true }], ["middle button", { button: 1 }]])("a %s-click is left to the browser", async (_n, init) => {
    const openRecordInVault = vi.fn();
    mount({ openRecordInVault, openRecordFromList: vi.fn() });
    const link = await screen.findByTestId("added-by-link");
    // the page's own listener (after the app's) sees whether the app took the click over; it then stops the browser's navigation
    let takenOver: boolean | null = null;
    document.addEventListener("click", (e) => { takenOver = e.defaultPrevented; e.preventDefault(); }, { once: true });
    fireEvent.click(link, init);
    expect(takenOver).toBe(false);
    expect(openRecordInVault).not.toHaveBeenCalled();
  });
  it("with no shell (the host answers null) the click opens nothing and does not throw", async () => {
    const { qc } = mount(null);
    fireEvent.click(await screen.findByTestId("added-by-link"));
    expect(addedByCardOf(qc, "vsc-anna")).toEqual({ door: ANNA, name: "Anna Berg" });
  });
});

describe("the host", () => {
  it("without a provider the line throws an error that names it", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<QueryClientProvider client={client()}><AddedByLine item={ITEM} own /></QueryClientProvider>)).toThrow(/AddedByHostContext\.Provider/);
    quiet.mockRestore();
  });
});
