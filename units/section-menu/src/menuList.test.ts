// The list helpers, ported from GilbApp's sectionMenuList.test.ts (0f0f1b7) onto a host-neutral list.
import { describe, expect, test, vi } from "vitest";
import { forYouFor, menuCommands, menuOptionsOf, placesFor, toCommand, visibleSections, type MenuList } from "./menuList";

type Id = "home" | "notes" | "admin";
interface Api { go(id: Id): void; newNote(): void; signOut(): void }
interface Gate { admin: boolean; hasPicture: boolean }
const GATE: Gate = { admin: false, hasPicture: true };

const LIST: MenuList<Id, Api, Gate> = {
  sections: [
    { id: "home", icon: "home", label: "Home", description: "Start here.", go: (a) => a.go("home"), options: [], also: ["help"] },
    {
      id: "notes", icon: "records", label: "Notes", description: "Your notes.", go: (a) => a.go("notes"),
      options: [
        { id: "notes.new", icon: "plus", label: "New note", description: "A blank note.", keywords: ["create"], run: (a) => a.newNote() },
        { id: "notes.cards", icon: "card", label: "Show as cards", description: "One at a time.", commandOnly: true, run: () => {} },
      ],
      also: ["help", "news"],
    },
    { id: "admin", icon: "admin", label: "Admin", description: "Managers only.", show: (g) => g.admin, go: (a) => a.go("admin"), options: [] },
  ],
  places: [
    { id: "news", icon: "news", label: "News", description: "What's new.", href: "https://example.test/news" },
    { id: "help", icon: "help", label: "Help", description: "Ask.", coming: true },
  ],
  forYou: [{ id: "you.picture", icon: "cam", label: "Add a picture", description: "So people know you.", show: (g) => !g.hasPicture, run: () => {} }],
  extraCommands: [{ id: "cmd.out", icon: "signout", label: "Sign out", description: "End it.", run: (a) => a.signOut(), section: null }],
};

describe("menuList", () => {
  describe("visibleSections", () => {
    test("keeps list order and drops a section whose gate is closed", () => {
      expect(visibleSections(LIST.sections, GATE).map((s) => s.id)).toEqual(["home", "notes"]);
      expect(visibleSections(LIST.sections, { ...GATE, admin: true }).map((s) => s.id)).toEqual(["home", "notes", "admin"]);
    });
  });

  describe("menuOptionsOf", () => {
    test("leaves out command-only options", () => {
      expect(menuOptionsOf(LIST.sections[1]!).map((o) => o.id)).toEqual(["notes.new"]);
    });
  });

  describe("gates on options and places", () => {
    test("a gated option or place shows only when the gate given agrees; with no gate it is left out", () => {
      const sec = { options: [
        { id: "a", show: (g: Gate) => g.admin },
        { id: "b" },
      ], also: ["p"] };
      const places = [{ id: "p", show: (g: Gate) => g.admin }];
      expect(menuOptionsOf(sec).map((o) => o.id)).toEqual(["b"]);
      expect(menuOptionsOf(sec, { ...GATE, admin: true }).map((o) => o.id)).toEqual(["a", "b"]);
      expect(placesFor(sec, places)).toEqual([]);
      expect(placesFor(sec, places, GATE)).toEqual([]);
      expect(placesFor(sec, places, { ...GATE, admin: true }).map((p) => p.id)).toEqual(["p"]);
    });
  });

  describe("placesFor", () => {
    test("gives a section's places in the places' own order, not the section's", () => {
      expect(placesFor(LIST.sections[1]!, LIST.places).map((p) => p.id)).toEqual(["news", "help"]);
      expect(placesFor(LIST.sections[2]!, LIST.places)).toEqual([]);
      expect(placesFor(LIST.sections[0]!)).toEqual([]);
    });
  });

  describe("forYouFor", () => {
    test("offers a gated entry only while its gate holds", () => {
      expect(forYouFor(LIST.forYou!, GATE)).toEqual([]);
      expect(forYouFor(LIST.forYou!, { ...GATE, hasPicture: false }).map((o) => o.id)).toEqual(["you.picture"]);
    });
  });

  describe("menuCommands", () => {
    test("lists Go to each visible section, every option (command-only too), places, For you and the extras", () => {
      const ids = menuCommands(LIST, { ...GATE, hasPicture: false }, null).map((c) => c.id);
      expect(ids).toEqual(["go.home", "go.notes", "notes.new", "notes.cards", "news", "help", "you.picture", "cmd.out"]);
    });

    test("puts the current section's rows first, then the rest in list order", () => {
      const cmds = menuCommands(LIST, GATE, "notes");
      expect(cmds.slice(0, 3).map((c) => c.id)).toEqual(["go.notes", "notes.new", "notes.cards"]);
      expect(cmds.slice(3).some((c) => c.section === "notes")).toBe(false);
    });

    test("words the rows as the host asks, and runs the section's own go", () => {
      const api = { go: vi.fn(), newNote: vi.fn(), signOut: vi.fn() };
      const cmds = menuCommands(LIST, GATE, null, { goTo: (l) => `Open ${l}` });
      expect(cmds[0]!.label).toBe("Open Home");
      cmds[0]!.run!(api);
      expect(api.go).toHaveBeenCalledWith("home");
      expect(cmds.find((c) => c.id === "go.notes")!.keywords).toEqual(["Notes", "Your notes."]);
    });
  });

  describe("toCommand", () => {
    test("carries keywords then the description, coming as a boolean, and the address", () => {
      const c = toCommand(LIST.places![1]!, "", null);
      expect(c).toMatchObject({ id: "help", keywords: ["Ask."], coming: true, loc: "", section: null });
      expect(toCommand(LIST.places![0]!, "", null).href).toBe("https://example.test/news");
    });
  });
});
