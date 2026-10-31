// The held card's Languages section with the host 0.2.0 builds, inside the provider alone (the record card, the provider's host, the real language section, a fake platform).
// What is pinned: with the slot the section draws a held language by NAME and FLAG (the entry is read, the flag's two small files are read, a country entity never);
// mounting, drawing and idling make no write; an unrelated edit's autosave carries nothing of the section (no language key, no null, no ""); with the slot REMOVED from the
// host the record card draws no section, reads no language and writes nothing.
import { useMemo } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StakeholderCardGilbPlatformProvider, useStakeholderCardPlatform } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { StakeholderRecordCard, StakeholderRecordCardHostContext, type StakeholderRecordCardProps } from "@kaigilb/gilbplatformcode-stakeholder-record-card";
import { HOST, P, createWorld, type World } from "../test/world";
import { heldWorld } from "../test/heldWorld";
import { providerProps } from "../test/harness";
import { NORWAY, NORWEGIAN, addLanguageTerms, languagesWorld, type LanguagesWorld } from "../test/languagesWorld";
import { HeldStakeholderCard, createStakeholderRecordCardHost } from "./index";

let world: World;
let lw: LanguagesWorld;
let id: string;
let entity: string;

beforeEach(async () => {
  world = await createWorld();
  addLanguageTerms(world);
  entity = world.platform.seed(P, "t:Person", { "a:name": "Ben Larsen", "a:givenName": "Ben", "a:familyName": "Larsen" });
  id = entity.slice(entity.lastIndexOf("/") + 1);
  world.platform.seed(P, "t:HeldPartyFieldClaim", {
    "a:heldParty": { "@id": entity },
    "a:languageUsed": { "@id": NORWEGIAN },
    "a:statedBy": { "@id": world.ownCardUri! },
    "a:flagCountry": { "@id": NORWAY },
  });
  lw = languagesWorld(heldWorld(world).fetch as typeof fetch);
  vi.stubGlobal("fetch", lw.fetch);
});

function mount(card: React.ReactNode) {
  return render(<StakeholderCardGilbPlatformProvider {...providerProps(world, { viewedVaultId: P })}>{card}</StakeholderCardGilbPlatformProvider>);
}
function CardWithoutSlot(props: StakeholderRecordCardProps) {
  const platform = useStakeholderCardPlatform();
  const host = useMemo(() => {
    const h = createStakeholderRecordCardHost(platform);
    delete h.renderLanguages;
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

describe("the slot is given (host 0.2.0)", () => {
  test("the Languages section draws the held language by its name and its flag, never its address", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const section = await screen.findByTestId("languages-section", {}, { timeout: 6000 });
    await waitFor(() => expect(within(section).getByTestId("language-row-value").textContent).toBe("Norwegian"), { timeout: 6000 });
    await waitFor(() => expect(within(section).getByTestId("flag-image").getAttribute("data-flag-state")).toBe("flag"), { timeout: 6000 });
    expect(within(section).getByRole("img", { name: "Flag of Norway" })).toBeTruthy();
    expect(section.textContent).not.toMatch(/:\/\//);
    expect(section.textContent).not.toContain("langnorwegian");
    // the entry at its own address and the two small flag files; no country entity
    expect(lw.asked.map((a) => a.url).sort()).toEqual([NORWEGIAN, `${NORWAY.replace("/base/e/osm-r-2978650", "")}/base/e/flag-osm-r-2978650`, `${NORWAY.replace("/base/e/osm-r-2978650", "")}/files/flag-osm-r-2978650`].sort());
    expect(lw.countryEntityAsks).toEqual([]);
  });

  test("mounting, drawing and idling make zero writes", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const section = await screen.findByTestId("languages-section", {}, { timeout: 6000 });
    await waitFor(() => expect(within(section).getByTestId("language-row-value").textContent).toBe("Norwegian"), { timeout: 6000 });
    await act(async () => {
      await sleep(500);
    });
    expect(writes()).toEqual([]);
    expect(lw.asked.every((a) => a.method === "GET")).toBe(true);
  });

  test("an unrelated edit is ONE PATCH of exactly that field: nothing of the section, no language key, no null, no empty string", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    await waitFor(() => expect(screen.getByTestId("languages-section")).toBeTruthy(), { timeout: 6000 });
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.type(screen.getByDisplayValue("Ben"), "x");
    await waitFor(() => expect(world.calls.filter((c) => c.method === "PATCH").length).toBe(1), { timeout: 4000 });
    await act(async () => {
      await sleep(300);
    });
    const patches = world.calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    const body = JSON.parse(patches[0]!.body!) as Record<string, unknown>;
    // The card's own save of a given-name edit: the given name and the name the card composes from its parts. Nothing of the languages.
    expect(Object.keys(body).sort()).toEqual(["a:givenName", "a:name"]);
    expect(Object.keys(body).some((k) => /language|flag|contact|heldParty|statedBy/i.test(k))).toBe(false);
    expect(Object.values(body).every((v) => v !== null && v !== "")).toBe(true);
    expect(writes().map((w) => w.method)).toEqual(["PATCH"]);
  });
});

describe("the contact language is the record's own field, written on the user's act", () => {
  test("'Make contact language' is ONE PATCH of exactly a:contactLanguage; clearing the marked language by removing it is ONE PATCH of exactly that field, cleared", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const section = await screen.findByTestId("languages-section", {}, { timeout: 6000 });
    await waitFor(() => expect(within(section).getByTestId("language-row-value").textContent).toBe("Norwegian"), { timeout: 6000 });
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.click(await within(section).findByRole("button", { name: "Make Norwegian the contact language" }));
    await waitFor(() => expect(world.calls.filter((c) => c.method === "PATCH").length).toBe(1), { timeout: 4000 });
    expect(JSON.parse(world.calls.find((c) => c.method === "PATCH")!.body!)).toEqual({ "a:contactLanguage": "no" });
    await waitFor(() => expect(within(section).getByTestId("language-contact-mark").textContent).toBe("Contact language"), { timeout: 4000 });
    await userEvent.click(within(section).getByRole("button", { name: "Remove language Norwegian" }));
    await waitFor(() => expect(world.calls.filter((c) => c.method === "PATCH").length).toBe(2), { timeout: 4000 });
    const patches = world.calls.filter((c) => c.method === "PATCH").map((c) => JSON.parse(c.body!) as Record<string, unknown>);
    // The section hands the record's save the empty tag; the record's save puts a cleared field on the wire as a null. Only that one field.
    expect(patches[1]).toEqual({ "a:contactLanguage": null });
    expect(world.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });
});

describe("the slot is REMOVED from the host", () => {
  test("no Languages section, no language is read, and nothing is written", async () => {
    mount(<CardWithoutSlot recordId={id} vaultId={P} />);
    await ready();
    await waitFor(() => expect(screen.getAllByTestId("field-present").length).toBe(2), { timeout: 6000 });
    await act(async () => {
      await sleep(500);
    });
    expect(screen.queryByTestId("languages-section")).toBeNull();
    expect(screen.queryByTestId("language-row")).toBeNull();
    expect(lw.asked).toEqual([]);
    expect(writes()).toEqual([]);
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
