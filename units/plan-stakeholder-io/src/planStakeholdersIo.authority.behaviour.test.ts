// @vitest-environment node
// The writes of an Authority relation beyond the ported cases: the addresses it forms, the relation type of a Resource Owner, what it returns,
// the order of end and write, and where the migration of the older record keys reads from.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTHORITY_RELATION_TYPE, RESOURCE_OWNER_RELATION_TYPE } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import { endThenWriteAuthority, migratedAuthorityRelation, writeAuthorityRelation } from "./planStakeholdersIo";
import { H, P, installAuthorityWire } from "../test/authorityWire";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

const FN = `${H}/base/e/fn1`;
const KAI = `${H}/base/e/kai`;
const ORG = `${H}/base/e/org`;
const factsOf = (c: { body: Record<string, unknown> | null }) => c.body!.facts as Record<string, unknown>;

describe("writeAuthorityRelation: addresses", () => {
  it("forms the stakeholder's and the record's addresses from their ids when they are not addresses", async () => {
    const wire = installAuthorityWire();
    await writeAuthorityRelation({ recordId: "fn1", recordUri: null, stakeholderUri: "kai", vaultId: P });
    const facts = factsOf(wire.puts()[0]!);
    expect(facts["role:stakeholder"]).toEqual({ "@id": `${P}/e/kai` });
    expect(facts["role:referenced-by"]).toEqual({ "@id": `${P}/e/fn1` });
  });

  it("keeps an address it is given, for the stakeholder and for the record", async () => {
    const wire = installAuthorityWire();
    await writeAuthorityRelation({ recordId: "fn1", recordUri: FN, stakeholderUri: KAI, vaultId: P });
    const facts = factsOf(wire.puts()[0]!);
    expect(facts["role:stakeholder"]).toEqual({ "@id": KAI });
    expect(facts["role:referenced-by"]).toEqual({ "@id": FN });
  });

  it("forms the record's address from its id when the address it is given is not one", async () => {
    const wire = installAuthorityWire();
    await writeAuthorityRelation({ recordId: "fn1", recordUri: "not-an-address", stakeholderUri: KAI, vaultId: P });
    expect(factsOf(wire.puts()[0]!)["role:referenced-by"]).toEqual({ "@id": expect.stringContaining("/e/") });
  });
});

describe("writeAuthorityRelation: what is written and returned", () => {
  const input = { recordId: "fn1", recordUri: FN, stakeholderUri: KAI, vaultId: P };

  it("writes a Resource Owner as its own relation type and answers that type", async () => {
    const wire = installAuthorityWire();
    const written = await writeAuthorityRelation({ ...input, relationType: RESOURCE_OWNER_RELATION_TYPE });
    expect(wire.puts()[0]!.body!.type).toBe(RESOURCE_OWNER_RELATION_TYPE);
    expect(written.type).toBe(RESOURCE_OWNER_RELATION_TYPE);
  });

  it("answers the relation as the record's side, naming the new relation's address and the stakeholder", async () => {
    installAuthorityWire();
    const written = await writeAuthorityRelation(input);
    expect(written.role).toBe("role:referenced-by");
    expect(written.type).toBe(AUTHORITY_RELATION_TYPE);
    expect(written.relation).toMatch(/\/r\//);
    expect(written.members).toEqual([{ member: KAI, role: "role:stakeholder" }]);
  });

  it("puts acts-for on the relation trimmed, and leaves it out when it is blank, null or absent", async () => {
    const wire = installAuthorityWire();
    await writeAuthorityRelation({ ...input, actsFor: `  ${ORG} ` });
    await writeAuthorityRelation({ ...input, actsFor: "   " });
    await writeAuthorityRelation({ ...input, actsFor: null });
    const [a, b, c] = wire.puts().map(factsOf);
    expect(a!["a:authorityActsFor"]).toEqual({ "@id": ORG });
    expect(b).not.toHaveProperty("a:authorityActsFor");
    expect(c).not.toHaveProperty("a:authorityActsFor");
    expect(a!["a:relationType"]).toBe("stakeholder");
  });

  it("names the vault the relation is written into", async () => {
    const wire = installAuthorityWire();
    await writeAuthorityRelation(input);
    expect(wire.puts()[0]!.body!.vault).toBe(P);
  });
});

describe("endThenWriteAuthority", () => {
  const input = { recordId: "fn1", recordUri: FN, stakeholderUri: KAI, vaultId: P };

  it("ends the relation first and answers the Authority it wrote", async () => {
    const wire = installAuthorityWire();
    const written = await endThenWriteAuthority(`${H}/base/r/plain-1`, input);
    expect(wire.ends()).toHaveLength(1);
    expect(wire.puts()).toHaveLength(1);
    expect(written.type).toBe(AUTHORITY_RELATION_TYPE);
  });

  it("ends a relation given by its id in the vault it is written into", async () => {
    const wire = installAuthorityWire();
    await endThenWriteAuthority("plain-1", input);
    expect(wire.ends()[0]!.url.startsWith("https://p.platform.example.test/")).toBe(true);
  });

  it("writes nothing when the end fails", async () => {
    const wire = installAuthorityWire({ endFails: true });
    await expect(endThenWriteAuthority(`${H}/base/r/plain-1`, input)).rejects.toThrow();
    expect(wire.puts()).toEqual([]);
  });
});

describe("migratedAuthorityRelation", () => {
  it("reads the older keys from the served document first, and from the flat facts when the served one has none", async () => {
    const wire = installAuthorityWire();
    const served = await migratedAuthorityRelation(
      { id: "fn1", entityUri: FN, facts: { authorityHolder: ORG }, served: { facts: { authorityHolder: { "@id": KAI } } } },
      P,
      [],
    );
    expect(served?.relation?.members?.[0]?.member).toBe(KAI);
    const flat = await migratedAuthorityRelation({ id: "fn1", entityUri: FN, facts: { authorityHolder: ORG } }, P, []);
    expect(flat?.relation?.members?.[0]?.member).toBe(ORG);
    expect(wire.puts()).toHaveLength(2);
  });

  it("writes the record's address as the record the relation hangs on, and no acts-for when the older keys name none", async () => {
    const wire = installAuthorityWire();
    await migratedAuthorityRelation({ id: "fn1", entityUri: FN, facts: { authorityHolder: KAI } }, P, undefined);
    const facts = factsOf(wire.puts()[0]!);
    expect(facts["role:referenced-by"]).toEqual({ "@id": FN });
    expect(facts).not.toHaveProperty("a:authorityActsFor");
  });

  it("writes nothing when the holder already has an Authority relation", async () => {
    const wire = installAuthorityWire();
    const rows = [{ relation: `${H}/base/r/a1`, role: "role:referenced-by", type: AUTHORITY_RELATION_TYPE, members: [{ member: KAI, role: "role:stakeholder" }] }];
    const out = await migratedAuthorityRelation({ id: "fn1", entityUri: FN, facts: { authorityHolder: KAI } }, P, rows);
    expect(out).toEqual({ relation: null });
    expect(wire.puts()).toEqual([]);
  });

  it("writes when the only Authority the record has is another person's, and ignores a plain stakeholder relation of the same person", async () => {
    const wire = installAuthorityWire();
    const rows = [
      { relation: `${H}/base/r/a1`, role: "role:referenced-by", type: AUTHORITY_RELATION_TYPE, members: [{ member: ORG, role: "role:stakeholder" }] },
      { relation: `${H}/base/r/s1`, role: "role:referenced-by", type: "t:StakeholderOf", members: [{ member: KAI, role: "role:stakeholder" }] },
    ];
    const out = await migratedAuthorityRelation({ id: "fn1", entityUri: FN, facts: { authorityHolder: KAI } }, P, rows);
    expect(out?.relation?.type).toBe(AUTHORITY_RELATION_TYPE);
    expect(wire.puts()).toHaveLength(1);
  });

  it("answers null for a record without the older keys, and reads no vault for it", async () => {
    const wire = installAuthorityWire();
    expect(await migratedAuthorityRelation({ id: "fn1", entityUri: FN }, P, [])).toBeNull();
    expect(wire.calls).toEqual([]);
  });
});
