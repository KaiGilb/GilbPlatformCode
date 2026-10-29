// "Holder far left, contact image far right" is VISUAL order, not only DOM order. A reversed
// flex row or an `order` on a child keeps the DOM order the existing test reads and flips the picture. jsdom has no layout, so this
// reads the styles that decide the visual order.
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ContactHeader } from "./index";
afterEach(cleanup);
test("the wide row draws left to right in DOM order (no reversed direction, no child order)", () => {
  render(
    <ContactHeader
      layout="wide"
      linked
      holder={<span />}
      holderInfo={{ name: "Ann", caption: "Me", type: "t:Person" }}
      contactType="t:Person"
      contact={{ displayName: "Ben Berg", unnamed: false, photoUrl: null, origin: "at birth", originLoading: false, placements: [], placementOpen: false }}
      renderPlacementChip={() => null}
      renderPhoto={() => null}
    />,
  );
  const row = screen.getByTestId("contact-shell-chrome-row");
  const dir = row.style.flexDirection || "row";
  expect(dir).toBe("row");
  expect(row.style.direction || "").not.toBe("rtl");
  for (const c of Array.from(row.children) as HTMLElement[]) expect(c.style.order || "").toBe("");
  expect((row.firstElementChild as HTMLElement).getAttribute("data-testid")).toBe("contact-header-holder");
  expect((row.lastElementChild as HTMLElement).getAttribute("data-testid")).toBe("contact-card-link-photo");
});
