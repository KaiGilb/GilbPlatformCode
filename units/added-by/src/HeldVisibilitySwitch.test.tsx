import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeldVisibilitySwitch } from "./index";

afterEach(cleanup);
const draw = (o: Partial<React.ComponentProps<typeof HeldVisibilitySwitch>> = {}) => {
  const onSet = vi.fn();
  render(<HeldVisibilitySwitch isPrivate={false} editing={false} onSet={onSet} noun="interest Sailing" {...o} />);
  return onSet;
};

describe("HeldVisibilitySwitch: shared with everyone who may read the vault, or private to the person who added it", () => {
  it("shared, not editing: no label and no control", () => {
    draw();
    expect(screen.getByTestId("held-visibility")).toBeTruthy();
    expect(screen.queryByTestId("held-private-label")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("shared, editing: 'Make private to me only' sets it private", () => {
    const onSet = draw({ editing: true });
    const b = screen.getByTestId("held-visibility-private");
    expect(b.textContent).toBe("Make private to me only");
    expect(b.getAttribute("aria-label")).toBe("Make interest Sailing private to me only");
    fireEvent.click(b);
    expect(onSet.mock.calls).toEqual([[true]]);
  });
  it("private, not editing: the 'Only you see this' label shows, and no control", () => {
    draw({ isPrivate: true });
    expect(screen.getByTestId("held-private-label").textContent).toBe("Only you see this");
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("private, editing: the label stays and 'Everyone in this vault' sets it back to shared", () => {
    const onSet = draw({ isPrivate: true, editing: true });
    expect(screen.getByTestId("held-private-label")).toBeTruthy();
    const b = screen.getByTestId("held-visibility-shared");
    expect(b.textContent).toBe("Everyone in this vault");
    expect(b.getAttribute("aria-label")).toBe("Show interest Sailing to everyone in this vault");
    fireEvent.click(b);
    expect(onSet.mock.calls).toEqual([[false]]);
  });
  it("busy disables the control; a click does nothing", () => {
    const onSet = draw({ editing: true, busy: true });
    const b = screen.getByRole("button") as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(onSet).not.toHaveBeenCalled();
  });
  it("not busy by default", () => {
    draw({ editing: true });
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  });
});
