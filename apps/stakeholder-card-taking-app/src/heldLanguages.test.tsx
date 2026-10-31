// The held card's Languages section, end to end in the app (fakes only): "+ Add your own" makes a record, the platform's world holds one held Norwegian claim about it,
// and the held card draws that language by its NAME and its FLAG, never its address. Reading makes no write of the section's: the only writes are the ones "+ Add your own" makes.
import { describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TEST_SETTINGS, signedInApp } from "../test/helpers";
import { BEN } from "../test/world";
import type { World } from "../test/world";
import { addLanguageTerms, withHeldLanguageOnNewRecord } from "../test/heldLanguageWorld";
import { COUNTRY_NO, LANGUAGE_NO, languageWorld, type LanguageWorld } from "../test/languageWorld";

async function heldCardWithLanguage() {
  let lw!: LanguageWorld;
  let world!: World;
  const s = await signedInApp({}, TEST_SETTINGS, (next) => {
    lw = languageWorld(withHeldLanguageOnNewRecord(next, () => world));
    return lw.fetch;
  });
  world = s.world;
  addLanguageTerms(world);
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText(/Person's principal/));
  await user.type(screen.getByLabelText(/Person's principal/), BEN);
  await user.click(screen.getByRole("button", { name: "Show card" }));
  await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
  await user.click(screen.getByTestId("add-own"));
  const held = await screen.findByRole("region", { name: "Record card" }, { timeout: 8000 });
  return { ...s, lw, held };
}

describe("the held card's Languages", () => {
  test("the section draws a held language by its name and its flag, and shows no address", async () => {
    const { held, lw } = await heldCardWithLanguage();
    const section = await within(held).findByTestId("languages-section", {}, { timeout: 8000 });
    await waitFor(() => expect(within(section).getByTestId("language-row-value").textContent).toBe("Norwegian"), { timeout: 8000 });
    await waitFor(() => expect(within(section).getByTestId("flag-image").getAttribute("data-flag-state")).toBe("flag"), { timeout: 8000 });
    expect(within(section).getByRole("img", { name: "Flag of Norway" }).getAttribute("data-flag-country")).toBe(COUNTRY_NO);
    expect(section.textContent).not.toContain("://");
    expect(section.textContent).not.toContain("lang-norwegian");
    // The entry at its own address and the two small flag files, all by GET; never a country entity.
    const asked = lw.asked.map((c) => c.url);
    expect(asked).toContain(LANGUAGE_NO);
    expect(lw.asked.every((c) => c.method === "GET")).toBe(true);
    for (const url of asked) expect(url === LANGUAGE_NO || /^https:\/\/geo\.example\.test\/(files|base\/e)\/flag-osm-r-\d+$/.test(url), url).toBe(true);
  }, 30_000);

  test("opening and idling the card write nothing for the section: the writes are \"+ Add your own\"'s alone", async () => {
    const { world, held } = await heldCardWithLanguage();
    const section = await within(held).findByTestId("languages-section", {}, { timeout: 8000 });
    await waitFor(() => expect(within(section).getByTestId("language-row-value").textContent).toBe("Norwegian"), { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 400));
    const writes = world.calls.filter((c) => c.method !== "GET" && !/\/base\/tag\/masters$/.test(c.url));
    expect(writes.every((c) => /\/lws\/vault\/[^/]+\/c$/.test(c.url) || c.method === "PATCH")).toBe(true);
    // The PATCH is the link "+ Add your own" writes on the record it made; none carries a language key.
    for (const c of writes.filter((w) => w.method === "PATCH")) expect(c.body ?? "").not.toMatch(/language|flag/i);
    expect(writes.filter((w) => w.method === "POST")).toHaveLength(1);
  }, 30_000);
});
