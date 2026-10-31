// @vitest-environment jsdom
// Ported from GilbApp `src/components/mynet/WorkLocationField.s8cityfix.test.tsx` (commit a703b3ed): the same cases against the unit. Changes: the import paths and the world (`test/world.ts`).
// Cycle214 s8 city fix — Kai, 2026-10-16: "Oslo does not come up as a city". The employment Location box searches the City box's
// grains (the settlement types and the administrative areas) and takes any place; it must list the city (Oslo, the municipality) FIRST.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkLocationField } from "./index";
import { GEO, setCatalogueMode, useWorld } from "../test/world";

useWorld();
afterEach(cleanup);
beforeEach(() => setCatalogueMode("cities-live"));

describe("the Location box, 'Oslo'", () => {
  it("lists the municipality (the city) first, the township and the kommune next, the region last; the first is selectable", async () => {
    const onChange = vi.fn();
    render(<WorkLocationField placeId="" label="" onChange={onChange} />);
    const box = screen.getByRole("textbox", { name: "Role location" });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "Oslo" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
    await waitFor(() => expect(screen.getAllByRole("option").every((o) => !/…/.test(o.textContent ?? ""))).toBe(true));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Oslomunicipality · in Norway",
      "Oslo Townshipmunicipality · in United States",
      "Oslo kommunemunicipality · no containing place recorded",
      "Osloregion · in Norway",
    ]);
    fireEvent.click(screen.getAllByRole("option")[0]!);
    expect(onChange).toHaveBeenCalledWith({ placeId: `${GEO}/oslo`, placeLabel: "Oslo" });
  });
});
