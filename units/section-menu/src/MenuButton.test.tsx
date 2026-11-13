import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuButton, type MenuButtonItem } from "./MenuButton";

afterEach(cleanup);

function setup(over: Partial<{ items: MenuButtonItem[]; onOpenChange: (o: boolean) => void }> = {}) {
  const calls: string[] = [];
  const items: MenuButtonItem[] = over.items ?? [
    { id: "a", label: "Alpha", onSelect: () => calls.push("a") },
    { id: "b", label: "Beta", disabled: true, onSelect: () => calls.push("b") },
    { id: "c", label: "Gamma", onSelect: () => calls.push("c") },
  ];
  const user = userEvent.setup();
  render(
    <div>
      <MenuButton items={items} {...(over.onOpenChange ? { onOpenChange: over.onOpenChange } : {})} />
      <button type="button">elsewhere</button>
    </div>,
  );
  const button = () => screen.getByRole("button", { name: "Menu" });
  return { user, calls, button };
}

describe("MenuButton", () => {
  test("starts closed with the popup attributes", () => {
    const { button } = setup();
    expect(button().getAttribute("aria-haspopup")).toBe("menu");
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("a click opens it, marks it expanded, and focuses the first item; a second click closes it", async () => {
    const { user, button } = setup();
    await user.click(button());
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(button().getAttribute("aria-controls")).toBe(screen.getByRole("menu").id);
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Alpha" }));
    await user.click(button());
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("Escape closes it and the focus returns to the button", async () => {
    const { user, button } = setup();
    await user.click(button());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(button().getAttribute("aria-expanded")).toBe("false");
  });

  test("a press outside closes it", async () => {
    const { user, button } = setup();
    await user.click(button());
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("a press inside the list does not close it by itself", async () => {
    const { user, button } = setup();
    await user.click(button());
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByRole("menu") });
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  test("choosing an item closes the menu, returns the focus, then runs the act once", async () => {
    const { user, calls, button } = setup();
    await user.click(button());
    await user.click(screen.getByRole("menuitem", { name: "Gamma" }));
    expect(calls).toEqual(["c"]);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  test("Enter on the focused item chooses it", async () => {
    const { user, calls, button } = setup();
    await user.click(button());
    await user.keyboard("{Enter}");
    expect(calls).toEqual(["a"]);
    expect(document.activeElement).toBe(button());
  });

  test("Down and Up move between enabled items and wrap; a disabled item is skipped", async () => {
    const { user, button } = setup();
    await user.click(button());
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Gamma" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Alpha" }));
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Gamma" }));
    expect(button().getAttribute("aria-expanded")).toBe("true");
  });

  test("Home and End go to the first and last enabled item", async () => {
    const { user, button } = setup();
    await user.click(button());
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Gamma" }));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Alpha" }));
  });

  test("ArrowDown on the closed button opens it on the first item; ArrowUp on the last", async () => {
    const { user, button } = setup();
    button().focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Alpha" }));
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Gamma" }));
  });

  test("a disabled item is aria-disabled and does nothing, and the menu stays open", async () => {
    const { user, calls, button } = setup();
    await user.click(button());
    const beta = screen.getByRole("menuitem", { name: "Beta" });
    expect(beta.getAttribute("aria-disabled")).toBe("true");
    await user.click(beta);
    expect(calls).toEqual([]);
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  test("Tab closes it", async () => {
    const { user, button } = setup();
    await user.click(button());
    await user.tab();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("onOpenChange hears open and close", async () => {
    const onOpenChange = vi.fn();
    const { user, button } = setup({ onOpenChange });
    await user.click(button());
    await user.keyboard("{Escape}");
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  test("a menu of only disabled items still opens and closes with Escape", async () => {
    const { user, button } = setup({ items: [{ id: "x", label: "X", disabled: true, onSelect: () => {} }] });
    await user.click(button());
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
