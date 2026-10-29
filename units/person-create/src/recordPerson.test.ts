// Record a local person through the package's pick-or-create, and the tag the create registers and its round trip.
//
// The master and the platform are the package's OWN fixtures at the pinned SHA, copied into `test/` and not mirrored. The kind and field names below are TEST INPUTS, as the
// fixture master serves them; the code under test names none. The host is the recording fake of `test/fakeHost.ts`.
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { readPickerVocabulary, type PickerReading } from "@kaigilb/gilbplatformcode-pick-or-create";
import { readTagGrammar, resolveTag, formatFullTag, type TagGrammar } from "@kaigilb/gilbplatformcode-tag-grammar";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { vaultRootOf } from "@kaigilb/gilbplatformcode-plan-self-source";
import { selfCardEntityUri } from "@kaigilb/gilbplatformcode-self-card";
import { fixtureMaster, RIG, t } from "../test/support";
import { withTagStandard } from "../test/fixtureTag";
import { withWritableFieldsAdjudicated } from "../test/writableFields";
import { fixturePlatform, type FixturePlatform } from "../test/fixturePlatform";
import { fakeHost, NO_OWN_VAULT_SAYS } from "../test/fakeHost";
import { fieldsFromBoxes, findPeople, isHeldVault, NotTheHolderError, personBoxes, recordPerson as recordPersonWith, recordableKinds, type PersonCreateHost } from "./recordPerson";

// The fixture platform serves every record on its identity host, so the person's landing vault sits on that host.
const P = "https://holder.example.test/vault";
const Q = "https://holder.example.test/base/pq1";
const SHARED = "https://holder.example.test/base/pshared";
const AGENT = "https://holder.example.test/vault/e/app-example";

const vault = (vaultId: string, over: Partial<ReachableVault> = {}): ReachableVault => ({
  vaultId,
  entity: `${vaultId}/e/root`,
  name: vaultId,
  parent: null,
  parentAmbiguous: false,
  modes: ["read", "write"],
  represents: null,
  isLandingVault: false,
  ...over,
});
const vP = vault(P, { isLandingVault: true });
const vQ = vault(Q, { parent: { entity: `${P}/e/root`, vaultId: P } });
const vShared = vault(SHARED);
const VAULTS = [vP, vQ, vShared];

// Credentials go only to the base origin's own host and its subdomains, so the vault hosts of this file sit under an apex that is the base origin.
beforeEach(() => {
  resetBaseOrigin();
  setBaseOrigin("https://example.test");
});

/** The host of the test in hand: it answers the adder's card that `setup` seeded. */
let host: PersonCreateHost = fakeHost("unset");
/** `recordPerson` with the host of the test in hand as its first argument. */
const recordPerson: typeof recordPersonWith extends (h: PersonCreateHost, ...r: infer R) => infer O ? (...r: R) => O : never = (...r) => recordPersonWith(host, ...r);

/** The adder's OWN card in their landing vault P, at its derived address (as the platform's ensure door mints it); answers its served @id. */
async function seedAdderCard(p: FixturePlatform): Promise<string> {
  const derived = await selfCardEntityUri(vaultRootOf(P)!);
  const probe = p.seed(P, "t:Person", { "a:name": "probe" });
  p.entities.delete(probe);
  const prefix = probe.slice(0, probe.lastIndexOf("/") + 1);
  return p.seed(P, "t:Person", { "a:name": "Ben (self)" }, { id: prefix + derived.slice(derived.lastIndexOf("/") + 1) });
}
const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

async function setup(edit?: (m: ReturnType<typeof fixtureMaster>) => void, tags?: "auto" | "ensure-only" | "off"): Promise<{ reading: PickerReading; p: FixturePlatform; grammar: TagGrammar; adderCard: string }> {
  // The package's writable fields without the 11 names that are neither placed nor refused.
  const m = withWritableFieldsAdjudicated(withTagStandard(fixtureMaster()));
  edit?.(m);
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const fieldSets = await resolveFieldSets(source);
  const reading = await readPickerVocabulary(source, fieldSets);
  const grammar = await readTagGrammar(source);
  const p = fixturePlatform({ origin: new URL(P).origin, ...(tags ? { tags } : {}) });
  p.reach.add(P).add(Q).add(SHARED);
  const adderCard = await seedAdderCard(p);
  host = fakeHost(adderCard);
  return { reading, p, grammar, adderCard };
}


function personKind(reading: PickerReading) {
  const k = recordableKinds(reading.fieldSets).find((x) => x.kind === t("Person"));
  if (!k) throw new Error("the fixture offers no Person kind");
  return k;
}

describe("record a person through pick-or-create (a:name only)", () => {
  it("the create writes the name under a:name only, the email, the organization as an Employment record, and the ADDER's own card as stater; read back from the store", async () => {
    const { reading, p, adderCard } = await setup();
    const kind = personKind(reading);
    const boxes = personBoxes(reading.fieldSets, kind);
    const made = await recordPerson(
      { reading, fetchImpl: p.fetch, queryClient: newQc() },
      { vault: vP, vaults: VAULTS, agent: AGENT, kind, name: "Ann Lee", boxes, values: { "a:email": "ann@example.test", "a:employment/a:org": "Acme AS" } },
    );
    const posts = p.requests.filter((r) => r.method === "POST" && r.path.endsWith("/c"));
    expect(posts.length).toBe(2);
    const body = posts[1]!.body as { type: string; facts: Record<string, unknown> };
    expect(body.type).toBe("t:Person");
    expect(Object.keys(body.facts).sort()).toEqual(["a:email", "a:employment", "a:name", "a:statedBy"]);
    expect(body.facts["a:name"]).toBe("Ann Lee");
    expect(body.facts).not.toHaveProperty("a:label");
    expect(body.facts).not.toHaveProperty("a:title");
    expect(body.facts["a:statedBy"]).toEqual({ "@id": adderCard });
    // Read back from the store.
    const stored = p.entities.get(made.record)!;
    expect(stored.type).toBe("t:Person");
    expect(stored.facts["a:name"]).toBe("Ann Lee");
    expect(stored.facts).not.toHaveProperty("a:label");
    expect(stored.facts).not.toHaveProperty("a:title");
    const employment = p.entities.get(made.held[0]!)!;
    expect(employment.type).toBe("t:Employment");
    expect(employment.facts["a:org"]).toBe("Acme AS");
    // The record's tag is the platform's (the fixture platform derives it from the name), not a form the app chose.
    expect(made.tag).toBe("ann-lee");
  });

  // One tag rule, the platform's: the create takes no tag. The record's tag is the one the PLATFORM made, read back into `made.tag`.
  it("the record's tag is the platform's: no tag is sent and no POST /base/tag/handle is made", async () => {
    const { reading, p } = await setup();
    const made = await recordPerson(
      { reading, fetchImpl: p.fetch, queryClient: newQc() },
      { vault: vQ, vaults: VAULTS, agent: AGENT, kind: personKind(reading), name: "Bo Ek", boxes: [], values: {} },
    );
    expect(made.tag).toBe(p.handlesOf(made.record)[0]!.facts["a:tagString"]);
    expect(made.tagHandle).toBe(p.handlesOf(made.record)[0]!.id);
    expect(p.count("POST", "/base/tag/handle")).toBe(0);
  });

  // A newer app on an older platform (no tag routes). The record is KEPT and shown without a tag; nothing is deleted, retracted or rolled back.
  it("a platform with no tag routes: the record is kept with no tag, and no DELETE, retract or end request is sent", async () => {
    const { reading, p } = await setup(undefined, "off");
    const made = await recordPerson(
      { reading, fetchImpl: p.fetch, queryClient: newQc() },
      { vault: vQ, vaults: VAULTS, agent: AGENT, kind: personKind(reading), name: "Bo Ek", boxes: [], values: {} },
    );
    expect(made).toMatchObject({ created: true, tag: null, tagHandle: null });
    expect(p.entities.get(made.record)!.facts["a:name"]).toBe("Bo Ek");
    expect(p.handlesOf(made.record)).toHaveLength(0);
    expect(p.requests.filter((r) => r.method === "DELETE" || /\/(remove|end|retract)\b/.test(r.path))).toEqual([]);
    expect(p.requests.filter((r) => r.method === "POST" && r.path.endsWith("/c"))).toHaveLength(1);
  });

  it("the stater is the ADDER's own card in their landing vault, as the card says its own @id, even when the record is written into a nested vault Q (⛔ not Q's card, which is never read)", async () => {
    const { reading, p, adderCard } = await setup();
    const qCardId = (await selfCardEntityUri(vaultRootOf(Q)!)).split("/").pop()!;
    const made = await recordPerson(
      { reading, fetchImpl: p.fetch, queryClient: newQc() },
      { vault: vQ, vaults: VAULTS, agent: AGENT, kind: personKind(reading), name: "Bo Ek", boxes: [], values: {} },
    );
    expect(p.entities.get(made.record)!.facts["a:statedBy"]).toEqual({ "@id": adderCard });
    expect(p.entities.get(made.record)!.vault).toBe(Q);
    expect(p.requests.some((r) => r.path.includes(qCardId))).toBe(false);
    expect(p.requests.some((r) => r.path.includes("/selfcard"))).toBe(false);
  });

  // A person may be recorded in any vault the signer may WRITE. In a vault only SHARED with them no self card is ever made.
  it("a vault shared with write (not their own, not under it) is recordable, whether or not it has a self card of its own: the stater is the adder's landing card and the shared vault's card door is never asked", async () => {
    const { reading, p, adderCard } = await setup();
    expect(isHeldVault(vShared, VAULTS)).toBe(false);
    expect(isHeldVault(vQ, VAULTS)).toBe(true);
    const sharedCardId = (await selfCardEntityUri(vaultRootOf(SHARED)!)).split("/").pop()!;
    const made = await recordPerson({ reading, fetchImpl: p.fetch, queryClient: newQc() }, { vault: vShared, vaults: VAULTS, agent: AGENT, kind: personKind(reading), name: "X", boxes: [], values: {} });
    expect(made.vaultId).toBe(vShared.vaultId);
    expect(p.entities.get(made.record)!.facts["a:statedBy"]).toEqual({ "@id": adderCard });
    expect(p.requests.some((r) => r.path.includes(sharedCardId) || r.path.includes("/selfcard"))).toBe(false);
  });

  it("a person with NO landing vault in the list: refused before any request, nothing written", async () => {
    const { reading, p } = await setup();
    const noLanding = [vQ, vShared];
    await expect(
      recordPerson({ reading, fetchImpl: p.fetch, queryClient: newQc() }, { vault: vShared, vaults: noLanding, agent: AGENT, kind: personKind(reading), name: "X", boxes: [], values: {} }),
    ).rejects.toThrow(NO_OWN_VAULT_SAYS);
    expect(p.requests.length).toBe(0);
  });

  it("a vault the person can only READ is refused before any request", async () => {
    const { reading, p } = await setup();
    const readOnly = vault(Q, { parent: { entity: "x", vaultId: P }, modes: ["read"] });
    await expect(
      recordPerson({ reading, fetchImpl: p.fetch, queryClient: newQc() }, { vault: readOnly, vaults: VAULTS, agent: AGENT, kind: personKind(reading), name: "X", boxes: [], values: {} }),
    ).rejects.toBeInstanceOf(NotTheHolderError);
    expect(p.requests.length).toBe(0);
  });

  // The adder with no card of their own gets a basic one in their LANDING vault, made by the host; when the host cannot give a card the create is refused and nothing is written.
  it("an adder whose own card cannot be read nor made: the create is refused, and nothing is written", async () => {
    const { reading, p } = await setup();
    host = { ...host, adderCardOf: async () => { throw new Error("Your own card could not be made, so what you add would have no source. Nothing was saved. (refused)"); } };
    await expect(
      recordPerson({ reading, fetchImpl: p.fetch, queryClient: newQc() }, { vault: vP, vaults: VAULTS, agent: AGENT, kind: personKind(reading), name: "X", boxes: [], values: {} }),
    ).rejects.toThrow(/Your own card could not be made/);
    expect(p.requests.filter((r) => r.method === "POST" && r.path.endsWith("/c")).length).toBe(0);
  });

  it("the boxes are the kind's text fields and the text fields of a record a field holds; no name box, no reference box, no unwritable field", async () => {
    const { reading } = await setup();
    const keys = personBoxes(reading.fieldSets, personKind(reading)).map((b) => b.key);
    expect(keys).toContain("a:email");
    expect(keys).toContain("a:employment/a:org");
    expect(keys).not.toContain("a:name");
    expect(keys).not.toContain("a:actsOnBehalfOf");
    expect(fieldsFromBoxes(personBoxes(reading.fieldSets, personKind(reading)), { "a:email": " e@x ", "a:employment/a:org": "", x: "y" })).toEqual({ "a:email": "e@x" });
  });

  it("a field whose record type publishes no type name gives no box (the package refuses to write it)", async () => {
    // The fixture's own Employment field, served without its a:typeAttribute: no names added.
    const { reading } = await setup((m) => {
      const url = `${RIG}/base/vocab?status=all&limit=2000`;
      for (let at: string | null = url, i = 0; at && i < 50; i++) {
        const page = m.docs.get(at) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
        if (!page) break;
        for (const n of page["@graph"]) {
          const recordType = (n["a:fieldRecordType"] as { "@id"?: string } | undefined)?.["@id"];
          if (!recordType) continue;
          delete n["a:typeAttribute"];
          // The record type's own term document is where its type name is read.
          const doc = m.docs.get(`${RIG}${new URL(recordType).pathname}`) as Record<string, unknown> | undefined;
          if (doc) delete doc["a:typeAttribute"];
        }
        at = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
      }
    });
    const kind = personKind(reading);
    const held = kind.fields.find((f) => f.record);
    expect(held?.record?.typeName ?? null).toBeNull();
    const keys = personBoxes(reading.fieldSets, kind).map((b) => b.key);
    expect(keys.some((k) => held?.writeKey && k.startsWith(`${held.writeKey}/`))).toBe(false);
    expect(keys).toContain("a:email");
  });

  it("only an inline-literal:text field gets a free-text box; a token field (its value must be a member of the term's value set) gets none", async () => {
    const { reading } = await setup();
    const kind = personKind(reading);
    const email = kind.fields.find((f) => f.writeKey === "a:email")!;
    // The same field, served as a token: what the live master serves for a:level, a:timeZone, a:contactLanguage.
    const asToken = { ...kind, fields: kind.fields.map((f) => (f === email ? { ...f, encoding: "inline-literal:token" } : f)) };
    const keys = personBoxes(reading.fieldSets, asToken).map((b) => b.key);
    expect(personBoxes(reading.fieldSets, kind).map((b) => b.key)).toContain("a:email");
    expect(keys).not.toContain("a:email");
  });

  it("a name typed finds the vault's own record (findCandidates); a record of another vault is not offered", async () => {
    const { reading, p } = await setup();
    const kind = personKind(reading);
    const ann = await recordPerson({ reading, fetchImpl: p.fetch, queryClient: newQc() }, { vault: vP, vaults: VAULTS, agent: AGENT, kind, name: "Ann Lee", boxes: [], values: {} });
    const sharedHeld = { ...vShared, parent: { entity: "x", vaultId: P } };
    await recordPerson({ reading, fetchImpl: p.fetch, queryClient: newQc() }, { vault: sharedHeld, vaults: [vP, vQ, sharedHeld], agent: AGENT, kind, name: "Ann Other", boxes: [], values: {} });
    const found = await findPeople(reading, P, "ann", p.fetch);
    expect(found.candidates.map((c) => c.record)).toEqual([ann.record]);
    expect(found.complete).toBe(true);
  });
});

describe("the tag the create registered", () => {
  it("the tag the create registered is stored as the record's one master handle, and its full form resolves through the package to the same record", async () => {
    const { reading, p, grammar } = await setup();
    const made = await recordPerson({ reading, fetchImpl: p.fetch, queryClient: newQc() }, { vault: vQ, vaults: VAULTS, agent: AGENT, kind: personKind(reading), name: "Ann Lee", boxes: [], values: {} });
    // Read from the store (the fixture platform's own state), ⛔ not from the create's answer.
    const handles = p.handlesOf(made.record);
    expect(handles.length).toBe(1);
    expect(handles[0]!.facts["a:tagString"]).toBe(made.tag);
    expect(handles[0]!.facts["a:tagRole"]).toBe("master");
    expect(handles[0]!.vault).toBe(Q);
    expect(made.tag).toBe("ann-lee");
    // "annq" is the fixture vault's registered name, a TEST INPUT: this step reads no vault name.
    const full = formatFullTag({ tag: made.tag!, vaultName: "annq" }, grammar);
    expect(full).toBe("@ann-lee@annq");
    const back = await resolveTag({ origin: p.origin, fetch: p.fetch }, grammar, { text: full, vaults: [{ vaultId: Q, vaultName: "annq" }], context: { ownVaultName: null } });
    expect(back).toMatchObject({ status: "resolved", record: made.record, vaultId: Q });
  });
});
