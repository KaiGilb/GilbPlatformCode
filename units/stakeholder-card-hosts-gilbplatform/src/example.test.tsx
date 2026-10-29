// Renders the README's wiring (test/example.tsx): the provider with every prop, and the online stakeholder card inside it.
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StakeholderScreen } from "../test/example";
import { BEN, createWorld } from "../test/world";

describe("the README's wiring", () => {
  test("draws the card with the header and the rows, and signs its reads with the session", async () => {
    const world = await createWorld();
    vi.stubGlobal("fetch", world.fetch);
    render(<StakeholderScreen session={world.session} principal={BEN} />);
    await waitFor(() => expect(screen.getAllByTestId("one-card-row-value").length).toBe(3));
    expect(screen.getByTestId("contact-card-name").textContent).toBe("Ben Larsen");
    expect(world.signed.length).toBeGreaterThan(0);
  });
});
