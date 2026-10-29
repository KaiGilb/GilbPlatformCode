// The carrier of addReference is placed by the same row test as every target: a carrier held in a vault nested in the named
// one, or in more than one vault, is refused with nothing written. No other test aims a nested or split CARRIER (the vault's own
// Ben is the carrier everywhere else), so a carrier-only exemption would not turn red.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { readPickerVocabulary, type Picker } from "./pickOrCreate";
import { addReference, ReferenceRefusedError, ReferenceUnknownError } from "@kaigilb/gilbplatformcode-holder-reference";
import { fixtureMaster, RIG } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const CHILD_VAULT = "https://annchild.example.test/vault";
const AGENT = "https://id.example.test/base/p/0b6c9a52-agent";

async function setup(rowVault = true) {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readPickerVocabulary(source, await resolveFieldSets(source), { references: true });
  const p = fixturePlatform({ origin: new URL(VAULT).origin, rowVault });
  p.reach.add(VAULT).add(CHILD_VAULT);
  p.nest(VAULT, CHILD_VAULT);
  const picker: Picker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: source };
  return { picker, p };
}
async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ReferenceRefusedError) return err.reason;
    if (err instanceof ReferenceUnknownError) return "unknown";
    throw err;
  }
  return "resolved";
}
const writes = (p: { requests: { method: string }[] }) => p.requests.filter((r) => r.method !== "GET").length;

describe("addReference places its CARRIER by the row's vault", () => {
  it("QE3: a carrier whose row names no vault (the target's row does) is 'not known yet', nothing written", async () => {
    const { picker, p } = await setup();
    const owners = p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" });
    const ben = p.seed(VAULT, "t:Person", { "a:name": "Ben" });
    // A list answer in which only the carrier's row lacks the pair (as a crossed peer's row would).
    const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
      const res = await p.fetch(url, init);
      if (!new URL(url).pathname.endsWith("/records")) return res;
      const body = (await res.json()) as { records: Record<string, unknown>[] };
      body.records = body.records.map((r) => (r.entity === ben ? (({ vault: _v, vaultAmbiguous: _a, ...rest }) => rest)(r) : r));
      return new Response(JSON.stringify(body), { status: res.status, headers: res.headers });
    };
    const strip: Picker = { ...picker, platform: { origin: picker.platform.origin, fetch } };
    expect(await reason(addReference(strip, { vaultId: VAULT, agent: AGENT, carrier: ben, field: "a:memberOf", target: owners }))).toBe("unknown");
    expect(writes(p)).toBe(0);
    // Control: the same carrier with its pair present is written once.
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: ben, field: "a:memberOf", target: owners }))).toBe("resolved");
    expect(writes(p)).toBe(1);
  });
});
