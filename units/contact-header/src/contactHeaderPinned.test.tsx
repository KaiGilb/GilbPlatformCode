// Pins every export of the unit and the behaviours the ported tests leave open.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AtomicPlacement } from "@kaigilb/gilbplatformcode-person-connections";
import * as unit from "./index";
import {
  ContactHeader,
  contactInitials,
  type ContactHeaderContact,
  type ContactHeaderProps,
  type ContactHeaderRelation,
  type ContactHeaderSlotImage,
} from "./index";

afterEach(cleanup);

const PERSON: ContactHeaderContact = {
  displayName: "Ben Berg",
  unnamed: false,
  photoUrl: null,
  origin: null,
  originLoading: false,
  placements: [],
  placementOpen: false,
};

function draw(over: Partial<Omit<ContactHeaderProps, "contact">> & { contact?: Partial<ContactHeaderContact> } = {}) {
  const { contact, ...rest } = over;
  const props: ContactHeaderProps = {
    linked: false,
    holder: <span data-testid="holder-img" />,
    renderPlacementChip: (p: AtomicPlacement) => <span data-testid="chip">{`${p.context}:${p.depth}`}</span>,
    renderPhoto: (img) => <img src={img.src} alt={img.alt} className={img.className} data-testid={img.testId} />,
    ...rest,
    contact: { ...PERSON, ...contact },
  };
  return render(<ContactHeader {...props} />);
}
const sheet = () => screen.getByTestId("contact-shell-header").querySelector("style")!.textContent!;
const inner = () => screen.getByTestId("contact-shell-header").querySelector(":scope > .gsh") as HTMLElement;
const rel = (i: number): ContactHeaderRelation => ({ key: `k${i}`, text: `rel-${i}`, kind: "predicate", curie: `t:R${i}`, title: `rel ${i}` });

describe("the exports", () => {
  test("are ContactHeader and contactInitials, and nothing else at run time", () => {
    expect(Object.keys(unit).sort()).toEqual(["ContactHeader", "contactInitials"]);
    expect(typeof unit.ContactHeader).toBe("function");
    expect(typeof unit.contactInitials).toBe("function");
  });
});

describe("contactInitials", () => {
  test("two letters of one word, upper-cased", () => {
    expect(contactInitials({ displayName: "ann", unnamed: false })).toBe("AN");
    expect(contactInitials({ displayName: "a", unnamed: false })).toBe("A");
  });
  test("first letter of the first and the last word, whatever lies between and around", () => {
    expect(contactInitials({ displayName: "  ann   marie\tlee  ", unnamed: false })).toBe("AL");
    expect(contactInitials({ displayName: "ann lee", unnamed: false })).toBe("AL");
  });
  test("unnamed wins over any name; a blank name is a question mark", () => {
    expect(contactInitials({ displayName: "Ann Lee", unnamed: true })).toBe("?");
    expect(contactInitials({ displayName: "", unnamed: false })).toBe("?");
    expect(contactInitials({ displayName: " \n ", unnamed: false })).toBe("?");
  });
});

describe("the layout", () => {
  test("narrow when none is given; the outer and the inner box both say so", () => {
    draw();
    expect(screen.getByTestId("contact-shell-header").getAttribute("data-layout")).toBe("narrow");
    expect(inner().getAttribute("data-layout")).toBe("narrow");
  });
  test.each(["wide", "narrow", "auto"] as const)("%s is passed to both boxes", (layout) => {
    draw({ layout });
    expect(screen.getByTestId("contact-shell-header").getAttribute("data-layout")).toBe(layout);
    expect(inner().getAttribute("data-layout")).toBe(layout);
  });
  test("the outer box is the size container", () => {
    draw();
    const outer = screen.getByTestId("contact-shell-header");
    expect(outer.className).toBe("gsh-q");
    expect(outer.style.containerType).toBe("inline-size");
    expect(outer.querySelector(":scope > style")).not.toBeNull();
    expect(outer.children).toHaveLength(2);
  });
  test("the image slots are told the shape, size and CSS size of each layout", () => {
    const seen = (layout: "wide" | "narrow" | "auto") => {
      const holder = vi.fn((_i: ContactHeaderSlotImage) => <span />);
      const editor = vi.fn((_i: ContactHeaderSlotImage) => <span />);
      draw({ layout, holder, photoEditor: editor, holderInfo: { name: "Ann", caption: null, type: "t:Person" }, contactType: "t:Organization" });
      const r = [holder.mock.calls[0]![0], editor.mock.calls[0]![0]];
      cleanup();
      return r;
    };
    expect(seen("wide")).toEqual([
      { shape: "circle", size: 128, cssSize: "128px" },
      { shape: "rounded-square", size: 128, cssSize: "128px" },
    ]);
    expect(seen("narrow")).toEqual([
      { shape: "circle", size: 60, cssSize: "60px" },
      { shape: "rounded-square", size: 80, cssSize: "80px" },
    ]);
    expect(seen("auto")).toEqual([
      { shape: "circle", size: 128, cssSize: "var(--gsh-hold)" },
      { shape: "rounded-square", size: 128, cssSize: "var(--gsh-cont)" },
    ]);
  });
  test("a slot may be a node or a function of the image", () => {
    draw({ holder: <b data-testid="node-holder" />, photoEditor: <i data-testid="node-editor" /> });
    expect(screen.getByTestId("contact-header-holder").contains(screen.getByTestId("node-holder"))).toBe(true);
    expect(screen.getByTestId("contact-card-avatar").contains(screen.getByTestId("node-editor"))).toBe(true);
  });
  test("framed by default; `framed={false}` says data-frame none and nothing else does", () => {
    draw();
    expect(inner().hasAttribute("data-frame")).toBe(false);
    cleanup();
    draw({ framed: false });
    expect(inner().getAttribute("data-frame")).toBe("none");
  });
  test("`nav` null draws nothing and sets no data-nav; any other node draws its box", () => {
    draw({ nav: null });
    expect(screen.queryByTestId("contact-header-nav")).toBeNull();
    expect(inner().hasAttribute("data-nav")).toBe(false);
    cleanup();
    draw({ nav: "back" });
    expect(screen.getByTestId("contact-header-nav").textContent).toBe("back");
    expect(inner().getAttribute("data-nav")).toBe("true");
  });
});

describe("the holder and the contact", () => {
  test("the holder's name and caption; no caption element without a caption", () => {
    draw({ holderInfo: { name: "Ann Berg", caption: "Me", type: "t:Person" } });
    const box = screen.getByTestId("contact-header-holder-name");
    expect(box.querySelector(".gsh-hname-name")!.textContent).toBe("Ann Berg");
    expect(box.querySelector(".gsh-sub")!.textContent).toBe("Me");
    cleanup();
    draw({ holderInfo: { name: "Ann Berg", caption: null, type: null } });
    expect(screen.getByTestId("contact-header-holder-name").querySelector(".gsh-sub")).toBeNull();
    cleanup();
    draw();
    expect(screen.getByTestId("contact-header-holder-name").querySelector(".gsh-hname-name")!.textContent).toBe("");
  });
  test("the contact's caption is drawn only when given", () => {
    draw();
    expect(screen.queryByTestId("contact-card-caption")).toBeNull();
    cleanup();
    draw({ contactCaption: "Person" });
    expect(screen.getByTestId("contact-card-caption").className).toBe("gsh-sub gsh-caption");
  });
  test("the name is a heading, marked unnamed or not, with the whole name as its title", () => {
    draw();
    const h = screen.getByTestId("contact-card-name");
    expect(h.tagName).toBe("H1");
    expect(h.getAttribute("data-unnamed")).toBe("false");
    expect(h.getAttribute("title")).toBe("Ben Berg");
    cleanup();
    draw({ contact: { unnamed: true, displayName: "Unnamed" } });
    expect(screen.getByTestId("contact-card-name").getAttribute("data-unnamed")).toBe("true");
    expect(screen.getByTestId("contact-card-initials").textContent).toBe("?");
  });
  test("the name is drawn word by word; a hyphen ends a word and a <wbr> follows it", () => {
    draw({ contact: { displayName: "Mary-Jane  O'Neil" } });
    const h = screen.getByTestId("contact-card-name");
    expect(Array.from(h.querySelectorAll(".gsh-word")).map((w) => w.textContent)).toEqual(["Mary-", "Jane", "O'Neil"]);
    expect(h.querySelectorAll("wbr")).toHaveLength(1);
    expect(h.textContent).toBe("Mary-Jane O'Neil");
  });
  test("a blank name draws no word", () => {
    draw({ contact: { displayName: "   " } });
    expect(screen.getByTestId("contact-card-name").querySelectorAll(".gsh-word")).toHaveLength(0);
  });
  test("the contact's shape follows the type: only a person is a circle", () => {
    draw({ contactType: "t:Person" });
    expect(screen.getByTestId("contact-card-link-photo").getAttribute("data-shape")).toBe("circle");
    cleanup();
    draw({ contactType: undefined });
    expect(screen.getByTestId("contact-card-link-photo").getAttribute("data-shape")).toBe("rounded-square");
  });
});

describe("the photo", () => {
  test("renderPhoto is handed the address, an empty alt, the class and the test id", () => {
    const renderPhoto = vi.fn(() => <span data-testid="p" />);
    draw({ renderPhoto, contact: { photoUrl: "https://x.example.test/p.jpg" } });
    expect(renderPhoto).toHaveBeenCalledWith({ src: "https://x.example.test/p.jpg", alt: "", className: "h-full w-full object-cover", testId: "contact-card-photo" });
  });
  test("with no photo renderPhoto is not called", () => {
    const renderPhoto = vi.fn(() => null);
    draw({ renderPhoto });
    expect(renderPhoto).not.toHaveBeenCalled();
  });
  test("a photo button with no name reads 'View full-screen photo'", () => {
    draw({ onPhoto: () => {}, contact: { displayName: "", photoUrl: "https://x.example.test/p.jpg" } });
    expect(screen.getByTestId("contact-card-avatar").getAttribute("aria-label")).toBe("View full-screen photo");
  });
  test("an editor slot given as a function is called once with the contact image", () => {
    const editor = vi.fn((_i: ContactHeaderSlotImage) => <span data-testid="ed" />);
    draw({ photoEditor: editor, layout: "wide" });
    expect(editor).toHaveBeenCalledWith({ shape: "rounded-square", size: 128, cssSize: "128px" });
    expect(screen.getByTestId("contact-card-avatar").getAttribute("data-has-photo")).toBe("false");
    expect(screen.queryByTestId("contact-card-initials")).toBeNull();
  });
  test("the badge: its title and its text for a screen reader are the same sentence, over a drawn glyph", () => {
    draw({ linked: true });
    const badge = screen.getByTestId("contact-card-link-note");
    expect(badge.className).toBe("gsh-badge");
    expect(badge.querySelector(".gsh-sr")!.textContent).toBe(badge.getAttribute("title"));
    expect(badge.querySelector("svg")).not.toBeNull();
    expect(screen.getByTestId("contact-card-link-photo").contains(badge)).toBe(true);
  });
});

describe("the Where / How we met line", () => {
  test("it opens and closes on a tap, and a new text closes it again", () => {
    const view = draw({ contact: { origin: "At the fair" } });
    const o = () => screen.getByTestId("contact-card-origin-inline");
    expect(o().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(o());
    expect(o().getAttribute("aria-expanded")).toBe("true");
    const again = (origin: string) =>
      view.rerender(<ContactHeader linked={false} holder={<span />} renderPlacementChip={() => null} renderPhoto={() => null} contact={{ ...PERSON, origin }} />);
    again("At the fair");
    expect(o().getAttribute("aria-expanded")).toBe("true");
    again("At the lake");
    expect(o().getAttribute("aria-expanded")).toBe("false");
    expect(o().textContent).toBe("At the lake");
  });
  test("loading words show only while loading and there is no text", () => {
    draw({ contact: { originLoading: true, origin: "At the fair" } });
    expect(screen.queryByText("Loading where you met…")).toBeNull();
    cleanup();
    draw({ contact: { originLoading: true } });
    expect(screen.getByText("Loading where you met…").className).toBe("gsh-loading");
  });
});

describe("the connection", () => {
  const connectionKids = () => Array.from(screen.getByTestId("contact-header-connection").children).map((c) => c.className);
  test("nothing to show: only the end arrow; loading alone, a panel button alone or a relation alone add the first arrow", () => {
    draw();
    expect(connectionKids()).toEqual(["gsh-arrow gsh-arrow-end"]);
    cleanup();
    draw({ contact: { originLoading: true } });
    expect(connectionKids()[0]).toBe("gsh-arrow");
    cleanup();
    draw({ onTogglePlacement: () => {} });
    expect(connectionKids()[0]).toBe("gsh-arrow");
    cleanup();
    draw({ onAddRelation: () => {} });
    expect(connectionKids()[0]).toBe("gsh-arrow");
  });
  test("the panel button: closed it has no box-shadow ring; it is a button of type button", () => {
    draw({ onTogglePlacement: () => {} });
    const b = screen.getByTestId("contact-card-open-placement");
    expect(b.getAttribute("type")).toBe("button");
    expect(b.className).toBe("gsh-chips");
    expect(b.style.cursor).toBe("pointer");
    expect(b.getAttribute("aria-expanded")).toBe("false");
  });
  test("an unplaced contact: 'Set connection type' for a person, 'Set access' for a group", () => {
    draw({ onTogglePlacement: () => {} });
    expect(screen.getByText("Set connection type").closest("button")).toBe(screen.getByTestId("contact-card-open-placement"));
    cleanup();
    draw({ onTogglePlacement: () => {}, contact: { kind: "group" } });
    expect(screen.getByText("Set access")).toBeTruthy();
    cleanup();
    draw({ onTogglePlacement: () => {}, contact: { kind: "person" } });
    expect(screen.getByText("Set connection type")).toBeTruthy();
  });
  test("the chips: Inner covers 1st in the same context, each context once, each chip keyed", () => {
    draw({
      onTogglePlacement: () => {},
      contact: {
        placements: [
          { context: "professional", depth: "first-degree" },
          { context: "personal", depth: "first-degree" },
          { context: "personal", depth: "close-circle" },
        ],
      },
    });
    const chips = screen.getAllByTestId("chip").map((c) => c.textContent);
    expect(chips).toHaveLength(2);
    expect(chips).toContain("personal:close-circle");
    expect(chips).toContain("professional:first-degree");
  });
  test("the origin sits in the connection, a button of type button with the whole text as its title", () => {
    draw({ contact: { origin: "At the fair" } });
    const o = screen.getByTestId("contact-card-origin-inline");
    expect(o.getAttribute("type")).toBe("button");
    expect(o.getAttribute("title")).toBe("At the fair");
  });
});

describe("the relations", () => {
  const texts = () => Array.from(screen.getByTestId("contact-header-relations").children).map((c) => c.textContent);
  test("four fit; the fifth turns the fourth line into '+2 more', and 'Show fewer' folds it back", () => {
    draw({ relations: [rel(0), rel(1), rel(2), rel(3), rel(4)] });
    expect(texts()).toEqual(["rel-0", "rel-1", "rel-2", "+2 more"]);
    fireEvent.click(screen.getByTestId("contact-header-relations-more"));
    expect(texts()).toEqual(["rel-0", "rel-1", "rel-2", "rel-3", "rel-4", "Show fewer"]);
    fireEvent.click(screen.getByTestId("contact-header-relations-more"));
    expect(texts()).toEqual(["rel-0", "rel-1", "rel-2", "+2 more"]);
  });
  test("exactly four have no 'more' button", () => {
    draw({ relations: [rel(0), rel(1), rel(2), rel(3)] });
    expect(screen.queryByTestId("contact-header-relations-more")).toBeNull();
    expect(texts()).toEqual(["rel-0", "rel-1", "rel-2", "rel-3"]);
  });
  test("a chip carries its kind, its curie only when it has one, and its title", () => {
    draw({
      relations: [
        { key: "a", text: "A", kind: "predicate", curie: "t:A", title: "ta" },
        { key: "b", text: "B", kind: "own", curie: null, title: "tb" },
        { key: "c", text: "C", kind: "term-name", curie: "t:C", title: "tc" },
      ],
    });
    const chips = screen.getAllByTestId("contact-header-relation");
    expect(chips.map((c) => c.getAttribute("data-kind"))).toEqual(["predicate", "own", "term-name"]);
    expect(chips.map((c) => c.getAttribute("data-curie"))).toEqual(["t:A", null, "t:C"]);
    expect(chips.map((c) => c.getAttribute("title"))).toEqual(["ta", "tb", "tc"]);
    expect(chips.map((c) => c.className)).toEqual(["gsh-rel", "gsh-rel gsh-rel-own", "gsh-rel gsh-rel-name"]);
  });
  test("the add button is a button of type button and calls the app once", () => {
    const onAddRelation = vi.fn();
    draw({ onAddRelation });
    const b = screen.getByTestId("contact-header-add-relation");
    expect(b.getAttribute("type")).toBe("button");
    fireEvent.click(b);
    expect(onAddRelation).toHaveBeenCalledTimes(1);
  });
});

describe("the style sheet", () => {
  test("every header ships one sheet, the same text each time", () => {
    draw();
    const first = sheet();
    cleanup();
    draw({ layout: "wide", linked: true, nav: <span />, relations: [rel(0)] });
    expect(sheet()).toBe(first);
    expect(screen.getByTestId("contact-shell-header").querySelectorAll("style")).toHaveLength(1);
  });
  test("two headers on a page ship two sheets", () => {
    render(
      <>
        <ContactHeader linked={false} holder={null} renderPlacementChip={() => null} renderPhoto={() => null} contact={PERSON} />
        <ContactHeader linked={false} holder={null} renderPlacementChip={() => null} renderPhoto={() => null} contact={PERSON} />
      </>,
    );
    expect(document.querySelectorAll('[data-testid="contact-shell-header"] > style')).toHaveLength(2);
  });
  test("the class names the sheet styles are exactly the unit's gsh- set", () => {
    draw();
    const names = [...new Set(sheet().match(/\.gsh-[a-z-]+/g))].sort();
    expect(names).toEqual(
      [
        ".gsh-add", ".gsh-arrow", ".gsh-arrow-end", ".gsh-badge", ".gsh-caption", ".gsh-chips", ".gsh-conn", ".gsh-cpic", ".gsh-hname",
        ".gsh-hname-name", ".gsh-hpic", ".gsh-ident", ".gsh-img", ".gsh-initials", ".gsh-loading", ".gsh-more", ".gsh-name", ".gsh-nav",
        ".gsh-origin", ".gsh-q", ".gsh-rel", ".gsh-rel-name", ".gsh-rel-own", ".gsh-rel-text", ".gsh-rels", ".gsh-row", ".gsh-sr", ".gsh-sub", ".gsh-word",
      ],
    );
  });
  test("the sheet sets the container name and exactly five --gsh- variables", () => {
    draw();
    expect(sheet()).toContain("container-type: inline-size; container-name: gsh;");
    expect([...new Set(sheet().match(/--gsh-[a-z-]+(?=:)/g))].sort()).toEqual(["--gsh-badge", "--gsh-badge-at", "--gsh-cont", "--gsh-hold", "--gsh-name"]);
  });
  test("the sizes of each layout", () => {
    draw();
    const c = sheet().replace(/\s+/g, " ");
    expect(c).toContain('.gsh[data-layout="narrow"] { --gsh-hold: 60px; --gsh-cont: 80px; --gsh-badge: 28px; --gsh-badge-at: -4px; --gsh-name: 18px; }');
    expect(c).toContain('.gsh[data-layout="wide"] { --gsh-hold: 128px; --gsh-cont: 128px; --gsh-badge: 32px; --gsh-badge-at: 4px; --gsh-name: 22px; }');
  });
  test("the name is right-aligned in the sheet of both arrangements, as well as inline", () => {
    draw();
    const c = sheet().replace(/\s+/g, " ");
    expect(c).toContain('.gsh[data-layout="wide"] .gsh-ident { grid-area: name; align-self: center; text-align: right; }');
    expect(c).toContain('.gsh[data-layout="narrow"] .gsh-ident { grid-area: name; align-self: end; text-align: right; }');
    expect(screen.getByTestId("contact-shell-identity").style.textAlign).toBe("right");
  });
  test("the container queries: 56rem (wide for auto), 340 px and 29rem (small)", () => {
    draw();
    const queries = [...sheet().matchAll(/@container gsh \(([^)]*)\)/g)].map((m) => m[1]);
    expect(queries).toEqual(["min-width: 56rem", "min-width: 56rem", "max-width: 340px", "max-width: 29rem"]);
  });
  test("every colour is the kit's token chain with its literal last", () => {
    draw();
    const c = sheet();
    for (const chain of [
      "var(--paper,var(--color-base,#f4f1ea))",
      "var(--ink,var(--color-ink,#2a2622))",
      "var(--ink-faint,var(--color-ink-muted,#6f6a63))",
      "var(--accent,var(--color-brand,#a85c3b))",
      "var(--surface,var(--color-sheet,#ffffff))",
      "var(--live-link,color-mix(in srgb,#7B3FE4 75%,var(--ink,var(--color-ink,#2a2622))))",
      'var(--font-name,"Arial Narrow","Helvetica Neue","Roboto Condensed",Arial,sans-serif)',
    ]) {
      expect(c, chain).toContain(chain);
    }
  });
});
