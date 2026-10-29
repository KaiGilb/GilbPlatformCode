// The relation chips in the shared ContactHeader.
// "If we have predicates, we should show that in the header too": the actual predicate of the ontology, not words made up.
// In `wide` the relations stand one per line after the Where / How we met line, "+ Relation" last; in `narrow` they sit in row 1 next to the
// holder's image. A holder's own label (no ontology predicate) is a DASHED chip; a term with no label shows its own name (mono).
// ⛔ The package holds no word: every chip's text comes in from the app (which reads it from the ontology).
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ContactHeader,
  type ContactHeaderContact,
  type ContactHeaderProps,
  type ContactHeaderRelation,
} from "./index";

afterEach(cleanup);

const PERSON: ContactHeaderContact = {
  displayName: "Ben Berg",
  unnamed: false,
  photoUrl: null,
  origin: "Madrid Conference, 2026",
  originLoading: false,
  placements: [],
  placementOpen: false,
};

const RELS: ContactHeaderRelation[] = [
  { key: "t:ColleagueOf", text: "colleague-of", kind: "predicate", curie: "t:ColleagueOf", title: "Ben Berg colleague-of Ann Berg · GilbVeda t:ColleagueOf" },
  { key: "t:CustomerOf", text: "customer-of", kind: "predicate", curie: "t:CustomerOf", title: "Ben Berg customer-of Ann Berg · GilbVeda t:CustomerOf" },
  { key: "own:book-club", text: "Book club", kind: "own", curie: null, title: "Your own label for Ben Berg. Not a GilbVeda relation." },
];

function draw(over: Partial<Omit<ContactHeaderProps, "contact">> & { contact?: Partial<ContactHeaderContact> } = {}) {
  const { contact, ...rest } = over;
  const props: ContactHeaderProps = {
    layout: "wide",
    linked: false,
    holder: <span data-testid="holder-img" />,
    holderInfo: { name: "Ann Berg", caption: "Me", type: "t:Person" },
    contactType: "t:Person",
    renderPlacementChip: (p) => <span data-testid="chip">{`${p.context}:${p.depth}`}</span>,
    renderPhoto: (img) => <img src={img.src} alt={img.alt} data-testid={img.testId} />,
    ...rest,
    contact: { ...PERSON, ...contact },
  };
  return render(<ContactHeader {...props} />);
}

const css = () => Array.from(document.querySelectorAll('[data-testid="contact-shell-header"] style')).map((s) => s.textContent ?? "").join("\n").replace(/\s+/g, " ");
const relChips = () => screen.getAllByTestId("contact-header-relation");

describe("relation chips (wide)", () => {
  test("drawn in the connection AFTER the Where / How we met line, in the order given, with the app's text as written", () => {
    draw({ relations: RELS, onAddRelation: () => {} });
    const conn = screen.getByTestId("contact-header-connection");
    const kids = Array.from(conn.children).map((c) => c.getAttribute("data-testid") ?? c.className);
    expect(kids.indexOf("contact-header-relations")).toBe(kids.indexOf("contact-card-origin-inline") + 1);
    expect(relChips().map((c) => c.textContent)).toEqual(["colleague-of", "customer-of", "Book club"]);
    expect(relChips().map((c) => c.getAttribute("data-kind"))).toEqual(["predicate", "predicate", "own"]);
    expect(relChips()[1]!.getAttribute("data-curie")).toBe("t:CustomerOf");
    expect(relChips()[1]!.getAttribute("title")).toBe("Ben Berg customer-of Ann Berg · GilbVeda t:CustomerOf");
  });
  test("stacked one per line in wide, '+ Relation' last", () => {
    draw({ relations: RELS, onAddRelation: () => {} });
    const box = screen.getByTestId("contact-header-relations");
    const last = box.lastElementChild!;
    expect(last.getAttribute("data-testid")).toBe("contact-header-add-relation");
    expect(last.textContent).toBe("+ Relation");
    const wide = css().slice(css().indexOf("@container"));
    expect(wide).toMatch(/\.gsh-rels \{[^}]*flex-direction: column/);
  });
  test("wide: the Where / How we met line stays centred on the line when the stacked relations make the connection taller", () => {
    draw({ relations: RELS, onAddRelation: () => {} });
    const wide = css().slice(css().indexOf("@container"));
    expect(wide).toMatch(/\.gsh-origin \{[^}]*align-self: center/);
  });
  test("'+ Relation' calls the app's add flow; it is a button", () => {
    const onAdd = vi.fn();
    draw({ relations: [], onAddRelation: onAdd });
    const add = screen.getByTestId("contact-header-add-relation");
    expect(add.tagName).toBe("BUTTON");
    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
  test("a person with no relation: only '+ Relation'", () => {
    draw({ relations: [], onAddRelation: () => {} });
    expect(screen.queryAllByTestId("contact-header-relation")).toHaveLength(0);
    expect(screen.getByTestId("contact-header-relations").children).toHaveLength(1);
  });
  test("no add flow given: no '+ Relation' (a chip that cannot be pressed is not drawn); no relations and no add flow: no box at all", () => {
    draw({ relations: RELS });
    expect(screen.queryByTestId("contact-header-add-relation")).toBeNull();
    expect(relChips()).toHaveLength(3);
    cleanup();
    draw({ relations: [] });
    expect(screen.queryByTestId("contact-header-relations")).toBeNull();
  });
  test("the three looks: a GilbVeda label, a term shown by its name (mono), the holder's own label (dashed)", () => {
    draw({ relations: [...RELS, { key: "t:NewOf", text: "t:NewOf", kind: "term-name", curie: "t:NewOf", title: "GilbVeda t:NewOf has no label yet; its own name is shown" }] });
    const [a, , own, name] = relChips();
    expect(a!.className).toContain("gsh-rel");
    expect(own!.className).toContain("gsh-rel-own");
    expect(name!.className).toContain("gsh-rel-name");
    const c = css();
    expect(c).toMatch(/\.gsh-rel-own \{[^}]*border-style: dashed/);
    expect(c).toMatch(/\.gsh-rel-name \{[^}]*font-family: ui-monospace/);
    expect(c).toMatch(/\.gsh-add \{[^}]*border-style: dashed/);
  });
  test("relations alone make a connection: the line runs to them", () => {
    draw({ contact: { origin: null }, relations: [RELS[0]!] });
    const conn = screen.getByTestId("contact-header-connection");
    expect(conn.firstElementChild!.className).toBe("gsh-arrow");
  });
});

describe("relation chips (narrow, row 1 next to the holder)", () => {
  test("the relations box takes the grid's `rels` area in narrow and in auto below 56rem, stacked", () => {
    draw({ layout: "auto", relations: RELS, onAddRelation: () => {} });
    const c = css();
    const narrow = c.slice(0, c.indexOf("@container"));
    expect(narrow).toMatch(/\[data-layout="narrow"\] \.gsh-rels \{[^}]*grid-area: rels[^}]*flex-direction: column/);
    expect(narrow).toMatch(/\[data-layout="auto"\] \.gsh-rels \{[^}]*grid-area: rels/);
  });
});

describe("an app that passes no relations: nothing is drawn for them", () => {
  test("no relations and no add flow: no relations box, no '+ Relation'", () => {
    draw({ layout: "narrow" });
    expect(screen.queryByTestId("contact-header-relations")).toBeNull();
    expect(screen.queryByText("+ Relation")).toBeNull();
  });
});

const many = (n: number): ContactHeaderRelation[] =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, text: `rel-${i}`, kind: "predicate" as const, curie: `t:R${i}`, title: `rel ${i}` }));

describe("header growth: at most 4 relation lines; the 4th is '+N more' when there are more (wide and narrow, one DOM)", () => {
  for (const layout of ["wide", "narrow"] as const) {
    test(`${layout}: 4 relations are all shown, no '+N more'`, () => {
      draw({ layout, relations: many(4), onAddRelation: () => {} });
      expect(relChips()).toHaveLength(4);
      expect(screen.queryByTestId("contact-header-relations-more")).toBeNull();
    });
    test(`${layout}: 7 relations show 3, then '+4 more', then '+ Relation'; pressing expands inline and pressing again collapses`, () => {
      draw({ layout, relations: many(7), onAddRelation: () => {} });
      const box = () => Array.from(screen.getByTestId("contact-header-relations").children).map((c) => c.textContent);
      expect(box()).toEqual(["rel-0", "rel-1", "rel-2", "+4 more", "+ Relation"]);
      const more = screen.getByTestId("contact-header-relations-more");
      expect(more.tagName).toBe("BUTTON");
      expect(more.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(more);
      expect(box()).toEqual(["rel-0", "rel-1", "rel-2", "rel-3", "rel-4", "rel-5", "rel-6", "Show fewer", "+ Relation"]);
      expect(screen.getByTestId("contact-header-relations-more").getAttribute("aria-expanded")).toBe("true");
      fireEvent.click(screen.getByTestId("contact-header-relations-more"));
      expect(box()).toEqual(["rel-0", "rel-1", "rel-2", "+4 more", "+ Relation"]);
    });
  }
});

describe("nothing in the connection may overlap the contact's name; the arrows give way first", () => {
  // A content-floored middle track took width from the picture columns (128 px image squeezed, the "⋯" pushed out of the header). The
  // middle track may shrink to 0; its content gives way inside it instead (arrows, then the origin and the relations), and what still
  // does not fit is clipped inside the connection, ⛔ never drawn over the name or the picture.
  test("wide: the pictures' columns are never squeezed: the middle track has no content floor; the connection clips inside its own track", () => {
    draw({ relations: RELS });
    const wide = css().slice(css().indexOf("@container"));
    expect(wide).toMatch(/grid-template-columns: auto fit-content\(10rem\) minmax\(0, 1fr\) fit-content\(14rem\) auto/);
    expect(wide).toMatch(/\.gsh-conn \{[^}]*min-width: 0;[^}]*overflow: hidden/);
    expect(wide).not.toMatch(/min-width: 19rem/);
  });
  test("wide: after the arrows, the origin (floor 3rem) and the relation stack (floor 5rem, chips ellipsize) give way; spacing does not hang on a 0 px arrow", () => {
    draw({ relations: RELS });
    const wide = css().slice(css().indexOf("@container"));
    expect(wide).toMatch(/\.gsh-origin \{[^}]*min-width: 3rem/);
    expect(wide).toMatch(/\.gsh-rels \{[^}]*flex: 0 1 auto;[^}]*min-width: 5rem/);
    expect(wide).toMatch(/\.gsh-conn \{[^}]*column-gap: 0/);
    expect(wide).toMatch(/\.gsh-conn > :not\(\.gsh-arrow\) \{ margin-inline: 5px; \}/);
  });
  test("the arrows shrink first (a far larger shrink factor than anything else), down to nothing, and their head is clipped with them", () => {
    draw({ relations: RELS });
    const c = css();
    expect(c).toMatch(/\.gsh-arrow \{[^}]*flex: 1 1000 16px;[^}]*min-width: 0;[^}]*overflow: hidden/);
    expect(c).toMatch(/\.gsh-arrow-end::after \{[^}]*right: 0;/);
  });
});

describe("the own label and '+ Relation' text reach 4.5:1 (darkened minimally toward the ink)", () => {
  test("own label: ink 66% over the paper; '+ Relation': accent 95% with ink", () => {
    draw({ relations: RELS, onAddRelation: () => {} });
    const c = css();
    expect(c).toMatch(/\.gsh-rel-own \{[^}]*border-style: dashed;[^}]*color: color-mix\(in srgb,var\(--ink,var\(--color-ink,#2a2622\)\) 66%,var\(--paper,var\(--color-base,#f4f1ea\)\)\)/);
    expect(c).toMatch(/\.gsh-add \{[^}]*color: color-mix\(in srgb,var\(--accent,var\(--color-brand,#a85c3b\)\) 95%,var\(--ink,var\(--color-ink,#2a2622\)\)\)/);
  });
});

describe("360 px with relations in row 1 (the origin once ran 15.8 px under the photo)", () => {
  test("narrow: the Where / How we met line may shrink to its column (no 5rem floor), so it never runs under the photo", () => {
    draw({ layout: "auto", relations: RELS, onAddRelation: () => {} });
    const narrow = css().slice(0, css().indexOf("@container"));
    expect(narrow).toMatch(/\[data-layout="narrow"\] \.gsh-origin \{[^}]*min-width: 0/);
    expect(narrow).toMatch(/\[data-layout="auto"\] \.gsh-origin \{[^}]*min-width: 0/);
  });
});

describe("a relation chip too long for its space ends in '…', the full label kept", () => {
  test("the chip's words sit in their own ellipsizing box (Chromium draws no ellipsis on a flex container's own text); the DOM keeps the whole label", () => {
    const long: ContactHeaderRelation = { key: "t:BusinessPartnerOf", text: "business-partner-of", kind: "predicate", curie: "t:BusinessPartnerOf", title: "Ben Berg business-partner-of Ann Berg · GilbVeda t:BusinessPartnerOf" };
    draw({ relations: [long] });
    const chip = relChips()[0]!;
    const words = chip.querySelector(".gsh-rel-text")!;
    expect(words.textContent).toBe("business-partner-of");
    expect(chip.textContent).toBe("business-partner-of");
    expect(chip.getAttribute("title")).toContain("business-partner-of");
    expect(css()).toMatch(/\.gsh-rel-text \{[^}]*min-width: 0;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap/);
    expect(css()).toMatch(/\.gsh-rel, \.gsh-add \{[^}]*min-width: 0/);
  });
});

describe("with relations in row 1, the name and origin go under the photo before their column falls below 120 px", () => {
  test("the header says whether its relation slot has content (data-rels)", () => {
    draw({ layout: "auto", relations: RELS, onAddRelation: () => {} });
    expect(document.querySelector(".gsh")!.getAttribute("data-rels")).toBe("true");
    cleanup();
    draw({ layout: "auto", onAddRelation: () => {} });
    expect(document.querySelector(".gsh")!.getAttribute("data-rels")).toBe("true");
    cleanup();
    draw({ layout: "auto" });
    expect(document.querySelector(".gsh")!.getAttribute("data-rels")).toBeNull();
  });
  test("narrow: the relation column is at most 9rem, and below 29rem of header (24 + 60 + 12 + 144 + 12 + 120 + 12 + 80 px) a header with relations takes the under-the-photo rows", () => {
    draw({ layout: "auto", relations: RELS, onAddRelation: () => {} });
    const c = css();
    expect(c).toMatch(/\.gsh\[data-layout="narrow"\] \.gsh-rels \{[^}]*max-width: 9rem/);
    const q = c.slice(c.indexOf("@container gsh (max-width: 29rem)"));
    expect(c.indexOf("@container gsh (max-width: 29rem)")).toBeGreaterThan(-1);
    expect(q).toMatch(/\.gsh\[data-layout="auto"\]\[data-rels="true"\] \.gsh-row \{[^}]*grid-template-areas: "hpic rels \. cpic" "name name name name" "origin origin origin origin"/);
    expect(q).toMatch(/\.gsh\[data-layout="narrow"\]\[data-rels="true"\] \.gsh-row \{/);
  });
  test("an opened origin breaks only between words", () => {
    draw({ layout: "auto", relations: RELS });
    expect(css()).toMatch(/\.gsh-origin\[aria-expanded="true"\] \{[^}]*overflow-wrap: normal;[^}]*word-break: normal/);
  });
});
