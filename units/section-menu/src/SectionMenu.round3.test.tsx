// Adopted from Agent.Tester round 3 (report AgentTester-AppUnit-8aaf2ff.md, 2026-10-18).
// Agent.Tester round 3 probes (8aaf2ff). Now part of the unit's suite.
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §2 + Outcome.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { HOVER_OPEN_DELAY_MS, SectionMenu, type SectionMenuProps } from "./SectionMenu";
import { forYouFor, menuCommands, menuOptionsOf, placesFor, visibleSections, type MenuList, type MenuOption, type MenuSection } from "./menuList";
import { createIntentChannel, type Intent } from "./intent";

type Id = "home" | "notes";
interface Api { go(id: Id): void; run(x: string): void }
interface G { admin: boolean; banned?: boolean }
const OPT_ADMIN: MenuOption<Api, G | undefined> = { id: "notes.admin", icon: "admin", label: "Admin", description: "Managers.", show: (g) => !!g && g.admin, run: (a) => a.run("admin") };
const OPT_NOTBANNED: MenuOption<Api, G | undefined> = { id: "notes.share", icon: "share", label: "Share", description: "Share a note.", show: (g) => !g?.banned, run: (a) => a.run("share") };
const SECTIONS: MenuSection<Id, Api, G | undefined>[] = [
  { id: "home", icon: "home", label: "Home", description: "Start.", go: (a) => a.go("home"), options: [] },
  { id: "notes", icon: "records", label: "Notes", description: "Notes.", go: (a) => a.go("notes"),
    options: [
      { id: "notes.new", icon: "plus", label: "New", description: "Blank.", run: (a) => a.run("new") },
      OPT_ADMIN, OPT_NOTBANNED,
      { id: "notes.soon", icon: "news", label: "Soon", description: "Later.", coming: true, href: "https://example.test/soon" },
      { id: "notes.ext", icon: "globe", label: "Docs", description: "Elsewhere.", href: "https://example.test/docs" },
    ] },
];
const fakeApi = () => ({ go: vi.fn(), run: vi.fn() });
function props(over: Partial<SectionMenuProps<Id, Api, never, G | undefined>> = {}) {
  return { sections: SECTIONS, current: "notes", api: fakeApi(), sizeClass: "expanded", layers: { scrim: 100, panel: 101 }, ...over } as SectionMenuProps<Id, Api, never, G | undefined>;
}
const panel = () => screen.getByTestId("section-menu-panel");
const trigger = () => screen.getByTestId("section-menu-trigger");
const isOpen = () => panel().getAttribute("data-open") === "true";
const drawnOptions = () => Array.from(screen.getByTestId("section-menu-here").querySelectorAll("[data-option]")).map((e) => e.getAttribute("data-option"));

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

describe("round 3 — gate parity, menu vs palette", () => {
  // README: "a command palette reads the same list and the two cannot drift apart".
  test("R1 gate undefined (still loading): the palette lists exactly what the menu draws for the notes section", async () => {
    render(<SectionMenu {...props({ gate: undefined })} />);
    await userEvent.click(trigger());
    const menuIds = drawnOptions();
    const list: MenuList<Id, Api, G | undefined> = { sections: SECTIONS };
    const paletteIds = menuCommands(list, undefined, null).filter((c) => c.section === "notes" && !c.id.startsWith("go.")).map((c) => c.id);
    expect(paletteIds).toEqual(menuIds);
  });
  test("R1b menuCommands with an undefined gate does not throw for a gate that reads a field", () => {
    const list = { sections: [{ ...SECTIONS[1]!, options: [{ ...OPT_ADMIN, show: (g: G) => g.admin }] }] } as unknown as MenuList<Id, Api, G>;
    expect(() => menuCommands(list, undefined as unknown as G, null)).not.toThrow();
  });
  test("R1c helper parity: menuOptionsOf(s, undefined) equals menuOptionsOf(s)", () => {
    expect(menuOptionsOf(SECTIONS[1]!, undefined).map((o) => o.id)).toEqual(menuOptionsOf(SECTIONS[1]!).map((o) => o.id));
  });
  test("R2 the gate arriving while the menu is open shows the gated option at once", async () => {
    function Host() { const [g, setG] = useState<G | undefined>(undefined); return <><button onClick={() => setG({ admin: true })}>load</button><SectionMenu {...props({ gate: g })} /></>; }
    render(<Host />);
    await userEvent.click(trigger());
    expect(drawnOptions()).not.toContain("notes.admin");
    act(() => { (screen.getByText("load") as HTMLButtonElement).click(); });
    expect(drawnOptions()).toContain("notes.admin");
  });
});

describe("round 3 — OptionList glyphs", () => {
  test("R3 a coming entry with an address draws no ↗; a live address does", async () => {
    render(<SectionMenu {...props()} />);
    await userEvent.click(trigger());
    const soon = panel().querySelector('[data-option="notes.soon"]')!;
    const ext = panel().querySelector('[data-option="notes.ext"]')!;
    expect(soon.textContent).not.toContain("↗");
    expect(soon.tagName).toBe("BUTTON");
    expect(ext.textContent).toContain("↗");
    expect(ext.tagName).toBe("A");
    expect(ext.getAttribute("target")).toBe("_blank");
    expect(ext.getAttribute("rel")).toContain("noopener");
  });
});

describe("round 3 — opening and the pointer", () => {
  test("R4 hover-open does not close when the pointer leaves the button or the panel", async () => {
    hoverable = true;
    render(<SectionMenu {...props()} />);
    fireEvent.pointerEnter(trigger(), { pointerType: "mouse" });
    await act(() => new Promise<void>((r) => setTimeout(r, HOVER_OPEN_DELAY_MS + 30)));
    expect(isOpen()).toBe(true);
    fireEvent.pointerLeave(trigger(), { pointerType: "mouse" });
    fireEvent.mouseLeave(trigger());
    fireEvent.mouseLeave(panel());
    expect(isOpen()).toBe(true);
  });
  test("R5 hover-open, then a click after the grace closes it", async () => {
    hoverable = true;
    vi.useFakeTimers({ toFake: ["Date"] });
    render(<SectionMenu {...props()} />);
    fireEvent.pointerEnter(trigger(), { pointerType: "mouse" });
    await act(() => new Promise<void>((r) => setTimeout(r, HOVER_OPEN_DELAY_MS + 30)));
    vi.setSystemTime(Date.now() + 700);
    fireEvent.click(trigger());
    expect(isOpen()).toBe(false);
  });
});

describe("round 3 — intent channel", () => {
  type I = Intent<"create", "notes" | "home">;
  function setup(strict: boolean) {
    const channel = createIntentChannel<I>();
    const acts: I[] = [];
    let post: (i: I | null) => void = () => {};
    let goTo: (p: string) => void = () => {};
    function Dest() { channel.useIntent("create", (i) => acts.push(i)); return <p>dest</p>; }
    function Host() {
      const [intent, setIntent] = useState<I | null>(null);
      const [place, setPlace] = useState("notes");
      post = setIntent; goTo = setPlace;
      return <channel.Context.Provider value={{ intent, place, consume: () => setIntent(null) }}>{place === "notes" && <Dest />}</channel.Context.Provider>;
    }
    render(strict ? <StrictMode><Host /></StrictMode> : <Host />);
    return { acts, post: (i: I | null) => act(() => post(i)), goTo: (p: string) => act(() => goTo(p)) };
  }
  const SAME: I = { kind: "create", place: "any" };
  test("R6 StrictMode, destination mounted: the same intent object posted twice acts twice, once each", () => {
    const h = setup(true);
    h.post(SAME); h.post(SAME);
    expect(h.acts.length).toBe(2);
  });
  test("R7 StrictMode, destination mounts after the post: acts once", () => {
    const h = setup(true);
    h.goTo("home");
    h.post({ kind: "create", place: "notes" });
    expect(h.acts.length).toBe(0);
    h.goTo("notes");
    expect(h.acts.length).toBe(1);
  });
  test("R8 after an act, leaving and coming back does not act again", () => {
    const h = setup(false);
    h.post(SAME);
    h.goTo("home"); h.goTo("notes");
    expect(h.acts.length).toBe(1);
  });
});
