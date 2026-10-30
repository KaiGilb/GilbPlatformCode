// New. `useElementWidth` over a fake `ResizeObserver` and a fake box: jsdom has no layout, so the width is whatever the test says,
// and a resize is the test calling the observer's callback. No timers, no waiting.
import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useElementWidth } from "./headerLayout";

let width = 0;
const observers: FakeObserver[] = [];
class FakeObserver {
  observed: Element[] = [];
  disconnected = false;
  constructor(public readonly callback: () => void) {
    observers.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
}

function Probe({ attach = true }: { attach?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useElementWidth(ref);
  return attach ? <div ref={ref} data-testid="box">{String(w)}</div> : <span data-testid="box">{String(w)}</span>;
}
const shown = () => screen.getByTestId("box").textContent;

beforeEach(() => {
  width = 0;
  observers.length = 0;
  vi.stubGlobal("ResizeObserver", FakeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width }) as DOMRect);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useElementWidth", () => {
  it("measures the element when it mounts", () => {
    width = 312;
    render(<Probe />);
    expect(shown()).toBe("312");
  });

  it("a box with no width yet (0) is `null`, not 0", () => {
    width = 0;
    render(<Probe />);
    expect(shown()).toBe("null");
  });

  it("a ref that holds nothing stays `null` and watches nothing", () => {
    width = 312;
    render(<Probe attach={false} />);
    expect(shown()).toBe("null");
    expect(observers).toHaveLength(0);
  });

  it("watches the element, once", () => {
    width = 312;
    render(<Probe />);
    expect(observers).toHaveLength(1);
    expect(observers[0]!.observed).toEqual([screen.getByTestId("box")]);
  });

  it("follows a resize: the observer's callback reads the box again", () => {
    width = 400;
    render(<Probe />);
    expect(shown()).toBe("400");
    width = 250;
    act(() => observers[0]!.callback());
    expect(shown()).toBe("250");
    width = 0;
    act(() => observers[0]!.callback());
    expect(shown()).toBe("null");
  });

  it("stops watching when the component goes away", () => {
    width = 400;
    const { unmount } = render(<Probe />);
    expect(observers[0]!.disconnected).toBe(false);
    unmount();
    expect(observers[0]!.disconnected).toBe(true);
  });

  it("with no ResizeObserver (an old browser, a test) it reads once and does not throw", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    width = 321;
    render(<Probe />);
    expect(shown()).toBe("321");
    expect(observers).toHaveLength(0);
  });

  it("does not watch again on a re-render with the same ref", () => {
    width = 400;
    const { rerender } = render(<Probe />);
    rerender(<Probe />);
    rerender(<Probe />);
    expect(observers).toHaveLength(1);
    expect(observers[0]!.disconnected).toBe(false);
  });
});
