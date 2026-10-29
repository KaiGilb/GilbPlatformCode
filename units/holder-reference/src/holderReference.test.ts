// A reference is written only to the holder's own record.
//
// Refused, with nothing sent: a target that is a party's identity, a principal, a record of another vault, or an IRI the typed list
// does not hold. Each ruled shape is written with a checked target.
//
// Expected values are LITERALS. The master is `fixtureMaster` refreshed by `withReferenceTerms`; the platform is `fixturePlatform`.
import { describe, it, expect } from "vitest";
import type { ReferencePicker } from "./holderReference";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { readReferenceReading } from "../test/readingOf";
import {
  addReference,
  checkReference,
  ReferenceRefusedError,
  ReferenceUnknownError,
  writeRoleRecord,
} from "./holderReference";
import { fixtureMaster, RIG, t, a } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const OTHER_VAULT = "https://ann2.example.test/vault";
const HOLDER = `${VAULT_HOST}/base/e/kai-self-card`;
const AGENT = "https://id.example.test/base/p/0b6c9a52-agent";
/** A party's identity anchor and an account principal, as GilbPlatform mints them. */
const IDENTITY = "https://id.example.test/base/p/7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const PRINCIPAL = "https://id.example.test/base/e/agent-account-ben";

async function setup(mutate?: (m: ReturnType<typeof fixtureMaster>) => void) {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  mutate?.(m);
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readReferenceReading(source, await resolveFieldSets(source), { references: true });
  // Served at the named vault's own origin: the package's writers refuse any other.
  const p = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT).add(OTHER_VAULT);
  const picker: ReferencePicker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: source };
  return { picker, p, m };
}

/** Writes sent to the platform: anything but a GET. */
const writes = (p: FixturePlatform) => p.requests.filter((r) => r.method !== "GET").length;

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

function seedWorld(p: FixturePlatform) {
  return {
    ben: p.seed(VAULT, "t:Person", { "a:name": "Ben", "a:email": "ben@example.test" }),
    acme: p.seed(VAULT, "t:Organization", { "a:name": "Acme AS" }),
    owners: p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" }),
    systems: p.seed(VAULT, "t:SoftwareSystemGroup", { "a:name": "Our systems" }),
    things: p.seed(VAULT, "t:ObjectGroup", { "a:name": "Things we keep" }),
    ourapp: p.seed(VAULT, "t:SoftwareSystem", { "a:name": "Our app" }),
    bot: p.seed(VAULT, "t:AiAgent", { "a:name": "Our bot" }),
    project: p.seed(VAULT, "t:Project", { "a:name": "Project X" }),
    benElsewhere: p.seed(OTHER_VAULT, "t:Person", { "a:name": "Ben" }),
    ownersElsewhere: p.seed(OTHER_VAULT, "t:PartyGroup", { "a:name": "Owners" }),
    selfCardElsewhere: p.seed(OTHER_VAULT, "t:Person", { "a:name": "Ann (vault 2)" }),
  };
}

describe("refused, with nothing sent", () => {
  it("a party's identity anchor, a principal, another vault's record or self card, and an IRI the list does not hold are refused for every record reference", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    const notHeld = `${VAULT_HOST}/base/e/never-written`;
    // Each field on a carrier it lawfully takes, so the refusal is the target's.
    for (const [field, carrierType] of [["a:memberOf", "Person"], ["a:heldParty", "HeldPartyFieldClaim"], ["a:actsOnBehalfOf", "Person"]] as const) {
      for (const target of [IDENTITY, PRINCIPAL, w.ownersElsewhere, w.benElsewhere, w.selfCardElsewhere, notHeld]) {
        expect(await reason(checkReference(picker, { vaultId: VAULT, field, carrierType, target })), `${field} → ${target}`).toBe("not-in-vault");
      }
    }
    expect(writes(p)).toBe(0);
  });

  it("a role record whose player or group is not the holder's record in the named vault is refused, and nothing is written", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    for (const [player, group] of [
      [IDENTITY, w.owners],
      [PRINCIPAL, w.owners],
      [w.benElsewhere, w.owners],
      [w.ben, w.ownersElsewhere],
      [w.ben, IDENTITY],
    ] as const) {
      expect(await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player, group }))).toBe("not-in-vault");
    }
    expect(writes(p)).toBe(0);
    expect(p.requests.filter((r) => r.method === "PUT").length).toBe(0);
  });

  it("a target that is not an address is refused (a copy of an address is not a reference)", async () => {
    const { picker, p } = await setup();
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: "Owners" }))).toBe("not-an-iri");
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:preferredChannel", carrierType: "Person", carrierFacts: { "a:email": "x@y" }, target: "ben@example.test" }))).toBe("not-an-iri");
    expect(writes(p)).toBe(0);
  });

  it("no vault named, no agent named: refused", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    expect(await reason(checkReference(picker, { vaultId: "", field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("no-vault");
    expect(await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: " ", player: w.ben, group: w.owners }))).toBe("no-agent");
    expect(writes(p)).toBe(0);
  });
});

describe("the type each reference admits is read live", () => {
  it("a person may be a plain member of a party group or an object group, not of a software system group", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    expect((await checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners })).targetType).toBe("PartyGroup");
    expect((await checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "t:Person", target: w.things })).targetType).toBe("ObjectGroup");
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.systems }))).toBe("type-not-admitted");
    // A person record is not a group.
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.acme }))).toBe("type-not-admitted");
    expect(writes(p)).toBe(0);
  });

  it("a carrier type no role relation admits as a member is refused", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "TagHandle", target: w.owners }))).toBe("carrier-type-not-admitted");
  });

  it("a held party is a party kind or a party-member-of role record; a software system that is not an AI agent is refused", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    const role = await writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.owners });
    const held = async (target: string) => reason(checkReference(picker, { vaultId: VAULT, field: "a:heldParty", carrierType: "HeldPartyFieldClaim", target }));
    expect(await held(w.ben)).toBe("resolved");
    expect(await held(w.bot)).toBe("resolved");
    expect(await held(role.record)).toBe("resolved");
    expect(await held(w.ourapp)).toBe("type-not-admitted");
    expect(await held(w.project)).toBe("type-not-admitted");
    expect((await checkReference(picker, { vaultId: VAULT, field: "a:heldParty", carrierType: "HeldPartyFieldClaim", target: w.ben })).value).toEqual({ "@id": w.ben });
  });

  it("acts-on-behalf-of points at a party, not at a role record and not at an object player", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    const role = await writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.owners });
    const rep = async (target: string) => reason(checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target }));
    expect(await rep(w.acme)).toBe("resolved");
    expect(await rep(role.record)).toBe("type-not-admitted");
    expect(await rep(w.project)).toBe("type-not-admitted");
  });

  it("a preferred channel is a contact-point attribute term that is a field of the carrier and under which the carrier holds a value; the vault check is not applied", async () => {
    const { picker, p } = await setup();
    const ch = async (target: string, facts: Record<string, unknown>, carrierType = "Person") =>
      reason(checkReference(picker, { vaultId: VAULT, field: "a:preferredChannel", carrierType, carrierFacts: facts, target }));
    expect(await ch(a("email"), { "a:email": "ben@example.test" })).toBe("resolved");
    // Any spelling of the value counts: the framed read compacts to the bare key.
    expect(await ch(a("email"), { email: "ben@example.test" })).toBe("resolved");
    expect(await ch(a("email"), { "a:name": "Ben" })).toBe("carrier-holds-no-value");
    expect(await ch(a("name"), { "a:name": "Ben" })).toBe("not-a-contact-term");
    expect(await ch(a("email"), { "a:email": "x@y" }, "PartyGroup")).toBe("not-a-field-of-carrier");
    expect(await ch(a("nosuchterm"), { "a:email": "x@y" })).toBe("not-a-contact-term");
    // No vault list was read for it: the target is on the master.
    expect(p.count("GET", "/lws/vault/")).toBe(0);
    expect(writes(p)).toBe(0);
  });

  it("a reference field this function does not write (a:skill, a:employment) is not checked here", async () => {
    const { picker } = await setup();
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:skill", carrierType: "Person", target: HOLDER }))).toBe("not-a-reference-field");
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:employment", carrierType: "Person", target: HOLDER }))).toBe("not-a-reference-field");
  });
});

describe("not known yet is never 'admits nothing'", () => {
  // The page's reading being not whole decides nothing at write time. A check that needs the contact-point listing reads it live
  // and answers "not known yet"; one that does not need it answers.
  it("a contact-point listing that is not complete: the preferred channel is 'not known yet', with nothing sent; a membership answers", async () => {
    const { picker, p } = await setup((m) => m.children("ElectronicContactPoint", [{ name: "Email" }], false));
    const w = seedWorld(p);
    expect(picker.reading.references!.complete).toBe(false);
    expect(
      await reason(checkReference(picker, { vaultId: VAULT, field: "a:preferredChannel", carrierType: "Person", carrierFacts: { "a:email": "x@y" }, target: a("email") })),
    ).toBe("unknown");
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("resolved");
    expect(p.requests.filter((r) => r.method !== "GET").length).toBe(0);
  });

  it("a party role whose kinds listing is not complete: not known yet", async () => {
    const { picker } = await setup((m) => m.children("Person", [{ name: "Passenger" }], false));
    expect(picker.reading.references!.complete).toBe(false);
    expect(picker.reading.references!.incompleteAt.some((x) => x.includes("PartyMemberOf"))).toBe(true);
  });

  it("a typed list that never says complete: not known yet, never 'not in the vault'", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    const real = p.fetch;
    picker.platform.fetch = async (url, init) => {
      const res = await real(url, init);
      if (!url.includes("/records?")) return res;
      const body = (await res.json()) as Record<string, unknown>;
      return new Response(JSON.stringify({ ...body, complete: false, records: [] }), { status: 200 });
    };
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("unknown");
  });
});

describe("each ruled shape is written with a checked target", () => {
  it("one role record of each relation kind, its ends the holder's records, its type the relation's own", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    const party = await writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.owners });
    const software = await writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ourapp, group: w.systems });
    const object = await writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.project, group: w.things });
    expect([party.writeType, software.writeType, object.writeType]).toEqual(["t:PartyMemberOf", "t:SoftwareSystemMemberOf", "t:ObjectMemberOf"]);
    for (const [r, player, group] of [[party, w.ben, w.owners], [software, w.ourapp, w.systems], [object, w.project, w.things]] as const) {
      const stored = p.entities.get(r.record)!;
      expect(stored.vault).toBe(VAULT);
      expect(stored.facts["role:source"]).toEqual({ "@id": player });
      expect(stored.facts["role:target"]).toEqual({ "@id": group });
    }
    const puts = p.requests.filter((r) => r.method === "PUT");
    expect(puts).toHaveLength(3);
    expect(puts[0]!.body).toEqual({ type: "t:PartyMemberOf", vault: VAULT, agent: AGENT, facts: { "role:source": { "@id": w.ben }, "role:target": { "@id": w.owners } } });
  });

  it("the relation is chosen by the group's EXACT type: a software system group takes software-system-member-of, not object-member-of", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    expect((await writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.bot, group: w.systems })).writeType).toBe("t:SoftwareSystemMemberOf");
    // A person is not a player of software-system-member-of.
    expect(await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.systems }))).toBe("type-not-admitted");
    // A project is a player of object-member-of only.
    expect(await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.project, group: w.owners }))).toBe("type-not-admitted");
    expect(p.count("PUT", "/vault/r/")).toBe(1);
  });

  it("an existing carrier in another vault, or one no LWS address answers as, is refused with nothing sent", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.benElsewhere, field: "a:memberOf", target: w.owners }))).toBe("not-in-vault");
    // The LWS route answers 404 for it: the address is not proven, so nothing is written.
    p.failNext("GET", `/lws/r/${w.ben.split("/").pop()}`, 404, { error: "NotFound" });
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.owners }))).toBe("carrier-not-addressable");
    expect(writes(p)).toBe(0);
    // The control: the same carrier, its address answering, is written.
    await addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.owners });
    expect(p.requests.filter((r) => r.method === "PATCH").map((r) => r.path)).toEqual([`/lws/r/${w.ben.split("/").pop()}`]);
  });
});

describe("the carrier is checked before the target", () => {
  it("a carrier whose kind the master does not offer the field on is refused, for every record reference, with nothing sent", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    const c = async (field: string, carrierType: string, target: string) => reason(checkReference(picker, { vaultId: VAULT, field, carrierType, target }));
    expect(await c("a:actsOnBehalfOf", "PartyGroup", w.acme)).toBe("carrier-type-not-admitted");
    expect(await c("a:actsOnBehalfOf", "AiAgent", w.acme)).toBe("carrier-type-not-admitted");
    expect(await c("a:memberOf", "SoftwareSystem", w.systems)).toBe("carrier-type-not-admitted"); // a role record only
    expect(await c("a:memberOf", "AiAgent", w.owners)).toBe("carrier-type-not-admitted");
    expect(await c("a:heldParty", "Person", w.ben)).toBe("carrier-type-not-admitted"); // never on the party's own record
    expect(await c("a:heldParty", "t:Organization", w.ben)).toBe("carrier-type-not-admitted");
    expect(await c("a:actsOnBehalfOf", "Project", w.acme)).toBe("carrier-type-not-admitted"); // not a stakeholder kind
    expect(await c("a:memberOf", "Project", w.things)).toBe("carrier-type-not-admitted");
    expect(writes(p)).toBe(0);
  });

  it("the controls: the declared carriers pass (Person and Organization for acts-on-behalf-of; Person, Organization, Party Group for member-of)", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    const c = async (field: string, carrierType: string, target: string) => reason(checkReference(picker, { vaultId: VAULT, field, carrierType, target }));
    expect(await c("a:actsOnBehalfOf", "Person", w.acme)).toBe("resolved");
    expect(await c("a:actsOnBehalfOf", "Organization", w.ben)).toBe("resolved");
    expect(await c("a:memberOf", "PartyGroup", w.owners)).toBe("resolved");
    expect(await c("a:memberOf", "Organization", w.owners)).toBe("resolved");
  });

  it("a held party on a carrier that is not a stakeholder kind has its target checked only (the master declares no carrier for it)", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:heldParty", carrierType: "HeldPartyFieldClaim", target: w.ben }))).toBe("resolved");
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:heldParty", carrierType: "HeldPartyFieldClaim", target: IDENTITY }))).toBe("not-in-vault");
  });

  it("addReference sends nothing for a wrong carrier: member-of on a software system, held-party on a person, acts-on-behalf-of on a party group", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ourapp, field: "a:memberOf", target: w.systems }))).toBe("carrier-type-not-admitted");
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:heldParty", target: w.acme }))).toBe("carrier-type-not-admitted");
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.owners, field: "a:actsOnBehalfOf", target: w.acme }))).toBe("carrier-type-not-admitted");
    expect(writes(p)).toBe(0);
  });
});
