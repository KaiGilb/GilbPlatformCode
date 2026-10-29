// The write-time reference check reads its sets live from the master, at create: no stored or kept set may admit or refuse; a
// master that does not answer gives ReferenceUnknownError and nothing is sent. Display reads may use the cache.
// Attack: the parts the check still takes from the reading (field sets / carrier kind, predicate spellings, which kinds are
// role relations with which group type) - can any of them admit a write the live master forbids?
// Every expected value is a LITERAL and states what the live master answers.
import { describe, it, expect, beforeEach } from "vitest";
import { masterSource, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { createRecord, CreateRefusedError, readPickerVocabulary, type Picker } from "./pickOrCreate";
import {
  readReferenceVocabulary,
  ReferenceRefusedError,
  ReferenceUnknownError,
} from "@kaigilb/gilbplatformcode-holder-reference";
import { createStakeholderKindReader, createTypeTreeReader, forgetStakeholderKindReaders, type StakeholderKindSet } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import type { VocabularyStore } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { fixtureMaster, RIG, t, a } from "../test/support";
import { withReferenceTerms } from "../test/fixtureReference";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { fixturePlatform, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";


const VAULT = "https://ann.example.test/vault";
const HOLDER = `${VAULT_HOST}/base/e/ann-self-card`;
const AGENT = "https://id.example.test/base/p/kept-agent";
const STAKEHOLDER_KEY = `gilb-stakeholders.kind-set.v1:${RIG}`;
const referenceMaster = () => withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));

function memoryStore(): VocabularyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

/** A page as an app builds it after the adoption list: stakeholder kind set from the store, field sets from it, the reference
 *  reading through the shared readers, and the picker's master live. */
async function pageOver(master: VocabularySource, store: VocabularyStore) {
  const common = { source: master, origin: RIG, store, defer: () => {} };
  const kinds = new Map<string, ReturnType<typeof createStakeholderKindReader>>();
  const readers = {
    kindReaderFor: (roleTerm: string) => kinds.get(roleTerm) ?? (kinds.set(roleTerm, createStakeholderKindReader({ ...common, roleTerm })), kinds.get(roleTerm)!),
    typeTreeReaderFor: (rootTerm: string) => createTypeTreeReader({ ...common, rootTerm }),
  };
  const kindSet = await readers.kindReaderFor("t/Stakeholder").get();
  const fieldSets = await resolveFieldSets(master, { kindSet });
  const references = await readReferenceVocabulary(master, fieldSets, readers);
  return { fieldSets, references };
}

const writes = (p: FixturePlatform) => p.requests.filter((r) => r.method !== "GET").length;
async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ReferenceRefusedError || err instanceof CreateRefusedError) return `refused:${err.reason}`;
    if (err instanceof ReferenceUnknownError) return "unknown";
    return `error:${(err as Error).name}`;
  }
  return "admitted";
}

/** The poison: Project made a stakeholder kind under Person in the kept t/Stakeholder set. */
function projectAsKind(store: ReturnType<typeof memoryStore>) {
  const kept = JSON.parse(store.data.get(STAKEHOLDER_KEY)!) as { set: StakeholderKindSet };
  const person = kept.set.types.find((x) => x.name === "Person")!;
  kept.set.types.push({ ...person, term: t("Project"), name: "Project", label: "Project", isMember: false, parents: [person.term] });
  kept.set.names.push("Project");
  store.data.set(STAKEHOLDER_KEY, JSON.stringify(kept));
}

beforeEach(() => forgetStakeholderKindReaders());

describe("a poisoned kept t/Stakeholder set (field sets, carrier kind) must never admit", () => {
  it("a create's reference fields: a Project create with a:actsOnBehalfOf writes nothing", async () => {
    const store = memoryStore();
    const m1 = referenceMaster();
    await pageOver(masterSource({ vedaOrigin: RIG, fetchImpl: m1.fetch }), store);
    projectAsKind(store);
    const live = masterSource({ vedaOrigin: RIG, fetchImpl: referenceMaster().fetch });
    const common = { source: live, origin: RIG, store, defer: () => {} };
    const kindSet = await createStakeholderKindReader({ ...common, roleTerm: "t/Stakeholder" }).get();
    const fieldSets = await resolveFieldSets(live, { kindSet });
    const reading = await readPickerVocabulary(live, fieldSets, { references: true });
    const p = fixturePlatform({ origin: new URL(VAULT).origin });
    p.reach.add(VAULT);
    const acme = p.seed(VAULT, "t:Organization", { "a:name": "Acme AS" });
    const picker: Picker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: live };
    await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Project"), name: "Project X", fields: { "a:actsOnBehalfOf": { "@id": acme } } }));
    expect(writes(p)).toBe(0);
  });
});

describe("master down at create (the create door's reference fields)", () => {
  it("a create with a:memberOf: not known yet, 0 writes", async () => {
    const m = referenceMaster();
    let up = true;
    const source = masterSource({ vedaOrigin: RIG, fetchImpl: async (u, i) => (up ? m.fetch(u, i) : Promise.reject(new TypeError("Failed to fetch"))) });
    const reading = await readPickerVocabulary(source, await resolveFieldSets(source), { references: true });
    const p = fixturePlatform({ origin: new URL(VAULT).origin });
    p.reach.add(VAULT);
    const owners = p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" });
    const acme = p.seed(VAULT, "t:Organization", { "a:name": "Acme AS" });
    up = false;
    const picker: Picker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: source };
    expect(await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona", fields: { "a:memberOf": { "@id": owners } } }))).toBe("unknown");
    expect(await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona", fields: { "a:actsOnBehalfOf": { "@id": acme } } }))).toBe("unknown");
    expect(await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona", fields: { "a:email": "m@example.test", "a:preferredChannel": { "@id": a("email") } } }))).toBe("unknown");
    const noMaster: Picker = { platform: picker.platform, reading };
    expect(await reason(createRecord(noMaster, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona", fields: { "a:memberOf": { "@id": owners } } }))).toBe("unknown");
    expect(writes(p)).toBe(0);
  });
});
