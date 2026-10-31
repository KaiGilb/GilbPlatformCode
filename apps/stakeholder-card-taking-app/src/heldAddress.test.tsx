// The held card's Address section, end to end in the app (fakes only): "+ Add your own" makes a record, the platform's world holds two addresses about it in two countries, and the
// held card draws each by its heading and its lines, the places by NAME, never an address. Opening the card is reads only: no write of the section's, nothing but a GET to the catalogue,
// and no request to any host but the platform's, the catalogue's and the ontology's. The only writes are the ones "+ Add your own" makes.
import { describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __resetGeoCache, __resetGeoGrainCache } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { __resetPlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import { __resetTermSlotsForTest } from "@kaigilb/gilbplatformcode-term-slots";
import { TEST_SETTINGS, signedInApp } from "../test/helpers";
import { BASE, BEN, GEO, HOST, ONTOLOGY } from "../test/world";
import type { World } from "../test/world";
import { catalogueCalls, withHeldAddressesOnNewRecord } from "../test/heldAddressWorld";

async function heldCardWithAddresses() {
  let world!: World;
  catalogueCalls.length = 0;
  // each test starts from a first visit: the catalogue, the address vocabulary and the term answers are asked afresh
  __resetGeoCache();
  __resetGeoGrainCache();
  __resetPlaceVocab();
  __resetTermSlotsForTest();
  const s = await signedInApp({}, TEST_SETTINGS, (next) => withHeldAddressesOnNewRecord(next, () => world));
  world = s.world;
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText(/Person's principal/));
  await user.type(screen.getByLabelText(/Person's principal/), BEN);
  await user.click(screen.getByRole("button", { name: "Show card" }));
  await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
  await user.click(screen.getByTestId("add-own"));
  const held = await screen.findByRole("region", { name: "Record card" }, { timeout: 8000 });
  return { ...s, held };
}
const group = (held: HTMLElement) => within(held).findByRole("region", { name: "Postal Address" }, { timeout: 8000 });

describe("the held card's Address", () => {
  test("a person with two addresses in two countries: each is drawn by its heading and lines, the places by name (never an address), the flags as the neutral globe where the catalogue holds none", async () => {
    const { held } = await heldCardWithAddresses();
    const g = await group(held);
    await waitFor(() => expect(within(g).getAllByTestId("place-claim")).toHaveLength(2), { timeout: 8000 });
    await waitFor(() => expect(within(g).getAllByTestId("place-view-region-country").map((n) => n.textContent).sort()).toEqual(["Norway", "United States"]), { timeout: 8000 });
    expect(within(g).getByRole("heading", { name: "home" })).toBeTruthy();
    expect(within(g).getByRole("heading", { name: "cabin" })).toBeTruthy();
    expect(g.textContent).toContain("Storgata 1");
    expect(g.textContent).toContain("0155 Oslo");
    expect(g.textContent).toContain("Main St 5");
    expect(g.textContent).toContain("Springfield");
    expect(g.textContent).not.toContain("://");
    expect(g.textContent).not.toMatch(/osm-r-/);
    expect(within(g).getAllByTestId("flag-image").length).toBeGreaterThan(0);
  }, 30_000);

  test("opening and idling write nothing for the section: the writes are \"+ Add your own\"'s alone; nothing but a GET reaches the catalogue; only the platform's, the catalogue's and the ontology's hosts are asked", async () => {
    const { world, held } = await heldCardWithAddresses();
    const g = await group(held);
    await waitFor(() => expect(within(g).getAllByTestId("place-claim")).toHaveLength(2), { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 500));
    const writes = world.calls.filter((c) => c.method !== "GET" && !/\/base\/tag\/masters$/.test(c.url));
    expect(writes.every((c) => /\/lws\/vault\/[^/]+\/c$/.test(c.url) || c.method === "PATCH")).toBe(true);
    // nothing of the section's: the one create is the person's; no PATCH names an address term; no DELETE at all
    expect(writes.filter((w) => w.method === "POST")).toHaveLength(1);
    expect(JSON.parse(writes.find((w) => w.method === "POST")!.body ?? "{}")).toMatchObject({ type: "t:Person" });
    for (const w of writes.filter((x) => x.method === "PATCH")) expect(w.body ?? "").not.toMatch(/placeClaimLabel|streetLine|claimPlace|claimSubject|detailOf|postalCode|addressLine/);
    expect(world.calls.filter((c) => c.method === "DELETE")).toEqual([]);
    expect(catalogueCalls.length).toBeGreaterThan(0);
    expect(catalogueCalls.filter((c) => c.method !== "GET")).toEqual([]);
    const allowed = new Set([BASE, HOST, GEO, ONTOLOGY, "https://id.example.test", "https://ontology.platform.example.test"].map((u) => new URL(u).origin));
    expect([...new Set(world.calls.map((c) => new URL(c.url).origin))].filter((o) => !allowed.has(o))).toEqual([]);
    // the section's listings went to the vault that holds the record
    expect(world.calls.some((c) => c.method === "GET" && /\/lws\/vault\/[^/]+\/records\?.*type=PlaceClaim/.test(c.url))).toBe(true);
  }, 30_000);
});
