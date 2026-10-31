// The held card's Employment section, end to end in the app (fakes only): "+ Add your own" makes a record, the platform's world gives that record two employments, and the
// held card draws each by its COMPANY NAME, its role line and its titles, never an address (since host 0.5.0 the work place is drawn too, by its name; this world serves no catalogue, so a place is "A place"). Reading makes no write of the
// section's: the only writes are the ones "+ Add your own" makes. Both tests are the app's own proof that the host 0.4.0 supplies the section (the installed host copy with
// the slot taken out makes them fail).
import { describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TEST_SETTINGS, signedInApp } from "../test/helpers";
import { BEN } from "../test/world";
import type { World } from "../test/world";
import { addEmploymentTerms, seededEmployments, withHeldEmploymentsOnNewRecord } from "../test/heldEmploymentWorld";

async function heldCardWithEmployments() {
  let world!: World;
  seededEmployments.length = 0;
  const s = await signedInApp({}, TEST_SETTINGS, (next) => withHeldEmploymentsOnNewRecord(next, () => world));
  world = s.world;
  addEmploymentTerms(world);
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText(/Person's principal/));
  await user.type(screen.getByLabelText(/Person's principal/), BEN);
  await user.click(screen.getByRole("button", { name: "Show card" }));
  await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
  await user.click(screen.getByTestId("add-own"));
  const held = await screen.findByRole("region", { name: "Record card" }, { timeout: 8000 });
  return { ...s, held };
}

describe("the held card's Employment", () => {
  test("each employment is drawn by its company name, its role line and its titles: no address; a place whose name is not known is \"A place\"", async () => {
    const { held } = await heldCardWithEmployments();
    const section = await within(held).findByTestId("employment-rows", {}, { timeout: 8000 });
    await waitFor(() => expect(within(section).getAllByTestId("employment-company-value").map((n) => n.textContent)).toEqual(["Acme AS", "Beta Holding"]), { timeout: 8000 });
    expect(within(section).getAllByTestId("employment-title-value").map((n) => n.textContent)).toEqual(["Welder", "Chair", "Founder"]);
    const lines = within(section).getAllByTestId("experience-role").map((n) => n.textContent ?? "");
    expect(lines[0]).toMatch(/Mar 2019 – Present/);
    expect(lines[1]).toMatch(/2012 – .*2018/);
    expect(section.textContent).not.toContain("://");
    expect(section.textContent).not.toMatch(/osm-|Oslo|geo\./);
    expect(within(section).getAllByTestId("experience-role-place").map((n) => n.textContent)).toEqual(["A place"]);
  }, 30_000);

  test("opening and idling the card write nothing for the section: the writes are \"+ Add your own\"'s alone, and no employment entity is written or deleted", async () => {
    const { world, held } = await heldCardWithEmployments();
    const section = await within(held).findByTestId("employment-rows", {}, { timeout: 8000 });
    await waitFor(() => expect(within(section).getAllByTestId("employment-company-value")).toHaveLength(2), { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 400));
    const writes = world.calls.filter((c) => c.method !== "GET" && !/\/base\/tag\/masters$/.test(c.url));
    expect(writes.every((c) => /\/lws\/vault\/[^/]+\/c$/.test(c.url) || c.method === "PATCH")).toBe(true);
    for (const c of writes.filter((w) => w.method === "PATCH")) expect(c.body ?? "").not.toMatch(/employment|jobTitle|org"|startDate|endDate|ongoing|workLocation/i);
    const entities = seededEmployments.flatMap((e) => [e.running, e.ended].map((u) => u.replace("/base/e/", "/lws/r/")));
    expect(world.calls.filter((c) => entities.includes(c.url) && c.method !== "GET")).toEqual([]);
    expect(world.calls.filter((c) => c.method === "DELETE")).toEqual([]);
    expect(world.calls.filter((c) => c.url.includes("org-find"))).toEqual([]);
    expect(writes.filter((w) => w.method === "POST")).toHaveLength(1);
  }, 30_000);
});
