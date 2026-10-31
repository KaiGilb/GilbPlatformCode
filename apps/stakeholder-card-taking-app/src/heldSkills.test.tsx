// The held card's Skills and Interests, end to end in the app (fakes only): "+ Add your own" makes a record, the platform's world gives that record a skill with a held note
// and a held interest with a note, and the held card draws the skill and the interest by their NAMES, never their addresses. Reading makes no write of the sections': the
// only writes are the ones "+ Add your own" makes.
import { describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TEST_SETTINGS, signedInApp } from "../test/helpers";
import { BEN } from "../test/world";
import type { World } from "../test/world";
import { addLanguageTerms } from "../test/heldLanguageWorld";
import { addSkillTerms, withHeldSkillsOnNewRecord } from "../test/heldSkillWorld";

async function heldCardWithSkills() {
  let world!: World;
  const s = await signedInApp({}, TEST_SETTINGS, (next) => withHeldSkillsOnNewRecord(next, () => world));
  world = s.world;
  // the Skill field is what puts the Skills and Interests on the card (the same gate as the Languages)
  addLanguageTerms(world);
  addSkillTerms(world);
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText(/Person's principal/));
  await user.type(screen.getByLabelText(/Person's principal/), BEN);
  await user.click(screen.getByRole("button", { name: "Show card" }));
  await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
  await user.click(screen.getByTestId("add-own"));
  const held = await screen.findByRole("region", { name: "Record card" }, { timeout: 8000 });
  return { ...s, held };
}

describe("the held card's Skills and Interests", () => {
  test("the skill is drawn by its name with its note and the interest by its name with its note, and no address is shown", async () => {
    const { held } = await heldCardWithSkills();
    const skills = await within(held).findByTestId("skill-rows", {}, { timeout: 8000 });
    await waitFor(() => expect(within(skills).getByTestId("skill-depth-note-text").textContent).toBe("TIG, six years"), { timeout: 8000 });
    expect(within(skills).getAllByTestId("skill-row-value")[0]!.textContent).toContain("welding");
    const interests = await within(held).findByTestId("interest-section", {}, { timeout: 8000 });
    await waitFor(() => expect(within(interests).getByTestId("interest-row-value").textContent).toBe("photography"), { timeout: 8000 });
    expect(within(interests).getByTestId("interest-note-text").textContent).toBe("Long exposures");
    expect(skills.textContent).not.toContain("://");
    expect(interests.textContent).not.toContain("://");
  }, 30_000);

  test("opening and idling the card write nothing for the sections: the writes are \"+ Add your own\"'s alone", async () => {
    const { world, held } = await heldCardWithSkills();
    const interests = await within(held).findByTestId("interest-section", {}, { timeout: 8000 });
    await waitFor(() => expect(within(interests).getByTestId("interest-row-value").textContent).toBe("photography"), { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 400));
    const writes = world.calls.filter((c) => c.method !== "GET" && !/\/base\/tag\/masters$/.test(c.url));
    expect(writes.every((c) => /\/lws\/vault\/[^/]+\/c$/.test(c.url) || c.method === "PATCH")).toBe(true);
    for (const c of writes.filter((w) => w.method === "PATCH")) expect(c.body ?? "").not.toMatch(/skill|fieldMeta|interest|topic/i);
    expect(writes.filter((w) => w.method === "POST")).toHaveLength(1);
  }, 30_000);
});
