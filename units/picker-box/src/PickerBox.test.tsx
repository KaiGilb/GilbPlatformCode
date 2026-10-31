// @vitest-environment jsdom
// New. The source has no test of this component of its own (it is exercised through the languages section's tests, which are in
// `language-section`). Pins the keyboard, the minimum characters, the escape, the latest-search-wins rule and the two failure lines.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PickerBox, type PickerOption } from "./index";

const OPTS: PickerOption[] = [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }, { id: "c", label: "Gamma" }];
afterEach(cleanup);

function box(over: Partial<React.ComponentProps<typeof PickerBox>> = {}) {
  const props = {
    label: "Add a thing",
    current: "",
    search: vi.fn(async () => OPTS),
    onChoose: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  };
  render(<PickerBox {...props} />);
  return { props, input: screen.getByRole("combobox", { name: "Add a thing" }) as HTMLInputElement };
}
const type = (input: HTMLElement, text: string) => fireEvent.change(input, { target: { value: text } });

describe("PickerBox", () => {
  it("searches once the minimum is reached and lists the matches; below it says keep typing and sends nothing", async () => {
    const { props, input } = box({ minChars: 2 });
    type(input, "a");
    expect(screen.getByTestId("picker-keep-typing").textContent).toBe("Keep typing…");
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(props.search).not.toHaveBeenCalled();
    type(input, "al");
    await waitFor(() => expect(screen.getAllByTestId("picker-option")).toHaveLength(3));
    expect(props.search).toHaveBeenCalledTimes(1);
    expect((props.search as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe("al");
    expect(screen.queryByTestId("picker-keep-typing")).toBeNull();
  });

  it("arrow keys move the highlight (kept inside the list) and Enter picks the highlighted one", async () => {
    const { props, input } = box();
    type(input, "x");
    await waitFor(() => expect(screen.getAllByTestId("picker-option")).toHaveLength(3));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByTestId("picker-option")[2]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getAllByTestId("picker-option")[1]!.getAttribute("aria-selected")).toBe("true");
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(props.onChoose).toHaveBeenCalledWith(OPTS[1]);
  });

  it("a click on a match picks it; nothing that was only typed is ever handed on", async () => {
    const { props, input } = box();
    type(input, "typed text");
    await waitFor(() => screen.getAllByTestId("picker-option"));
    await act(async () => { fireEvent.click(screen.getByText("Gamma")); });
    expect(props.onChoose).toHaveBeenCalledTimes(1);
    expect(props.onChoose).toHaveBeenCalledWith(OPTS[2]);
  });

  it("Enter with no matches picks nothing", async () => {
    const { props, input } = box({ search: vi.fn(async () => []) });
    type(input, "zzz");
    await waitFor(() => expect(screen.getByTestId("picker-no-match").textContent).toBe("No match for “zzz”."));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onChoose).not.toHaveBeenCalled();
  });

  it("Escape and the Cancel button cancel", () => {
    const { props, input } = box();
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledTimes(2);
  });

  it("Clear is offered only when something is stored and a handler is given", () => {
    cleanup();
    const onClear = vi.fn();
    render(<PickerBox label="L" current="" search={async () => []} onChoose={() => {}} onCancel={() => {}} onClear={onClear} />);
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    cleanup();
    render(<PickerBox label="L" current="Norwegian" search={async () => []} onChoose={() => {}} onCancel={() => {}} onClear={onClear} />);
    expect(screen.getByTestId("picker-current").textContent).toBe("Now: Norwegian");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("a failed choice shows its message and the box stays open; a failed search says nothing was changed", async () => {
    const { input } = box({ onChoose: vi.fn(async () => { throw new Error("Could not add"); }) });
    type(input, "x");
    await waitFor(() => screen.getAllByTestId("picker-option"));
    await act(async () => { fireEvent.click(screen.getByText("Alpha")); });
    expect(screen.getByTestId("picker-message").textContent).toBe("Could not add");
    cleanup();
    const b = box({ search: vi.fn(async () => { throw new Error("down"); }) });
    type(b.input, "x");
    await waitFor(() => expect(screen.getByTestId("picker-search-failed").textContent).toContain("Nothing was changed"));
  });

  it("the latest search wins: a slow answer to an older text does not replace a newer one", async () => {
    let release!: (o: PickerOption[]) => void;
    const search = vi.fn((q: string) => (q === "a" ? new Promise<PickerOption[]>((r) => { release = r; }) : Promise.resolve([{ id: "z", label: "Newer" }])));
    const { input } = box({ search });
    type(input, "a");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    type(input, "ab");
    await waitFor(() => screen.getByText("Newer"));
    await act(async () => { release([{ id: "old", label: "Older" }]); });
    expect(screen.queryByText("Older")).toBeNull();
    expect(screen.getByText("Newer")).toBeTruthy();
  });

  it("the older search is aborted when the text changes", async () => {
    const signals: AbortSignal[] = [];
    const { input } = box({ search: vi.fn(async (_q: string, s: AbortSignal) => { signals.push(s); return OPTS; }) });
    type(input, "a");
    await waitFor(() => expect(signals).toHaveLength(1));
    type(input, "ab");
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
  });

  it("while a choice is being made the box is disabled and a second pick is ignored", async () => {
    let done!: () => void;
    const onChoose = vi.fn(() => new Promise<void>((r) => { done = r; }));
    const { input } = box({ onChoose });
    type(input, "x");
    await waitFor(() => screen.getAllByTestId("picker-option"));
    fireEvent.click(screen.getByText("Alpha"));
    fireEvent.click(screen.getByText("Beta"));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(input.disabled).toBe(true);
    await act(async () => { done(); });
    expect(input.disabled).toBe(false);
  });
});
