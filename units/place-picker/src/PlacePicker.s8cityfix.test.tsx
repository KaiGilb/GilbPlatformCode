// @vitest-environment jsdom
// Ported from GilbApp `PlacePicker.s8cityfix.test.tsx` (8 cases): the 6 that render the picker. The City box typed "Oslo" against the live shapes: the municipality
// that is the city comes first and is selectable as the city; the region of the same name is below, with its hint; the kommune with no container sits below
// the hits that name a container. The other 2 (the postal address's country line, `compactLines` and the stored address's flag) render the address card and go with H15f.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GeoPlace } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { PlacePicker } from "./index";
import { GEO, setCatalogueMode, useWorld } from "../test/world";

useWorld();
afterEach(cleanup);
beforeEach(() => setCatalogueMode("cities-live"));

const lines = () =>
  screen.getAllByRole("option").map((o) => `${o.querySelector("span")!.textContent} | ${o.querySelector('[data-testid="place-option-lands"]')!.textContent!} | ${o.textContent!.includes("goes in your") ? "HINT" : "-"}`);

async function type(rung: "city" | "region" | "country", q: string, count: number, onPick: (p: GeoPlace) => void = () => {}) {
  render(<PlacePicker rung={rung} label={rung === "city" ? "City" : rung === "region" ? "Region" : "Country"} value={null} onPick={onPick} onClear={() => {}} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: q } });
  await waitFor(() => expect(screen.getAllByRole("option").length).toBe(count));
  // The containers are read after the list is drawn.
  await waitFor(() => expect(screen.getAllByRole("option").some((o) => /in Norway|in Sweden|in United States/.test(o.textContent ?? ""))).toBe(true));
}

describe("City box, 'Oslo'", () => {
  it("lists the city (the municipality) first, selectable, with no hint; the region is last, with its hint", async () => {
    const picked: GeoPlace[] = [];
    await type("city", "Oslo", 4, (p) => void picked.push(p));
    await waitFor(() => expect(lines().filter((l) => /no containing place|in /.test(l)).length).toBe(4));
    const l = lines();
    expect(l[0]).toMatch(/^Oslo \| municipality · in Norway \| -$/);
    expect(l[1]).toMatch(/^Oslo Township \| municipality · in United States \| -$/);
    expect(l[2]).toMatch(/^Oslo kommune \| municipality · no containing place recorded \| -$/);
    expect(l[3]).toMatch(/^Oslo \| region · in Norway \| HINT$/);
    expect(screen.getAllByRole("option")[3]!.textContent).toContain("goes in your Region field, not City");
    fireEvent.click(screen.getAllByRole("option")[0]!);
    await waitFor(() => expect(picked.map((p) => p.id)).toEqual([`${GEO}/oslo`]));
  });
});

describe("the other cities Kai named", () => {
  it("Bergen: the municipality in Norway is first and not hinted", async () => {
    await type("city", "Bergen", 3);
    expect(lines()[0]).toMatch(/^Bergen \| municipality · in Norway \| -$/);
    expect(lines().every((x) => x.endsWith("| -"))).toBe(true);
  });

  it("Stockholm: the municipality first, the county (a region) last with its hint", async () => {
    await type("city", "Stockholm", 2);
    const l = lines();
    expect(l[0]).toMatch(/^Stockholm Municipality \| municipality · in Sweden \| -$/);
    expect(l[1]).toMatch(/^Stockholm County \| region · in Sweden \| HINT$/);
  });

  it("Springfield: the city, the township and the town are all offered as cities", async () => {
    await type("city", "Springfield", 3);
    expect(lines().map((x) => x.split(" | ")[1])).toEqual(["city · in United States", "municipality · in United States", "town · in United States"]);
    expect(lines().every((x) => x.endsWith("| -"))).toBe(true);
  });
});

describe("the Region box", () => {
  it("'Oslo' offers the region, as a region, with no hint", async () => {
    await type("region", "Oslo", 1);
    expect(lines()).toEqual(["Oslo | region · in Norway | -"]);
  });
});

describe("the country value keeps the picked country's entity reference (the card draws the country's flag from it)", () => {
  it("a bound country's value carries the catalogue id", () => {
    const norway: GeoPlace = { id: `${GEO}/no`, label: "Norway", type: "Country", memberOf: [] };
    render(<PlacePicker rung="country" label="Country" value={norway} onPick={() => {}} onClear={() => {}} />);
    expect(screen.getByTestId("place-country-value").getAttribute("data-place-id")).toBe(`${GEO}/no`);
  });
});
