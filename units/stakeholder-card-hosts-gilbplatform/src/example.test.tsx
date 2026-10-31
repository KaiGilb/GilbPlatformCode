// Renders the README's wiring (test/example.tsx): the provider with every prop, and the online stakeholder card inside it; "+ Add your own" tells the page
// the record and its door.
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StakeholderScreen } from "../test/example";
import { BEN, P, createWorld } from "../test/world";

describe("the README's wiring", () => {
  test("draws the card with the header and the rows, and signs its reads with the session", async () => {
    const world = await createWorld();
    vi.stubGlobal("fetch", world.fetch);
    render(<StakeholderScreen session={world.session} principal={BEN} />);
    await waitFor(() => expect(screen.getAllByTestId("one-card-row-value").length).toBe(3));
    expect(screen.getByTestId("contact-card-name").textContent).toBe("Ben Larsen");
    expect(world.signed.length).toBeGreaterThan(0);
  });

  test("after + Add your own the page is told the new record and the vault it was made in", async () => {
    const world = await createWorld();
    vi.stubGlobal("fetch", world.fetch);
    render(<StakeholderScreen session={world.session} principal={BEN} />);
    await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
    fireEvent.click(screen.getByTestId("add-own"));
    await waitFor(() => expect(screen.getByText(/^Opened /).textContent).toMatch(new RegExp(` in ${P}$`)), { timeout: 8000 });
  });
});
