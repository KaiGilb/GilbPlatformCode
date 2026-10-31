// A skill of theirs is drawn by its name, not its address, in a group titled with the skill field's label.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("@kaigilb/gilbplatformcode-person-create", async (orig) => (await import("../test/mocks")).personCreateMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => (await import("../test/mocks")).lwsRecordsMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-card-vocabulary", async (orig) => (await import("../test/mocks")).vocabularyMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-state", async (orig) => (await import("../test/mocks")).listStateMock(await orig<{ forgetLinkedFinds: () => void }>()));

import { forgetLinkedRecords, forgetPageLinks, forgetScreenLinks } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { reset, VOCAB } from "../test/mocks";
import { ONTOLOGY, setUp, tearDown } from "../test/support";
import { draw, personFields, stubPlatform } from "../test/world";

// 0.1.4: the skills are term addresses of the ontology origin the test sets (they were on another host); `one-card` 0.3.0 words the name from the address.
const SKILL_A = `${ONTOLOGY}/base/t/EvolutionaryProjectManagement`;
const SKILL_B = `${ONTOLOGY}/base/t/RequirementsEngineering`;

beforeEach(() => {
  setUp();
  reset();
  VOCAB.fields = personFields([
    ["FamilyName", "Family Name", "familyName"],
    ["GivenName", "Given Name", "givenName"],
    ["Skill", "Skills", "skill"],
  ]);
  stubPlatform({ skills: [SKILL_A, SKILL_B], ben: { given: "Ada", family: "Lovelace", email: null } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  forgetLinkedRecords();
  forgetPageLinks();
  forgetScreenLinks();
  tearDown();
});

describe("a skill of theirs is drawn by its name", () => {
  it("the rows read the skill's name, not its address, and the group takes the field's label", async () => {
    draw();
    const heading = await screen.findByRole("heading", { name: "Skills" });
    const group = heading.closest("[data-testid='card-group']") as HTMLElement;
    expect(group.textContent).toContain("Evolutionary Project Management");
    expect(group.textContent).toContain("Requirements Engineering");
    expect(group.textContent).not.toContain("https://");
    expect(group.textContent).not.toContain("EvolutionaryProjectManagement");
    expect(group.getAttribute("data-group")).toBe("theirs:a:skill");
  });
});
