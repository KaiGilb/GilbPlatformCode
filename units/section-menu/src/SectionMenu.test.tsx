// The section menu's behaviour on a host-neutral list. Ported from GilbApp's SectionMenu tests
// (0f0f1b7: tester, tester2, tester3, tester4, shell), keeping what belongs to the menu itself; what
// belongs to GilbApp's own sections and shell stays tested in GilbApp.
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §2
// (the trigger, hover-open, scrim, always-mounted inert dialog, 120 ms hover intent, focus trap and Tab order,
// arrows, Home/End, Esc, the compact sheet).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { HOVER_INTENT_MS, SectionMenu, type SectionMenuHandle, type SectionMenuProps } from "./SectionMenu";
import { placesFor, visibleSections, type MenuOption, type MenuSection } from "./menuList";

type Id = "home" | "notes" | "files";
interface Api { go(id: Id): void; newNote(): void; upload(): void; signOut(): void }

const SECTIONS: MenuSection<Id, Api>[] = [
  { id: "home", icon: "home", label: "Home", description: "Start here.", go: (a) => a.go("home"),
    options: [{ id: "home.tour", icon: "help", label: "Take the tour", description: "Two minutes.", run: (a) => a.go("home") }], also: ["help"] },
  { id: "notes", icon: "records", label: "Notes", description: "Your notes.", go: (a) => a.go("notes"),
    options: [
      { id: "notes.new", icon: "plus", label: "New note", description: "A blank note.", run: (a) => a.newNote() },
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

function fakeApi() {
  return { go: vi.fn(), newNote: vi.fn(), upload: vi.fn(), signOut: vi.fn() };
}

function renderMenu(over: Partial<SectionMenuProps<Id, Api>> = {}) {
  const api = fakeApi();
  const props: SectionMenuProps<Id, Api> = {
    sections: visibleSections(SECTIONS, {}),
    current: "notes",
    api,
    sizeClass: "expanded",
    places: (s) => placesFor(s, PLACES),
    forYou: FOR_YOU,
    footerAction: { label: "Sign out", icon: "signout", run: (a) => a.signOut(), testId: "section-menu-sign-out" },
    layers: { scrim: 100, panel: 101 },
    ...over,
  };
  const view = render(<SectionMenu {...props} />);
  return { api, props, view };
}

const panel = () => screen.getByTestId("section-menu-panel");
const trigger = () => screen.getByTestId("section-menu-trigger");
const section = (id: Id) => panel().querySelector<HTMLElement>(`[data-section="${id}"]`)!;
const option = (id: string) => panel().querySelector<HTMLElement>(`[data-option="${id}"]`)!;
const isOpen = () => panel().getAttribute("data-open") === "true";
/** Lets the open effect's requestAnimationFrame run. */
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

// jsdom 25 has no PointerEvent, so `pointerType` would be lost; a small stand-in carries it.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStandIn extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "";
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventStandIn;
}

let hoverable = false;
beforeEach(() => {
  hoverable = false;
  window.matchMedia = ((q: string) => ({ matches: hoverable && q.includes("hover: hover"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SectionMenu", () => {
  describe("the button", () => {
    test("says where you are, in its text and its accessible name", () => {
      renderMenu();
      expect(screen.getByTestId("section-menu-trigger-label").textContent).toBe("Notes");
      expect(trigger().getAttribute("aria-label")).toBe("Go to — you are in Notes");
      expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");
      expect(trigger().getAttribute("aria-controls")).toBe(panel().id);
    });

    test("an unknown current section reads as the first", () => {
      renderMenu({ current: "nowhere" as Id });
      expect(screen.getByTestId("section-menu-trigger-label").textContent).toBe("Home");
    });
  });

  describe("always mounted, instant", () => {
    test("closed: in the page but inert and hidden; open is a class change on the same node", async () => {
      renderMenu();
      const p = panel();
      expect(p.getAttribute("aria-hidden")).toBe("true");
      expect(p.hasAttribute("inert")).toBe(true);
      expect(p.getAttribute("role")).toBe("dialog");
      await userEvent.click(trigger());
      expect(panel()).toBe(p);
      expect(isOpen()).toBe(true);
      expect(p.hasAttribute("inert")).toBe(false);
      expect(trigger().getAttribute("aria-expanded")).toBe("true");
    });

    test("the layers and the offsets are the host's", () => {
      renderMenu({ layers: { scrim: 55, panel: 56 }, scrimTop: "56px", panelTop: "64px" });
      expect(panel().style.zIndex).toBe("56");
      expect(panel().style.top).toBe("64px");
      const scrim = screen.getByTestId("section-menu-scrim");
      expect(scrim.style.zIndex).toBe("55");
      expect(scrim.style.top).toBe("56px");
    });
  });

  describe("opening", () => {
    test("a click opens it and focus lands on the section you are in", async () => {
      renderMenu();
      await userEvent.click(trigger());
      await frame();
      expect(document.activeElement).toBe(section("notes"));
      expect(section("notes").getAttribute("aria-current")).toBe("page");
      expect(screen.getByTestId("section-menu-here-tag").textContent).toBe("You are here");
    });

    test("a fine pointer that can hover opens it on enter; the click that follows keeps it open", () => {
      hoverable = true;
      renderMenu();
      fireEvent.pointerEnter(trigger(), { pointerType: "mouse" });
      expect(isOpen()).toBe(true);
      fireEvent.click(trigger());
      expect(isOpen()).toBe(true);
      // A click well after the hover is a request to close.
      const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5_000);
      fireEvent.click(trigger());
      expect(isOpen()).toBe(false);
      now.mockRestore();
    });

    test("touch does not open on enter, and nothing opens on enter where hover is coarse", () => {
      hoverable = true;
      renderMenu();
      fireEvent.pointerEnter(trigger(), { pointerType: "touch" });
      expect(isOpen()).toBe(false);
      cleanup();
      hoverable = false;
      renderMenu();
      fireEvent.pointerEnter(trigger(), { pointerType: "mouse" });
      expect(isOpen()).toBe(false);
    });

    test("it does not close when the pointer leaves", async () => {
      renderMenu();
      await userEvent.click(trigger());
      fireEvent.pointerLeave(trigger());
      fireEvent.mouseLeave(panel());
      expect(isOpen()).toBe(true);
    });
  });

  describe("four ways to close, focus back on the button", () => {
    test("Close", async () => {
      renderMenu();
      await userEvent.click(trigger());
      await userEvent.click(screen.getByTestId("section-menu-close"));
      expect(isOpen()).toBe(false);
      expect(document.activeElement).toBe(trigger());
    });
    test("Esc", async () => {
      renderMenu();
      await userEvent.click(trigger());
      await frame();
      await userEvent.keyboard("{Escape}");
      expect(isOpen()).toBe(false);
      expect(document.activeElement).toBe(trigger());
    });
    test("a click on the dimmed edge", async () => {
      renderMenu();
      await userEvent.click(trigger());
      fireEvent.click(screen.getByTestId("section-menu-scrim"));
      expect(isOpen()).toBe(false);
      expect(document.activeElement).toBe(trigger());
    });
    test("any choice: a section, an option, a place, For you, the footer act", async () => {
      const { api } = renderMenu();
      await userEvent.click(trigger());
      await userEvent.click(section("files"));
      expect(isOpen()).toBe(false);
      expect(api.go).toHaveBeenCalledWith("files");
      await userEvent.click(trigger());
      await userEvent.click(option("notes.new"));
      expect(isOpen()).toBe(false);
      expect(api.newNote).toHaveBeenCalledTimes(1);
      await userEvent.click(trigger());
      await userEvent.click(screen.getByTestId("section-menu-sign-out"));
      expect(isOpen()).toBe(false);
      expect(api.signOut).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(trigger());
    });
    test("a second click on the button, after the hover grace, closes it", async () => {
      renderMenu();
      await userEvent.click(trigger());
      await userEvent.click(trigger());
      expect(isOpen()).toBe(false);
    });
  });

  describe("choices", () => {
    test("onChoose hears the section a choice goes to, before the act runs", async () => {
      const order: string[] = [];
      const api = { go: vi.fn(() => order.push("go")), newNote: vi.fn(() => order.push("new")), upload: vi.fn(), signOut: vi.fn() };
      renderMenu({ api, onChoose: (t) => order.push(`choose:${t ?? "-"}`) });
      await userEvent.click(trigger());
      await userEvent.click(section("files"));
      await userEvent.click(trigger());
      await userEvent.click(option("notes.new"));
      await userEvent.click(trigger());
      await userEvent.click(option("help"));
      expect(order).toEqual(["choose:files", "go", "choose:notes", "new", "choose:-", "go"]);
    });

    test("a coming entry is greyed and does nothing; an address opens in a new tab and closes the menu", async () => {
      const { api } = renderMenu();
      await userEvent.click(trigger());
      const coming = option("notes.profile");
      expect(coming.getAttribute("aria-disabled")).toBe("true");
      expect(coming.textContent).toContain("Coming");
      await userEvent.click(coming);
      expect(isOpen()).toBe(true);
      const link = option("news") as HTMLAnchorElement;
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe("https://example.test/news");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      fireEvent.click(link);
      expect(isOpen()).toBe(false);
      expect(api.go).not.toHaveBeenCalled();
    });

    test("with no api yet, a choice only closes", async () => {
      renderMenu({ api: undefined });
      await userEvent.click(trigger());
      await userEvent.click(section("files"));
      expect(isOpen()).toBe(false);
    });
  });

  describe("preview", () => {
    test("resting the pointer 120 ms on a section previews its options; a quick pass does not", async () => {
      vi.useFakeTimers();
      renderMenu();
      fireEvent.click(trigger());
      fireEvent.mouseEnter(section("files"));
      act(() => vi.advanceTimersByTime(HOVER_INTENT_MS - 10));
      expect(option("notes.new")).toBeTruthy();
      fireEvent.mouseEnter(section("home"));
      act(() => vi.advanceTimersByTime(HOVER_INTENT_MS - 10));
      expect(panel().querySelector('[data-option="home.tour"]')).toBeNull();
      act(() => vi.advanceTimersByTime(20));
      expect(option("home.tour")).toBeTruthy();
      expect(screen.getByTestId("section-menu-here").textContent).toContain("In Home");
      expect(screen.getByTestId("section-menu-here").textContent).toContain("Click an option to go to Home and do it");
      expect(section("home").getAttribute("data-previewing")).toBe("true");
    });

    test("focus previews; the places follow the previewed section; each opening starts from where you are", async () => {
      renderMenu();
      await userEvent.click(trigger());
      act(() => section("home").focus());
      expect(option("home.tour")).toBeTruthy();
      expect(screen.getByTestId("section-menu-places").querySelectorAll("[data-option]").length).toBe(1);
      await userEvent.click(screen.getByTestId("section-menu-close"));
      await userEvent.click(trigger());
      expect(option("notes.new")).toBeTruthy();
      expect(section("notes").getAttribute("data-previewing")).toBe("true");
    });

    test("a section with no places shows no Also useful here", async () => {
      renderMenu();
      await userEvent.click(trigger());
      act(() => section("files").focus());
      expect(screen.queryByTestId("section-menu-places")).toBeNull();
      expect(screen.getByTestId("section-menu-foryou")).toBeTruthy();
    });
  });

  describe("keyboard", () => {
    test("Up, Down, Home and End move between sections and preview; Right goes in, Left comes back", async () => {
      renderMenu();
      await userEvent.click(trigger());
      await frame();
      await userEvent.keyboard("{ArrowDown}");
      expect(document.activeElement).toBe(section("files"));
      await userEvent.keyboard("{ArrowDown}");
      expect(document.activeElement).toBe(section("home"));
      await userEvent.keyboard("{End}");
      expect(document.activeElement).toBe(section("files"));
      await userEvent.keyboard("{Home}");
      expect(document.activeElement).toBe(section("home"));
      await userEvent.keyboard("{ArrowUp}");
      expect(document.activeElement).toBe(section("files"));
      await userEvent.keyboard("{ArrowRight}");
      expect(document.activeElement).toBe(option("files.upload"));
      await userEvent.keyboard("{ArrowLeft}");
      expect(document.activeElement).toBe(section("files"));
    });

    test("Tab reaches every section, and the previewed section's options and places right after it, then wraps", async () => {
      renderMenu();
      await userEvent.click(trigger());
      await frame();
      const seen: string[] = [];
      for (let i = 0; i < 9; i++) {
        await userEvent.tab();
        const el = document.activeElement as HTMLElement;
        seen.push(el.getAttribute("data-section") ?? el.getAttribute("data-option") ?? el.getAttribute("data-testid") ?? el.tagName);
      }
      // Focus starts on Notes (you are here). Its option is next (the coming one is skipped), then its places.
      // Tabbing onto Files previews Files, so its option follows it.
      expect(seen).toEqual(["notes.new", "news", "help", "files", "files.upload", "you.agent", "section-menu-sign-out", "section-menu-close", "home"]);
      expect(panel().contains(document.activeElement)).toBe(true);
    });

    test("Shift+Tab goes backwards and wraps to the footer act", async () => {
      renderMenu();
      await userEvent.click(trigger());
      await frame();
      act(() => screen.getByTestId("section-menu-close").focus());
      await userEvent.tab({ shift: true });
      expect(document.activeElement).toBe(screen.getByTestId("section-menu-sign-out"));
    });
  });

  describe("phone (compact)", () => {
    test("one column; hover does not preview; the options are those of the section you are in", async () => {
      vi.useFakeTimers();
      renderMenu({ sizeClass: "compact" });
      fireEvent.click(trigger());
      const grid = screen.getByTestId("section-menu-here").parentElement!;
      expect(grid.className).toContain("grid-cols-1");
      fireEvent.mouseEnter(section("files"));
      act(() => vi.advanceTimersByTime(HOVER_INTENT_MS * 3));
      act(() => section("files").focus());
      expect(option("notes.new")).toBeTruthy();
      expect(panel().querySelector('[data-option="files.upload"]')).toBeNull();
      expect(panel().textContent).not.toContain("Press");
    });

    test("medium is two columns; wide is three, or two when there is no third column's content", () => {
      renderMenu({ sizeClass: "medium" });
      expect(screen.getByTestId("section-menu-here").parentElement!.className).toContain("grid-cols-2");
      cleanup();
      renderMenu({ places: undefined, forYou: undefined });
      expect(screen.getByTestId("section-menu-here").parentElement!.className).toContain("minmax(0,2fr)");
      expect(screen.queryByTestId("section-menu-foryou")).toBeNull();
    });
  });

  describe("what the host passes in", () => {
    test("dismissed closes it at once and does not take focus back", async () => {
      const { props, view } = renderMenu();
      await userEvent.click(trigger());
      await frame();
      const outside = document.createElement("input");
      document.body.appendChild(outside);
      outside.focus();
      view.rerender(<SectionMenu {...props} dismissed />);
      expect(isOpen()).toBe(false);
      expect(document.activeElement).toBe(outside);
      outside.remove();
    });

    test("the handle opens it on a section of the host's choice, and closes it", async () => {
      const ref = createRef<SectionMenuHandle<Id>>();
      renderMenu({ ref });
      act(() => ref.current!.openAt("files"));
      expect(isOpen()).toBe(true);
      expect(option("files.upload")).toBeTruthy();
      act(() => ref.current!.close());
      expect(isOpen()).toBe(false);
      act(() => ref.current!.openAt());
      expect(option("notes.new")).toBeTruthy();
    });

    test("a section's warning and busy state", async () => {
      renderMenu({ sectionStatus: (s) => (s.id === "files" ? { warning: "The kinds could not be read", busy: true } : undefined) });
      expect(screen.getByTestId("section-menu-files-warning").textContent).toBe("The kinds could not be read");
      expect(section("files").getAttribute("aria-busy")).toBe("true");
      expect(section("files").getAttribute("title")).toBe("The kinds could not be read");
      expect(section("notes").hasAttribute("aria-busy")).toBe(false);
    });

    test("the words, the footer hint and the icons are the host's", () => {
      renderMenu({
        labels: { goTo: "Menu", trigger: (l) => `Menu, at ${l}`, here: "Here", sections: "Pages" },
        footerHint: <span data-testid="hint">Press ⌘K</span>,
        renderIcon: (name) => <i data-icon={name} />,
      });
      expect(panel().getAttribute("aria-label")).toBe("Menu");
      expect(trigger().getAttribute("aria-label")).toBe("Menu, at Notes");
      expect(screen.getByTestId("section-menu-here-tag").textContent).toBe("Here");
      expect(panel().textContent).toContain("Pages");
      expect(screen.getByTestId("hint").textContent).toBe("Press ⌘K");
      expect(trigger().querySelector('[data-icon="records"]')).toBeTruthy();
    });

    test("with no footer act, the footer has the hint only; the default hint names Esc", () => {
      renderMenu({ footerAction: undefined });
      expect(panel().querySelector("[data-footer-action]")).toBeNull();
      expect(panel().textContent).toContain("Press Esc to close");
    });
  });
});
