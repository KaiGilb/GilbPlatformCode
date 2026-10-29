import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PersonCard } from "@kaigilb/gilbplatformcode-person-connections";
import { PLACEMENT_BAND_TITLE, PLACEMENT_CHIP_HELP, PersonPlacementChips } from "./index";

const card = (over: Partial<PersonCard>): PersonCard => ({ party: "p", how: "placement", placements: [], link: { state: "none" }, anchor: null, connections: "read", ...over });
const HELP = "You placed them in this circle. It decides what of yours they can see. Change it in MyNet.";

describe("PersonPlacementChips", () => {
  test("the words", () => {
    expect(PLACEMENT_BAND_TITLE).toBe("In your circles");
    expect(PLACEMENT_CHIP_HELP).toBe(HELP);
  });
  test("draws nothing for no card, a card that is not a placement, and a placement with no circle", () => {
    for (const c of [null, card({ how: "sameAs", placements: [{ context: "personal", depth: "first-degree" }] }), card({ how: "none" }), card({ placements: [] })]) {
      const { container, unmount } = render(<PersonPlacementChips card={c} />);
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });
  test("the band: the title, one access chip per circle, the help line", () => {
    render(<PersonPlacementChips card={card({ placements: [{ context: "professional", depth: "close-circle" }, { context: "personal", depth: "first-degree" }] })} />);
    const band = screen.getByTestId("person-placement-band");
    expect(band.getAttribute("aria-label")).toBe("In your circles");
    expect(band.getAttribute("data-meaning")).toBe("access");
    expect(band.querySelector("h3")!.textContent).toBe("In your circles");
    const chips = screen.getAllByTestId("person-placement-chip");
    expect(chips.map((c) => c.getAttribute("title"))).toEqual([HELP, HELP]);
    expect(chips.map((c) => c.getAttribute("data-meaning"))).toEqual(["access", "access"]);
    expect(screen.getByTestId("person-placement-help").textContent).toBe(HELP);
  });
  test("Inner Circle covers the 1st connection of the same context (the package's display rule)", () => {
    render(<PersonPlacementChips card={card({ placements: [{ context: "personal", depth: "first-degree" }, { context: "personal", depth: "close-circle" }] })} />);
    expect(screen.getAllByTestId("person-placement-chip").map((c) => c.textContent)).toEqual(["Personal Inner Circle"]);
  });
  test("no write: no button, no remove, no add", () => {
    render(<PersonPlacementChips card={card({ placements: [{ context: "personal", depth: "first-degree" }] })} />);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});
