// Renders the shipped Overlay in jsdom.
import { afterEach, describe, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Overlay } from "./Overlay";

afterEach(cleanup);

function drawer(open: boolean, onClose: () => void, side: "left" | "right" = "left") {
  return (
    <Overlay open={open} onClose={onClose} side={side} title="Workspace">
      <p>INSIDE</p>
    </Overlay>
  );
}

describe("Overlay", () => {
  test("closed draws nothing", () => {
    render(drawer(false, () => {}));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("INSIDE")).toBeNull();
  });
  test("open is a modal dialog named by its title", () => {
    render(drawer(true, () => {}));
    const d = screen.getByRole("dialog", { name: "Workspace" });
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("INSIDE")).toBeTruthy();
  });
  test("Escape, the backdrop, and the Close button each close it", () => {
    let closes = 0;
    render(drawer(true, () => closes++));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(closes).toBe(3);
  });
  test("locks the page scroll while open, and gives it back on close", () => {
    document.body.style.overflow = "auto";
    const { rerender } = render(drawer(true, () => {}));
    expect(document.body.style.overflow).toBe("hidden");
    rerender(drawer(false, () => {}));
    expect(document.body.style.overflow).toBe("auto");
  });
  test("moves focus in on open and back to the opener on close", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(drawer(true, () => {}));
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    rerender(drawer(false, () => {}));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
  test("the side picks the edge it slides from", () => {
    render(drawer(true, () => {}, "right"));
    expect(screen.getByRole("dialog").className).toContain("right-0");
  });
  test("an input inside keeps focus while the host re-renders with a new onClose each time", async () => {
    function Host() {
      const [text, setText] = useState("");
      // A new onClose function on every render, as an inline arrow gives.
      return (
        <Overlay open onClose={() => setText("")} side="left" title="Search">
          <input aria-label="query" value={text} onChange={(e) => setText(e.target.value)} />
        </Overlay>
      );
    }
    render(<Host />);
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    const input = screen.getByRole("textbox", { name: "query" });
    input.focus();
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "ab" } });
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("ab");
  });
  test("Escape that a control inside already handled does not close the drawer", () => {
    let closes = 0;
    render(
      <Overlay open onClose={() => closes++} side="left" title="Menu">
        <div data-testid="menu" onKeyDown={(e) => { if (e.key === "Escape") e.preventDefault(); }} tabIndex={0} />
      </Overlay>,
    );
    fireEvent.keyDown(screen.getByTestId("menu"), { key: "Escape" });
    expect(closes).toBe(0);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closes).toBe(1);
  });
  test("the title is set in the serif family, labelled so a class merge cannot read it as a weight", () => {
    render(drawer(true, () => {}));
    expect(screen.getByText("Workspace").className).toContain("font-[family-name:var(--serif)]");
  });
});
