// The `nav` slot and `framed={false}` of the narrow layout.
// - `nav`: an app keeps its navigation buttons in row 1, directly after the holder's image. The narrow grid gets a `nav` column ONLY when
//   an app passes `nav`, so the grid with no nav is byte for byte the four-column one.
// - `framed={false}`: the app's shell already draws the band (its own background, border and padding), so the header draws none of its
//   own there. The default (framed) is unchanged.
// jsdom has no layout: these tests read the DOM and the stylesheet the header ships.
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { AtomicPlacement } from "@kaigilb/gilbplatformcode-person-connections";
import { ContactHeader, type ContactHeaderContact, type ContactHeaderProps } from "./index";

afterEach(cleanup);

const PERSON: ContactHeaderContact = {
  displayName: "Ben Berg",
  unnamed: false,
  photoUrl: null,
  origin: "At birth",
  originLoading: false,
  placements: [
    { context: "personal", depth: "close-circle" },
    { context: "professional", depth: "first-degree" },
  ],
  placementOpen: false,
};
const chip = (p: AtomicPlacement) => <span data-testid="chip">{`${p.context}:${p.depth}`}</span>;
function draw(over: Partial<Omit<ContactHeaderProps, "contact">> & { contact?: Partial<ContactHeaderContact> } = {}) {
  const { contact, ...rest } = over;
  return render(
    <ContactHeader
      linked
      holder={<span data-testid="holder-img" />}
      holderInfo={{ name: "Ann Berg", caption: null, type: "t:Person" }}
      contactType="t:Person"
      renderPlacementChip={chip}
      onTogglePlacement={() => {}}
      renderPhoto={(img) => <img src={img.src} alt="" data-testid={img.testId} />}
      {...rest}
      contact={{ ...PERSON, ...contact }}
    />,
  );
}
const css = () =>
  Array.from(document.querySelectorAll('[data-testid="contact-shell-header"] style'))
    .map((s) => s.textContent ?? "")
    .join("\n")
    .replace(/\s+/g, " ");
const inner = () => screen.getByTestId("contact-shell-header").querySelector(":scope > .gsh") as HTMLElement;

describe("ContactHeader with a nav and without a frame", () => {
  describe("the default layout", () => {
    test("with no layout given, the header is the two-row narrow layout", () => {
      draw();
      expect(screen.getByTestId("contact-shell-header").getAttribute("data-layout")).toBe("narrow");
      expect(inner().getAttribute("data-layout")).toBe("narrow");
      // no icon-font link glyph and no Tailwind class is drawn
      expect(document.querySelector(".fa-link")).toBeNull();
      expect(document.querySelector(".rounded-lg")).toBeNull();
    });
  });

  describe("nav: in row 1, directly after the holder's image", () => {
    test("the nav is drawn in its own box right after the holder, and the header says it has one", () => {
      draw({ layout: "narrow", nav: <div data-testid="nav-buttons" /> });
      const row = Array.from(screen.getByTestId("contact-shell-chrome-row").children).map((c) => c.getAttribute("data-testid"));
      expect(row.indexOf("contact-header-nav")).toBe(row.indexOf("contact-header-holder-name") + 1);
      expect(row.indexOf("contact-header-holder")).toBe(0);
      const nav = screen.getByTestId("contact-header-nav");
      expect(nav.className).toBe("gsh-nav");
      expect(nav.contains(screen.getByTestId("nav-buttons"))).toBe(true);
      expect(inner().getAttribute("data-nav")).toBe("true");
    });
    test("the narrow grid with a nav: holder | nav | relations | name over origin | photo; chips across all five columns", () => {
      draw({ layout: "narrow", nav: <div /> });
      const c = css();
      expect(c).toMatch(
        /\.gsh\[data-layout="narrow"\]\[data-nav="true"\] \.gsh-row \{[^}]*grid-template-columns: auto auto auto minmax\(0, 1fr\) auto;[^}]*grid-template-areas: "hpic nav rels name cpic" "hpic nav rels origin cpic" "chips chips chips chips chips"/,
      );
      expect(c).toMatch(/\.gsh-nav \{[^}]*grid-area: nav/);
    });
    test("no nav: no nav box, no data-nav, and the grid is the four-column one", () => {
      draw({ layout: "auto" });
      expect(screen.queryByTestId("contact-header-nav")).toBeNull();
      expect(inner().hasAttribute("data-nav")).toBe(false);
      expect(css()).toMatch(/grid-template-areas: "hpic rels name cpic" "hpic rels origin cpic" "chips chips chips chips"/);
    });
  });

  describe("framed: when the app's shell draws the band, the header draws none", () => {
    test("framed={false}: the header says so, and the stylesheet drops its own background, line and padding", () => {
      draw({ layout: "narrow", framed: false });
      expect(inner().getAttribute("data-frame")).toBe("none");
      const c = css();
      expect(c).toMatch(/\.gsh\[data-frame="none"\] \{ background: transparent; border-bottom: 0; \}/);
      expect(c).toMatch(/\.gsh\[data-frame="none"\]\[data-layout\] \.gsh-row \{ padding: 0; \}/);
    });
    test("by default the header is framed and carries no data-frame", () => {
      draw({ layout: "auto" });
      expect(inner().hasAttribute("data-frame")).toBe(false);
    });
  });

  describe("shapes and the badge in narrow (people as circles, everything else as squares; the link only when linked)", () => {
    test("a linked person: circle, badge", () => {
      draw({ layout: "narrow" });
      expect(screen.getByTestId("contact-card-link-photo").getAttribute("data-shape")).toBe("circle");
      expect(screen.getByTestId("contact-card-avatar").getAttribute("data-shape")).toBe("circle");
      expect(screen.getByTestId("contact-card-link-note")).toBeTruthy();
    });
    test("a local person: circle, no badge", () => {
      draw({ layout: "narrow", linked: false });
      expect(screen.getByTestId("contact-card-link-photo").getAttribute("data-shape")).toBe("circle");
      expect(screen.queryByTestId("contact-card-link-note")).toBeNull();
    });
    test("a group (Organization vault): rounded square, no badge", () => {
      draw({
        layout: "narrow",
        linked: false,
        contactType: "https://veda.example.test/base/t/Organization",
        contact: { kind: "group", displayName: "Book Club", origin: "Organization" },
      });
      expect(screen.getByTestId("contact-card-link-photo").getAttribute("data-shape")).toBe("rounded-square");
      expect(screen.queryByTestId("contact-card-link-note")).toBeNull();
    });
  });
});
