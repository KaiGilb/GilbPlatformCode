// New (the source has no test of the hook itself; two component tests reach it, one already ported to `org-employees`). The hook is
// drawn by a tiny sheet; the browser history is jsdom's own. `history.back()` is replaced by a fake that pops the entry and fires
// `popstate` at once (or does nothing, for the fallback timer), so nothing waits on the clock; timers are fake.
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetSheetHistory, dropStaleSheetEntry, useSheetHistory } from "./index";

const stateOf = () => (window.history.state ?? {}) as Record<string, unknown>;
const marked = () => !!stateOf().gilbSheet;
const BASE = { usr: null, key: "k0", idx: 2 };

let api: { requestClose: (after?: () => void) => void } | null = null;
let closed: ReturnType<typeof vi.fn>;
let back: ReturnType<typeof vi.spyOn>;
let answerBack: boolean;
let stack: Array<Record<string, unknown> | null>;

function Sheet({ initiallyOpen = true, onClosed }: { initiallyOpen?: boolean; onClosed: () => void }) {
  const [open, setOpen] = useState(initiallyOpen);
  api = useSheetHistory(open, () => {
    setOpen(false);
    onClosed();
  });
  return <div data-testid="s" data-open={open ? "yes" : "no"} />;
}
const openNow = () => document.querySelector("[data-testid=s]")!.getAttribute("data-open") === "yes";

beforeEach(() => {
  vi.useFakeTimers();
  __resetSheetHistory();
  window.history.replaceState(BASE, "", "/app/?rec=r1");
  closed = vi.fn();
  answerBack = true;
  stack = [];
  // The fake back: pops the pushed entry (restoring the state under it) and fires popstate, as the browser does a moment later.
  const push = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((s, t) => {
    stack.push(window.history.state as Record<string, unknown> | null);
    push(s, t as string);
  });
  back = vi.spyOn(window.history, "back").mockImplementation(() => {
    if (!answerBack) return;
    const prior = stack.pop() ?? BASE;
    window.history.replaceState(prior, "", "/app/?rec=r1");
    window.dispatchEvent(new PopStateEvent("popstate", { state: prior }));
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("opening", () => {
  it("pushes ONE entry whose state keeps the router's own state and adds the marker; the address is unchanged", () => {
    render(<Sheet onClosed={closed} />);
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(stateOf()).toMatchObject({ key: "k0", idx: 2, gilbSheet: true });
    expect(window.location.search).toBe("?rec=r1");
  });
  it("a sheet that starts closed pushes nothing, and opening later pushes one", () => {
    const { rerender } = render(<Sheet initiallyOpen={false} onClosed={closed} />);
    expect(window.history.pushState).not.toHaveBeenCalled();
    expect(marked()).toBe(false);
    rerender(<Sheet initiallyOpen={false} onClosed={closed} />);
    expect(window.history.pushState).not.toHaveBeenCalled();
  });
  it("re-rendering while open (even with a new onClosed) pushes nothing more and removes nothing", () => {
    const { rerender } = render(<Sheet onClosed={closed} />);
    rerender(<Sheet onClosed={() => closed()} />);
    rerender(<Sheet onClosed={closed} />);
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(marked()).toBe(true);
  });
  it("a null history state is treated as an empty one", () => {
    window.history.replaceState(null, "", "/app/?rec=r1");
    render(<Sheet onClosed={closed} />);
    expect(stateOf()).toEqual({ gilbSheet: true });
  });
});

describe("closing from inside", () => {
  it("requestClose() closes at once and removes the entry with one back()", () => {
    render(<Sheet onClosed={closed} />);
    act(() => api!.requestClose());
    expect(closed).toHaveBeenCalledTimes(1);
    expect(openNow()).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);
    expect(marked()).toBe(false);
  });
  it("requestClose(after) runs `after` once the entry is gone, after the sheet closed and after the back", () => {
    const order: string[] = [];
    render(<Sheet onClosed={() => order.push("closed")} />);
    act(() => api!.requestClose(() => order.push(`after(marked=${marked()})`)));
    expect(order).toEqual(["closed", "after(marked=false)"]);
    expect(back).toHaveBeenCalledTimes(1);
  });
  it("if the browser never answers, a fallback timer runs `after` once (400 ms), and a later popstate does not run it again", () => {
    answerBack = false;
    const after = vi.fn();
    render(<Sheet onClosed={closed} />);
    act(() => api!.requestClose(after));
    expect(after).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(399));
    expect(after).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(after).toHaveBeenCalledTimes(1);
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
    expect(after).toHaveBeenCalledTimes(1);
  });
  it("when the browser does answer, the fallback timer is cleared and `after` runs once", () => {
    const after = vi.fn();
    render(<Sheet onClosed={closed} />);
    act(() => api!.requestClose(after));
    act(() => void vi.advanceTimersByTime(1000));
    expect(after).toHaveBeenCalledTimes(1);
  });
  it("when the marker is already gone, `after` runs at once and no back() is made", () => {
    const after = vi.fn();
    render(<Sheet onClosed={closed} />);
    window.history.replaceState(BASE, "", "/app/?rec=r1");
    act(() => api!.requestClose(after));
    expect(back).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });
  it("a second requestClose after the sheet is closed calls onClosed and after again but makes no back()", () => {
    const after = vi.fn();
    render(<Sheet onClosed={closed} />);
    act(() => api!.requestClose());
    act(() => api!.requestClose(after));
    expect(back).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(2);
  });
});

describe("the system Back", () => {
  it("a popstate with the marker gone closes the sheet and nothing else (no back())", () => {
    render(<Sheet onClosed={closed} />);
    act(() => {
      window.history.replaceState(BASE, "", "/app/?rec=r1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(openNow()).toBe(false);
    expect(back).not.toHaveBeenCalled();
  });
  it("a popstate that still carries the marker does not close the sheet", () => {
    render(<Sheet onClosed={closed} />);
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
    expect(closed).not.toHaveBeenCalled();
    expect(openNow()).toBe(true);
  });
  it("unmounting removes the popstate listener", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Sheet onClosed={closed} />);
    unmount();
    expect(remove.mock.calls.some((c) => c[0] === "popstate")).toBe(true);
  });
});

describe("unmounting", () => {
  it("an open sheet unmounted while its entry is current removes the entry (one back())", () => {
    const { unmount } = render(<Sheet onClosed={closed} />);
    unmount();
    expect(back).toHaveBeenCalledTimes(1);
    expect(marked()).toBe(false);
    expect(closed).not.toHaveBeenCalled();
  });
  it("a sheet that was closed from inside makes no second back() when it unmounts", () => {
    const { unmount } = render(<Sheet onClosed={closed} />);
    act(() => api!.requestClose());
    unmount();
    expect(back).toHaveBeenCalledTimes(1);
  });
  it("a sheet whose entry the browser already removed makes no back() when it unmounts", () => {
    const { unmount } = render(<Sheet onClosed={closed} />);
    act(() => {
      window.history.replaceState(BASE, "", "/app/?rec=r1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    unmount();
    expect(back).not.toHaveBeenCalled();
  });
  it("onClosed is read fresh: the latest function is called, not the one of the first render", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Sheet onClosed={first} />);
    rerender(<Sheet onClosed={second} />);
    act(() => api!.requestClose());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("dropStaleSheetEntry", () => {
  it("does nothing when the current entry has no marker", () => {
    dropStaleSheetEntry();
    expect(back).not.toHaveBeenCalled();
  });
  it("steps back once off a marked entry (a reload that landed on a sheet)", () => {
    window.history.replaceState({ ...BASE, gilbSheet: true }, "", "/app/?rec=r1");
    answerBack = false;
    dropStaleSheetEntry();
    expect(back).toHaveBeenCalledTimes(1);
  });
  it("called together by several cards (or StrictMode) it steps back ONCE, until 500 ms have passed", () => {
    window.history.replaceState({ ...BASE, gilbSheet: true }, "", "/app/?rec=r1");
    answerBack = false;
    dropStaleSheetEntry();
    dropStaleSheetEntry();
    dropStaleSheetEntry();
    expect(back).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(499));
    dropStaleSheetEntry();
    expect(back).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(1));
    dropStaleSheetEntry();
    expect(back).toHaveBeenCalledTimes(2);
  });
  it("__resetSheetHistory lets the next call step back at once", () => {
    window.history.replaceState({ ...BASE, gilbSheet: true }, "", "/app/?rec=r1");
    answerBack = false;
    dropStaleSheetEntry();
    __resetSheetHistory();
    dropStaleSheetEntry();
    expect(back).toHaveBeenCalledTimes(2);
  });
});
