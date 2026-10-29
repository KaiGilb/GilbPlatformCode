// The chain-link badge as ONE component: a white circle at the picture's lower left, the chain-link glyph, the words LINK_NOTE for
// hover and for assistive technology.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LINK_NOTE, LinkBadge } from "./index";

afterEach(cleanup);

describe("LinkBadge", () => {
  it("draws the chain-link glyph in a round badge at the picture's lower left, named by LINK_NOTE", () => {
    render(
      <div style={{ position: "relative", width: 64, height: 64 }}>
        <LinkBadge size={22} offset={-2} testId="row-link" />
      </div>,
    );
    const b = screen.getByTestId("row-link");
    expect(b.getAttribute("title")).toBe(LINK_NOTE);
    expect(b.textContent).toContain(LINK_NOTE); // read by assistive technology, hidden from sight
    expect(b.querySelector("svg path")).not.toBeNull();
    expect(b.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(b.style.position).toBe("absolute");
    expect(b.style.left).toBe("-2px");
    expect(b.style.bottom).toBe("-2px");
    expect(b.style.width).toBe("22px");
    expect(b.style.height).toBe("22px");
    expect(b.style.borderRadius).toBe("50%");
    expect(b.style.pointerEvents).toBe("none");
  });

  it("uses the header's own colours: the sheet behind, the live-link colour for the glyph, the line as outline", () => {
    render(<LinkBadge testId="b" />);
    const b = screen.getByTestId("b");
    expect(b.getAttribute("style")).toContain("var(--surface,var(--color-sheet,#ffffff))");
    expect(b.getAttribute("style")).toContain("var(--live-link,");
  });

  it("defaults to the header's narrow size (28 px at -4 px)", () => {
    render(<LinkBadge testId="d" />);
    const b = screen.getByTestId("d");
    expect(b.style.width).toBe("28px");
    expect(b.style.left).toBe("-4px");
  });
});
