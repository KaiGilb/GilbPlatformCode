// @vitest-environment jsdom
// Ported from GilbApp `src/components/mynet/WorkLocationField.s8cardlook.test.tsx` (commit a703b3ed): the same cases against the unit. Changes: the import paths and the world (`test/world.ts`).
// Cycle214 s8 "card look" — Kai, 2026-10-16, on THIS box (employment Location): "typing 'Oslo' shows four rows
// 'Oslo / Oslo / Oslo kommune / Oslo Township' with no way to tell them apart". The same shared lookup as the address pickers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkLocationField } from "./index";
import { GEO, setCatalogueMode, useWorld } from "../test/world";

useWorld();
afterEach(cleanup);
beforeEach(() => setCatalogueMode("oslo-live"));

async function open(onChange = vi.fn()) {
  render(<WorkLocationField placeId="" label="" onChange={onChange} />);
  const box = screen.getByRole("textbox", { name: "Role location" });
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "Oslo" } });
  await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
  return onChange;
}

describe("the Location box tells the four Oslo rows apart", () => {
  it("each row carries its kind and its container; no two read the same", async () => {
    await open();
    await waitFor(() => {
      const lines = screen.getAllByRole("option").map((o) => o.textContent ?? "");
      expect(lines.some((l) => /^Oslomunicipality · in Norway$/.test(l))).toBe(true);
      expect(lines.some((l) => /^Osloregion · in Norway$/.test(l))).toBe(true);
      expect(lines.some((l) => /^Oslo kommunemunicipality · no containing place recorded$/.test(l))).toBe(true);
      expect(lines.some((l) => /^Oslo Townshipmunicipality · in United States$/.test(l))).toBe(true);
      expect(new Set(lines).size).toBe(4);
    });
  });

  it("picking a row still stores that row's own address, whichever Oslo it is", async () => {
    const onChange = await open();
    await waitFor(() => expect(screen.getAllByRole("option").some((o) => /in United States/.test(o.textContent ?? ""))).toBe(true));
    fireEvent.click(screen.getAllByRole("option").find((o) => /Oslo Township/.test(o.textContent ?? ""))!);
    expect(onChange).toHaveBeenCalledWith({ placeId: `${GEO}/oslo-township`, placeLabel: "Oslo Township" });
  });

  it("every row is a touch target of at least 44 px and the list is a labelled listbox", async () => {
    await open();
    const list = screen.getByRole("listbox");
    expect(list.getAttribute("aria-label")).toBeTruthy();
    for (const o of screen.getAllByRole("option")) expect(o.className).toMatch(/min-h-11/);
  });
});
