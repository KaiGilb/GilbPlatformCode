// Adopted into the unit's own suite from Agent.Tester's probes (2026-10-18).
// Agent.Tester round 5 probes (units/section-menu 866232a).
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §2
// (the trigger, hover-open, four ways to close, focus trap and Tab order, menuCommands/toCommand) + README claims.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HOVER_CLICK_GRACE_MS, HOVER_INTENT_MS, SectionMenu, type SectionMenuProps } from "./SectionMenu";
import { menuCommands, type MenuOption, type MenuSection } from "./menuList";

type Id = "home" | "notes";
interface Api { go(id: Id): void; run(x: string): void; signOut(): void }
const SECTIONS: MenuSection<Id, Api>[] = [
  { id: "home", icon: "home", label: "Home", description: "Start.", go: (a) => a.go("home"), options: [{ id: "home.tour", icon: "help", label: "Tour", description: "t", run: (a) => a.run("tour") }] },
  { id: "notes", icon: "records", label: "Notes", description: "Notes.", go: (a) => a.go("notes"), also: ["ext"],
    options: [
      { id: "notes.new", icon: "plus", label: "New", description: "n", run: (a) => a.run("new") },
      { id: "notes.soon", icon: "user", label: "Soon", description: "s", coming: true },
      { id: "notes.last", icon: "plus", label: "Last", description: "l", run: (a) => a.run("last") },
    ] },
];
// An address that ALSO carries a run: the link opens the address; the run must not fire (SectionMenu.tsx:612).
const PLACES: MenuOption<Api>[] = [{ id: "ext", icon: "news", label: "Ext", description: "e", href: "https://example.test/x", run: (a) => a.run("ext-run") }];

if (typeof window.PointerEvent === "undefined") {
  class P extends MouseEvent { pointerType: string; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.pointerType = i.pointerType ?? ""; } }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = P;
}
let hoverable = false;
beforeEach(() => {
  hoverable = false;
  window.matchMedia = ((q: string) => ({ matches: hoverable && q.includes("hover: hover"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function renderMenu(over: Partial<SectionMenuProps<Id, Api>> = {}) {
  const api = { go: vi.fn(), run: vi.fn(), signOut: vi.fn() };
  render(<SectionMenu {...({ sections: SECTIONS, current: "notes", api, sizeClass: "expanded", places: (s: MenuSection<Id, Api>) => (s.also?.includes("ext") ? PLACES : []),
    footerAction: { label: "Sign out", run: (a: Api) => a.signOut() }, layers: { scrim: 1, panel: 2 }, ...over } as SectionMenuProps<Id, Api>)} />);
  return api;
}
const panel = () => screen.getByTestId("section-menu-panel");
const isOpen = () => panel().getAttribute("data-open") === "true";
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

describe("round 5 probes", () => {
  // Spec: menuCommands/toCommand — MenuCommandWords JSDoc: goTo default "Go to <label>", forYou default "For you".
  test("Q5-1 menuCommands default wording: 'Go to <label>' rows and 'For you' loc; words override both", () => {
    const list = { sections: SECTIONS, forYou: [{ id: "y", icon: "bot" as const, label: "Y", description: "" }] };
    const rows = menuCommands(list, undefined, null);
    expect(rows.find((r) => r.id === "go.notes")?.label).toBe("Go to Notes");
    expect(rows.find((r) => r.id === "y")?.loc).toBe("For you");
    const w = menuCommands(list, undefined, null, { goTo: (l) => `Gå til ${l}`, forYou: "For deg" });
    expect(w.find((r) => r.id === "go.notes")?.label).toBe("Gå til Notes");
    expect(w.find((r) => r.id === "y")?.loc).toBe("For deg");
  });

  // Spec: README "api … while it is undefined a choice only closes the menu" — the footer act too.
  test("Q5-2 api undefined: the footer act only closes the menu and runs nothing", async () => {
    const run = vi.fn();
    renderMenu({ api: undefined, footerAction: { label: "Sign out", run } });
    await userEvent.click(screen.getByTestId("section-menu-trigger"));
    await frame();
    await userEvent.click(screen.getByTestId("section-menu-footer-action"));
    expect(isOpen()).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  // Spec: four ways to close / "an option with an address opens it in a new tab" (the link's own act only).
  test("Q5-3 an address that also has a run: the click closes the menu and does NOT run the option's run", async () => {
    const api = renderMenu();
    await userEvent.click(screen.getByTestId("section-menu-trigger"));
    await frame();
    const a = panel().querySelector<HTMLAnchorElement>('[data-option="ext"]')!;
    expect(a.tagName).toBe("A");
    a.addEventListener("click", (e) => e.preventDefault()); // jsdom: no navigation
    await userEvent.click(a);
    expect(isOpen()).toBe(false);
    expect(api.run).not.toHaveBeenCalled();
  });

  // Spec: hover-open; README "A click right after a hover-open (within 600 ms) keeps it open; a later click closes it."
  // Pointer leaving the trigger and coming back while open must not reset the preview nor restart the grace.
  test("Q5-4 pointer re-entering the trigger while open keeps the preview and a later click still closes", () => {
    vi.useFakeTimers();
    hoverable = true;
    renderMenu();
    const t = screen.getByTestId("section-menu-trigger");
    fireEvent.pointerEnter(t, { pointerType: "mouse" });
    expect(isOpen()).toBe(true);
    const home = panel().querySelector<HTMLElement>('[data-section="home"]')!;
    fireEvent.mouseEnter(home);
    act(() => { vi.advanceTimersByTime(HOVER_INTENT_MS + 10); });
    expect(home.getAttribute("data-previewing")).toBe("true");
    act(() => { vi.advanceTimersByTime(HOVER_CLICK_GRACE_MS + 10); });
    fireEvent.pointerEnter(t, { pointerType: "mouse" });
    expect(home.getAttribute("data-previewing")).toBe("true");
    fireEvent.click(t);
    expect(isOpen()).toBe(false);
  });

  // Spec: Rule_Code_accessibility RuleA11yAriaWhenNeeded; SectionMenuLabels.sectionsGroup "The accessible name of the sections' group".
  test("Q5-5 the sections' group carries its accessible name (default and host label)", () => {
    renderMenu({ labels: { sectionsGroup: "Seksjoner" } });
    expect(screen.getByTestId("section-menu-sections").getAttribute("aria-label")).toBe("Seksjoner");
    expect(screen.getByRole("group", { name: "Seksjoner", hidden: true })).toBeTruthy();
  });

  // Observation probe: arrowing onto a coming option (aria-disabled, not a Tab stop) then Tab.
  test("Q5-6 (observation) ArrowDown onto a coming option, then Tab: where focus goes", async () => {
    renderMenu();
    await userEvent.click(screen.getByTestId("section-menu-trigger"));
    await frame();
    (panel().querySelector('[data-option="notes.new"]') as HTMLElement).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement?.getAttribute("data-option")).toBe("notes.soon");
    await userEvent.tab();
    // Record, do not judge: the trap finds no index for an element outside its order and goes to the first stop.
    (globalThis as { __q56?: string }).__q56 = document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.getAttribute("data-option") ?? "";
    console.log("Q5-6 focus after Tab from a coming option:", (globalThis as { __q56?: string }).__q56);
  });
});
