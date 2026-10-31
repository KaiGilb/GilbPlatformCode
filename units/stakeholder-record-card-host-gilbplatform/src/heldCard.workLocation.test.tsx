// The held card's work place (host 0.5.0), inside the provider alone: the record card, the provider's host, the real `employment-rows`, the real
// `work-location-field` and `work-place-name`, a fake platform and a fake place catalogue (`test/geoWorld.ts`).
// What is pinned: a stored place is drawn by its NAME with what it is and where (never an address); the Location box keeps the name on a click; picking a
// place is ONE PATCH of that employment naming only the place (besides the company and titles every update carries); emptying it is exactly a null for the
// place; a name not known is SAID ("A place" and why); a compact stored place reads as an address because the host passes the catalogue's origin; the write
// guard holds a section read-only whose target is the catalogue; and nothing but a GET ever goes to the catalogue.
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StakeholderCardGilbPlatformProvider } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { GEO, P, createWorld, type World } from "../test/world";
import { heldWorld } from "../test/heldWorld";
import { GONE, OSLO, OSLO_TOWNSHIP, geoWorld, type GeoWorld } from "../test/geoWorld";
import { providerProps } from "../test/harness";
import { addLanguageTerms } from "../test/languagesWorld";
import { __resetGeoCache, __resetGeoGrainCache } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { GEO_WRITE_REFUSED_SAYS, HeldStakeholderCard } from "./index";

vi.setConfig({ testTimeout: 30000 });

let world: World;
let geo: GeoWorld;
let id: string;
let acme: string;
let entity: string;
const geoWritesSeen: string[] = [];
const EVIL = "https://evil.example/base/e/osm-r-1";

function seed(place: unknown, extraEdges: unknown[] = []) {
  acme = world.platform.seed(P, "t:Employment", { "a:org": "Acme AS", "a:jobTitle": "Welder", "a:startDate": "2019-03", "a:ongoing": true, ...(place === undefined ? {} : { "a:workLocation": place }) });
  entity = world.platform.seed(P, "t:Person", { "a:name": "Ben Larsen", "a:givenName": "Ben", "a:familyName": "Larsen", "a:employment": [{ "@id": acme }, ...extraEdges] });
  id = entity.slice(entity.lastIndexOf("/") + 1);
  geo = geoWorld(world, heldWorld(world).fetch as typeof fetch);
  vi.stubGlobal("fetch", geo.fetch);
}
beforeEach(async () => {
  __resetGeoCache();
  __resetGeoGrainCache();
  world = await createWorld();
  addLanguageTerms(world);
});
afterEach(() => {
  // the world-level proof, per test: nothing but a GET went to the catalogue
  for (const c of world.calls) if (c.url.startsWith(GEO) && c.method !== "GET") geoWritesSeen.push(`${c.method} ${c.url}`);
});
afterAll(() => expect(geoWritesSeen).toEqual([]));

function mount() {
  return render(
    <StakeholderCardGilbPlatformProvider {...providerProps(world, { viewedVaultId: P })}>
      <HeldStakeholderCard recordId={id} vaultId={P} />
    </StakeholderCardGilbPlatformProvider>,
  );
}
const ready = () => waitFor(() => expect(screen.getByTestId("contact-note-editor")).toBeTruthy(), { timeout: 6000 });
const section = () => screen.findByTestId("employment-rows", {}, { timeout: 6000 });
const writes = () => world.calls.filter((c) => c.method !== "GET");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NO_ADDRESS = /:\/\/|\/base\/e\/|osm-r|geo\.example|evil\.example/;
/** Everything a person or a screen reader can get from the section: text, names, titles, placeholders, input values (not `data-*`). */
function readable(root: HTMLElement): string {
  const out: string[] = [root.textContent ?? ""];
  root.querySelectorAll<HTMLElement>("*").forEach((e) => {
    for (const a of ["aria-label", "title", "placeholder", "alt"]) {
      const v = e.getAttribute(a);
      if (v) out.push(v);
    }
    if (e instanceof HTMLInputElement) out.push(e.value);
  });
  return out.join("\n");
}
async function inEdit() {
  await ready();
  const s = await section();
  await waitFor(() => expect(within(s).getAllByTestId("employment-company-value")).toHaveLength(1), { timeout: 6000 });
  await userEvent.click(screen.getByTestId("card-edit"));
  const box = (await within(s).findByRole("textbox", { name: "Role location" }, { timeout: 4000 })) as HTMLInputElement;
  return { s, box };
}

describe("a stored place is drawn by its name", () => {
  test("presentation: the name, and under it what it is and where; no address, host or id anywhere", async () => {
    seed({ "@id": OSLO });
    mount();
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getByTestId("experience-role-place").textContent).toBe("Oslo"), { timeout: 6000 });
    await waitFor(() => expect(within(s).getByTestId("experience-role-place-kind").textContent).toBe("municipality · in Norway"), { timeout: 6000 });
    expect(readable(s)).not.toMatch(NO_ADDRESS);
    expect(writes()).toEqual([]);
  });

  test("edit: the Location box shows the name and a click keeps it", async () => {
    seed({ "@id": OSLO });
    mount();
    const { s, box } = await inEdit();
    await waitFor(() => expect(box.value).toBe("Oslo"), { timeout: 6000 });
    await userEvent.click(box);
    expect(box.value).toBe("Oslo");
    expect(readable(s)).not.toMatch(NO_ADDRESS);
    await act(async () => {
      await sleep(300);
    });
    expect(writes()).toEqual([]);
  });

  test("a place stored in the compact form (base:e/<id>) reads as that place, because the host passes the catalogue's origin", async () => {
    seed({ "@id": "base:e/osm-r-oslo" });
    mount();
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getByTestId("experience-role-place").textContent).toBe("Oslo"), { timeout: 6000 });
    expect(world.calls.some((c) => c.method === "GET" && c.url === OSLO)).toBe(true);
  });
});

describe("a stored place whose name is not known is said", () => {
  test("a place of another host: 'A place', that it is not the catalogue's, no address, and NO request to that host", async () => {
    seed({ "@id": EVIL });
    mount();
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getByTestId("experience-role-place-kind").textContent).toMatch(/not in the place catalogue this app uses/), { timeout: 6000 });
    expect(within(s).getByTestId("experience-role-place").textContent).toBe("A place");
    expect(readable(s)).not.toMatch(NO_ADDRESS);
    expect(world.calls.filter((c) => c.url.startsWith("https://evil.example"))).toEqual([]);
  });

  test("a failed read: 'A place' and that the name could not be read; the place stays stored (nothing written)", async () => {
    seed({ "@id": OSLO });
    geo.down.add(OSLO);
    mount();
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getByTestId("experience-role-place-kind").textContent).toBe("The name of this place could not be read right now."), { timeout: 6000 });
    expect(within(s).getByTestId("experience-role-place").textContent).toBe("A place");
    expect(writes()).toEqual([]);
  });

  test("a place the catalogue no longer holds (404): 'A place' and 'That place is no longer in the catalogue.'", async () => {
    seed({ "@id": GONE });
    mount();
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getByTestId("experience-role-place-kind").textContent).toBe("That place is no longer in the catalogue."), { timeout: 6000 });
    expect(within(s).getByTestId("experience-role-place").textContent).toBe("A place");
  });

  test("edit: the box says 'A place' and why, never an empty box over a stored place", async () => {
    seed({ "@id": GONE });
    mount();
    const { s, box } = await inEdit();
    await waitFor(() => expect(within(s).getByTestId("work-location-missing")).toBeTruthy(), { timeout: 6000 });
    expect(box.value).toBe("A place");
  });
});

describe("choosing and clearing the place write the one fact", () => {
  test("picking a place is ONE PATCH of that employment: the place as an address, no date key, no other null; the record is not written", async () => {
    seed({ "@id": OSLO });
    mount();
    const { s, box } = await inEdit();
    await waitFor(() => expect(box.value).toBe("Oslo"), { timeout: 6000 });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "Oslo" } });
    const options = await within(s).findAllByRole("option", {}, { timeout: 4000 });
    const township = options.find((o) => /Oslo Township/.test(o.textContent ?? ""))!;
    await userEvent.click(township);
    await waitFor(() => expect(writes()).toHaveLength(1), { timeout: 4000 });
    await act(async () => {
      await sleep(300);
    });
    expect(writes()).toHaveLength(1);
    const w = writes()[0]!;
    expect(w.method).toBe("PATCH");
    expect(w.url).toBe(acme.replace("/base/e/", "/lws/r/"));
    // The company and the titles go with every update of the employment (H12); the place is the only thing that changed.
    expect(JSON.parse(w.body!)).toEqual({ "a:org": "Acme AS", "a:jobTitle": "Welder", "a:workLocation": { "@id": OSLO_TOWNSHIP } });
    expect(world.platform.entities.get(acme)!.facts["a:workLocation"]).toEqual({ "@id": OSLO_TOWNSHIP });
    expect(world.platform.entities.get(entity)!.facts["a:employment"]).toEqual([{ "@id": acme }]);
  });

  test("emptying the box clears the place: ONE PATCH whose place is exactly null", async () => {
    seed({ "@id": OSLO });
    mount();
    const { box } = await inEdit();
    await waitFor(() => expect(box.value).toBe("Oslo"), { timeout: 6000 });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "" } });
    await waitFor(() => expect(writes()).toHaveLength(1), { timeout: 4000 });
    await act(async () => {
      await sleep(300);
    });
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(writes()[0]!.body!)).toEqual({ "a:org": "Acme AS", "a:jobTitle": "Welder", "a:workLocation": null });
    expect(writes()[0]!.url).toBe(acme.replace("/base/e/", "/lws/r/"));
  });

  test("a title edit with a place stored writes no place (it is carried, not touched)", async () => {
    seed({ "@id": OSLO });
    mount();
    const { s } = await inEdit();
    const title = await within(s).findAllByLabelText("Edit Employment Job title", {}, { timeout: 4000 });
    await userEvent.click(title[0]!);
    const input = within(s).getByDisplayValue("Welder");
    await userEvent.clear(input);
    await userEvent.type(input, "Senior welder{Enter}");
    await waitFor(() => expect(writes()).toHaveLength(1), { timeout: 4000 });
    expect(JSON.parse(writes()[0]!.body!)).toEqual({ "a:org": "Acme AS", "a:jobTitle": "Senior welder" });
    expect(world.platform.entities.get(acme)!.facts["a:workLocation"]).toEqual({ "@id": OSLO });
  });

  test("a date edit with a place stored names the dates and NOT the place (it is carried, not rewritten)", async () => {
    seed({ "@id": OSLO });
    mount();
    const { s } = await inEdit();
    await userEvent.click(within(s).getByRole("checkbox", { name: "Role is current" }));
    await waitFor(() => expect(writes()).toHaveLength(1), { timeout: 4000 });
    await act(async () => {
      await sleep(300);
    });
    expect(writes()).toHaveLength(1);
    const body = JSON.parse(writes()[0]!.body!) as Record<string, unknown>;
    expect(Object.keys(body)).not.toContain("a:workLocation");
    expect(Object.keys(body)).toContain("a:ongoing");
    expect(world.platform.entities.get(acme)!.facts["a:workLocation"]).toEqual({ "@id": OSLO });
  });

  test("a stored place of another host is carried when something else is edited, and never asked for", async () => {
    seed({ "@id": EVIL });
    mount();
    const { s } = await inEdit();
    const title = await within(s).findAllByLabelText("Edit Employment Job title", {}, { timeout: 4000 });
    await userEvent.click(title[0]!);
    const input = within(s).getByDisplayValue("Welder");
    await userEvent.clear(input);
    await userEvent.type(input, "Senior welder{Enter}");
    await waitFor(() => expect(writes()).toHaveLength(1), { timeout: 4000 });
    expect(JSON.parse(writes()[0]!.body!)).toEqual({ "a:org": "Acme AS", "a:jobTitle": "Senior welder" });
    expect(world.platform.entities.get(acme)!.facts["a:workLocation"]).toEqual({ "@id": EVIL });
    expect(world.calls.filter((c) => c.url.startsWith("https://evil.example"))).toEqual([]);
  });
});

describe("the write guard (decision 2b): a section whose target is the place catalogue cannot be written", () => {
  test("an employment edge that names a catalogue row: the section is read-only, says why, and offers no control that writes", async () => {
    seed({ "@id": OSLO }, [{ "@id": OSLO }]);
    mount();
    await ready();
    const s = await section();
    await waitFor(() => expect(screen.getByTestId("employment-geo-refused")).toBeTruthy(), { timeout: 6000 });
    expect(screen.getByTestId("employment-geo-refused").textContent).toBe(GEO_WRITE_REFUSED_SAYS);
    await userEvent.click(screen.getByTestId("card-edit"));
    await act(async () => {
      await sleep(400);
    });
    expect(within(s).queryByText("add employment")).toBeNull();
    expect(within(s).queryByRole("button", { name: /Remove employment/ })).toBeNull();
    expect(within(s).queryByRole("textbox", { name: "Role location" })).toBeNull();
    expect(writes()).toEqual([]);
  });

  test("control: the same card without a catalogue target has the controls and no such line", async () => {
    seed({ "@id": OSLO });
    mount();
    const { s } = await inEdit();
    expect(within(s).getByText("add employment")).toBeTruthy();
    expect(screen.queryByTestId("employment-geo-refused")).toBeNull();
  });
});
