// Renders the README's wiring (test/example.tsx): the provider with every prop, the online stakeholder card inside it, and after "+ Add your own" the
// held card of the record that was made, with the button back to the online card.
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StakeholderScreen } from "../test/example";
import { BEN, createWorld } from "../test/world";
import { heldWorld } from "../test/heldWorld";

describe("the README's wiring", () => {
  test("draws the card with the header and the rows, and signs its reads with the session", async () => {
    const world = await createWorld();
    vi.stubGlobal("fetch", world.fetch);
    render(<StakeholderScreen session={world.session} principal={BEN} />);
    await waitFor(() => expect(screen.getAllByTestId("one-card-row-value").length).toBe(3));
    expect(screen.getByTestId("contact-card-name").textContent).toBe("Ben Larsen");
    expect(world.signed.length).toBeGreaterThan(0);
  });

  test("after + Add your own the held card of the new record is drawn, and Back returns to the online card", async () => {
    const world = await createWorld();
    vi.stubGlobal("fetch", heldWorld(world).fetch);
    render(<StakeholderScreen session={world.session} principal={BEN} />);
    await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
    fireEvent.click(screen.getByTestId("add-own"));
    await waitFor(() => expect(screen.getByText("Back to the online card")).toBeTruthy(), { timeout: 8000 });
    await waitFor(() => expect(screen.getByTestId("card-edit")).toBeTruthy(), { timeout: 8000 });
    expect(screen.getByTestId("contact-card-name").textContent).toBe("Ben Larsen");
    fireEvent.click(screen.getByText("Back to the online card"));
    await waitFor(() => expect(screen.getByTestId("online-stakeholder-card")).toBeTruthy());
  });
});
