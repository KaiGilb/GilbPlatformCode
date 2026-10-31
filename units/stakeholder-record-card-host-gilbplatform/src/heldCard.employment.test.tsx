// The held card's Employment section with the host 0.4.0 builds, inside the provider alone (the record card, the provider's host, the real `employment-rows`, a fake platform).
// What is pinned: the section draws each employment by company, role line and title (never an address); mounting, drawing and idling write nothing; one edit is one PATCH of exactly
// what changed (no null the person did not ask for); a stored work place is carried and not cleared (since 0.5.0 it is also drawn by name: `heldCard.workLocation.test.tsx`); with the slot REMOVED from the host the card is exactly the card of the 0.3.0 host.
import { useMemo } from "react";
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StakeholderCardGilbPlatformProvider, useStakeholderCardPlatform } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { StakeholderRecordCard, StakeholderRecordCardHostContext, type StakeholderRecordCardProps } from "@kaigilb/gilbplatformcode-stakeholder-record-card";
import { GEO, P, createWorld, type World } from "../test/world";
import { heldWorld } from "../test/heldWorld";
import { providerProps } from "../test/harness";
import { NORWAY, NORWEGIAN, addLanguageTerms, languagesWorld } from "../test/languagesWorld";
import { PHOTOGRAPHY, WELDING, addSkillTerms } from "../test/skillsWorld";
import { __resetGeoCache, __resetGeoGrainCache } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { HeldStakeholderCard, createStakeholderRecordCardHost } from "./index";

// The world-level proof: across this file, nothing but a GET ever went to the place catalogue.
const geoWritesSeen: string[] = [];
afterEach(() => {
  for (const c of world.calls) if (c.url.startsWith(GEO) && c.method !== "GET") geoWritesSeen.push(`${c.method} ${c.url}`);
});
afterAll(() => expect(geoWritesSeen).toEqual([]));

let world: World;
let id: string;
let entity: string;
let acme: string;
let beta: string;
const PLACE = "https://geo.example.test/base/e/osm-r-2775550";

beforeEach(async () => {
  __resetGeoCache();
  __resetGeoGrainCache();
  world = await createWorld();
  addLanguageTerms(world);
  acme = world.platform.seed(P, "t:Employment", { "a:org": "Acme AS", "a:jobTitle": "Welder", "a:startDate": "2019-03", "a:ongoing": true, "a:workLocation": { "@id": PLACE } });
  beta = world.platform.seed(P, "t:Employment", { "a:org": "Beta Holding", "a:jobTitle": ["Chair", "Founder"], "a:startDate": "2012-05", "a:endDate": "2018-12" });
  entity = world.platform.seed(P, "t:Person", { "a:name": "Ben Larsen", "a:givenName": "Ben", "a:familyName": "Larsen", "a:employment": [{ "@id": acme }, { "@id": beta }] });
  id = entity.slice(entity.lastIndexOf("/") + 1);
  vi.stubGlobal("fetch", heldWorld(world).fetch as typeof fetch);
});

function mount(card: React.ReactNode) {
  return render(<StakeholderCardGilbPlatformProvider {...providerProps(world, { viewedVaultId: P })}>{card}</StakeholderCardGilbPlatformProvider>);
}
/** The host as 0.3.0 built it, member by member (no Employment). */
function CardWith030Host(props: StakeholderRecordCardProps) {
  const platform = useStakeholderCardPlatform();
  const host = useMemo(() => {
    const h = createStakeholderRecordCardHost(platform);
    const { renderEmployment: _gone, ...rest } = h;
    void _gone;
    return { useShell: rest.useShell, photoReadKeys: rest.photoReadKeys, photoReadKeysSync: rest.photoReadKeysSync, vocabulary: rest.vocabulary, useRefLabel: rest.useRefLabel, renderLanguages: rest.renderLanguages, renderSkillsAndInterests: rest.renderSkillsAndInterests };
  }, [platform]);
  return (
    <StakeholderRecordCardHostContext.Provider value={host}>
      <StakeholderRecordCard {...props} />
    </StakeholderRecordCardHostContext.Provider>
  );
}
function CardWithoutSlot(props: StakeholderRecordCardProps) {
  const platform = useStakeholderCardPlatform();
  const host = useMemo(() => {
    const h = createStakeholderRecordCardHost(platform);
    delete h.renderEmployment;
    return h;
  }, [platform]);
  return (
    <StakeholderRecordCardHostContext.Provider value={host}>
      <StakeholderRecordCard {...props} />
    </StakeholderRecordCardHostContext.Provider>
  );
}
const ready = () => waitFor(() => expect(screen.getByTestId("contact-note-editor")).toBeTruthy(), { timeout: 6000 });
const writes = () => world.calls.filter((c) => c.method !== "GET");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const employmentRequests = () => world.calls.filter((c) => /\/base\/a\/(org|claimSlotKey|startDate|endDate|ongoing|workLocation)\b|\/base\/t\/Employment\b/.test(c.url) || c.url.includes(acme.replace("/base/e/", "/lws/r/")) || c.url.includes(beta.replace("/base/e/", "/lws/r/")));
const section = () => screen.findByTestId("employment-rows", {}, { timeout: 6000 });

describe("the slot is given (host 0.4.0)", () => {
  test("the Employment section draws each employment by company, role line and title, and no address; a stored place whose name is not known (this world serves no catalogue) is 'A place'", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getAllByTestId("employment-company-value").map((n) => n.textContent)).toEqual(["Acme AS", "Beta Holding"]), { timeout: 6000 });
    expect(within(s).getAllByTestId("employment-title-value").map((n) => n.textContent)).toEqual(["Welder", "Chair", "Founder"]);
    expect(within(s).getAllByTestId("experience-role").map((n) => n.textContent ?? "")[0]).toMatch(/Mar 2019 – Present/);
    expect(within(s).getAllByTestId("experience-role")[1]!.textContent).toMatch(/2012 – .*2018/);
    expect(s.textContent).not.toMatch(/:\/\//);
    expect(s.textContent).not.toMatch(/osm-|Oslo|geo\./);
    expect(within(s).getByTestId("experience-role-place").textContent).toBe("A place");
    expect(s.querySelector("[aria-label='Role location']")).toBeNull();
  });

  test("the section is titled by the master's label, and sits in the card once", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const s = await section();
    expect(within(s).getByRole("heading", { name: "Employment" })).toBeTruthy();
    expect(screen.getAllByTestId("employment-rows")).toHaveLength(1);
  });

  test("mounting, drawing and idling make zero writes, and only GETs are asked", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getAllByTestId("employment-company-value")).toHaveLength(2), { timeout: 6000 });
    await act(async () => {
      await sleep(500);
    });
    expect(writes()).toEqual([]);
  });

  test("opening the card for editing and closing it writes nothing; the add and remove controls come with edit mode", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getAllByTestId("employment-company-value")).toHaveLength(2), { timeout: 6000 });
    expect(within(s).queryByText("add employment")).toBeNull();
    await userEvent.click(screen.getByTestId("card-edit"));
    await waitFor(() => expect(within(s).getByText("add employment")).toBeTruthy(), { timeout: 4000 });
    expect(within(s).getByRole("button", { name: "Remove employment Acme AS" })).toBeTruthy();
    await act(async () => {
      await sleep(300);
    });
    expect(writes()).toEqual([]);
  });

  test("an unrelated edit is ONE PATCH of exactly that field: nothing of the section, no employment key, no null, no empty string", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    await waitFor(() => expect(screen.getByTestId("employment-rows")).toBeTruthy(), { timeout: 6000 });
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.type(screen.getByDisplayValue("Ben"), "x");
    await waitFor(() => expect(world.calls.filter((c) => c.method === "PATCH").length).toBe(1), { timeout: 4000 });
    await act(async () => {
      await sleep(300);
    });
    const patches = world.calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    const body = JSON.parse(patches[0]!.body!) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["a:givenName", "a:name"]);
    expect(Object.values(body).every((v) => v !== null && v !== "")).toBe(true);
    expect(writes().map((w) => w.method)).toEqual(["PATCH"]);
  });

  test("a title edit is ONE PATCH of that employment: its company and titles, no date, no place, no null; the record is not written", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getAllByTestId("employment-company-value")).toHaveLength(2), { timeout: 6000 });
    await userEvent.click(screen.getByTestId("card-edit"));
    const box = await within(s).findAllByLabelText("Edit Employment Job title", {}, { timeout: 4000 });
    await userEvent.click(box[0]!);
    const input = within(s).getByDisplayValue("Welder");
    await userEvent.clear(input);
    await userEvent.type(input, "Senior welder{Enter}");
    await waitFor(() => expect(writes()).toHaveLength(1), { timeout: 4000 });
    const w = writes()[0]!;
    expect(w.method).toBe("PATCH");
    expect(w.url).toBe(acme.replace("/base/e/", "/lws/r/"));
    expect(JSON.parse(w.body!)).toEqual({ "a:org": "Acme AS", "a:jobTitle": "Senior welder" });
    expect(world.platform.entities.get(acme)!.facts["a:workLocation"]).toEqual({ "@id": PLACE });
  });

  test("removing an employment drops its edge from the record and deletes nothing", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getAllByTestId("employment-company-value")).toHaveLength(2), { timeout: 6000 });
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.click(await within(s).findByRole("button", { name: "Remove employment Acme AS" }, { timeout: 4000 }));
    await waitFor(() => expect(writes()).toHaveLength(1), { timeout: 4000 });
    expect(writes()[0]!.method).toBe("PATCH");
    expect(JSON.parse(writes()[0]!.body!)).toEqual({ "a:employment": { "@id": beta } });
    expect(world.platform.entities.has(acme)).toBe(true);
    expect(world.calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });

  test("the company box asks no organization-vault finder: no request to org-find, ever", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getAllByTestId("employment-company-value")).toHaveLength(2), { timeout: 6000 });
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.click((await within(s).findAllByTestId("company-search-closed", {}, { timeout: 4000 }))[0]!);
    await userEvent.type(within(s).getByRole("textbox", { name: "Edit Employment Company" }), "Ac");
    await act(async () => {
      await sleep(600);
    });
    expect(world.calls.filter((c) => c.url.includes("org-find"))).toEqual([]);
    expect(world.unserved.filter((u) => u.includes("org-find"))).toEqual([]);
  });

  test("the company box names the vault it searched by the shell's name for it, and says the search was not made when the vault could not be asked", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getAllByTestId("employment-company-value")).toHaveLength(2), { timeout: 6000 });
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.click((await within(s).findAllByTestId("company-search-closed", {}, { timeout: 4000 }))[0]!);
    await userEvent.type(within(s).getByRole("textbox", { name: "Edit Employment Company" }), "Zz");
    // The fake platform does not serve the typed search, so the search fails: the box says so, naming the vault (the shell's name for it), and draws no miss.
    const alert = await within(s).findByRole("alert", {}, { timeout: 4000 });
    expect(alert.textContent).toContain("The search of Ann could not be made.");
    expect(within(s).queryByTestId("company-search-miss")).toBeNull();
    expect(s.textContent).not.toMatch(/No company named|No organization record named/);
    expect(writes()).toEqual([]);
  });
});

describe("the slot is REMOVED from the host", () => {
  test("no Employment section, no employment term or entity is read, and nothing is written", async () => {
    mount(<CardWithoutSlot recordId={id} vaultId={P} />);
    await ready();
    await waitFor(() => expect(screen.getAllByTestId("field-present").length).toBe(2), { timeout: 6000 });
    await act(async () => {
      await sleep(500);
    });
    expect(screen.queryByTestId("employment-rows")).toBeNull();
    expect(employmentRequests()).toEqual([]);
    expect(writes()).toEqual([]);
  });

  test("the card is exactly the card of the 0.3.0 host in the same world, and the section's own terms are not asked", async () => {
    const first = mount(<CardWith030Host recordId={id} vaultId={P} />);
    await ready();
    await waitFor(() => expect(screen.getAllByTestId("field-present").length).toBe(2), { timeout: 6000 });
    await act(async () => {
      await sleep(500);
    });
    // React's generated ids count up across mounts; they are the one thing that may differ.
    const sameIds = (html: string) => html.replace(/_r_[0-9a-z]+_/g, "_r_N_");
    const html030 = first.container.innerHTML;
    first.unmount();
    const second = mount(<CardWithoutSlot recordId={id} vaultId={P} />);
    await ready();
    await waitFor(() => expect(screen.getAllByTestId("field-present").length).toBe(2), { timeout: 6000 });
    await act(async () => {
      await sleep(500);
    });
    expect(sameIds(second.container.innerHTML)).toBe(sameIds(html030));
    expect(employmentRequests()).toEqual([]);
  });

  test("the same edit saves the same PATCH body with and without the slot", async () => {
    mount(<CardWithoutSlot recordId={id} vaultId={P} />);
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.type(screen.getByDisplayValue("Ben"), "x");
    await waitFor(() => expect(world.calls.filter((c) => c.method === "PATCH").length).toBe(1), { timeout: 4000 });
    const body = JSON.parse(world.calls.find((c) => c.method === "PATCH")!.body!) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["a:givenName", "a:name"]);
  });
});

describe("where the section stands, and what gates it", () => {
  test("with Skills, Interests and Languages on the card the Employment group comes once, after the Skills, Interests and Languages groups (the card's own order, as in GilbApp)", async () => {
    addSkillTerms(world);
    world.platform.entities.get(entity)!.facts["a:skill"] = [{ "@id": WELDING }];
    world.platform.entities.get(entity)!.facts["a:fieldMeta"] = { skill: { type: "skill", label: "welding", order: 7, access: "private", valueIndex: 0 } };
    world.platform.seed(P, "t:HeldPartyFieldClaim", { "a:heldParty": { "@id": entity }, "a:topicInterest": { "@id": PHOTOGRAPHY }, "a:topicInterestNote": "Long exposures", "a:statedBy": { "@id": world.ownCardUri! } });
    world.platform.seed(P, "t:HeldPartyFieldClaim", { "a:heldParty": { "@id": entity }, "a:languageUsed": { "@id": NORWEGIAN }, "a:statedBy": { "@id": world.ownCardUri! }, "a:flagCountry": { "@id": NORWAY } });
    vi.stubGlobal("fetch", languagesWorld(heldWorld(world).fetch as typeof fetch).fetch);
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    await section();
    const interests = await screen.findByTestId("interest-section", {}, { timeout: 6000 });
    const languages = await screen.findByTestId("languages-section", {}, { timeout: 6000 });
    const employment = screen.getByTestId("employment-rows");
    expect(screen.getAllByTestId("employment-rows")).toHaveLength(1);
    const before = (x: Element, y: Element) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(interests, languages)).toBe(true);
    expect(before(languages, employment)).toBe(true);
  }, 20000);

  test("the section has its own gate, not the Skill field's: on a master with no Skill field a person card whose field set has the Employment field still draws it", async () => {
    world = await createWorld();
      const emp = world.platform.seed(P, "t:Employment", { "a:org": "Acme AS", "a:jobTitle": "Welder" });
    const person = world.platform.seed(P, "t:Person", { "a:name": "Ben Larsen", "a:givenName": "Ben", "a:familyName": "Larsen", "a:employment": { "@id": emp } });
    vi.stubGlobal("fetch", heldWorld(world).fetch as typeof fetch);
    mount(<HeldStakeholderCard recordId={person.slice(person.lastIndexOf("/") + 1)} vaultId={P} />);
    await ready();
    const s = await section();
    await waitFor(() => expect(within(s).getAllByTestId("employment-company-value").map((n) => n.textContent)).toEqual(["Acme AS"]), { timeout: 6000 });
  });

  test("a record that is not a person card (an organization, no Employment field) draws no Employment section and reads no employment", async () => {
    const org = world.platform.seed(P, "t:Organization", { "a:name": "Nordlys AS" });
    mount(<HeldStakeholderCard recordId={org.slice(org.lastIndexOf("/") + 1)} vaultId={P} />);
    await ready();
    await act(async () => {
      await sleep(500);
    });
    expect(screen.queryByTestId("employment-rows")).toBeNull();
    expect(employmentRequests()).toEqual([]);
    expect(writes()).toEqual([]);
  });
});
