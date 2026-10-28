// "New qualifier set...": the graph finds the Levels lines of the card by their test ids and by the words "+ Level" and
// "New level kind". This is the contract with the lines of the card; it is pinned here with stand-ins for them.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { focusLevelEditor } from "./index";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

// One step at a time, each in its own act, so the card re-renders between two tries.
const settle = () => {
  for (let ms = 0; ms <= 300; ms += 40) act(() => void vi.advanceTimersByTime(40));
};

describe("focusLevelEditor", () => {
  it("focuses the 'New level kind' field of the card's add-level editor, found by walking up from the graph", () => {
    const view = render(
      <div>
        <div data-testid="graph" />
        <section>
          <div data-testid="plan-level-add">
            <input aria-label="Other field" />
            <input aria-label="New level kind" />
          </div>
        </section>
      </div>,
    );
    focusLevelEditor(view.getByTestId("graph"));
    settle();
    expect(document.activeElement).toBe(view.getByLabelText("New level kind"));
  });

  it("scrolls the panel into view and, with no such field, focuses the panel's first button or input", () => {
    const scroll = vi.fn();
    const view = render(
      <div>
        <div data-testid="graph" />
        <div data-testid="plan-levels-view">
          <div data-testid="plan-level-panel">
            <button>First</button>
            <input aria-label="Second" />
          </div>
        </div>
      </div>,
    );
    view.getByTestId("plan-level-panel").scrollIntoView = scroll;
    focusLevelEditor(view.getByTestId("graph"));
    settle();
    expect(scroll).toHaveBeenCalledWith({ block: "center" });
    expect(document.activeElement).toBe(view.getByText("First"));
  });

  it("when the card keeps the editor behind '+ Level', presses that button once and then focuses the field", () => {
    const pressed = vi.fn();
    function Card() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <div data-testid="graph" />
          <div data-testid="plan-levels-view">
            <button
              onClick={() => {
                pressed();
                setOpen(true);
              }}
            >
              + Level
            </button>
            {open ? (
              <div data-testid="plan-level-panel">
                <input aria-label="New level kind" />
              </div>
            ) : null}
          </div>
        </div>
      );
    }
    const view = render(<Card />);
    focusLevelEditor(view.getByTestId("graph"));
    settle();
    expect(pressed).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(view.getByLabelText("New level kind"));
  });

  it("does nothing, and throws nothing, when the graph is in no card that holds the lines or is given no element", () => {
    const view = render(<div data-testid="graph" />);
    focusLevelEditor(view.getByTestId("graph"));
    focusLevelEditor(null);
    expect(() => settle()).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });

  it("gives up after six tries when the editor never opens", () => {
    const view = render(
      <div>
        <div data-testid="graph" />
        <div data-testid="plan-levels-view" />
      </div>,
    );
    focusLevelEditor(view.getByTestId("graph"));
    expect(() => settle()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
