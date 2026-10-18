// Adopted from Agent.Tester round 4 (report AgentTester-AppUnit-b3efe88-GilbApp-d96e249.md, 2026-10-18): the gate
// matrix and Q4-2, which covers the undefined gate in visibleSections and forYouFor (D14).
// Agent.Tester round 4 probes (units/section-menu b3efe88). Scratch copy only, not shipped.
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §2
// ("menuCommands/toCommand, so a command palette can read the same list") + README line 25 ("one rule").
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectionMenu, type SectionMenuProps } from "./SectionMenu";
import { forYouFor, menuCommands, menuOptionsOf, placesFor, visibleSections, type MenuList, type MenuOption, type MenuSection } from "./menuList";

type Id = "home" | "notes" | "admin";
interface Api { go(id: Id): void; run(x: string): void }
interface G { admin: boolean; banned?: boolean; picture?: boolean }
type MG = G | undefined;

const opt = (id: string, show?: (g: MG) => boolean, extra: Partial<MenuOption<Api, MG>> = {}): MenuOption<Api, MG> =>
  ({ id, icon: "plus", label: id, description: id, run: (a) => a.run(id), ...(show ? { show } : {}), ...extra });

const SECTIONS: MenuSection<Id, Api, MG>[] = [
  { id: "home", icon: "home", label: "Home", description: "Start.", go: (a) => a.go("home"), options: [opt("home.tour")], also: ["p.open", "p.admin"] },
  { id: "notes", icon: "records", label: "Notes", description: "Notes.", go: (a) => a.go("notes"), also: ["p.open", "p.admin", "p.notbanned"],
    options: [
      opt("notes.new"),
      opt("notes.admin", (g) => !!g && g.admin),
      opt("notes.share", (g) => !g?.banned),
      opt("notes.cmdonly", undefined, { commandOnly: true }),
      opt("notes.cmdonly.gated", (g) => !!g && g.admin, { commandOnly: true }),
    ] },
  { id: "admin", icon: "admin", label: "Admin", description: "Managers.", show: (g) => !!g && g.admin, go: (a) => a.go("admin"), options: [opt("admin.x")] },
];
const PLACES = [opt("p.open"), opt("p.admin", (g) => !!g && g.admin), opt("p.notbanned", (g) => !g?.banned)];
const FOR_YOU = [opt("you.always"), opt("you.pic", (g) => !!g && !g.picture), opt("you.notbanned", (g) => !g?.banned)];
const EXTRAS = [{ ...opt("x.open"), section: null }, { ...opt("x.admin", (g) => !!g && g.admin), section: "notes" as Id }];
const LIST: MenuList<Id, Api, MG> = { sections: SECTIONS, places: PLACES, forYou: FOR_YOU, extraCommands: EXTRAS };

const GATES: [string, MG][] = [
  ["undefined", undefined],
  ["admin", { admin: true }],
  ["plain", { admin: false }],
  ["banned admin", { admin: true, banned: true }],
  ["has picture", { admin: false, picture: true }],
];

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => cleanup());

function drawn(testId: string): string[] {
  const el = screen.queryByTestId(testId);
  return el ? Array.from(el.querySelectorAll("[data-option]")).map((e) => e.getAttribute("data-option")!) : [];
}

describe("round 4 — menu vs palette over a gate matrix (one rule)", () => {
  for (const [name, gate] of GATES) {
    test(`Q4-1 gate ${name}: sections, each section's options, places and For you agree with menuCommands`, async () => {
      const cmds = menuCommands(LIST, gate, null);
      const ids = cmds.map((c) => c.id);
      const vis = visibleSections(SECTIONS, gate);
      // Sections: palette "go." rows equal the visible sections.
      expect(ids.filter((i) => i.startsWith("go.")).map((i) => i.slice(3))).toEqual(vis.map((s) => s.id));
      for (const s of vis) {
        cleanup();
        const props = { sections: vis, current: s.id, api: { go: vi.fn(), run: vi.fn() }, sizeClass: "expanded", layers: { scrim: 1, panel: 2 },
          gate, places: (x: MenuSection<Id, Api, MG>) => placesFor(x, PLACES, gate), forYou: forYouFor(FOR_YOU, gate) } as unknown as SectionMenuProps<Id, Api, never, MG>;
        render(<SectionMenu {...props} />);
        await userEvent.click(screen.getByTestId("section-menu-trigger"));
        const menuHere = drawn("section-menu-here");
        const paletteHere = cmds.filter((c) => c.section === s.id && !c.id.startsWith("go.") && !c.id.startsWith("x.")).map((c) => c.id)
          .filter((i) => !s.options.find((o) => o.id === i)?.commandOnly);
        expect(menuHere, `section ${s.id}`).toEqual(paletteHere);
        if (name === "admin" && s.id === "notes") expect(menuHere).toEqual(["notes.new", "notes.admin", "notes.share"]);
        if (name === "undefined" && s.id === "notes") { expect(menuHere).toEqual(["notes.new"]); expect(drawn("section-menu-places")).toEqual(["p.open"]); }
        // Places drawn for this section are all palette rows; For you drawn equals the palette's For you rows.
        for (const p of drawn("section-menu-places")) expect(ids).toContain(p);
        expect(drawn("section-menu-foryou")).toEqual(cmds.filter((c) => c.loc === "For you").map((c) => c.id));
      }
    });
  }

  test("Q4-2 undefined gate: every gated entry is left out of every helper, and none throws for a gate reading a field", () => {
    const strict = { sections: SECTIONS.map((s) => (s.show ? { ...s, show: (g: G) => g.admin } : s)) } as unknown as MenuList<Id, Api, G>;
    expect(() => visibleSections(strict.sections, undefined as unknown as G)).not.toThrow();
    expect(visibleSections(SECTIONS, undefined).map((s) => s.id)).toEqual(["home", "notes"]);
    expect(forYouFor(FOR_YOU, undefined).map((o) => o.id)).toEqual(["you.always"]);
    expect(placesFor(SECTIONS[1]!, PLACES, undefined).map((o) => o.id)).toEqual(["p.open"]);
    expect(menuOptionsOf(SECTIONS[1]!, undefined).map((o) => o.id)).toEqual(["notes.new"]);
    const ids = menuCommands(LIST, undefined, null).map((c) => c.id);
    expect(ids).toEqual(["go.home", "home.tour", "go.notes", "notes.new", "notes.cmdonly", "p.open", "you.always", "x.open"]);
  });

  test("Q4-3 a defined falsy gate (false / 0 / '') is a gate: show() is called with it", () => {
    const seen: unknown[] = [];
    const list: MenuList<Id, Api, unknown> = { sections: [{ id: "home", icon: "home", label: "H", description: "", go: () => {},
      options: [{ id: "o", icon: "plus", label: "o", description: "", show: (g) => { seen.push(g); return g === false; } }] }] };
    expect(menuCommands(list, false, null).map((c) => c.id)).toEqual(["go.home", "o"]);
    expect(menuOptionsOf(list.sections[0]!, false).map((o) => o.id)).toEqual(["o"]);
    expect(seen).toEqual([false, false]);
  });

  test("Q4-4 extra command gated on a hidden section: still named by its section label, and gated by the same rule", () => {
    const admin = menuCommands(LIST, { admin: true }, null).find((c) => c.id === "x.admin");
    expect(admin?.loc).toBe("Notes");
    expect(menuCommands(LIST, undefined, null).find((c) => c.id === "x.admin")).toBeUndefined();
  });

  test("Q4-5 current-first ordering keeps every row (a permutation, no loss)", () => {
    const a = menuCommands(LIST, { admin: true }, null).map((c) => c.id).sort();
    const b = menuCommands(LIST, { admin: true }, "notes").map((c) => c.id).sort();
    expect(b).toEqual(a);
  });

  // Observation probe: null is not undefined. README claims only "none passed or undefined".
  test("Q4-6 (observation) a null gate is passed to show(): a gate reading a field throws", () => {
    const list = { sections: [{ ...SECTIONS[1]!, options: [{ ...opt("n"), show: (g: G) => g.admin }] }] } as unknown as MenuList<Id, Api, G | null>;
    let threw = false;
    try { menuCommands(list, null, null); } catch { threw = true; }
    expect(threw).toBe(true);
  });
});
