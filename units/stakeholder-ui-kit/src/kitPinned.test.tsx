// Every export of the kit is pinned here: the names it offers, the token values, the two name words, the glyph and the badge.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as kit from "./index";
import { LINK_NOTE, LinkBadge, LinkGlyph, NAME_FONT, NAME_NOT_READ, NAME_NOT_YET, W, imageShapeOf, type ImageShape, type LinkBadgeProps } from "./index";

afterEach(cleanup);

describe("the kit's exports", () => {
  it("offers exactly these names", () => {
    expect(Object.keys(kit).sort()).toEqual(["LINK_NOTE", "LinkBadge", "LinkGlyph", "NAME_FONT", "NAME_NOT_READ", "NAME_NOT_YET", "W", "imageShapeOf"].sort());
  });
  it("types the shape and the badge props", () => {
    const shape: ImageShape = imageShapeOf("t:Person");
    const props: LinkBadgeProps = { size: 20, offset: -1, testId: "x" };
    expect(shape).toBe("circle");
    expect(props.size).toBe(20);
  });
});

describe("the two name-state words", () => {
  it("are these exact words", () => {
    expect(NAME_NOT_READ).toBe("Name could not be read");
    expect(NAME_NOT_YET).toBe("Name not read yet");
  });
});

describe("the colour tokens", () => {
  it("hold each chain: the host token first, a second token second, a literal last", () => {
    expect(W).toEqual({
      base: "var(--paper,var(--color-base,#f4f1ea))",
      ink: "var(--ink,var(--color-ink,#2a2622))",
      muted: "var(--ink-faint,var(--color-ink-muted,#6f6a63))",
      brand: "var(--accent,var(--color-brand,#a85c3b))",
      brandLighter: "color-mix(in srgb,var(--accent,var(--color-brand,#a85c3b)) 9%,var(--paper,var(--color-base,#f4f1ea)))",
      line: "color-mix(in srgb,var(--ink,var(--color-ink,#2a2622)) 20%,transparent)",
      lineSubtle: "color-mix(in srgb,var(--ink,var(--color-ink,#2a2622)) 9%,transparent)",
      sheet: "var(--surface,var(--color-sheet,#ffffff))",
      relBg: "color-mix(in srgb,var(--surface,var(--color-sheet,#ffffff)) 90%,var(--ink,var(--color-ink,#2a2622)))",
      relBorder: "color-mix(in srgb,var(--ink,var(--color-ink,#2a2622)) 28%,transparent)",
      ownText: "color-mix(in srgb,var(--ink,var(--color-ink,#2a2622)) 66%,var(--paper,var(--color-base,#f4f1ea)))",
      addText: "color-mix(in srgb,var(--accent,var(--color-brand,#a85c3b)) 95%,var(--ink,var(--color-ink,#2a2622)))",
      link: "var(--live-link,color-mix(in srgb,#7B3FE4 75%,var(--ink,var(--color-ink,#2a2622))))",
    });
  });
  it("gives the name face its own fallbacks", () => {
    expect(NAME_FONT).toBe('var(--font-name,"Arial Narrow","Helvetica Neue","Roboto Condensed",Arial,sans-serif)');
  });
});

describe("LINK_NOTE and LinkGlyph", () => {
  it("words the badge", () => {
    expect(LINK_NOTE).toBe("Live link to their account — not a copy");
  });
  it("draws a 14 px chain-link glyph hidden from assistive technology, or the size it is given", () => {
    const { container, rerender } = render(<LinkGlyph />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("14");
    expect(svg.getAttribute("height")).toBe("14");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.querySelectorAll("path")).toHaveLength(1);
    rerender(<LinkGlyph size={40} />);
    expect(container.querySelector("svg")!.getAttribute("width")).toBe("40");
  });
});

describe("LinkBadge", () => {
  it("draws the glyph at half its own size", () => {
    render(<LinkBadge testId="b" size={40} />);
    expect(screen.getByTestId("b").querySelector("svg")!.getAttribute("width")).toBe("20");
    cleanup();
    render(<LinkBadge testId="c" size={21} />);
    expect(screen.getByTestId("c").querySelector("svg")!.getAttribute("width")).toBe("11");
  });
  it("sits at the lower left, offset the same way on both sides, taking no pointer events", () => {
    render(<LinkBadge testId="b" offset={-9} />);
    const b = screen.getByTestId("b");
    expect(b.style.bottom).toBe("-9px");
    expect(b.style.left).toBe("-9px");
    expect(b.style.pointerEvents).toBe("none");
  });
  it("carries LINK_NOTE as its title and as one readable name, with no test id when none is given", () => {
    const { container } = render(<LinkBadge />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.getAttribute("title")).toBe(LINK_NOTE);
    expect(badge.hasAttribute("data-testid")).toBe(false);
    expect(badge.textContent).toBe(LINK_NOTE);
  });
});

describe("imageShapeOf", () => {
  it("trims a type before it reads it, and refuses a non-string", () => {
    expect(imageShapeOf("  t:Person  ")).toBe("circle");
    expect(imageShapeOf(42 as unknown as string)).toBe("rounded-square");
  });
  it("reads a term address ending in /t/Person on any host, and nothing that only contains it", () => {
    expect(imageShapeOf("http://mirror.example.test/x/t/Person")).toBe("circle");
    expect(imageShapeOf("https://example.test/t/Person/extra")).toBe("rounded-square");
    expect(imageShapeOf("t:Person2")).toBe("rounded-square");
  });
});
