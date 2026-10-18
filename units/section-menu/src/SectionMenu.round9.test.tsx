// Adopted into the unit's own suite from Agent.Tester's probes (2026-10-18).
// Agent.Tester round 9 probes (units/section-menu ec46d96, D18 follow-up).
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §2
// (focus trap and Tab order; arrows): Tab and Shift+Tab from a coming entry the arrows landed on go on to the
// next and previous usable entries in the trap's order, wherever the coming entry sits.
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectionMenu, type SectionMenuProps } from "./SectionMenu";
import { placesFor, type MenuOption, type MenuSection } from "./menuList";

type Id = "notes" | "files" | "last";
interface Api { go(id: Id): void }
const o = (id: string, coming = false): MenuOption<Api> =>
  ({ id, icon: "plus", label: id, description: id, ...(coming ? { coming: true } : { run: (a: Api) => a.go("notes") }) });

afterEach(cleanup);
const name = () => {
  const el = document.activeElement as HTMLElement;
  return el.getAttribute("data-option") ?? el.getAttribute("data-section") ?? el.getAttribute("data-testid");
};
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

async function open(sections: MenuSection<Id, Api>[], extra: Partial<SectionMenuProps<Id, Api>> = {}, current: Id = "notes") {
  render(<SectionMenu sections={sections} current={current} api={{ go: vi.fn() }} sizeClass="expanded"
    layers={{ scrim: 100, panel: 101 }} {...extra} />);
  await userEvent.click(screen.getByTestId("section-menu-trigger"));
  await frame();
}

describe("round 9 — Tab from a coming entry, wherever it sits", () => {
  test("Q9-1 two coming entries in a row: Tab skips both, Shift+Tab from the second skips the first", async () => {
    const S: MenuSection<Id, Api>[] = [
      { id: "notes", icon: "records", label: "Notes", description: "N", go: (a) => a.go("notes"),
        options: [o("a"), o("c1", true), o("c2", true), o("b")] },
      { id: "files", icon: "files", label: "Files", description: "F", go: (a) => a.go("files"), options: [] },
    ];
    await open(S);
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    expect(name()).toBe("c1");
    await userEvent.tab();
    expect(name()).toBe("b");
    await userEvent.keyboard("{ArrowUp}");
    expect(name()).toBe("c2");
    await userEvent.tab({ shift: true });
    expect(name()).toBe("a");
  });

  test("Q9-2 a coming entry first in the list: Shift+Tab goes back to its section", async () => {
    const S: MenuSection<Id, Api>[] = [
      { id: "notes", icon: "records", label: "Notes", description: "N", go: (a) => a.go("notes"), options: [o("c1", true), o("b")] },
      { id: "files", icon: "files", label: "Files", description: "F", go: (a) => a.go("files"), options: [] },
    ];
    await open(S);
    await userEvent.keyboard("{ArrowRight}");
    expect(name()).toBe("c1");
    await userEvent.tab({ shift: true });
    expect(name()).toBe("notes");
  });

  test("Q9-3 a coming entry that is the last stop: Tab wraps to Close, Shift+Tab goes to the previous one", async () => {
    const S: MenuSection<Id, Api>[] = [
      { id: "files", icon: "files", label: "Files", description: "F", go: (a) => a.go("files"), options: [] },
      { id: "notes", icon: "records", label: "Notes", description: "N", go: (a) => a.go("notes"), options: [o("a"), o("c1", true)] },
    ];
    await open(S);
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    expect(name()).toBe("c1");
    await userEvent.tab();
    expect(name()).toBe("section-menu-close");
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}"); // Close -> back to the last usable (wrap)
    expect(name()).toBe("a");
    await userEvent.keyboard("{ArrowDown}");
    expect(name()).toBe("c1");
    await userEvent.tab({ shift: true });
    expect(name()).toBe("a");
  });

  test("Q9-4 a section whose only options are coming: Tab goes on to the next section", async () => {
    const S: MenuSection<Id, Api>[] = [
      { id: "notes", icon: "records", label: "Notes", description: "N", go: (a) => a.go("notes"), options: [o("c1", true), o("c2", true)] },
      { id: "files", icon: "files", label: "Files", description: "F", go: (a) => a.go("files"), options: [] },
    ];
    await open(S);
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    expect(name()).toBe("c2");
    await userEvent.tab();
    expect(name()).toBe("files");
  });

  test("Q9-5 a coming place and a coming For-you entry: Tab and Shift+Tab go to their neighbours", async () => {
    const S: MenuSection<Id, Api>[] = [
      { id: "notes", icon: "records", label: "Notes", description: "N", go: (a) => a.go("notes"), options: [o("a")], also: ["p1", "pc", "p2"] },
      { id: "files", icon: "files", label: "Files", description: "F", go: (a) => a.go("files"), options: [] },
    ];
    const PLACES = [o("p1"), o("pc", true), o("p2")];
    await open(S, {
      places: (s) => placesFor(s, PLACES),
      forYou: [o("y1"), o("yc", true)],
      footerAction: { label: "Sign out", run: vi.fn() },
    });
    document.querySelector<HTMLElement>("[data-option='pc']")!.focus(); // where ArrowDown from p1 lands
    await userEvent.keyboard("{ArrowUp}{ArrowDown}");
    expect(name()).toBe("pc");
    await userEvent.tab();
    expect(name()).toBe("p2");
    await userEvent.keyboard("{ArrowUp}");
    expect(name()).toBe("pc");
    await userEvent.tab({ shift: true });
    expect(name()).toBe("p1");
    document.querySelector<HTMLElement>("[data-option='y1']")!.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(name()).toBe("yc");
    await userEvent.tab();
    expect(name()).toBe("section-menu-footer-action");
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(name()).toBe("y1");
  });

  test("Q9-6 a coming entry of a previewed section that is not yours: Tab goes on to the next section", async () => {
    const S: MenuSection<Id, Api>[] = [
      { id: "notes", icon: "records", label: "Notes", description: "N", go: (a) => a.go("notes"), options: [o("a")] },
      { id: "files", icon: "files", label: "Files", description: "F", go: (a) => a.go("files"), options: [o("f1"), o("fc", true)] },
      { id: "last", icon: "home", label: "Last", description: "L", go: (a) => a.go("last"), options: [] },
    ];
    await open(S);
    await userEvent.keyboard("{ArrowDown}");
    expect(name()).toBe("files");
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    expect(name()).toBe("fc");
    await userEvent.tab();
    expect(name()).toBe("last");
  });

  test("Q9-7 compact (phone): Tab from a coming entry goes on in order", async () => {
    const S: MenuSection<Id, Api>[] = [
      { id: "notes", icon: "records", label: "Notes", description: "N", go: (a) => a.go("notes"), options: [o("a"), o("c1", true), o("b")] },
      { id: "files", icon: "files", label: "Files", description: "F", go: (a) => a.go("files"), options: [] },
    ];
    await open(S, { sizeClass: "compact" });
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    expect(name()).toBe("c1");
    await userEvent.tab();
    expect(name()).toBe("b");
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.tab({ shift: true });
    expect(name()).toBe("a");
  });

  test("Q9-8 Tab from the trigger while open (outside the order) still enters at Close", async () => {
    const S: MenuSection<Id, Api>[] = [
      { id: "notes", icon: "records", label: "Notes", description: "N", go: (a) => a.go("notes"), options: [o("a")] },
    ];
    await open(S);
    screen.getByTestId("section-menu-trigger").focus();
    await userEvent.tab();
    expect(name()).toBe("section-menu-close");
  });

  test("Q9-9 a coming entry is never itself a Tab stop: Tab round the whole panel never lands on one", async () => {
    const S: MenuSection<Id, Api>[] = [
      { id: "notes", icon: "records", label: "Notes", description: "N", go: (a) => a.go("notes"), options: [o("a"), o("c1", true), o("b")] },
      { id: "files", icon: "files", label: "Files", description: "F", go: (a) => a.go("files"), options: [] },
    ];
    await open(S);
    const seen: (string | null)[] = [];
    for (let k = 0; k < 8; k++) { await userEvent.tab(); seen.push(name()); }
    expect(seen).not.toContain("c1");
    expect(seen.slice(0, 5)).toEqual(["a", "b", "files", "section-menu-close", "notes"]);
  });
});
