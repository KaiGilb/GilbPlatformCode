// Renders the README's wiring (test/example.tsx): the online card, then after "+ Add your own" the held card of the new record, and Back.
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StakeholderScreens } from "../test/example";
import { BEN, createWorld } from "../test/world";
import { heldWorld } from "../test/heldWorld";

describe("the README's wiring", () => {
  test("after + Add your own the held card of the new record is drawn, and Back returns to the online card", async () => {
    const world = await createWorld();
    vi.stubGlobal("fetch", heldWorld(world).fetch);
    render(<StakeholderScreens session={world.session} principal={BEN} />);
    await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
    fireEvent.click(screen.getByTestId("add-own"));
    await waitFor(() => expect(screen.getByText("Back to the online card")).toBeTruthy(), { timeout: 8000 });
    await waitFor(() => expect(screen.getByTestId("card-edit")).toBeTruthy(), { timeout: 8000 });
    expect(screen.getByTestId("contact-card-name").textContent).toBe("Ben Larsen");
    fireEvent.click(screen.getByText("Back to the online card"));
    await waitFor(() => expect(screen.getByTestId("online-stakeholder-card")).toBeTruthy());
  });
});
