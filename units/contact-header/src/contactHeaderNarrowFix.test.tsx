// The narrow layout, small widths and names:
// - below about 340 px of header width (container query) the contact's name and the Where / How we met line go UNDER the contact
//   photo, right-aligned, each on a row of their own. Nothing is drawn under the photo or its badge.
// - a name never breaks inside a word. It wraps at spaces and after hyphens only; one word too long for its space ends in "…",
//   and the full name stays the accessible name and the title.
// - a phone has no hover. The narrow Where / How we met line is a BUTTON: a tap expands it inline to the full text, another tap
//   collapses it (aria-expanded; Enter / Space come with the native button). Wide keeps 2 lines with "…" and the hover title; it is
//   the same button (one DOM).
// - the initials are ink tinted with the brand, never the bare brand colour.
// - the circle is a stylesheet rule on `data-shape`; dropping it must fail a test.
// jsdom has no layout: these tests read the DOM and the stylesheet.
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AtomicPlacement } from "@kaigilb/gilbplatformcode-person-connections";
import { ContactHeader, type ContactHeaderContact, type ContactHeaderProps } from "./index";

afterEach(cleanup);

const LONG = "We met at the Nordic Systems Engineering Forum in Tromsø, on the second evening, over a long dinner about Planguage";
const PERSON: ContactHeaderContact = {
  displayName: "Maximiliana Consortium-Vanderbilt",
  unnamed: false,
  photoUrl: null,
  origin: LONG,
  originLoading: false,
  placements: [{ context: "personal", depth: "close-circle" }],
  placementOpen: false,
};
const chip = (p: AtomicPlacement) => <span data-testid="chip">{`${p.context}:${p.depth}`}</span>;
function draw(over: Partial<Omit<ContactHeaderProps, "contact">> & { contact?: Partial<ContactHeaderContact> } = {}) {
  const { contact, ...rest } = over;
  return render(
    <ContactHeader
      layout="narrow"
      linked
      holder={<span />}
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

describe("ContactHeader narrow: small widths, names, the origin button, the initials", () => {
  describe("under about 340 px the name and the origin go under the photo", () => {
    // Narrow: "Below about 340 px the name and origin go under the contact photo, right-aligned".
    test("one container query below 340 px moves name and origin to rows of their own, with and without a nav", () => {
      draw();
      const c = css();
      const at = c.indexOf("@container gsh (max-width: 340px)");
      expect(at).toBeGreaterThan(-1);
      const q = c.slice(at);
      expect(q).toMatch(/grid-template-areas: "hpic rels \. cpic" "name name name name" "origin origin origin origin" "chips chips chips chips"/);
      expect(q).toMatch(
        /\[data-nav="true"\] \.gsh-row \{[^}]*grid-template-areas: "hpic nav rels \. cpic" "name name name name name" "origin origin origin origin origin" "chips chips chips chips chips"/,
      );
    });
  });

  describe("a name breaks only at spaces and hyphens", () => {
    test("the name is drawn word by word (a hyphen ends a word), the text and the title are the full name", () => {
      draw();
      const h1 = screen.getByTestId("contact-card-name");
      expect(h1.textContent).toBe("Maximiliana Consortium-Vanderbilt");
      expect(h1.getAttribute("title")).toBe("Maximiliana Consortium-Vanderbilt");
      expect(Array.from(h1.querySelectorAll(".gsh-word")).map((w) => w.textContent)).toEqual(["Maximiliana", "Consortium-", "Vanderbilt"]);
    });
    test("a word never breaks inside; one too long for its space ends in an ellipsis", () => {
      draw({ contact: { displayName: "Ben Carr" } });
      expect(Array.from(screen.getByTestId("contact-card-name").querySelectorAll(".gsh-word")).map((w) => w.textContent)).toEqual([
        "Ben",
        "Carr",
      ]);
      const c = css();
      expect(c).toMatch(/\.gsh-name \{ overflow-wrap: normal; word-break: normal; \}/);
      expect(c).toMatch(/\.gsh-word \{ display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;/);
    });
  });

  describe("the narrow origin line is a button that expands and collapses", () => {
    test("a tap expands it inline, another collapses it; it is a native button (Enter / Space), with the full text", () => {
      draw();
      const o = screen.getByTestId("contact-card-origin-inline");
      expect(o.tagName).toBe("BUTTON");
      expect(o.getAttribute("type")).toBe("button");
      expect(o.textContent).toBe(LONG);
      expect(o.getAttribute("title")).toBe(LONG);
      expect(o.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(o);
      expect(o.getAttribute("aria-expanded")).toBe("true");
      fireEvent.click(o);
      expect(o.getAttribute("aria-expanded")).toBe("false");
    });
    test("expanded, the line shows its full text (narrow and wide); closed, wide keeps 2 lines and the hover", () => {
      draw({ layout: "auto" });
      const c = css();
      expect(c).toMatch(
        /\.gsh\[data-layout="narrow"\] \.gsh-origin\[aria-expanded="true"\], \.gsh\[data-layout="auto"\] \.gsh-origin\[aria-expanded="true"\] \{ white-space: normal; overflow: visible; text-overflow: clip; \}/,
      );
      const wide = c.slice(c.indexOf("@container gsh (min-width: 56rem)"));
      expect(wide).toMatch(/\.gsh-origin \{[^}]*-webkit-line-clamp: 2;/);
      expect(wide).toMatch(/\.gsh-origin\[aria-expanded="true"\] \{ display: block; -webkit-line-clamp: unset; line-clamp: none; \}/);
    });
  });

  describe("the picture's initials and the circle", () => {
    test("the initials are drawn in the ink colour tinted with the brand, never the bare brand colour", () => {
      draw();
      expect(css()).toMatch(/\.gsh-initials \{ color: color-mix\(in srgb,var\(--accent,var\(--color-brand,#a85c3b\)\) 30%,var\(--ink,var\(--color-ink,#2a2622\)\)\); \}/);
    });
    test("a person's picture is a circle by a stylesheet rule on data-shape, and a square is 16 px", () => {
      draw();
      expect(screen.getByTestId("contact-card-avatar").getAttribute("data-shape")).toBe("circle");
      const c = css();
      expect(c).toContain('.gsh-img[data-shape="circle"] { border-radius: 50%; }');
      expect(c).toContain('.gsh-img[data-shape="rounded-square"] { border-radius: 16px; }');
    });
  });
});
