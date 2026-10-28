import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { topOpen } from "@kaigilb/gilbplatformcode-open-popups";
import { PlanTypeReplaceAsk } from "./index";

afterEach(cleanup);

const mount = (props: Partial<Parameters<typeof PlanTypeReplaceAsk>[0]> = {}) => {
  const onKeep = vi.fn();
  const onReplace = vi.fn();
  const r = render(<PlanTypeReplaceAsk what="Door" onKeep={onKeep} onReplace={onReplace} {...props} />);
  return { onKeep, onReplace, ...r };
};

describe("PlanTypeReplaceAsk", () => {
  it("is a modal alert dialog that asks 'Replace the earlier concept <what>?' with Keep and Replace", () => {
    mount({ what: "Gate idea" });
    const ask = screen.getByTestId("plan-type-replace-ask");
    expect(ask.getAttribute("role")).toBe("alertdialog");
    expect(ask.getAttribute("aria-modal")).toBe("true");
    expect(ask.getAttribute("aria-label")).toBe("Replace the earlier concept");
    expect(ask.textContent).toBe("Replace the earlier concept Gate idea?KeepReplace");
    expect([...ask.querySelectorAll("button")].map((b) => b.getAttribute("type"))).toEqual(["button", "button"]);
    expect(screen.getByRole("button", { name: "Keep" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Replace" }).className).toContain("min-h-11");
  });

  it("Keep and Replace call their own handler, once", () => {
    const { onKeep, onReplace } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onReplace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it("takes the focus when it opens, on the first button (Keep, the safe answer)", () => {
    mount();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep" }));
  });

  it("Escape means Keep: it calls onKeep, not onReplace, and neither reaches nor is taken by a layer around it", () => {
    const around = vi.fn();
    const onKeep = vi.fn();
    const onReplace = vi.fn();
    render(
      <div onKeyDown={around}>
        <PlanTypeReplaceAsk what="Door" onKeep={onKeep} onReplace={onReplace} />
      </div>,
    );
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    screen.getByTestId("plan-type-replace-ask").dispatchEvent(event);
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onReplace).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(around).not.toHaveBeenCalled();
  });

  it("another key goes on to the layer around it and does nothing here", () => {
    const around = vi.fn();
    const onKeep = vi.fn();
    render(
      <div onKeyDown={around}>
        <PlanTypeReplaceAsk what="Door" onKeep={onKeep} onReplace={() => undefined} />
      </div>,
    );
    fireEvent.keyDown(screen.getByTestId("plan-type-replace-ask"), { key: "a" });
    expect(around).toHaveBeenCalledTimes(1);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it("Tab stays inside: it wraps from Replace to Keep and, with Shift, from Keep to Replace; the key does not reach a layer around it", async () => {
    const around = vi.fn();
    render(
      <div onKeyDown={around}>
        <button type="button">outside</button>
        <PlanTypeReplaceAsk what="Door" onKeep={() => undefined} onReplace={() => undefined} />
      </div>,
    );
    const user = userEvent.setup();
    const keep = screen.getByRole("button", { name: "Keep" });
    const replace = screen.getByRole("button", { name: "Replace" });
    await user.tab();
    expect(document.activeElement).toBe(replace);
    await user.tab();
    expect(document.activeElement).toBe(keep);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(replace);
    expect(around.mock.calls.filter(([e]) => e.key === "Tab")).toHaveLength(0);
  });

  it("is on the open stack while it is mounted: the stack's close is Keep, its element is the dialog, and it leaves the stack when it goes", () => {
    const { onKeep, unmount } = mount();
    const top = topOpen();
    expect(top).not.toBeNull();
    expect(top!.el()).toBe(screen.getByTestId("plan-type-replace-ask"));
    expect(top!.exclusive).toBeUndefined();
    top!.close();
    expect(onKeep).toHaveBeenCalledTimes(1);
    unmount();
    expect(topOpen()).toBeNull();
  });

  it("the stack's close calls the latest onKeep, not the one it was mounted with", () => {
    const first = vi.fn();
    const second = vi.fn();
    const r = render(<PlanTypeReplaceAsk what="Door" onKeep={first} onReplace={() => undefined} />);
    r.rerender(<PlanTypeReplaceAsk what="Door" onKeep={second} onReplace={() => undefined} />);
    topOpen()!.close();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("re-rendering with another `what` does not take the focus back from where the person moved it", () => {
    const r = render(<PlanTypeReplaceAsk what="Door" onKeep={() => undefined} onReplace={() => undefined} />);
    screen.getByRole("button", { name: "Replace" }).focus();
    r.rerender(<PlanTypeReplaceAsk what="Gate" onKeep={() => undefined} onReplace={() => undefined} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Replace" }));
    expect(screen.getByTestId("plan-type-replace-ask").textContent).toContain("Gate");
  });
});
