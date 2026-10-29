// The nested-vault, vault-host, carrier and attribute-address rules of the reference check, each as a test with its control:
//   - a record of a vault NESTED in the named vault is refused (by the vault each row names);
//   - a role record is written at the vault's own address on the vault's own host and read back there; any other origin is refused
//     with nothing sent;
//   - the held-party target-only branch is entered only on a WHOLE reading that positively lacks the carrier; an incomplete
//     field-set reading is "not known yet" for every rule;
//   - a preferred channel is the attribute address the term's own facts give (`a/email`), never the type address `t/Email`;
//   - `a:heldParty` is checked and never written by the package.
import { describe, it, expect } from "vitest";
import type { ReferencePicker } from "./holderReference";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { readReferenceReading } from "../test/readingOf";
import { addReference, checkReference, PartialReferenceError, ReferenceRefusedError, ReferenceUnknownError, writeRoleRecord } from "./holderReference";
import { fixtureMaster, RIG, CONTEXT, t, a } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, PLATFORM_RIG, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const CHILD_VAULT = "https://annchild.example.test/vault";
const HOLDER = `${VAULT_HOST}/base/e/kai-self-card`;
const AGENT = "https://id.example.test/base/p/0b6c9a52-agent";
type M = ReturnType<typeof fixtureMaster>;

async function setup(opts: { mutate?: (m: M) => void; origin?: string } = {}) {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  // t/Email in the live shape (read 2026-10-02): the
  // same term as a/email, naming itself as its own @id.
  m.put("t/Email", { "@context": CONTEXT, "@id": t("Email"), "a:predicateAttribute": "a:email", "a:typeUri": t("Email"), "a:subTypeOf": { "@id": t("ElectronicContactPoint") } });
  opts.mutate?.(m);
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readReferenceReading(source, await resolveFieldSets(source), { references: true });
  const p = fixturePlatform({ origin: opts.origin ?? new URL(VAULT).origin });
  p.reach.add(VAULT).add(CHILD_VAULT);
  const picker: ReferencePicker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: source };
  return { picker, p, m, source };
}
const writes = (p: FixturePlatform) => p.requests.filter((r) => r.method !== "GET").length;
/** Add a field declaration to the master's listing: `predicateAttribute` declared as a field of `typeName`. */
function declareOn(m: M, predicateAttribute: string, typeName: string) {
  const pages: Record<string, unknown>[][] = [];
  let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`;
  while (url) {
    const page = m.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
    if (!page) break;
    pages.push(page["@graph"]);
    url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
  }
  pages.push([{ "@id": t(`Fixture${typeName}${predicateAttribute.replace(/\W/g, "")}`), "a:predicateAttribute": predicateAttribute, "a:label": predicateAttribute, "a:fieldOf": { "@id": t(typeName) } }]);
  m.listing(pages as never);
}

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ReferenceRefusedError) return err.reason;
    if (err instanceof ReferenceUnknownError || err instanceof VocabularyUnavailableError) return "unknown";
    if (err instanceof PartialReferenceError) return "partial";
    throw err;
  }
  return "resolved";
}

function world(p: FixturePlatform) {
  return {
    ben: p.seed(VAULT, "t:Person", { "a:name": "Ben", "a:email": "ben@example.test" }),
    owners: p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" }),
    acme: p.seed(VAULT, "t:Organization", { "a:name": "Acme" }),
    childBen: p.seed(CHILD_VAULT, "t:Person", { "a:name": "Ben (child)" }),
    childOwners: p.seed(CHILD_VAULT, "t:PartyGroup", { "a:name": "Owners (child)" }),
  };
}

describe("a record of a vault nested in the named vault is another vault's record", () => {
  // The vault each row names decides, not a proof by exclusion over `scannedVaults`. The row-vault tests proper are in
  // `rowVault.test.ts`.
  it("the parent's own records pass, read from the parent's list alone: no nested vault's list is asked (the control)", async () => {
    const { picker, p } = await setup();
    p.nest(VAULT, CHILD_VAULT);
    const w = world(p);
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("resolved");
    const lists = p.requests.filter((r) => r.path.endsWith("/records")).map((r) => new URL(r.url));
    expect(lists.length).toBe(1);
    expect(lists.every((u) => u.pathname.includes(encodeURIComponent(VAULT)) && !u.pathname.includes(encodeURIComponent(CHILD_VAULT)))).toBe(true);
  });

  it("a nested list that would answer 403 is never asked, so it cannot turn a check into 'not known yet'", async () => {
    const { picker, p } = await setup();
    p.nest(VAULT, CHILD_VAULT);
    const w = world(p);
    p.failNext("GET", `/lws/vault/${encodeURIComponent(CHILD_VAULT)}/records`, 403, { error: "Forbidden" });
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("resolved");
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.childOwners }))).toBe("not-in-vault");
    expect(writes(p)).toBe(0);
  });

  it("the row's own vault decides, whatever the answer's scannedVaults says", async () => {
    for (const scanned of [undefined, [CHILD_VAULT], [`${VAULT}/`, CHILD_VAULT]]) {
      const { picker, p } = await setup();
      p.nest(VAULT, CHILD_VAULT);
      const w = world(p);
      const real = picker.platform.fetch;
      picker.platform.fetch = async (url, init) => {
        const res = await real(url, init);
        if (!new URL(url).pathname.endsWith("/records")) return res;
        const { scannedVaults: _drop, ...rest } = (await res.json()) as Record<string, unknown>;
        return new Response(JSON.stringify(scanned === undefined ? rest : { ...rest, scannedVaults: scanned }), { status: 200 });
      };
      expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("resolved");
      expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.childOwners }))).toBe("not-in-vault");
      expect(writes(p)).toBe(0);
    }
  });
});

describe("a role record is written at the vault's own address, on the vault's own host", () => {
  it("the PUT goes to <vault>/r/<id> on the vault's host, the record is minted there and read back there", async () => {
    const { picker, p } = await setup();
    const w = world(p);
    const made = await writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.owners });
    const puts = p.requests.filter((r) => r.method === "PUT");
    expect(puts.map((r) => r.path)).toEqual([`/vault/r/${made.record.split("/").pop()}`]);
    expect(puts[0]!.url.startsWith("https://ann.example.test/vault/r/sh-")).toBe(true);
    expect(made.record.startsWith(`${VAULT}/r/sh-`)).toBe(true);
    expect(p.requests.some((r) => r.method === "GET" && r.url === `https://ann.example.test/vault/r/${made.record.split("/").pop()}`)).toBe(true);
    expect(p.count("PUT", "/base/r/")).toBe(0);
  });

  it("an origin whose host is not the named vault's host is refused before anything is sent, for both writers", async () => {
    const { picker, p } = await setup({ origin: PLATFORM_RIG });
    const w = world(p);
    expect(await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.owners }))).toBe("origin-not-vault-host");
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.owners }))).toBe("origin-not-vault-host");
    expect(p.requests.length).toBe(0);
  });

  it("a minted entity not on the vault's host is reported written and unread, never read through another host", async () => {
    const { picker, p } = await setup();
    const w = world(p);
    const real = picker.platform.fetch;
    picker.platform.fetch = async (url, init) => {
      const res = await real(url, init);
      if ((init?.method ?? "GET") !== "PUT") return res;
      const body = (await res.json()) as Record<string, unknown>;
      return new Response(JSON.stringify({ ...body, entity: String(body.entity).replace("ann.example.test", "node.example.test") }), { status: 201 });
    };
    let err: unknown;
    try {
      await writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.owners });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PartialReferenceError);
    expect((err as PartialReferenceError).written).toMatch(/^https:\/\/node\.example\.test\/vault\/r\/sh-/);
    expect(p.requests.filter((r) => r.method === "GET" && r.url.includes("/r/sh-")).length).toBe(0);
  });
});

describe("the carrier is read positively", () => {
  it("a stakeholder kind named by its full IRI is that kind (held-party refused); another absolute IRI is refused, not cut to its last segment", async () => {
    const { picker, p } = await setup();
    const w = world(p);
    const c = (carrierType: string, field = "a:heldParty", target = w.ben) => reason(checkReference(picker, { vaultId: VAULT, field, carrierType, target }));
    expect(await c("https://ontology.platform.example.test/base/t/Person")).toBe("carrier-type-not-admitted");
    expect(await c(t("Person"))).toBe("carrier-type-not-admitted");
    expect(await c("http://schema.org/Person")).toBe("carrier-type-not-admitted");
    expect(await c(t("Project"))).toBe("carrier-type-not-admitted"); // option (i): an absolute IRI must be a kind's own
    expect(await c("http://schema.org/Person", "a:memberOf", w.owners)).toBe("carrier-type-not-admitted");
    expect(await c("a:Person")).toBe("carrier-type-not-admitted");
    expect(await c("Per son")).toBe("carrier-type-not-admitted");
    // Controls: the documented forms and the stated limit.
    expect(await c(t("Person"), "a:memberOf", w.owners)).toBe("resolved");
    expect(await c("t:Person", "a:memberOf", w.owners)).toBe("resolved");
    expect(await c("HeldPartyFieldClaim")).toBe("resolved");
    expect(writes(p)).toBe(0);
  });

  // The write-time check takes nothing from the page's reading that admits or refuses, and its being not whole decides nothing
  // either: it answers what the live master answers. A live set not whole is still "not known yet" (see `holderReferenceKept.test.ts`).
  it("a field-set reading that is not whole decides nothing; the check answers what the live master answers", async () => {
    const { picker, p } = await setup();
    const w = world(p);
    const fs = picker.reading.fieldSets;
    const person = Object.values(fs.byKind).find((k) => k.name === "Person")!;
    // every set present, the reading flagged not whole.
    picker.reading.fieldSets = { ...fs, complete: false, incompleteAt: ["declarations: page 2"] };
    const c = (field: string, carrierType: string, target: string, carrierFacts?: Record<string, unknown>) =>
      reason(checkReference(picker, { vaultId: VAULT, field, carrierType, target, carrierFacts }));
    expect(await c("a:memberOf", "Person", w.owners)).toBe("resolved");
    expect(await c("a:actsOnBehalfOf", "Person", w.acme)).toBe("resolved");
    expect(await c("a:preferredChannel", "Person", a("email"), { "a:email": "x@y" })).toBe("resolved");
    // Person's set missing from a reading that is not whole.
    const byKind = { ...fs.byKind };
    delete byKind[person.kind];
    picker.reading.fieldSets = { ...fs, byKind, complete: false, incompleteAt: ["declarations: page 2"] };
    expect(await c("a:heldParty", "Person", w.ben)).toBe("carrier-type-not-admitted"); // the live master offers no a:heldParty on Person
    expect(await c("a:memberOf", "Person", w.owners)).toBe("resolved");
    expect(await c("a:heldParty", "HeldPartyFieldClaim", w.ben)).toBe("resolved");
    expect(writes(p)).toBe(0);
  });
});

describe("a preferred channel is the attribute's own address only", () => {
  it("t/Email, served as the same term, is refused; a/email is admitted (the control)", async () => {
    const { picker } = await setup();
    const c = (target: string) => reason(checkReference(picker, { vaultId: VAULT, field: "a:preferredChannel", carrierType: "Person", carrierFacts: { "a:email": "x@y" }, target }));
    expect(await c(a("email"))).toBe("resolved");
    expect(await c(t("Email"))).toBe("not-a-contact-term");
  });

  it("a term at its own address whose predicate attribute is another attribute is refused (the address is derived from the term's facts)", async () => {
    const { picker } = await setup({
      mutate: (m) => m.put("a/fixtureEmailAlias", { "@context": CONTEXT, "@id": a("fixtureEmailAlias"), "a:predicateAttribute": "a:email", "a:typeUri": t("Email"), "a:subTypeOf": { "@id": t("ElectronicContactPoint") } }),
    });
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:preferredChannel", carrierType: "Person", carrierFacts: { "a:email": "x@y" }, target: a("fixtureEmailAlias") }))).toBe("not-a-contact-term");
  });
});

describe("a:heldParty is checked, never written by the package", () => {
  it("even on a carrier whose kind offered the field, addReference refuses a:heldParty with nothing sent", async () => {
    // The field is offered on Person by the LIVE master (a declaration of a:heldParty with a:fieldOf Person), ⛔ not by an edit of
    // the page's field set, which the write-time check does not read.
    const { picker, p } = await setup({ mutate: (m) => declareOn(m, "a:heldParty", "Person") });
    const w = world(p);
    // The check itself answers (the field is now offered on Person): the control.
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:heldParty", carrierType: "Person", target: w.acme }))).toBe("resolved");
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:heldParty", target: w.acme }))).toBe("held-party-not-written");
    expect(writes(p)).toBe(0);
  });
});
