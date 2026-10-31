// @vitest-environment jsdom
// Ported from GilbApp `PlacePicker.n6.reqa5091.agenttester.test.tsx` (7 cases): changing a bound City. The keyboard path (Tab into the list), a change
// of mind, the emptied box clearing at once, the edit closing after a pick, the pointer's mousedown kept off the box, and a failed pick.
// Changed from the source: the catalogue is the fake platform of `../test/world.ts`; the failed pick no longer shows the thrown text (F15): the box says
// a fixed sentence and the detail goes to the console (the case below checks both).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlacePicker } from "./index";
import { GEO, setCatalogueMode, useWorld } from "../test/world";

useWorld();
afterEach(cleanup);
beforeEach(() => setCatalogueMode("normal"));

const BOUND = { id: `${GEO}/manchester`, label: "Manchester", type: "City", memberOf: [] as string[] };
const tick = () => act(() => new Promise((r) => setTimeout(r, 20)));

async function openAndSearch(onPick: (p: unknown) => void | Promise<void> = vi.fn(), onClear = vi.fn()) {
  render(<PlacePicker rung="city" label="City" value={BOUND} onPick={onPick} onClear={onClear} />);
  fireEvent.click(screen.getByTestId("place-city-value"));
  const box = await waitFor(() => screen.getByRole("combobox"));
  fireEvent.change(box, { target: { value: "Oslo" } });
  const opt = await waitFor(() => screen.getAllByRole("option")[0]!);
  return { box, opt, onPick, onClear };
}

describe("N6: changing a bound City", () => {
  it("KEYBOARD: Tab moves the focus into the list; one tick later the list is still there and Enter/click picks", async () => {
    const onPick = vi.fn();
    const { opt, onClear } = await openAndSearch(onPick);
    act(() => { (opt as HTMLElement).focus(); });
    await tick();
    expect(screen.getAllByRole("option")[0]).toBe(opt);
    fireEvent.click(opt);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onClear).not.toHaveBeenCalled();
  });

  it("CHANGE OF MIND: leaving the box to the page closes the edit one tick later, the stored City stays, nothing is picked or cleared", async () => {
    const onPick = vi.fn();
    const { box, onClear } = await openAndSearch(onPick);
    act(() => { (box as HTMLElement).blur(); });
    await waitFor(() => expect(screen.getByTestId("place-city-value").textContent).toContain("Manchester"));
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(onPick).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("CHANGE OF MIND from the list: Tab into an option, then leave the list to the page, closes the edit and keeps the City", async () => {
    const onPick = vi.fn();
    const { opt, onClear } = await openAndSearch(onPick);
    act(() => { (opt as HTMLElement).focus(); });
    await tick();
    act(() => { (opt as HTMLElement).blur(); });
    await waitFor(() => expect(screen.getByTestId("place-city-value").textContent).toContain("Manchester"));
    expect(onPick).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("EMPTIED: an emptied box clears at once on leaving (synchronously, before any tick)", async () => {
    const onClear = vi.fn();
    render(<PlacePicker rung="city" label="City" value={BOUND} onPick={vi.fn()} onClear={onClear} />);
    fireEvent.click(screen.getByTestId("place-city-value"));
    const box = await waitFor(() => screen.getByRole("combobox"));
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("POINTER: the option's mousedown is default-prevented, so the box keeps the focus", async () => {
    const { box, opt } = await openAndSearch();
    act(() => { (box as HTMLElement).focus(); });
    expect(fireEvent.mouseDown(opt)).toBe(false);
  });

  it("AFTER A PICK the edit is over: a later leave does not read the emptied box as a clear", async () => {
    const { opt, onPick, onClear } = await openAndSearch(vi.fn(async () => {}));
    fireEvent.click(opt);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryAllByRole("option")).toHaveLength(0));
    const box = screen.queryByRole("combobox");
    if (box) { fireEvent.blur(box); await tick(); }
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.getByTestId("place-city-value")).toBeTruthy();
  });

  it("FAILED PICK (F15): a fixed sentence is shown, the thrown text is not, and a later change of mind still closes the edit without clearing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { box, opt, onClear } = await openAndSearch(vi.fn(async () => { throw new Error("store said no: 403 secret detail"); }));
    fireEvent.click(opt);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That place could not be added right now."));
    expect(screen.getByRole("alert").textContent).not.toMatch(/store said no|403|secret/);
    expect(log.mock.calls.flat().join(" ")).toMatch(/store said no: 403 secret detail/);
    act(() => { (box as HTMLElement).blur(); });
    await waitFor(() => expect(screen.getByTestId("place-city-value").textContent).toContain("Manchester"));
    expect(onClear).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
