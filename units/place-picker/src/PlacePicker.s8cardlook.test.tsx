// @vitest-environment jsdom
// Ported from GilbApp `PlacePicker.s8cardlook.test.tsx` (6 cases): the four rows for "Oslo" are told apart by what each is and where it is.
// Changed from the source: `axe-core` is run directly (colour contrast off: jsdom does not resolve colours); the catalogue is the fake platform of `../test/world.ts`.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axeCore from "axe-core";
import { PlacePicker } from "./index";
import { GEO, calls, setCatalogueMode, useWorld } from "../test/world";

useWorld();
afterEach(cleanup);
beforeEach(() => setCatalogueMode("oslo-live"));
const axe = (node: Element) => axeCore.run(node, { rules: { "color-contrast": { enabled: false } } });

const rowFetches = () => calls.map((c) => c.url).filter((u) => u.startsWith(GEO + "/"));

async function typeOslo(rung: "city" | "region" = "city") {
  render(<PlacePicker rung={rung} label={rung === "city" ? "City" : "Region/State"} value={null} onPick={() => {}} onClear={() => {}} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Oslo" } });
  // The City box searches the settlement grains and the administrative areas (4 live rows); the Region box only the latter.
  await waitFor(() => expect(screen.getAllByRole("option").length).toBe(rung === "city" ? 4 : 1));
}
const meta = (el: HTMLElement) => el.querySelector('[data-testid="place-option-lands"]')!.textContent!;

describe("the four Oslo rows are told apart", () => {
  it("each row names its kind and its container, and no two rows read the same", async () => {
    await typeOslo();
    await waitFor(() => {
      const lines = screen.getAllByRole("option").map((o) => `${o.querySelector("span")!.textContent} | ${meta(o)}`);
      expect(lines.some((l) => /Oslo \| municipality · in Norway/.test(l))).toBe(true);
      expect(lines.some((l) => /Oslo \| region · in Norway/.test(l))).toBe(true);
      expect(lines.some((l) => /Oslo kommune \| municipality · no containing place recorded/.test(l))).toBe(true);
      expect(lines.some((l) => /Oslo Township \| municipality · in United States/.test(l))).toBe(true);
      expect(new Set(lines).size).toBe(4);
    });
  });

  it("the kind is the strong word of the line, the container follows it", async () => {
    await typeOslo();
    await waitFor(() => expect(screen.getAllByRole("option").some((o) => /in Norway/.test(o.textContent ?? ""))).toBe(true));
    const strong = screen.getAllByRole("option").map((o) => o.querySelector('[data-testid="place-option-lands"] .font-medium')?.textContent);
    expect(strong).toEqual(expect.arrayContaining(["municipality", "region"]));
  });

  it("the list is drawn before any container is read, and the containers land after", async () => {
    await typeOslo();
    expect(screen.getAllByRole("option")[0]).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("option").some((o) => /in Norway/.test(o.textContent ?? ""))).toBe(true));
  });

  it("the lookup is bounded: Norway is read once for the two Oslos in it, and no parent of a parent is read", async () => {
    await typeOslo();
    await waitFor(() => expect(screen.getAllByRole("option").some((o) => /in United States/.test(o.textContent ?? ""))).toBe(true));
    const reads = rowFetches();
    expect(reads.filter((u) => u === `${GEO}/no`).length).toBe(1);
    expect(reads.filter((u) => u === `${GEO}/us`).length).toBe(1);
  });

  it("works under the Region box too (same rows, same words)", async () => {
    await typeOslo("region");
    await waitFor(() => expect(screen.getAllByRole("option").some((o) => /region · in Norway/.test(o.textContent ?? ""))).toBe(true));
  });

  it("a person using a screen reader hears kind and container in the option's own text, and axe is clean", async () => {
    const { container } = render(<PlacePicker rung="city" label="City" value={null} onPick={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getAllByRole("combobox").at(-1)!, { target: { value: "Oslo" } });
    await waitFor(() => expect(screen.getAllByRole("option").some((o) => /in Norway/.test(o.textContent ?? ""))).toBe(true));
    expect((await axe(container)).violations).toEqual([]);
  });
});
