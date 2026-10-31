// The held card's Skills and Interests sections with the host 0.3.0 builds, inside the provider alone (the record card, the provider's host, the real
// `skill-rows` and `interest-rows`, a fake platform). Probe: what is drawn, and what is written.
import { useMemo } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StakeholderCardGilbPlatformProvider, useStakeholderCardPlatform } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { StakeholderRecordCard, StakeholderRecordCardHostContext, type StakeholderRecordCardProps } from "@kaigilb/gilbplatformcode-stakeholder-record-card";
import { HOST, P, createWorld, type World } from "../test/world";
import { heldWorld } from "../test/heldWorld";
import { providerProps } from "../test/harness";
import { addLanguageTerms } from "../test/languagesWorld";
import { PHOTOGRAPHY, WELDING, addSkillTerms } from "../test/skillsWorld";
import { HeldStakeholderCard, createStakeholderRecordCardHost } from "./index";

let world: World;
let id: string;
let entity: string;

beforeEach(async () => {
  world = await createWorld();
  addLanguageTerms(world);
  addSkillTerms(world);
  entity = world.platform.seed(P, "t:Person", {
    "a:name": "Ben Larsen",
    "a:givenName": "Ben",
    "a:familyName": "Larsen",
    "a:skill": [{ "@id": WELDING }],
    "a:fieldMeta": { skill: { type: "skill", label: "welding", order: 7, access: "private", valueIndex: 0 } },
  });
  id = entity.slice(entity.lastIndexOf("/") + 1);
  world.platform.seed(P, "t:HeldPartyFieldClaim", {
    "a:heldParty": { "@id": entity },
    "a:skill": { "@id": WELDING },
    "a:skillDepthNote": "TIG, six years",
    "a:statedBy": { "@id": world.ownCardUri! },
  });
  world.platform.seed(P, "t:HeldPartyFieldClaim", {
    "a:heldParty": { "@id": entity },
    "a:topicInterest": { "@id": PHOTOGRAPHY },
    "a:topicInterestNote": "Long exposures",
    "a:statedBy": { "@id": world.ownCardUri! },
  });
  vi.stubGlobal("fetch", heldWorld(world).fetch as typeof fetch);
});

function mount(card: React.ReactNode) {
  return render(<StakeholderCardGilbPlatformProvider {...providerProps(world, { viewedVaultId: P })}>{card}</StakeholderCardGilbPlatformProvider>);
}
function CardWithoutSlot(props: StakeholderRecordCardProps) {
  const platform = useStakeholderCardPlatform();
  const host = useMemo(() => {
    const h = createStakeholderRecordCardHost(platform);
    delete h.renderSkillsAndInterests;
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
const claimFinds = () => world.calls.filter((c) => c.method === "GET" && /heldParty/.test(decodeURIComponent(c.url)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the slot is given (host 0.3.0)", () => {
  test("the Skills draw the skill by its name with its note; the Interests draw the interest by its name with its note; no address anywhere; Skills, then Interests", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const skills = await screen.findByTestId("skill-rows", {}, { timeout: 6000 });
    await waitFor(() => expect(within(skills).getByTestId("skill-depth-note-text").textContent).toBe("TIG, six years"), { timeout: 6000 });
    expect(within(skills).getAllByTestId("skill-row-value")[0]!.textContent).toContain("welding");
    const interests = await screen.findByTestId("interest-section", {}, { timeout: 6000 });
    await waitFor(() => expect(within(interests).getByTestId("interest-row-value").textContent).toBe("photography"), { timeout: 6000 });
    expect(within(interests).getByTestId("interest-note-text").textContent).toBe("Long exposures");
    expect(skills.textContent).not.toMatch(/:\/\//);
    expect(interests.textContent).not.toMatch(/:\/\//);
    // a skill appears once; the Skills group comes before the Interests group, inside one container
    expect(screen.getAllByTestId("skill-row")).toHaveLength(1);
    const rowDiv = (e: HTMLElement) => e.closest("div.flex.flex-col.gap-4");
    expect(rowDiv(skills)).toBe(rowDiv(interests));
    expect(skills.compareDocumentPosition(interests) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the vocabulary of the notes and the interest's term are read, once the slot is given (they are not when it is not: see the last describe)
    expect(world.calls.some((c) => /skillDepthNote/.test(c.url))).toBe(true);
    expect(world.calls.some((c) => /topicInterest/.test(c.url))).toBe(true);
    expect(world.calls.some((c) => /\/t\/Photography/.test(c.url))).toBe(true);
    // the claims are asked for by the record's entity, through the platform's per-person find
    const finds = claimFinds().map((c) => new URL(c.url)).filter((u) => u.searchParams.get("attr") === "a:heldParty");
    expect(finds.length).toBeGreaterThan(0);
    expect(finds.every((u) => u.pathname === "/base/find-by-attribute")).toBe(true);
    // never the vault's whole list of held claims
    expect(world.calls.some((c) => c.url.includes("/records?type=HeldPartyFieldClaim"))).toBe(false);
    expect(finds.map((u) => JSON.parse(u.searchParams.get("value")!))).toContainEqual({ "@id": entity });
  });

  test("mounting, drawing and idling make zero writes", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const interests = await screen.findByTestId("interest-section", {}, { timeout: 6000 });
    await waitFor(() => expect(within(interests).getByTestId("interest-row-value").textContent).toBe("photography"), { timeout: 6000 });
    await act(async () => {
      await sleep(500);
    });
    expect(writes()).toEqual([]);
  });

  test("an unrelated edit is ONE PATCH of exactly that field: nothing of the sections, no skill or interest key, no null, no empty string", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    await waitFor(() => expect(screen.getByTestId("interest-section")).toBeTruthy(), { timeout: 6000 });
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
    expect(Object.keys(body).some((k) => /skill|fieldMeta|interest|topic|heldParty|statedBy/i.test(k))).toBe(false);
    expect(Object.values(body).every((v) => v !== null && v !== "")).toBe(true);
    expect(writes().map((w) => w.method)).toEqual(["PATCH"]);
  });

  test("a typed note is ONE POST of a t:HeldPartyFieldClaim about this record and this skill; the record's own save does not carry it", async () => {
    // a skill without a note yet: remove the seeded note claim's text by seeding a second person's view of the same skill is not needed; use an interest-free, note-free skill
    const other = world.platform.seed(P, "t:Person", {
      "a:name": "Cy Hansen", "a:givenName": "Cy", "a:familyName": "Hansen",
      "a:skill": [{ "@id": WELDING }],
      "a:fieldMeta": { skill: { type: "skill", label: "welding", order: 7, access: "private", valueIndex: 0 } },
    });
    mount(<HeldStakeholderCard recordId={other.slice(other.lastIndexOf("/") + 1)} vaultId={P} />);
    await ready();
    const skills = await screen.findByTestId("skill-rows", {}, { timeout: 6000 });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    await user.click(await within(skills).findByRole("button", { name: /^Edit note for / }, { timeout: 6000 }));
    await user.type(within(skills).getByRole("textbox", { name: /^About / }), "ICU nights");
    await user.tab();
    await waitFor(() => expect(writes().some((w) => w.method === "POST")).toBe(true), { timeout: 6000 });
    const posts = writes().filter((w) => w.method === "POST");
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0]!.body!) as { type: string; facts: Record<string, unknown> };
    expect(body.type).toBe("t:HeldPartyFieldClaim");
    expect(body.facts).toMatchObject({ "a:heldParty": { "@id": other }, "a:skill": { "@id": WELDING }, "a:skillDepthNote": "ICU nights", "a:statedBy": { "@id": world.ownCardUri } });
    expect(Object.keys(body.facts).sort()).toEqual(["a:directReader", "a:heldParty", "a:skill", "a:skillDepthNote", "a:statedBy"]);
    expect(writes().every((w) => !w.body?.includes("skillDepthNote") || w.method === "POST")).toBe(true);
    expect(writes().filter((w) => w.method === "PATCH")).toEqual([]);
  });

  test("removing the skill: ONE record PATCH that nulls the skill's value list and that skill's sidecar entry, then ONE DELETE of the viewer's own claim for it; the interest is untouched", async () => {
    mount(<HeldStakeholderCard recordId={id} vaultId={P} />);
    await ready();
    const skills = await screen.findByTestId("skill-rows", {}, { timeout: 6000 });
    await waitFor(() => expect(within(skills).getByTestId("skill-depth-note-text").textContent).toBe("TIG, six years"), { timeout: 6000 });
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.click(await screen.findByTestId("skill-row-remove", {}, { timeout: 6000 }));
    await waitFor(() => expect(world.calls.filter((c) => c.method === "DELETE")).toHaveLength(1), { timeout: 6000 });
    const w = writes();
    expect(w.map((x) => x.method)).toEqual(["PATCH", "DELETE"]);
    const patched = JSON.parse(w[0]!.body!) as Record<string, unknown>;
    // the skill's value list (now empty: null) and that skill's sidecar entry, and nothing else
    expect(Object.keys(patched).sort()).toEqual(["a:fieldMeta", "a:skill"]);
    expect(patched["a:skill"]).toBeNull();
    const meta = patched["a:fieldMeta"] as Record<string, unknown>;
    expect(Object.entries(meta).filter(([, v]) => v === null).map(([k]) => k)).toEqual(["skill"]);
    expect(screen.getByTestId("interest-section").textContent).toContain("photography");
  });
});

describe("the slot is REMOVED from the host (the card as host 0.2.0 drew it)", () => {
  test("the plain Skills section is drawn, with no note and no Interests; no claim is looked for and nothing is written", async () => {
    mount(<CardWithoutSlot recordId={id} vaultId={P} />);
    await ready();
    const skills = await screen.findByTestId("skill-rows", {}, { timeout: 6000 });
    expect(within(skills).getAllByTestId("skill-row-value")[0]!.textContent).toContain("welding");
    await act(async () => {
      await sleep(500);
    });
    expect(screen.queryByTestId("skill-depth-note")).toBeNull();
    expect(screen.queryByTestId("interest-section")).toBeNull();
    // nothing of the Skills-and-Interests layer is read: not the vocabulary of a skill note or an interest, not an interest's term
    expect(world.calls.filter((c) => /skillDepthNote|topicInterest|\/t\/Photography/.test(c.url))).toEqual([]);
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
