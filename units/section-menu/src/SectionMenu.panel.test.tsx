// A menu option may open the host's own panel in the options column instead of closing and running an act.
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HOVER_INTENT_MS, SectionMenu, type SectionMenuProps } from "./SectionMenu";
import type { MenuOption, MenuSection } from "./menuList";

type Id = "home" | "notes" | "files";
interface Api { go(id: Id): void; newNote(): void; upload(): void }

const SECTIONS: MenuSection<Id, Api>[] = [
  { id: "home", icon: "home", label: "Home", description: "Start here.", go: (a) => a.go("home"),
    options: [{ id: "home.tour", icon: "help", label: "Take the tour", description: "Two minutes.", run: (a) => a.go("home") }] },
  { id: "notes", icon: "records", label: "Notes", description: "Your notes.", go: (a) => a.go("notes"),
    options: [
      { id: "notes.new", icon: "plus", label: "New note", description: "A blank note.", run: (a) => a.newNote() },
      { id: "notes.pick", icon: "records", label: "Pick one", description: "Choose which.", panel: "pick" },
      { id: "notes.other", icon: "search", label: "Find a note", description: "Search.", run: (a) => a.newNote() },
    ] },
  { id: "files", icon: "files", label: "Files", description: "Documents.", go: (a) => a.go("files"),
    options: [{ id: "files.upload", icon: "upload", label: "Upload a file", description: "A file.", run: (a) => a.upload() }] },
];

function renderMenu(over: Partial<SectionMenuProps<Id, Api>> = {}) {
  const api: Api = { go: vi.fn(), newNote: vi.fn(), upload: vi.fn() };
  const props: SectionMenuProps<Id, Api> = {
    sections: SECTIONS,
    current: "notes",
    api,
    sizeClass: "expanded",
    layers: { scrim: 100, panel: 101 },
    renderPanel: (id, ctx) => (
      <button type="button" data-testid="host-act" onClick={() => ctx.choose(() => api.go("notes"), "notes")}>
        Open {id}
      </button>
    ),
    ...over,
  };
  const view = render(<SectionMenu {...props} />);
  return { api, props, view };
}

const panelEl = () => screen.getByTestId("section-menu-panel");
const trigger = () => screen.getByTestId("section-menu-trigger");
const section = (id: Id) => panelEl().querySelector<HTMLElement>(`[data-section="${id}"]`)!;
const option = (id: string) => panelEl().querySelector<HTMLElement>(`[data-option="${id}"]`)!;
const isOpen = () => panelEl().getAttribute("data-open") === "true";
const here = () => screen.getByTestId("section-menu-here");
/** Lets a requestAnimationFrame scheduled by an open or a Back run. */
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openOnPick() {
  await userEvent.click(trigger());
  await frame();
  await userEvent.click(option("notes.pick"));
}

describe("a host panel in the options column", () => {
  test("choosing a panel option keeps the menu open and swaps the options for the host panel", async () => {
    const onChoose = vi.fn();
    renderMenu({ onChoose });
    await openOnPick();
    expect(isOpen()).toBe(true);
    expect(onChoose).not.toHaveBeenCalled();
    expect(here().querySelector("[data-option]")).toBeNull();
    const host = screen.getByTestId("section-menu-host-panel");
    expect(host.getAttribute("data-panel")).toBe("pick");
    expect(host.textContent).toContain("Open pick");
    expect(here().textContent).toContain("Pick one");
    expect(here().textContent).not.toContain("Choose which.");
    const back = screen.getByTestId("section-menu-panel-back");
    expect(back.getAttribute("aria-label")).toBe("Back to In Notes");
    expect(back.textContent).toContain("Back");
    await frame();
    expect(document.activeElement).toBe(screen.getByTestId("host-act"));
  });

  test("ctx.choose closes the menu, calls onChoose once, then runs", async () => {
    const order: string[] = [];
    renderMenu({
      onChoose: (t) => order.push(`choose:${t ?? "-"}`),
      renderPanel: (_id, ctx) => (
        <button type="button" data-testid="host-act" onClick={() => ctx.choose(() => order.push("run"), "files")}>Do it</button>
      ),
    });
    await openOnPick();
    await userEvent.click(screen.getByTestId("host-act"));
    expect(isOpen()).toBe(false);
    expect(order).toEqual(["choose:files", "run"]);
  });

  test("Back returns to the options and focuses the option that opened the panel", async () => {
    renderMenu();
    await openOnPick();
    await frame();
    await userEvent.click(screen.getByTestId("section-menu-panel-back"));
    await frame();
    expect(isOpen()).toBe(true);
    expect(screen.queryByTestId("section-menu-host-panel")).toBeNull();
    expect(option("notes.pick")).toBeTruthy();
    expect(option("notes.new")).toBeTruthy();
    expect(document.activeElement).toBe(option("notes.pick"));
  });

  test("Escape leaves the panel, and a second Escape closes the menu", async () => {
    renderMenu();
    await openOnPick();
    await frame();
    await userEvent.keyboard("{Escape}");
    expect(isOpen()).toBe(true);
    expect(screen.queryByTestId("section-menu-host-panel")).toBeNull();
    expect(option("notes.new")).toBeTruthy();
    expect(option("notes.pick")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(isOpen()).toBe(false);
  });

  test("without renderPanel a panel option is left out and its siblings stay", async () => {
    const places: MenuOption<Api>[] = [
      { id: "news", icon: "news", label: "News", description: "What's new.", href: "https://example.test/news" },
      { id: "place.pick", icon: "files", label: "Useful panel", description: "Open.", panel: "place" },
    ];
    const forYou: MenuOption<Api>[] = [
      { id: "you.keep", icon: "user", label: "For you", description: "Shown.", run: (a) => a.go("home") },
      { id: "you.pick", icon: "bot", label: "You panel", description: "Open.", panel: "you" },
    ];
    renderMenu({ renderPanel: undefined, places: (s) => (s.id === "notes" ? places : []), forYou });
    await userEvent.click(trigger());
    expect(panelEl().querySelector("[data-option='notes.pick']")).toBeNull();
    expect(option("notes.new")).toBeTruthy();
    expect(option("notes.other")).toBeTruthy();
    expect(panelEl().querySelector("[data-option='place.pick']")).toBeNull();
    expect(option("news")).toBeTruthy();
    expect(panelEl().querySelector("[data-option='you.pick']")).toBeNull();
    expect(option("you.keep")).toBeTruthy();
  });

  test("previewing another section clears the panel, and opening again starts without one", () => {
    vi.useFakeTimers();
    renderMenu();
    fireEvent.click(trigger());
    fireEvent.click(option("notes.pick"));
    expect(screen.getByTestId("section-menu-host-panel").getAttribute("data-panel")).toBe("pick");

    act(() => { section("files").focus(); });
    expect(screen.queryByTestId("section-menu-host-panel")).toBeNull();
    expect(option("files.upload")).toBeTruthy();

    act(() => { section("notes").focus(); });
    expect(screen.queryByTestId("section-menu-host-panel")).toBeNull();
    expect(option("notes.pick")).toBeTruthy();

    fireEvent.click(option("notes.pick"));
    expect(screen.getByTestId("section-menu-host-panel")).toBeTruthy();
    fireEvent.mouseEnter(section("home"));
    act(() => { vi.advanceTimersByTime(HOVER_INTENT_MS); });
    expect(screen.queryByTestId("section-menu-host-panel")).toBeNull();
    expect(option("home.tour")).toBeTruthy();

    fireEvent.click(screen.getByTestId("section-menu-close"));
    fireEvent.click(trigger());
    expect(screen.queryByTestId("section-menu-host-panel")).toBeNull();
    expect(option("notes.new")).toBeTruthy();
    expect(option("notes.pick")).toBeTruthy();
    vi.useRealTimers();
  });

  test("Tab from the previewed section reaches Back, then the host panel's first button", async () => {
    renderMenu({
      renderPanel: () => (
        <>
          <button type="button" data-testid="host-first">First</button>
          <button type="button" data-testid="host-second">Second</button>
        </>
      ),
    });
    await openOnPick();
    await frame();
    act(() => { section("notes").focus(); });
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByTestId("section-menu-panel-back"));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByTestId("host-first"));
  });

  test("on a phone the panel opens and ctx.choose closes the menu", async () => {
    const order: string[] = [];
    renderMenu({
      sizeClass: "compact",
      onChoose: (t) => order.push(`choose:${t ?? "-"}`),
      renderPanel: (_id, ctx) => (
        <button type="button" data-testid="host-act" onClick={() => ctx.choose(() => order.push("run"), "notes")}>Do it</button>
      ),
    });
    await userEvent.click(trigger());
    await userEvent.click(option("notes.pick"));
    expect(isOpen()).toBe(true);
    expect(screen.getByTestId("section-menu-host-panel").getAttribute("data-panel")).toBe("pick");
    expect(here().textContent).toContain("Pick one");
    await userEvent.click(screen.getByTestId("host-act"));
    expect(isOpen()).toBe(false);
    expect(order).toEqual(["choose:notes", "run"]);
  });

  test("a place or a For you option with panel opens the host panel too", async () => {
    renderMenu({
      places: () => [{ id: "place.pick", icon: "files", label: "Useful", description: "Open.", panel: "place" }],
      forYou: [{ id: "you.pick", icon: "bot", label: "Yours", description: "Open.", panel: "you" }],
    });
    await userEvent.click(trigger());
    await frame();
    await userEvent.click(option("place.pick"));
    expect(isOpen()).toBe(true);
    expect(screen.getByTestId("section-menu-host-panel").getAttribute("data-panel")).toBe("place");
    await userEvent.click(screen.getByTestId("section-menu-panel-back"));
    await frame();
    await userEvent.click(option("you.pick"));
    expect(screen.getByTestId("section-menu-host-panel").getAttribute("data-panel")).toBe("you");
    expect(isOpen()).toBe(true);
  });

  test("a field in the host panel stays in the Tab order, and the trap wraps back to it", async () => {
    // Focusing another section on a wide screen previews it and leaves the host panel, so the field
    // would unmount mid-cycle. On a phone, focus does not preview, and the field stays to be wrapped to.
    renderMenu({
      sizeClass: "compact",
      renderPanel: () => (
        <>
          <input aria-label="Find" />
          <button>Go</button>
        </>
      ),
    });
    await openOnPick();
    await frame();
    const find = screen.getByRole("textbox", { name: "Find" });
    const go = screen.getByRole("button", { name: "Go" });
    expect(document.activeElement).toBe(find);

    await userEvent.tab();
    expect(document.activeElement).toBe(go);

    const seen: Element[] = [];
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      seen.push(document.activeElement!);
    }
    expect(seen).toEqual([
      section("files"),
      screen.getByTestId("section-menu-close"),
      section("home"),
      section("notes"),
      screen.getByTestId("section-menu-panel-back"),
      find,
    ]);

    act(() => { go.focus(); });
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(find);
  });

  test("a select and a textarea are Tab stops; a tabIndex -1 control and a disabled input are not", async () => {
    renderMenu({
      renderPanel: () => (
        <>
          <select aria-label="Kind"><option value="a">A</option></select>
          <button type="button" tabIndex={-1}>Skip</button>
          <input aria-label="Nope" disabled />
          <textarea aria-label="Note" />
        </>
      ),
    });
    await openOnPick();
    await frame();
    const kind = screen.getByRole("combobox", { name: "Kind" });
    const note = screen.getByRole("textbox", { name: "Note" });
    const skip = screen.getByRole("button", { name: "Skip" });
    const nope = screen.getByRole("textbox", { name: "Nope" });
    expect(document.activeElement).toBe(kind);

    await userEvent.tab();
    expect(document.activeElement).toBe(note);

    act(() => { note.focus(); });
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(kind);

    const seen: Element[] = [];
    for (let i = 0; i < 8; i++) {
      await userEvent.tab();
      seen.push(document.activeElement!);
    }
    expect(seen).toContain(note);
    expect(seen).not.toContain(skip);
    expect(seen).not.toContain(nope);
  });
});
