// Pick-or-create. Create writes the holder's record into the named vault with `a:statedBy` = the holder; pick always returns the
// holder's record. The record's TAG is the PLATFORM's (it makes the master at create, and the package reads it back), so these
// tests do not register or derive a tag; they read the platform's.
//
// Expected values are LITERALS. The master is `fixtureMaster` + the served TagStandard record + field declarations that differ per
// kind; the platform is `fixturePlatform` (the shipped routes' shapes). Both are fetched from origins that are not the identity
// host of any IRI they serve.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import {
  createRecord,
  CreateRefusedError,
  findCandidates,
  PartialCreateError,
  pick,
  pickByTag,
  pickOrCreate,
  readPickerVocabulary,
  type CreateInput,
  type PickOrCreateInput,
  type Picker,
} from "./pickOrCreate";
import { addTag, NoTagRoutesError, NO_TAG_ROUTES_SENTENCE } from "@kaigilb/gilbplatformcode-tag-client";
import { PlatformError } from "@kaigilb/gilbplatformcode-record-sync";
import { VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { fixtureMaster, RIG, t } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { fixturePlatform, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const OTHER_VAULT = "https://other.example.test/vault";
const HOLDER = "https://ann.example.test/vault/e/ann-self-card";
const AGENT = "https://ann.example.test/vault/e/app-ourapp";

async function setup(tags?: "auto" | "ensure-only" | "off"): Promise<{ picker: Picker; p: FixturePlatform; m: ReturnType<typeof fixtureMaster> }> {
  const m = withWritableFields(withTagStandard(fixtureMaster()));
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readPickerVocabulary(source, await resolveFieldSets(source));
  // createRecord, like every writer, refuses an origin that is not the named
  // vault's own host, so the fixture is served at the vault's own origin.
  const p = fixturePlatform({ origin: new URL(VAULT).origin, ...(tags ? { tags } : {}) });
  p.reach.add(VAULT).add(OTHER_VAULT);
  return { picker: { platform: { origin: p.origin, fetch: p.fetch }, reading }, p, m };
}

const ben = (over: Partial<PickOrCreateInput> = {}): PickOrCreateInput => ({
  vaultId: VAULT,
  holder: HOLDER,
  agent: AGENT,
  kind: t("Person"),
  name: "Ben Lee",
  fields: { "a:email": "ben@example.test" },
  ...over,
});

const refusal = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (err) {
    if (err instanceof CreateRefusedError) return err.reason;
    throw err;
  }
  return "not refused";
};

describe("createRecord — the holder's record, in the named vault", () => {
  it("writes one record with the name, the fields, and the holder as its stater", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, ben());
    const stored = p.entities.get(made.record)!;
    expect(stored.vault).toBe(VAULT);
    expect(stored.type).toBe("t:Person");
    // `a:lwsSelf` is the platform's own stamp on a create, not a fact this package sent.
    expect(stored.facts).toEqual({
      "a:name": "Ben Lee",
      "a:email": "ben@example.test",
      "a:statedBy": { "@id": HOLDER },
      "a:lwsSelf": { "@id": made.record },
    });
    const sent = p.requests.find((r) => r.method === "POST" && r.path.endsWith("/c"))!;
    // At the vault's own origin.
    expect(sent.url).toBe(`${new URL(VAULT).origin}/lws/vault/${encodeURIComponent(VAULT)}/c`);
    expect(sent.body).toEqual({
      type: "t:Person",
      facts: { "a:name": "Ben Lee", "a:email": "ben@example.test", "a:statedBy": { "@id": HOLDER } },
      agent: AGENT,
    });
  });

  it("returns the record's own IRI, as the record says it, not the address the create answered with", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, ben());
    expect(made.record).toBe(`${VAULT_HOST}/base/e/x0001`);
    expect(made).toMatchObject({ created: true, vaultId: VAULT, held: [] });
    // The read-back went to the platform origin (the vault's own), with the resource
    // address's own path.
    expect(p.requests.some((r) => r.method === "GET" && r.url === `${new URL(VAULT).origin}/lws/r/x0001`)).toBe(true);
  });

  it("writes the name under a:name only, never under the label spelling", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, ben({ fields: undefined }));
    expect(Object.keys(p.entities.get(made.record)!.facts).sort()).toEqual(["a:lwsSelf", "a:name", "a:statedBy"]);
  });

  it("writes a field under the one current spelling its term publishes", async () => {
    const { picker, p } = await setup();
    // Asked for by the retired spelling, by the bare spelling and by the term IRI.
    const byRetired = await createRecord(picker, ben({ name: "A One", fields: { "a:fixtureTelephone": "+47 1" } }));
    const byBare = await createRecord(picker, ben({ name: "B Two", fields: { phone: "+47 2" } }));
    const byTerm = await createRecord(picker, ben({ name: "C Three", fields: { [t("Phone")]: "+47 3" } }));
    expect(p.entities.get(byRetired.record)!.facts["a:phone"]).toBe("+47 1");
    expect(p.entities.get(byBare.record)!.facts["a:phone"]).toBe("+47 2");
    expect(p.entities.get(byTerm.record)!.facts["a:phone"]).toBe("+47 3");
    for (const r of [byRetired, byBare, byTerm]) expect("a:fixtureTelephone" in p.entities.get(r.record)!.facts).toBe(false);
  });

  it("writes no reference to an existing record: it cannot check the target is the holder's own", async () => {
    const { picker, p } = await setup();
    const acme = p.seed(VAULT, "t:Organization", { "a:name": "Acme" });
    const before = p.entities.size;
    // A record of this vault, a party's own identity, and a record of another vault: all three
    // look the same to a create, so none is written.
    for (const target of [acme, "https://id.example.test/base/p/00000000-0000-4000-8000-00000000000a", p.seed(OTHER_VAULT, "t:Organization", { "a:name": "Elsewhere" })]) {
      expect(await refusal(createRecord(picker, ben({ fields: { "a:actsOnBehalfOf": { "@id": target } } }))), target).toBe("field-not-writable");
    }
    expect(p.entities.size).toBe(before + 1);
    expect(p.requests).toHaveLength(0);
  });

  it("a list is written only to a field whose term declares it multi, and never an empty one", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, ben({ fields: { "a:phone": ["+47 1", "+47 2"] } }));
    expect(p.entities.get(made.record)!.facts["a:phone"]).toEqual(["+47 1", "+47 2"]);
    const before = p.entities.size;
    expect(await refusal(createRecord(picker, ben({ name: "B Two", fields: { "a:email": ["a@x.test", "b@x.test"] } })))).toBe("field-value");
    expect(await refusal(createRecord(picker, ben({ name: "C Three", fields: { "a:email": [] } })))).toBe("field-value");
    expect(await refusal(createRecord(picker, ben({ name: "D Four", fields: { "a:phone": [] } })))).toBe("field-value");
    expect(await refusal(createRecord(picker, ben({ name: "E Five", fields: { "a:employment": { record: { "a:org": [] } } } })))).toBe("field-value");
    expect(p.entities.size).toBe(before);
  });

  it("each kind is written as its own type, with its own fields", async () => {
    const { picker, p } = await setup();
    const org = await createRecord(picker, ben({ kind: t("Organization"), name: "Acme AS", fields: { "a:email": "post@acme.test" } }));
    const agent = await createRecord(picker, ben({ kind: t("AiAgent"), name: "Agent VDT", fields: undefined }));
    expect(p.entities.get(org.record)!.type).toBe("t:Organization");
    expect(p.entities.get(agent.record)!.type).toBe("t:AiAgent");
    // Phone is offered on Person only; email on Person and Organization; neither on an AI agent.
    expect(await refusal(createRecord(picker, ben({ kind: t("Organization"), name: "B AS", fields: { "a:phone": "1" } })))).toBe("field-not-offered");
    expect(await refusal(createRecord(picker, ben({ kind: t("AiAgent"), name: "Agent B", fields: { "a:email": "x@y.test" } })))).toBe("field-not-offered");
  });
});

describe("createRecord — holder-only: nothing but the record is written (the platform makes its tag)", () => {
  it("sends exactly: the create, the read-back, the master read: no tag check and no tag write", async () => {
    const { picker, p } = await setup();
    await createRecord(picker, ben());
    expect(p.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST /lws/vault/${encodeURIComponent(VAULT)}/c`,
      "GET /lws/r/x0001",
      "GET /base/tag/master",
    ]);
  });

  it("writes no audience fact, no grant and no sharing call", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, ben());
    const writes = p.requests.filter((r) => r.method !== "GET");
    expect(writes.map((r) => r.path)).toEqual([`/lws/vault/${encodeURIComponent(VAULT)}/c`]);
    const keys = Object.keys(p.entities.get(made.record)!.facts);
    expect(keys.filter((k) => /visibility|audience|grant|share|acl/i.test(k))).toEqual([]);
    // Everything written lives in the named vault, and only there.
    expect([...p.entities.values()].map((e) => e.vault)).toEqual([VAULT, VAULT]);
  });

  it("has no default vault: a create that names none is refused before any request", async () => {
    const { picker, p } = await setup();
    expect(await refusal(createRecord(picker, ben({ vaultId: "" })))).toBe("no-vault");
    expect(await refusal(createRecord(picker, ben({ vaultId: undefined as unknown as string })))).toBe("no-vault");
    expect(await refusal(createRecord(picker, ben({ vaultId: "ann" })))).toBe("no-vault");
    expect(p.requests).toHaveLength(0);
  });

  it("a vault the holder cannot write is the platform's refusal, and nothing is written", async () => {
    const { picker, p } = await setup();
    p.reach.delete(VAULT);
    await expect(createRecord(picker, ben())).rejects.toBeInstanceOf(PlatformError);
    expect(p.entities.size).toBe(0);
  });
});

describe("createRecord — the stater is the holder, given, never guessed", () => {
  it("refuses a create with no holder, before any request", async () => {
    const { picker, p } = await setup();
    expect(await refusal(createRecord(picker, ben({ holder: "" })))).toBe("no-holder");
    expect(await refusal(createRecord(picker, ben({ holder: undefined as unknown as string })))).toBe("no-holder");
    expect(await refusal(createRecord(picker, ben({ holder: "ann" })))).toBe("no-holder");
    expect(p.requests).toHaveLength(0);
  });

  it("writes the holder it was given, not the agent that makes the write", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, ben());
    expect(p.entities.get(made.record)!.facts["a:statedBy"]).toEqual({ "@id": HOLDER });
    expect(HOLDER).not.toBe(AGENT);
  });

  it("refuses a stater smuggled in through the fields", async () => {
    const { picker, p } = await setup();
    // The stater is not a field any kind offers, so it is refused as not offered.
    expect(await refusal(createRecord(picker, ben({ fields: { "a:statedBy": { "@id": AGENT } } })))).toBe("field-not-offered");
    expect(p.entities.size).toBe(0);
  });
});

describe("createRecord — refuses what the master does not offer, before writing", () => {
  it("an unknown kind, a kind that offers no name, an empty name", async () => {
    const { picker, p } = await setup();
    expect(await refusal(createRecord(picker, ben({ kind: t("Pump") })))).toBe("unknown-kind");
    expect(await refusal(createRecord(picker, ben({ kind: "Person" })))).toBe("unknown-kind");
    // The membership relation is a stakeholder kind, and it is not a record with a name.
    expect(await refusal(createRecord(picker, ben({ kind: t("PartyMemberOf"), fields: undefined })))).toBe("kind-offers-no-name");
    expect(await refusal(createRecord(picker, ben({ name: "   " })))).toBe("no-name");
    expect(p.requests).toHaveLength(0);
  });

  it("a field no term offers, a field with no encoding, a field with no single spelling", async () => {
    const { picker, p } = await setup();
    expect(await refusal(createRecord(picker, ben({ fields: { "a:fixtureShoeSize": "44" } })))).toBe("field-not-offered");
    expect(await refusal(createRecord(picker, ben({ fields: { "a:jobTitle": "CEO" } })))).toBe("field-not-offered");
    expect(await refusal(createRecord(picker, ben({ fields: { "a:level": "high" } })))).toBe("field-not-writable");
    expect(await refusal(createRecord(picker, ben({ fields: { "a:timeZone": "Europe/Oslo" } })))).toBe("field-not-writable");
    expect(p.requests).toHaveLength(0);
  });

  it("a value in the wrong shape for the field's declared encoding", async () => {
    const { picker, p } = await setup();
    expect(await refusal(createRecord(picker, ben({ fields: { "a:email": { "@id": "https://x.test/e/1" } } })))).toBe("field-value");
    expect(await refusal(createRecord(picker, ben({ fields: { "a:email": "  " } })))).toBe("field-value");
    expect(p.requests).toHaveLength(0);
  });

  it("the same field given under two spellings, and the name given as a field", async () => {
    const { picker, p } = await setup();
    expect(await refusal(createRecord(picker, ben({ fields: { "a:phone": "1", phone: "2" } })))).toBe("field-ambiguous");
    expect(await refusal(createRecord(picker, ben({ fields: { "a:name": "Someone Else" } })))).toBe("field-ambiguous");
    expect(p.requests).toHaveLength(0);
  });
});

describe("createRecord — the record's tag is the platform's (one rule)", () => {
  it("returns the master tag the platform made, and its handle", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, ben());
    expect(made.tag).toBe("ben-lee");
    const handles = p.handlesOf(made.record);
    expect(handles).toHaveLength(1);
    expect(handles[0]!.id).toBe(made.tagHandle);
    expect(handles[0]!.vault).toBe(VAULT);
    expect(handles[0]!.facts).toEqual({
      "a:tagString": "ben-lee",
      "a:tagRole": "master",
      "a:tagOrigin": "registered",
      "a:tagHandleOfEntity": { "@id": made.record },
    });
  });

  it("sends NO tag write on a create: no POST /base/tag/handle, no tag check, no ensure when the platform made the tag", async () => {
    const { picker, p } = await setup();
    await createRecord(picker, ben());
    expect(p.count("POST", "/base/tag/handle")).toBe(0);
    expect(p.count("POST", "/base/tag/ensure")).toBe(0);
    expect(p.count("GET", "/base/tag/resolve")).toBe(0);
    expect(p.count("GET", "/base/tag/master")).toBe(1);
    // No stored value anywhere holds the separator: the full form was not written.
    for (const e of p.entities.values()) {
      for (const [k, v] of Object.entries(e.facts)) {
        if (k === "a:email") continue; // an email address holds @ and is not a tag
        expect(JSON.stringify(v).includes("@ben"), `${e.id} ${k}`).toBe(false);
      }
    }
  });

  it("the master is read with the query key targetEntity (⛔ not entity)", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, ben());
    const sent = p.requests.find((r) => r.path === "/base/tag/master")!;
    expect(new URL(sent.url).searchParams.get("targetEntity")).toBe(made.record);
    expect(new URL(sent.url).searchParams.get("entity")).toBeNull();
  });

  it("two records of the same name get the platform's different tags; the package does not number them", async () => {
    const { picker } = await setup();
    const first = await createRecord(picker, ben());
    const second = await createRecord(picker, ben({ name: "Ben Lee" }));
    const third = await createRecord(picker, ben());
    expect([first.tag, second.tag, third.tag]).toEqual(["ben-lee", "ben-lee-2", "ben-lee-3"]);
    expect(second.record).not.toBe(first.record);
  });

  it("the same tag is free in another vault: uniqueness is per vault (the platform's)", async () => {
    const { picker, p } = await setup();
    const here = await createRecord(picker, ben());
    // The other vault is written at its own origin: one fixture behind two origins.
    const otherOrigin = new URL(OTHER_VAULT).origin;
    const atOther = { ...picker, platform: { origin: otherOrigin, fetch: (url: string, init?: RequestInit) => p.fetch(url.replace(otherOrigin, p.origin), init) } };
    const there = await createRecord(atOther, ben({ vaultId: OTHER_VAULT }));
    expect(here.tag).toBe("ben-lee");
    expect(there.tag).toBe("ben-lee");
  });

  it("never refuses for a taken name: a create is no longer refused because every form of the name is used", async () => {
    const { picker, p } = await setup();
    for (let i = 0; i < 4; i++) await createRecord(picker, ben());
    expect(p.entities.size).toBe(8);
  });

  it("a name no tag could be made from is still created (the platform decides; the package has no derivation)", async () => {
    const { picker } = await setup();
    const made = await createRecord(picker, ben({ name: "@ @" }));
    expect(made.created).toBe(true);
    expect(made.tag).not.toBeNull();
  });

  it("ignores a `tag` a JavaScript caller still passes: it is never sent and never registered", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, { ...ben(), tag: "Ben G." } as unknown as CreateInput);
    expect(made.tag).toBe("ben-lee");
    expect(p.count("POST", "/base/tag/handle")).toBe(0);
    expect(p.entities.get(made.record)!.facts).not.toHaveProperty("a:tag");
  });

  it("a tag that is not for a record: addTag (the typed client) never sends a string holding @", async () => {
    const { picker, p } = await setup();
    const rec = p.seed(VAULT, "t:Person", { "a:name": "Seeded" });
    await expect(addTag(picker.platform, rec, "to@m", AGENT, { grammar: picker.reading.grammar })).rejects.toThrow(/must not hold "@"/);
    expect(p.count("POST", "/base/tag/handle")).toBe(0);
  });

  it("when the platform made no tag (it answers `none`), ensure is asked ONCE and its tag is the result", async () => {
    const { picker, p } = await setup("ensure-only");
    const made = await createRecord(picker, ben());
    expect(p.count("POST", "/base/tag/ensure")).toBe(1);
    expect(p.requests.find((r) => r.path === "/base/tag/ensure")!.body).toEqual({ targetEntity: made.record, agent: AGENT });
    expect(p.count("GET", "/base/tag/master")).toBe(2);
    expect(made.tag).toBe("ben-lee");
    expect(made.tagHandle).toBe(p.handlesOf(made.record)[0]!.id);
    expect(p.count("POST", "/base/tag/handle")).toBe(0);
  });

  it("a platform without the tag routes is a hard PlatformError saying so, ⛔ never an older derivation", async () => {
    const { picker, p } = await setup("off");
    const err = await createRecord(picker, ben()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlatformError);
    expect(err).toBeInstanceOf(NoTagRoutesError);
    expect((err as Error).message).toBe("This platform does not make tags yet");
    expect(NO_TAG_ROUTES_SENTENCE).toBe("This platform does not make tags yet");
    // The record WAS created, and the error says what exists. No tag was registered by any other road.
    expect((err as NoTagRoutesError).created?.record).toBe(`${VAULT_HOST}/base/e/x0001`);
    expect(p.count("POST", "/base/tag/handle")).toBe(0);
    expect(p.handlesOf(`${VAULT_HOST}/base/e/x0001`)).toHaveLength(0);
  });

  it("an anomaly or an unreadable master gives the create no tag (null), never a guess, and no ensure", async () => {
    const { picker, p } = await setup();
    p.failNext("GET", "/base/tag/master", 200, { tagKnown: false, tagUnknownReason: "anomaly" });
    const made = await createRecord(picker, ben());
    expect(made).toMatchObject({ created: true, tag: null, tagHandle: null });
    expect(p.count("POST", "/base/tag/ensure")).toBe(0);
  });
});

describe("createRecord — a failure after the record exists is reported, never hidden", () => {
  it("carries the record when the platform refuses the ensure (403): the error is not swallowed", async () => {
    const { picker, p } = await setup("ensure-only");
    p.failNext("POST", "/base/tag/ensure", 403, { error: "WriteForbiddenError" });
    const err = await createRecord(picker, ben()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PartialCreateError);
    const partial = err as PartialCreateError;
    const record = partial.record!;
    expect(p.entities.get(record)!.facts["a:name"]).toBe("Ben Lee");
    expect(partial.written).toEqual([record]);
    expect((partial.cause as PlatformError).status).toBe(403);
    expect(p.handlesOf(record)).toHaveLength(0);
    expect(partial).not.toHaveProperty("tag");
  });

  it("carries the resource when the new record cannot be read back", async () => {
    const { picker, p } = await setup();
    p.failNext("GET", "/lws/r/", 503);
    const err = await createRecord(picker, ben()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PartialCreateError);
    expect((err as PartialCreateError).record).toBe(`${VAULT_HOST}/lws/r/x0001`);
    expect((err as PartialCreateError).written).toEqual([`${VAULT_HOST}/lws/r/x0001`]);
    // The record, and the master handle the platform made for it (the package registers no tag after).
    expect(p.entities.size).toBe(2);
    expect(p.count("GET", "/base/tag/master")).toBe(0);
  });

  it("a create the platform refuses writes nothing and is not a partial create", async () => {
    const { picker, p } = await setup();
    p.failNext("POST", "/lws/vault/", 409, { error: "UndefinedTermError" });
    const err = await createRecord(picker, ben()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlatformError);
    expect((err as PlatformError).status).toBe(409);
    expect(p.entities.size).toBe(0);
  });
});

describe("createRecord — a field that holds a record of its own (organization)", () => {
  const acme = { "a:employment": { record: { "a:org": "Acme AS" } } };

  it("writes the organization as one record of the field's own type, stated by the holder, and points the person at it", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, ben({ fields: { "a:email": "ben@example.test", ...acme } }));
    expect(made.held).toHaveLength(1);
    const employment = p.entities.get(made.held[0]!)!;
    expect(employment.vault).toBe(VAULT);
    expect(employment.type).toBe("t:Employment");
    expect(employment.facts).toEqual({
      "a:org": "Acme AS",
      "a:statedBy": { "@id": HOLDER },
      "a:lwsSelf": { "@id": employment.id },
    });
    expect(p.entities.get(made.record)!.facts).toEqual({
      "a:name": "Ben Lee",
      "a:email": "ben@example.test",
      "a:employment": { "@id": employment.id },
      "a:statedBy": { "@id": HOLDER },
      "a:lwsSelf": { "@id": made.record },
    });
  });

  it("writes the held record first, then the person; the platform makes both tags, and the person's is read", async () => {
    const { picker, p } = await setup();
    await createRecord(picker, ben({ fields: acme }));
    const c = `/lws/vault/${encodeURIComponent(VAULT)}/c`;
    expect(p.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST ${c}`,
      "GET /lws/r/x0001",
      `POST ${c}`,
      "GET /lws/r/x0002",
      "GET /base/tag/master",
    ]);
    const posts = p.requests.filter((r) => r.method === "POST" && r.path === c);
    expect(posts[0]!.body).toEqual({ type: "t:Employment", facts: { "a:org": "Acme AS", "a:statedBy": { "@id": HOLDER } }, agent: AGENT });
    expect(posts[1]!.body!.type).toBe("t:Person");
  });

  it("makes no organization record, no role and no audience fact for typed text", async () => {
    const { picker, p } = await setup();
    await createRecord(picker, ben({ fields: acme }));
    // The platform tags every record it creates, the held Employment record too: two handles.
    expect([...p.entities.values()].map((e) => e.type).sort()).toEqual(["t:Employment", "t:Person", "t:TagHandle", "t:TagHandle"]);
    for (const e of p.entities.values()) {
      expect(Object.keys(e.facts).filter((k) => /^role:|visibility|audience/i.test(k)), e.type).toEqual([]);
    }
  });

  it("one entry is a single reference; two are a list, in the order given", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(
      picker,
      ben({ fields: { "a:employment": [{ record: { "a:org": "Acme AS", "a:jobTitle": "CTO" } }, { record: { "a:org": "Beta AB" } }] } }),
    );
    expect(made.held).toHaveLength(2);
    expect(p.entities.get(made.record)!.facts["a:employment"]).toEqual([{ "@id": made.held[0] }, { "@id": made.held[1] }]);
    expect(p.entities.get(made.held[0]!)!.facts["a:org"]).toBe("Acme AS");
    expect(p.entities.get(made.held[0]!)!.facts["a:jobTitle"]).toBe("CTO");
    expect(p.entities.get(made.held[1]!)!.facts["a:org"]).toBe("Beta AB");
  });

  it("stamps the type name the record type's own term publishes, not the field term's", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, ben({ fields: { "a:fixturePassport": { record: { "a:fixtureDocumentNumber": "N123" } } } }));
    const passport = p.entities.get(made.held[0]!)!;
    expect(passport.type).toBe("t:FixturePassportRecord");
    // The record's field is declared on a type above the record type, and is inherited.
    expect(passport.facts["a:fixtureDocumentNumber"]).toBe("N123");
    expect(p.entities.get(made.record)!.facts["a:fixturePassport"]).toEqual({ "@id": passport.id });
  });

  it("refuses, before writing: a reference or text where a record is held, and a record where none is", async () => {
    const { picker, p } = await setup();
    const existing = p.seed(VAULT, "t:Employment", { "a:org": "Old" });
    const before = p.entities.size;
    expect(await refusal(createRecord(picker, ben({ fields: { "a:employment": { "@id": existing } } })))).toBe("field-value");
    expect(await refusal(createRecord(picker, ben({ fields: { "a:employment": "Acme AS" } })))).toBe("field-value");
    expect(await refusal(createRecord(picker, ben({ fields: { "a:email": { record: { "a:org": "Acme" } } } })))).toBe("field-value");
    expect(await refusal(createRecord(picker, ben({ fields: { "a:employment": { record: {} } } })))).toBe("field-value");
    expect(await refusal(createRecord(picker, ben({ fields: { "a:employment": [] } })))).toBe("field-value");
    expect(p.entities.size).toBe(before);
    expect(p.requests).toHaveLength(0);
  });

  it("refuses, before writing: a fact the record does not offer, two records where one is held, a type with no name", async () => {
    const { picker, p } = await setup();
    // Email is a field of a person, not of an employment record.
    expect(await refusal(createRecord(picker, ben({ fields: { "a:employment": { record: { "a:email": "x@y.test" } } } })))).toBe("field-not-offered");
    // A name is not a field of the employment record either.
    expect(await refusal(createRecord(picker, ben({ fields: { "a:employment": { record: { "a:name": "Acme" } } } })))).toBe("field-not-offered");
    const two = [{ record: { "a:fixtureDocumentNumber": "1" } }, { record: { "a:fixtureDocumentNumber": "2" } }];
    expect(await refusal(createRecord(picker, ben({ fields: { "a:fixturePassport": two } })))).toBe("field-value");
    expect(await refusal(createRecord(picker, ben({ fields: { "a:fixtureBadge": { record: { "a:fixtureDocumentNumber": "1" } } } })))).toBe("field-not-writable");
    expect(p.requests).toHaveLength(0);
  });

  it("when the person cannot be created after the held record was, the error says what exists", async () => {
    const { picker, p } = await setup();
    let creates = 0;
    const realFetch = p.fetch;
    picker.platform.fetch = async (url, init) => {
      if ((init?.method ?? "GET") === "POST" && url.endsWith("/c")) {
        creates += 1;
        if (creates === 2) return new Response(JSON.stringify({ error: "UndefinedTermError" }), { status: 409 });
      }
      return realFetch(url, init);
    };
    const err = await createRecord(picker, ben({ fields: acme })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PartialCreateError);
    const partial = err as PartialCreateError;
    expect(partial.record).toBeNull();
    expect(partial.written).toHaveLength(1);
    expect(p.entities.get(partial.written[0]!)!.type).toBe("t:Employment");
    expect((partial.cause as PlatformError).status).toBe(409);
  });
});

describe("pick — always the holder's record in the named vault", () => {
  it("create, then pick by tag, returns the same id", async () => {
    const { picker } = await setup();
    const made = await createRecord(picker, ben());
    const picked = await pickByTag(picker, { vaultId: VAULT, tag: made.tag! });
    expect(picked).toEqual({ created: false, record: made.record, vaultId: VAULT, type: "t:Person" });
  });

  it("create, then find and pick, returns the same id", async () => {
    const { picker } = await setup();
    const made = await createRecord(picker, ben());
    const found = await findCandidates(picker, { vaultId: VAULT, text: "ben lee" });
    expect(found.complete).toBe(true);
    expect(found.candidates).toEqual([{ record: made.record, vaultId: VAULT, type: "t:Person", label: "Ben Lee" }]);
    expect(pick(found.candidates[0]!)).toEqual({ created: false, record: made.record, vaultId: VAULT, type: "t:Person" });
  });

  it("pickOrCreate with a tag that exists picks; with one that does not, creates; then picks the same", async () => {
    const { picker, p } = await setup();
    // The tag is only LOOKED UP: it names the record to pick; a create gets the platform's own tag, not the typed one.
    const first = await pickOrCreate(picker, ben({ tag: "ben-lee" }));
    expect(first.created).toBe(true);
    const size = p.entities.size;
    const second = await pickOrCreate(picker, ben({ tag: "ben-lee" }));
    expect(second).toEqual({ created: false, record: first.record, vaultId: VAULT, type: "t:Person" });
    expect(p.entities.size).toBe(size);
  });

  it("pickOrCreate with no tag creates: a shared name is never taken for the same party", async () => {
    const { picker } = await setup();
    const a = await pickOrCreate(picker, ben());
    const b = await pickOrCreate(picker, ben());
    expect(a.created && b.created).toBe(true);
    expect(a.record).not.toBe(b.record);
  });

  it("the same tag in another vault is another record: pick asks the named vault only", async () => {
    const { picker, p } = await setup();
    const mine = await createRecord(picker, ben());
    const theirs = p.seed(OTHER_VAULT, "t:Person", { "a:name": "Ben Hansen" });
    p.seedTag(OTHER_VAULT, "ben-lee", theirs);
    expect((await pickByTag(picker, { vaultId: VAULT, tag: "ben-lee" }))!.record).toBe(mine.record);
    expect((await pickByTag(picker, { vaultId: OTHER_VAULT, tag: "ben-lee" }))!.record).toBe(theirs);
  });

  it("a tag that names something that is not a stakeholder record is not picked; a create then makes a new record with the platform's tag", async () => {
    const { picker, p } = await setup();
    const pump = p.seed(VAULT, "t:Pump", { "a:label": "PT-101" });
    p.seedTag(VAULT, "PT-101", pump);
    expect(await pickByTag(picker, { vaultId: VAULT, tag: "PT-101" })).toBeNull();
    const made = await pickOrCreate(picker, ben({ tag: "PT-101" }));
    expect(made).toMatchObject({ created: true, tag: "ben-lee" });
    expect(p.handlesOf(pump)).toHaveLength(1);
  });

  it("a tag that names nothing is null, and a tag holding @ is refused", async () => {
    const { picker } = await setup();
    expect(await pickByTag(picker, { vaultId: VAULT, tag: "nobody" })).toBeNull();
    await expect(pickByTag(picker, { vaultId: VAULT, tag: "ben@ann" })).rejects.toThrow(/must not hold/);
  });
});

describe("findCandidates — the holder's stakeholder records, by type, in the named vault", () => {
  it("asks the typed list for exactly the kinds read from the master", async () => {
    const { picker, p } = await setup();
    await findCandidates(picker, { vaultId: VAULT });
    const asked = new URL(p.requests[0]!.url);
    expect(asked.pathname).toBe(`/lws/vault/${encodeURIComponent(VAULT)}/records`);
    expect(asked.searchParams.getAll("type").sort()).toEqual([
      "AiAgent", "DataStore", "Organization", "PartyGroup", "PartyMemberOf", "Passenger",
      "Person", "SoftwareSystem", "SoftwareSystemGroup", "SoftwareSystemMemberOf",
    ]);
  });

  it("returns stakeholder records of this vault only: not other types, not other vaults", async () => {
    const { picker, p } = await setup();
    const person = p.seed(VAULT, "t:Person", { "a:name": "Ben Lee" });
    const org = p.seed(VAULT, "t:Organization", { "a:name": "Acme" });
    p.seed(VAULT, "t:NoteDocument", { "a:name": "Ben's note" });
    p.seedTag(VAULT, "ben", person);
    p.seed(OTHER_VAULT, "t:Person", { "a:name": "Ben Elsewhere" });
    const found = await findCandidates(picker, { vaultId: VAULT });
    expect(found.candidates.map((c) => c.record).sort()).toEqual([person, org].sort());
    expect(found.complete).toBe(true);
  });

  it("walks every page: a 45th record is found, and the walk says it is complete", async () => {
    const { picker, p } = await setup();
    const ids: string[] = [];
    for (let i = 1; i <= 45; i++) ids.push(p.seed(VAULT, "t:Person", { "a:name": `Person ${i}` }));
    const found = await findCandidates(picker, { vaultId: VAULT });
    expect(found.candidates).toHaveLength(45);
    expect(found.pages).toBe(3);
    expect(found.complete).toBe(true);
    const one = await findCandidates(picker, { vaultId: VAULT, text: "person 1" });
    // "Person 1" and "Person 10".."Person 19": 11 rows.
    expect(one.candidates).toHaveLength(11);
    expect(one.candidates.map((c) => c.record)).toContain(ids[0]);
  });

  it("a walk cut short says so, and is not read as the whole list", async () => {
    const { picker, p } = await setup();
    for (let i = 1; i <= 45; i++) p.seed(VAULT, "t:Person", { "a:name": `Person ${i}` });
    const cut = await findCandidates(picker, { vaultId: VAULT, maxPages: 2 });
    expect(cut.candidates).toHaveLength(40);
    expect(cut.complete).toBe(false);
  });

  it("a vault the holder cannot read is an error, not an empty list", async () => {
    const { picker, p } = await setup();
    p.reach.delete(VAULT);
    await expect(findCandidates(picker, { vaultId: VAULT })).rejects.toMatchObject({ name: "PlatformError", status: 403 });
  });

  it("with no kinds in the reading it refuses, rather than list the whole vault", async () => {
    const { picker, p } = await setup();
    picker.reading = { ...picker.reading, fieldSets: { ...picker.reading.fieldSets, kinds: { ...picker.reading.fieldSets.kinds, types: [] } } };
    await expect(findCandidates(picker, { vaultId: VAULT })).rejects.toBeInstanceOf(VocabularyUnavailableError);
    expect(p.requests).toHaveLength(0);
  });
});
