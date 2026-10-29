// The header follows the REAL width with CSS container queries (no JS width measure). Below 56rem it is the two-row narrow layout:
// row 1 = holder image (60 px), the relation slot, the contact's name and Where / How we met right-justified, the contact
// image (80 px) with its badge; row 2 = the circle chips at full width, wrapping.
// The Where / How we met text wraps onto at most 2 lines in wide, then an ellipsis; the full text is on hover and in the accessible name.
// jsdom has no layout and no container queries: these tests read the DOM, the slot sizes and the stylesheet the header ships.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { AtomicPlacement } from "@kaigilb/gilbplatformcode-person-connections";
import { ContactHeader, type ContactHeaderContact, type ContactHeaderProps, type ContactHeaderSlotImage } from "./index";

afterEach(cleanup);

const PERSON: ContactHeaderContact = {
  displayName: "Ben Berg",
  unnamed: false,
  photoUrl: null,
  origin: "at birth",
  originLoading: false,
  placements: [{ context: "personal", depth: "close-circle" }],
  placementOpen: false,
};
const chip = (p: AtomicPlacement) => <span data-testid="chip">{`${p.context}:${p.depth}`}</span>;
function draw(over: Partial<Omit<ContactHeaderProps, "contact">> & { contact?: Partial<ContactHeaderContact> } = {}) {
  const { contact, ...rest } = over;
  return render(
    <ContactHeader
      layout="auto"
      linked
      holder={<span data-testid="holder-img" />}
      holderInfo={{ name: "Ann Berg", caption: "Me", type: "t:Person" }}
      contactType="t:Person"
      contactCaption="Person · online card"
      renderPlacementChip={chip}
      renderPhoto={(img) => <img src={img.src} alt="" data-testid={img.testId} />}
      {...rest}
      contact={{ ...PERSON, ...contact }}
    />,
  );
}
/** The stylesheet the header ships with itself. */
const css = () => Array.from(document.querySelectorAll('[data-testid="contact-shell-header"] style')).map((s) => s.textContent ?? "").join("\n");

describe("layout follows the real width (container query), not a JS measure", () => {
  test("the size container is an OUTER box; the layout and its size variables sit on an INNER box (a container query cannot style its own container)", () => {
    draw();
    const outer = screen.getByTestId("contact-shell-header");
    const inner = outer.querySelector(":scope > .gsh") as HTMLElement;
    expect(outer.className).toBe("gsh-q");
    expect(inner.getAttribute("data-layout")).toBe("auto");
    expect(inner.contains(screen.getByTestId("contact-shell-chrome-row"))).toBe(true);
    const c = css().replace(/\s+/g, " ");
    expect(c).toMatch(/\.gsh-q \{ container-type: inline-size; container-name: gsh; \}/);
    expect(c).not.toMatch(/\.gsh \{[^}]*container-type/);
    // the wide sizes are set on the inner box inside the query
    expect(c.slice(c.indexOf("@container"))).toMatch(/\.gsh\[data-layout="auto"\] \{ --gsh-hold: 128px; --gsh-cont: 128px;/);
  });
  test("auto: the header is a size container and ships ONE container query at 56rem that switches to wide", () => {
    draw();
    const h = screen.getByTestId("contact-shell-header");
    expect(h.getAttribute("data-layout")).toBe("auto");
    expect(h.style.containerType).toBe("inline-size");
    expect(css()).toMatch(/@container\s+gsh\s*\(min-width:\s*56rem\)/);
  });
  test("auto: the image slots are sized by the stylesheet (a CSS variable), so a resize needs no re-render", () => {
    const holder = vi.fn((_i: ContactHeaderSlotImage) => <span />);
    const editor = vi.fn((_i: ContactHeaderSlotImage) => <span />);
    draw({ holder, photoEditor: editor });
    expect(holder.mock.calls[0]![0].cssSize).toMatch(/^var\(--gsh-hold/);
    expect(editor.mock.calls[0]![0].cssSize).toMatch(/^var\(--gsh-cont/);
  });
  test("one DOM in every layout: the same parts, the same order", () => {
    for (const layout of ["auto", "wide", "narrow"] as const) {
      draw({ layout });
      expect(Array.from(screen.getByTestId("contact-shell-chrome-row").children).map((c) => c.getAttribute("data-testid"))).toEqual([
        "contact-header-holder",
        "contact-header-holder-name",
        "contact-header-connection",
        "contact-shell-identity",
        "contact-card-link-photo",
      ]);
      cleanup();
    }
  });
});

describe("narrow (two rows)", () => {
  test("forced narrow: holder 60 px, contact 80 px", () => {
    const holder = vi.fn((_i: ContactHeaderSlotImage) => <span />);
    const editor = vi.fn((_i: ContactHeaderSlotImage) => <span />);
    draw({ layout: "narrow", holder, photoEditor: editor });
    expect(holder.mock.calls[0]![0].cssSize).toBe("60px");
    expect(editor.mock.calls[0]![0].cssSize).toBe("80px");
  });
  test("the narrow grid: row 1 holder | relations | name over origin | photo; row 2 the chips, full width and wrapping", () => {
    draw();
    const c = css().replace(/\s+/g, " ");
    expect(c).toMatch(/grid-template-areas: "hpic rels name cpic" "hpic rels origin cpic" "chips chips chips chips"/);
    expect(c).toMatch(/\.gsh-chips \{[^}]*grid-area: chips[^}]*flex-direction: row[^}]*flex-wrap: wrap/);
    // Right-aligned like the name. Chrome draws no ellipsis on a right-aligned 2-line clamp, so narrow shows ONE right-aligned line with an
    // ellipsis; the full text is the title and in the DOM.
    expect(c).toMatch(/\[data-layout="auto"\] \.gsh-origin \{[^}]*grid-area: origin[^}]*text-align: right[^}]*white-space: nowrap[^}]*text-overflow: ellipsis/);
    // the holder's name, the caption and the line are wide-only
    expect(c).toMatch(/\.gsh-hname, [^,{]*\.gsh-caption, [^,{]*\.gsh-arrow \{ display: none/);
  });
  test("the wide grid inside the container query: holder | name | connection | contact name | photo; the pictures are never squeezed", () => {
    draw();
    const c = css().replace(/\s+/g, " ");
    const wide = c.slice(c.indexOf("@container"));
    expect(wide).toMatch(/grid-template-areas: "hpic hname conn name cpic"/);
    // The middle track has no floor; the connection clips inside it (never over the name, never squeezing the pictures).
    expect(wide).toMatch(/grid-template-columns: auto fit-content\(10rem\) minmax\(0, 1fr\) fit-content\(14rem\) auto/);
  });
  test("the row is never reversed or re-ordered by the stylesheet (visual order = DOM order)", () => {
    draw();
    expect(css()).not.toMatch(/row-reverse|column-reverse|direction:\s*rtl|[;{\s]order:/);
  });
});

describe("Where / How we met: wide 2 lines then an ellipsis, narrow 1 right-aligned line then an ellipsis; full text on hover and in the accessible name", () => {
  for (const text of ["Met at the Oslo Innovation Week, 2024", "We met at the Nordic Systems Engineering Forum in Tromsø, on the second evening, over a long dinner about Planguage, 201"]) {
    test(`${text.length} characters`, () => {
      expect([37, 120]).toContain(text.length);
      draw({ contact: { origin: text } });
      const o = screen.getByTestId("contact-card-origin-inline");
      expect(o.textContent).toBe(text);
      expect(o.getAttribute("title")).toBe(text);
      expect(o.className).toContain("gsh-origin");
      const c = css().replace(/\s+/g, " ");
      const wide = c.slice(c.indexOf("@container"));
      expect(wide).toMatch(/\.gsh-origin \{[^}]*display: -webkit-box;[^}]*white-space: normal;[^}]*-webkit-line-clamp: 2/);
    });
  }
});
