// Adopted into the unit's own suite from Agent.Tester's probes (2026-10-18).
// The app counterpart of the web unit's round-8 test (Agent.Tester web round 8, D18, 2026-10-18): Tab and
// Shift+Tab from a coming option the arrows landed on go on to the next and previous usable entries, in the
// trap's order, instead of jumping to Close. The same code was in both units.
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §2 (focus trap and Tab order).
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectionMenu } from "./SectionMenu";
import { placesFor, type MenuOption, type MenuSection } from "./menuList";

type Id = "notes" | "files";
interface Api { go(id: Id): void }
const SECTIONS: MenuSection<Id, Api>[] = [
  { id: "notes", icon: "records", label: "Notes", description: "Your notes.", go: (a) => a.go("notes"), also: ["help"],
    options: [
      { id: "notes.new", icon: "plus", label: "New note", description: "A blank note.", run: (a) => a.go("notes") },
      { id: "notes.soon", icon: "user", label: "Soon", description: "Later.", coming: true },
      { id: "notes.two", icon: "plus", label: "Second", description: "Two.", run: (a) => a.go("notes") },
    ] },
  { id: "files", icon: "files", label: "Files", description: "Documents.", go: (a) => a.go("files"), options: [] },
];
const PLACES: MenuOption<Api>[] = [{ id: "help", icon: "help", label: "Help", description: "Ask.", run: (a) => a.go("notes") }];

afterEach(cleanup);
const name = () => {
  const el = document.activeElement as HTMLElement;
  return el.getAttribute("data-option") ?? el.getAttribute("data-section") ?? el.getAttribute("data-testid");
};
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

async function openOnSoon() {
  render(<SectionMenu sections={SECTIONS} current="notes" api={{ go: vi.fn() }} sizeClass="expanded"
    places={(s) => placesFor(s, PLACES)} layers={{ scrim: 100, panel: 101 }} />);
  await userEvent.click(screen.getByTestId("section-menu-trigger"));
  await frame();
  await userEvent.keyboard("{ArrowRight}{ArrowDown}");
  expect(name()).toBe("notes.soon");
}

describe("round 8 — Tab from a coming option the arrows reached", () => {
  test("Tab goes on to the next usable entry, not to Close", async () => {
    await openOnSoon();
    await userEvent.tab();
    expect(name()).toBe("notes.two");
  });
  test("Shift+Tab goes back to the previous usable entry", async () => {
    await openOnSoon();
    await userEvent.tab({ shift: true });
    expect(name()).toBe("notes.new");
  });
});
