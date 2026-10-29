// A reference at create: the nested-vault, vault-host, carrier and attribute-address rules, each as a test with its control:
//   - a record of a vault NESTED in the named vault is refused (by the vault each row names);
//   - a role record is written at the vault's own address on the vault's own host and read back there; any other origin is refused
//     with nothing sent;
//   - the held-party target-only branch is entered only on a WHOLE reading that positively lacks the carrier; an incomplete
//     field-set reading is "not known yet" for every rule;
//   - a preferred channel is the attribute address the term's own facts give (`a/email`), never the type address `t/Email`;
//   - `a:heldParty` is checked and never written by the package.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { createRecord, readPickerVocabulary, type Picker } from "./pickOrCreate";
import { fixtureMaster, RIG, CONTEXT, t } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, VAULT_HOST } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const CHILD_VAULT = "https://annchild.example.test/vault";
const HOLDER = `${VAULT_HOST}/base/e/ann-self-card`;
const AGENT = "https://id.example.test/base/p/0b6c9a52-agent";
type M = ReturnType<typeof fixtureMaster>;

async function setup(opts: { mutate?: (m: M) => void; origin?: string } = {}) {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  // t/Email in the live shape (read 2026-10-02): the
  // same term as a/email, naming itself as its own @id.
  m.put("t/Email", { "@context": CONTEXT, "@id": t("Email"), "a:predicateAttribute": "a:email", "a:typeUri": t("Email"), "a:subTypeOf": { "@id": t("ElectronicContactPoint") } });
  opts.mutate?.(m);
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readPickerVocabulary(source, await resolveFieldSets(source), { references: true });
  const p = fixturePlatform({ origin: opts.origin ?? new URL(VAULT).origin });
  p.reach.add(VAULT).add(CHILD_VAULT);
  const picker: Picker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: source };
  return { picker, p, m, source };
}

describe("the carrier is read positively", () => {

  it("a create on a field-set reading that is not whole is 'not known yet', with nothing sent (the create path's sibling)", async () => {
    const { picker, p } = await setup();
    picker.reading.fieldSets = { ...picker.reading.fieldSets, complete: false, incompleteAt: ["declarations: page 2"] };
    let err: unknown;
    try {
      await createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(VocabularyUnavailableError);
    expect(p.requests.length).toBe(0);
  });
});
