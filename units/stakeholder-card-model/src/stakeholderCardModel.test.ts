// The card's session reading, its field modes and its state.
//
// The master is the package's own fixture master, imported and not mirrored: when the served shapes move, this file moves with them.
// It is fetched at a rig origin while every IRI names the ontology origin.
import { beforeEach, describe, expect, it } from "vitest";
import { masterFetch, readStakeholderCardVocabulary } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { resolveStakeholderKinds } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { fixtureMaster, RIG, ID } from "../test/support";
import { withReferenceTerms } from "../test/fixtureReference";
import { cardFieldOf, stakeholderCardState } from "./stakeholderCardModel";
import type { StakeholderCardVocabulary } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";

beforeEach(() => {
  resetTermOrigin();
  setTermOrigin(ID);
});

/** The fixture's listing without its one illustrative node that is no term on the master
 *  (`t/Unrelated` / `a:unrelated`): a master without the selector serves the
 *  whole listing, so the node would be served to the app. Every other node is kept as served. */
function withoutUnplaced(m: ReturnType<typeof fixtureMaster>): ReturnType<typeof fixtureMaster> {
  const pages: Record<string, unknown>[][] = [];
  for (let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`, i = 0; url && i < 50; i++) {
    const page = m.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
    if (!page) break;
    pages.push(page["@graph"].filter((n) => n["@id"] !== `${ID}/base/t/Unrelated`));
    url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
  }
  m.listing(pages as never);
  return m;
}

function master(selector = true) {
  const m = withoutUnplaced(withReferenceTerms(fixtureMaster()));
  m.selector = selector;
  // The app reads the master at its identity origin; the fixture answers at the rig.
  const hostFetch = (url: string, init?: RequestInit) => m.fetch(url.replace(ID, RIG), init);
  return { m, hostFetch };
}

describe("the session reading equals the package's answer for the same master", () => {
  it("the field sets and the kinds the card reads equal resolveFieldSets and resolveStakeholderKinds on the same master", async () => {
    const { m } = master();
    const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
    const direct = await resolveFieldSets(source);
    const kinds = await resolveStakeholderKinds(source);
    const card = await readStakeholderCardVocabulary(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
    expect(card.fieldSetsRefusal).toBeNull();
    expect(JSON.stringify(card.fieldSets!.byKind)).toBe(JSON.stringify(direct.byKind));
    expect(card.fieldSets!.complete).toBe(direct.complete);
    expect(card.kindNames).toEqual([...new Set(kinds.types.map((t) => t.name))]);
    expect(card.kindNames.length).toBeGreaterThan(3);
  });

  it("on a master without the carrier selector: the kinds are known, the field sets are 'not known yet', never an empty set", async () => {
    const { m } = master(false);
    const card = await readStakeholderCardVocabulary(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
    expect(card.fieldSets).toBeNull();
    expect(card.fieldSetsRefusal).toMatch(/^not known yet: /);
    expect(card.kindNames).toContain("Person");
    // The whole listing this master serves holds no node that is no term on
    // the master (the fixture's illustrative t/Unrelated is dropped by withoutUnplaced).
    expect(JSON.stringify([...m.docs.values()])).not.toContain("/base/t/Unrelated");
    // And the card's state for a stakeholder record says so.
    const s = stakeholderCardState("t:Person", { data: card, pending: false });
    expect(s.state).toBe("fields-not-known");
    // Control: the same master WITH the selector gives a ready card.
    const { m: m2 } = master(true);
    const ok = await readStakeholderCardVocabulary(masterSource({ vedaOrigin: RIG, fetchImpl: m2.fetch }));
    expect(stakeholderCardState("t:Person", { data: ok, pending: false }).state).toBe("ready");
  });
});

describe("the host fetch the package is handed", () => {
  it("masterFetch passes the init on unchanged; a wrapper that drops it is caught", async () => {
    const got: (RequestInit | undefined)[] = [];
    const inner = async (_url: string, init?: RequestInit) => {
      got.push(init);
      return new Response("{}");
    };
    await masterFetch(inner)("https://ontology.example.test/base/t/Person", { cache: "no-cache" });
    expect(got[0]?.cache).toBe("no-cache");
    // Control: a host fetch that drops the init is visible to the same check.
    const dropping = (url: string) => inner(url);
    await masterFetch(dropping)("https://ontology.example.test/base/t/Person", { cache: "no-cache" });
    expect(got[1]?.cache).toBeUndefined();
  });
});

describe("how the card treats each field of the set", () => {
  it("a ruled reference is written only by the package; a record field, an unruled reference and held-party are shown; a literal is the card's", async () => {
    const { m } = master();
    const sets = await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
    const person = Object.values(sets.byKind).find((k) => k.name === "Person")!;
    const mode = (writeKey: string) => {
      const f = person.fields.find((x) => x.writeKey === writeKey);
      if (!f) throw new Error(`${writeKey} is not in the fixture's Person set`);
      return cardFieldOf(f);
    };
    expect(mode("a:memberOf")).toMatchObject({ mode: "reference-add", rule: "membership" });
    expect(mode("a:preferredChannel")).toMatchObject({ mode: "reference-add", rule: "contact-term" });
    expect(mode("a:skill")).toMatchObject({ mode: "shown", rule: null });
    expect(mode("a:name")).toMatchObject({ mode: "card-edit", slug: "name" });
    // The fixture's email declares no encoding: shown, ⛔ never guessed to be a literal.
    expect(mode("a:email")).toMatchObject({ mode: "shown", slug: null });
    const name = person.fields.find((f) => f.writeKey === "a:name")!;
    const recordOf = { type: "https://ontology.example.test/base/t/Employment", typeName: "t:Employment", many: true, fields: [] };
    const record = person.fields.find((f) => f.record) ?? { ...name, encoding: "reference-edge:@id", record: recordOf };
    expect(cardFieldOf(record).mode).toBe("shown");
    // Discriminating: a field whose encoding is a LITERAL but which holds a record
    // of its own is still shown, ⛔ not edited as text. Control: the same field without a record
    // is the card's.
    expect(cardFieldOf({ ...name, record: recordOf })).toMatchObject({ mode: "shown", slug: null });
    expect(cardFieldOf({ ...name, record: null })).toMatchObject({ mode: "card-edit", slug: "name" });
    // A field with no single declared encoding (production's t/Skill declares two; the package
    // reads none) is shown, ⛔ never guessed to be a literal. Control: the same field with one.
    expect(cardFieldOf({ ...name, encoding: null })).toMatchObject({ mode: "shown", slug: null });
    expect(cardFieldOf({ ...name, encoding: "inline-literal:text" })).toMatchObject({ mode: "card-edit", slug: "name" });
    // held-party: the package checks it and the record-and-claims door writes it.
    const heldParty = cardFieldOf({ ...person.fields[0]!, record: null, writeKey: "a:heldParty", encoding: "reference-edge:@id" });
    expect(heldParty).toMatchObject({ mode: "shown", rule: "held-party" });
  });
});

describe("the card's state", () => {
  const data: StakeholderCardVocabulary = { kindNames: ["Person"], kindsComplete: true, fieldSets: null, fieldSetsRefusal: "not known yet: x" };
  it("reading, kinds not known, a type that is not a stakeholder kind", () => {
    expect(stakeholderCardState("t:Person", { pending: true }).state).toBe("reading");
    expect(stakeholderCardState("t:Person", { pending: false, error: new Error("503") })).toEqual({ state: "kinds-not-known", reason: "503" });
    expect(stakeholderCardState("t:Building", { pending: false, data }).state).toBe("not-a-stakeholder-kind");
    expect(stakeholderCardState(`${ID}/base/t/Person`, { pending: false, data }).state).toBe("fields-not-known");
  });
});
