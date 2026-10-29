// The unit's one piece of module state: the remote contexts already read, by their URL (`remoteContexts` in holderReference.ts).
// Each test file runs in its own module scope, so this file starts with the map empty.
import { describe, expect, it } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { readReferenceReading } from "../test/readingOf";
import { writeRoleRecord, type ReferencePicker } from "./holderReference";
import { fixtureMaster, RIG } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, type FixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const AGENT = "https://id.example.test/base/p/context-agent";

async function setup(mutate?: (p: FixturePlatform) => void) {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readReferenceReading(source, await resolveFieldSets(source), { references: true });
  const p = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT);
  mutate?.(p);
  const picker: ReferencePicker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: source };
  const ben = p.seed(VAULT, "t:Person", { "a:name": "Ben" });
  const owners = p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" });
  return { picker, p, ben, owners };
}
const contextGets = (p: FixturePlatform) => p.requests.filter((r) => r.method === "GET" && r.path === "/base/context.jsonld").length;

describe("the remote contexts already read are kept for the run", () => {
  it("the first read-back of a role record reads the platform's context; a second platform's read-back of the same URL does not", async () => {
    const first = await setup();
    await writeRoleRecord(first.picker, { vaultId: VAULT, agent: AGENT, player: first.ben, group: first.owners });
    expect(contextGets(first.p)).toBe(1);
    const second = await setup();
    await writeRoleRecord(second.picker, { vaultId: VAULT, agent: AGENT, player: second.ben, group: second.owners });
    expect(contextGets(second.p)).toBe(0);
  });
});
