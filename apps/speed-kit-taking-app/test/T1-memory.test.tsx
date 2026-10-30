import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ANN, boot, click, panel, waitFor } from "./helpers";

describe("T1 memory", () => {
  test("T1 memory: back to Entries paints the rows on the first render, from memory", async () => {
    const k = await boot();
    k.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1");
    expect(screen.getAllByTestId(/^entry-e\d+$/)).toHaveLength(30);
    await waitFor(() => expect(panel().dataset.source).toBe("network")); // the first visit had nothing to paint from (the panel follows the rows by a step)

    click("nav-entry-e1"); // an Entry page
    expect(screen.queryByTestId("entry-e1")).toBeNull();
    expect(screen.getByTestId("rename-input")).toBeTruthy();

    fireEvent.click(screen.getByTestId("nav-entries")); // back: asserted at once, before any await
    expect(screen.getByTestId("entry-e1").textContent).toContain("Ann entry 1");
    expect(screen.getAllByTestId(/^entry-e\d+$/)).toHaveLength(30);
    expect(panel().dataset.source).toBe("memory");
    expect(k.proof.lastPaint?.source).toBe("memory");
    expect(k.proof.lastPaint?.page).toBe("entries");
    expect(Number.isFinite(k.proof.lastPaint?.ms)).toBe(true);
    expect(k.session.client?.origin).toBe(new URL(ANN).origin);
  });
});
