// Adopted from Agent.Tester's round-1 probes of units/section-menu at c76f682 (report
// AgentTester-AppUnit-c76f682.md, 2026-10-18): the GilbApp tests not ported in the first cut (diagonal
// move, Shift+Tab, full Tab cycle, phone targets, hover-then-Esc grace), the gates, the empty list,
// StrictMode, and the axe check (Rule_Code_accessibility RuleA11yUnitTest).
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §2 + Outcome.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState, type ReactNode } from "react";
import axe from "axe-core";
import { HOVER_INTENT_MS, HOVER_OPEN_DELAY_MS, SectionMenu, type SectionMenuProps } from "./SectionMenu";
import { menuCommands, menuOptionsOf, placesFor, visibleSections, type MenuOption, type MenuSection } from "./menuList";
import { createIntentChannel, type Intent } from "./intent";

type Id = "home" | "notes" | "files";
interface Api { go(id: Id): void; newNote(): void; upload(): void; signOut(): void }
const SECTIONS: MenuSection<Id, Api>[] = [
  { id: "home", icon: "home", label: "Home", description: "Start here.", go: (a) => a.go("home"),
    options: [{ id: "home.tour", icon: "help", label: "Take the tour", description: "Two minutes.", run: (a) => a.go("home") }], also: ["help"] },
  { id: "notes", icon: "records", label: "Notes", description: "Your notes.", go: (a) => a.go("notes"),
    options: [
      { id: "notes.new", icon: "plus", label: "New note", description: "A blank note.", run: (a) => a.newNote() },
      { id: "notes.two", icon: "plus", label: "Second", description: "Two.", run: (a) => a.newNote() },
      { id: "notes.profile", icon: "user", label: "Update your profile", description: "Soon.", coming: true },
    ], also: ["news", "help"] },
  { id: "files", icon: "files", label: "Files", description: "Documents.", go: (a) => a.go("files"),
    options: [{ id: "files.upload", icon: "upload", label: "Upload a file", description: "Into this vault.", run: (a) => a.upload() }] },
];
const PLACES: MenuOption<Api>[] = [
  { id: "news", icon: "news", label: "News", description: "What's new.", href: "https://example.test/news" },
  { id: "help", icon: "help", label: "Help", description: "Ask.", run: (a) => a.go("home") },
];
const FOR_YOU: MenuOption<Api>[] = [{ id: "you.agent", icon: "bot", label: "Choose an agent", description: "Pick one.", run: (a) => a.go("home") }];
const fakeApi = () => ({ go: vi.fn(), newNote: vi.fn(), upload: vi.fn(), signOut: vi.fn() });

function renderMenu(over: Partial<SectionMenuProps<Id, Api>> = {}) {
  const api = fakeApi();
  const props: SectionMenuProps<Id, Api> = {
    sections: SECTIONS, current: "notes", api, sizeClass: "expanded",
    places: (s) => placesFor(s, PLACES), forYou: FOR_YOU,
    footerAction: { label: "Sign out", icon: "signout", run: (a) => a.signOut() },
    layers: { scrim: 100, panel: 101 }, ...over,
  };
  const view = render(<SectionMenu {...props} />);
  return { api, props, view };
}
const panel = () => screen.getByTestId("section-menu-panel");
const trigger = () => screen.getByTestId("section-menu-trigger");
const section = (id: string) => Array.from(panel().querySelectorAll<HTMLElement>("[data-section]")).find((e) => e.getAttribute("data-section") === id)!;
const option = (id: string) => panel().querySelector<HTMLElement>(`[data-option="${id}"]`);
const isOpen = () => panel().getAttribute("data-open") === "true";
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
const nameOf = (el: Element | null) =>
  el?.getAttribute("data-section") ?? el?.getAttribute("data-option") ?? el?.getAttribute("data-testid") ?? el?.tagName ?? "null";

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

describe("ported — SectionMenu", () => {
  // Edge: a gate can hide every section (visibleSections → []).
  test("P1 an empty section list does not throw", () => {
    expect(() => renderMenu({ sections: visibleSections(SECTIONS.map((s) => ({ ...s, show: () => false })), {}) })).not.toThrow();
  });

  // Spec: MenuOption.show JSDoc "Shown only when this returns true" — a section option gated off.
  test("P2 a section option whose show() is false is not drawn in the menu", async () => {
    const gated: MenuSection<Id, Api>[] = SECTIONS.map((s) => s.id !== "notes" ? s : {
      ...s, options: [...s.options, { id: "notes.secret", icon: "key", label: "Secret", description: "Hidden.", show: () => false, run: (a) => a.newNote() }],
    });
    renderMenu({ sections: gated });
    await userEvent.click(trigger());
    expect(option("notes.secret")).toBeNull();
  });

  test("P2b menuOptionsOf / menuCommands honour an option's show() gate", () => {
    const sec: MenuSection<Id, Api, { admin: boolean }> = { id: "notes", icon: "records", label: "Notes", description: "", go: () => {},
      options: [{ id: "o.admin", icon: "admin", label: "Admin", description: "", show: (g) => g.admin }] };
    expect(menuOptionsOf(sec).map((o) => o.id)).toEqual([]);
    const cmds = menuCommands({ sections: [sec], places: [{ id: "p.admin", icon: "admin", label: "P", description: "", show: (g) => g.admin }] }, { admin: false }, null);
    expect(cmds.map((c) => c.id)).toEqual(["go.notes"]);
  });

  // Spec: 120 ms hover intent; a diagonal move to the options keeps the preview.
  test("P3 leaving the sections column before 120 ms cancels the pending preview", () => {
    vi.useFakeTimers();
    renderMenu();
    fireEvent.click(trigger());
    fireEvent.mouseEnter(section("files"));
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS - 40));
    fireEvent.mouseLeave(section("files").closest("[data-testid='section-menu-sections']")!.parentElement!);
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS * 2));
    expect(section("notes").getAttribute("data-previewing")).toBe("true");
    expect(option("files.upload")).toBeNull();
  });

  test("P4 a hover timer pending at close does not change the preview of the next opening", () => {
    vi.useFakeTimers();
    renderMenu();
    fireEvent.click(trigger());
    fireEvent.mouseEnter(section("files"));
    fireEvent.click(screen.getByTestId("section-menu-close"));
    fireEvent.click(trigger());
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS * 2));
    expect(section("notes").getAttribute("data-previewing")).toBe("true");
  });

  // Spec: focus trap and Tab order.
  test("P5 Shift+Tab from the first option goes back to the previewed section, preview kept", async () => {
    renderMenu();
    await userEvent.click(trigger());
    await frame();
    await userEvent.keyboard("{ArrowDown}"); // files previewed
    await userEvent.tab();
    expect(nameOf(document.activeElement)).toBe("files.upload");
    await userEvent.tab({ shift: true });
    expect(nameOf(document.activeElement)).toBe("files");
    expect(section("files").getAttribute("data-previewing")).toBe("true");
  });

  test("P6 one full Tab cycle: Close, then each section followed by exactly its live options and places, For you, footer act", async () => {
    renderMenu();
    await userEvent.click(trigger());
    await frame();
    act(() => screen.getByTestId("section-menu-close").focus());
    const seen: string[] = [];
    for (let i = 0; i < 14; i++) { await userEvent.tab(); seen.push(nameOf(document.activeElement)); }
    expect(seen).toEqual([
      "home", "home.tour", "help",
      "notes", "notes.new", "notes.two", "news", "help",
      "files", "files.upload",
      "you.agent", "section-menu-footer-action", "section-menu-close", "home",
    ]);
  });

  // Spec: arrows.
  test("P7 Down/Up inside an option column move between options and stop at the ends; Left from For you returns to the previewed section", async () => {
    renderMenu();
    await userEvent.click(trigger());
    await frame();
    await userEvent.keyboard("{ArrowRight}");
    expect(nameOf(document.activeElement)).toBe("notes.new");
    await userEvent.keyboard("{ArrowUp}");
    expect(nameOf(document.activeElement)).toBe("notes.new");
    await userEvent.keyboard("{ArrowDown}");
    expect(nameOf(document.activeElement)).toBe("notes.two");
    await userEvent.keyboard("{ArrowDown}");
    // the coming entry is aria-disabled but still a focusable button in the column
    expect(["notes.two", "notes.profile"]).toContain(nameOf(document.activeElement));
    act(() => option("you.agent")!.focus());
    await userEvent.keyboard("{ArrowLeft}");
    expect(nameOf(document.activeElement)).toBe("notes");
  });

  test("P8 arrows still work for a host id containing a quote", async () => {
    const odd = [...SECTIONS, { id: 'a"b', icon: "home", label: "Odd", description: "", go: () => {}, options: [] }] as unknown as MenuSection<Id, Api>[];
    renderMenu({ sections: odd });
    await userEvent.click(trigger());
    await frame();
    await userEvent.keyboard("{End}");
    expect(nameOf(document.activeElement)).toBe('a"b');
    await userEvent.keyboard("{Home}");
    expect(nameOf(document.activeElement)).toBe("home");
  });

  // Spec: hover-open + click grace.
  test("P9 hover opens; Esc closes; a click within the grace opens it again", async () => {
    hoverable = true;
    renderMenu();
    fireEvent.pointerEnter(trigger(), { pointerType: "mouse" });
    await act(() => new Promise<void>((r) => setTimeout(r, HOVER_OPEN_DELAY_MS + 30)));
    expect(isOpen()).toBe(true);
    await frame();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(isOpen()).toBe(false);
    fireEvent.click(trigger());
    expect(isOpen()).toBe(true);
  });

  test("P10 coming entry: Enter does nothing; a coming entry that also has an address is not a live link", async () => {
    const withHref = SECTIONS.map((s) => s.id !== "notes" ? s : { ...s, options: [...s.options,
      { id: "notes.soon", icon: "news" as const, label: "Soon", description: "", coming: true, href: "https://example.test/soon" }] });
    const { api } = renderMenu({ sections: withHref });
    await userEvent.click(trigger());
    act(() => option("notes.profile")!.focus());
    await userEvent.keyboard("{Enter}");
    expect(isOpen()).toBe(true);
    expect(api.newNote).not.toHaveBeenCalled();
    const soon = option("notes.soon")!;
    expect(soon.tagName === "A" && soon.hasAttribute("href")).toBe(false);
  });

  // Spec: compact sheet.
  test("P11 phone: icon-only trigger, 44 px targets, Tab reaches the current section's places", async () => {
    renderMenu({ sizeClass: "compact" });
    expect(screen.getByTestId("section-menu-trigger-label").className).toContain("hidden");
    await userEvent.click(trigger());
    await frame();
    for (const el of panel().querySelectorAll("button, a")) expect(el.className).toMatch(/min-h-\[44px\]/);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) { await userEvent.tab(); seen.push(nameOf(document.activeElement)); }
    expect(seen.slice(0, 4)).toEqual(["notes.new", "notes.two", "news", "help"]);
  });

  test("P12 reduced motion: trigger, chevron and panel switch transitions off", () => {
    renderMenu();
    expect(trigger().className).toContain("motion-reduce:transition-none");
    expect(Array.from(trigger().querySelectorAll("svg")).pop()!.getAttribute("class")).toContain("motion-reduce:transition-none");
    expect(panel().className).toContain("motion-reduce:transition-none");
  });

  test("P13 dismissed then un-dismissed: it can open again", async () => {
    const { props, view } = renderMenu();
    await userEvent.click(trigger());
    view.rerender(<SectionMenu {...props} dismissed />);
    expect(isOpen()).toBe(false);
    view.rerender(<SectionMenu {...props} dismissed={false} />);
    await userEvent.click(trigger());
    expect(isOpen()).toBe(true);
  });

  test("P14 Tab from outside the panel while open is pulled into the panel (Close first)", async () => {
    renderMenu();
    await userEvent.click(trigger());
    await frame();
    act(() => trigger().focus());
    await userEvent.tab();
    expect(nameOf(document.activeElement)).toBe("section-menu-close");
  });

  // Rule_Code_accessibility RuleA11yUnitTest: an axe check, closed and open, in three widths.
  test.each(["expanded", "medium", "compact"] as const)("P15 axe: no violations, closed and open (%s)", async (sizeClass) => {
    const { view } = renderMenu({ sizeClass, sectionStatus: (s) => (s.id === "files" ? { warning: "Could not read", busy: true } : undefined) });
    const run = async () => (await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    expect(await run()).toEqual([]);
    await userEvent.click(trigger());
    await frame();
    expect(await run()).toEqual([]);
  });
});

describe("ported — intent channel", () => {
  type I = Intent<"create", "home" | "notes">;
  const channel = createIntentChannel<I>();
  function Destination({ act: a }: { act: () => void }) { channel.useIntent("create", a); return <p>notes view</p>; }
  function App({ act: a, strict }: { act: () => void; strict?: boolean }) {
    const [place, setPlace] = useState<"home" | "notes">("home");
    const [pending, setPending] = useState<I | null>(null);
    const body: ReactNode = (
      <channel.Context.Provider value={{ intent: pending, place, consume: () => setPending(null) }}>
        <button onClick={() => { setPending({ kind: "create", place: "notes" }); setPlace("notes"); }}>go</button>
        {place === "notes" && <Destination act={a} />}
      </channel.Context.Provider>
    );
    return strict ? <StrictMode>{body}</StrictMode> : body;
  }

  // Spec: "act once the destination is mounted".
  test("P16 the act runs once, after a destination that was not mounted at choice time mounts", async () => {
    const a = vi.fn();
    render(<App act={a} />);
    await userEvent.click(screen.getByText("go"));
    expect(screen.getByText("notes view")).toBeTruthy();
    expect(a).toHaveBeenCalledTimes(1);
  });

  test("P17 under StrictMode the act still runs exactly once", async () => {
    const a = vi.fn();
    render(<App act={a} strict />);
    await userEvent.click(screen.getByText("go"));
    expect(a).toHaveBeenCalledTimes(1);
  });
});
