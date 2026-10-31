// The online card of a person who shares a language: the row shows the language's name and its flag, never its address (the language
// entry and the flag files are answered by test/languageWorld.ts; nothing else is asked for).
import { describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TEST_SETTINGS, signedInApp } from "../test/helpers";
import { BEN, BEN_FIELDS } from "../test/world";
import { COUNTRY_NO, COUNTRY_UK, COUNTRY_US, LANGUAGE_EN, LANGUAGE_NO, languageWorld, type LanguageWorld } from "../test/languageWorld";

async function cardWith(language: string) {
  let lw!: LanguageWorld;
  const s = await signedInApp({ ben: { ...BEN_FIELDS, "a:languageUsed": language } }, TEST_SETTINGS, (next) => ((lw = languageWorld(next)).fetch));
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText(/Person's principal/));
  await user.type(screen.getByLabelText(/Person's principal/), BEN);
  await user.click(screen.getByRole("button", { name: "Show card" }));
  await waitFor(() => expect(screen.getByTestId("online-stakeholder-card")).toBeTruthy());
  return { ...s, lw };
}

describe("a language of their online card", () => {
  test("a language in one country: its name and that country's flag, and no address anywhere on the card", async () => {
    const { world, lw } = await cardWith(LANGUAGE_NO);
    const card = screen.getByTestId("online-stakeholder-card");
    await waitFor(() => expect(within(card).getByTestId("language-row-name").textContent).toBe("Norwegian"));
    await waitFor(() => expect(within(card).getByRole("img", { name: "Flag of Norway" }).getAttribute("data-flag-country")).toBe(COUNTRY_NO));
    expect(card.textContent).not.toContain("://");
    expect(card.textContent).not.toContain(LANGUAGE_NO);
    // Only the entry and the two small flag files were asked for, all by GET, never a country.
    expect(lw.asked.length).toBeGreaterThan(0);
    expect(lw.asked.every((c) => c.method === "GET")).toBe(true);
    for (const { url } of lw.asked) expect(url === LANGUAGE_NO || /^https:\/\/geo\.example\.test\/(files|base\/e)\/flag-osm-r-\d+$/.test(url), url).toBe(true);
    expect(world.calls.filter((c) => c.method !== "GET" && !/\/base\/tag\/masters$/.test(c.url))).toEqual([]);
  });

  test("a language in several countries: its name and the globe, and no flag is asked for", async () => {
    const { lw } = await cardWith(LANGUAGE_EN);
    const card = screen.getByTestId("online-stakeholder-card");
    await waitFor(() => expect(within(card).getByTestId("language-row-name").textContent).toBe("English"));
    expect(within(card).getByTestId("flag-image").getAttribute("data-flag-state")).toBe("globe");
    expect(lw.asked.map((c) => c.url)).toEqual([LANGUAGE_EN]);
    expect(lw.asked.map((c) => c.url)).not.toContain(COUNTRY_UK);
    expect(lw.asked.map((c) => c.url)).not.toContain(COUNTRY_US);
    expect(card.textContent).not.toContain("://");
  });

  test("a language the catalogue does not answer: 'A language' and the globe, never the address", async () => {
    await cardWith("https://catalogue.example.test/base/e/lang-unknown");
    const card = screen.getByTestId("online-stakeholder-card");
    await waitFor(() => expect(within(card).getByTestId("language-row").getAttribute("data-language-state")).toBe("failed"));
    expect(within(card).getByTestId("language-row-name").textContent).toBe("A language");
    expect(card.textContent).not.toContain("lang-unknown");
  });
});
