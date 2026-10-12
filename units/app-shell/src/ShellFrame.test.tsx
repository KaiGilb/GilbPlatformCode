// The frame at each size class. Imports the shipped component and renders it in jsdom.
import { afterEach, describe, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShellFrame } from "./ShellFrame";
import { useShellCore } from "./ShellCore";

function setWidth(w: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
  window.dispatchEvent(new Event("resize"));
}
afterEach(() => { cleanup(); localStorage.clear(); });

function Probe() {
  const c = useShellCore();
  return (
    <div>
      <span data-testid="cls">{c.sizeClass}</span>
      <span data-testid="detail">{String(c.detailOpen)}</span>
      <button onClick={c.openDetail}>open-detail</button>
      <button onClick={c.closeDetail}>close-detail</button>
    </div>
  );
}

const frame = () => (
  <ShellFrame layoutOptions={{ storageKey: "t" }} header={<span>H</span>} left={<p>LEFT</p>} center={<Probe />} right={<p>RIGHT</p>} />
);

describe("ShellFrame", () => {
  test("at 840 px it draws three regions and no bottom bar", () => {
    setWidth(840);
    const { container } = render(frame());
    expect(screen.getByTestId("cls").textContent).toBe("expanded");
    expect(container.querySelector('[data-region="center"]')).not.toBeNull();
    expect(screen.getByText("RIGHT")).toBeTruthy(); // right open by default
    expect(screen.queryByText("LEFT")).toBeNull(); // left collapsed by default
    expect(screen.queryByRole("navigation", { name: "Panels" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show selection panel" }));
    expect(screen.getByText("LEFT")).toBeTruthy();
  });

  test("at 839 px it is medium: centre, bottom bar, and drawers that open and close", () => {
    setWidth(839);
    render(frame());
    expect(screen.getByTestId("cls").textContent).toBe("medium");
    expect(screen.getByRole("navigation", { name: "Panels" })).toBeTruthy();
    expect(screen.queryByText("RIGHT")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Detail/ }));
    expect(screen.getByRole("dialog", { name: "Detail" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Selection/ }));
    expect(screen.queryByRole("dialog", { name: "Detail" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Workspace" })).toBeTruthy();
  });

  test("at 599 px it is compact, and openDetail opens the sheet", () => {
    setWidth(599);
    render(frame());
    expect(screen.getByTestId("cls").textContent).toBe("compact");
    expect(screen.getByTestId("detail").textContent).toBe("false");
    fireEvent.click(screen.getByText("open-detail"));
    expect(screen.getByTestId("detail").textContent).toBe("true");
    expect(screen.getByText("RIGHT")).toBeTruthy();
  });

  test("openDetail and closeDetail move the pane at expanded width", () => {
    setWidth(1200);
    render(frame());
    fireEvent.click(screen.getByText("close-detail"));
    expect(screen.queryByText("RIGHT")).toBeNull();
    fireEvent.click(screen.getByText("open-detail"));
    expect(screen.getByText("RIGHT")).toBeTruthy();
  });

  test("openDetail on an open pane keeps it open: it is not a toggle", () => {
    setWidth(1200);
    render(frame());
    expect(screen.getByText("RIGHT")).toBeTruthy();
    fireEvent.click(screen.getByText("open-detail"));
    expect(screen.getByText("RIGHT")).toBeTruthy();
    expect(screen.getByTestId("detail").textContent).toBe("true");
  });

  test("resizing the window switches the frame live", () => {
    setWidth(1000);
    render(frame());
    expect(screen.queryByRole("navigation", { name: "Panels" })).toBeNull();
    act(() => setWidth(500));
    expect(screen.getByRole("navigation", { name: "Panels" })).toBeTruthy();
  });

  test("a frame with no side regions draws no toggles and no bottom bar", () => {
    setWidth(400);
    render(<ShellFrame layoutOptions={{ storageKey: "t2" }} center={<p>ONLY</p>} />);
    expect(screen.getByText("ONLY")).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  test("useShellCore outside a frame throws", () => {
    expect(() => render(<Probe />)).toThrow(/inside a ShellFrame/);
  });
});
