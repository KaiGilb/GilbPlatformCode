// Cycle214 GAPP214.42 N1 (VATester QA N1, BVedanta typing F1) — a FULL-STATE write sends every fact
// the person did not edit EXACTLY AS THE VAULT SERVED IT.
//
// A full replace (`PUT /lws/r/:id`, the share act for a holder) retracts every fact it omits and
// stores what it is sent verbatim. At 398edc5 both were built from `BaseRecord.facts`, the editor's
// flattened strings: a link `{"@id": X}` was stored as the text "X" (measured on a store, `is_ref`
// false), a list of links became one joined string, and every fact the editor never held (a grant,
// a value with no string form) was retracted. [[Rule_Code_gilb-record-io#RuleBaseioNoReadReplaceRoundTrip]].
//
// `factsAsServed` and `readRecord` are REAL; `shareEntity` is REAL with only the credential seams
// stubbed, and the assertions read the body that reaches `fetch`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { factsAsServed, readRecord, ServedLinkUnreadableError, ServedShortFormError, type ServedDocument } from "./records";
import { resetVaultContextCache, vaultContextUrl } from "./vaultContext";
import { SERVED_CONTEXT } from "../test/servedContext.fixture";
import { setBaseOrigin, setLocalRigHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { setUp, tearDown } from "../test/support";

const VAULT = "https://hv.platform.example.test";
/** The vault's OWN context: `GET <vault>/base/context.jsonld`, CORS-public on GilbPlatform. */
const CTX = `${VAULT}/base/context.jsonld`;
/** What `GET /lws/r/:id` names as a record's `@context` (GilbPlatform `src/lws/jsonld.ts:39`). The
 *  address answers 404 on the open web (BVedanta 2026-10-08T06:06:05Z), so the mock answers 404. */
const LWS = "https://www.w3.org/ns/lws/v1";
/** The vault's context as GilbPlatform serves it (verbatim pin): `fvParent`, `fvOf`, `solution`
 *  typed `"@type": "@id"`, and its own host's `base:` prefix. */
const VAULT_CTX = SERVED_CONTEXT["@context"] as Record<string, unknown>;
const AT = `${VAULT}/base/e/rec1`;
const LINK = { "@id": `${VAULT}/base/e/vsc-holder` };
const LIST = [{ "@id": `${VAULT}/base/e/ann` }, { "@id": `${VAULT}/base/e/bo` }];
const LANG = { "@value": "Hei", "@language": "nb" };
const GRANT = "https://id.platform.example.test/base/p/reader";

/** A served document as `readRecord` keeps it from `GET /lws/r` (its `@context` is the LWS address). */
const doc = (facts: Record<string, unknown>, context: unknown = LWS): ServedDocument => ({ facts, context, etag: '"sha256:0"' });

let fetchMock: ReturnType<typeof vi.fn>;
/** Answers the vault's own context with `ctx` (`null`: 404); every other request is recorded and
 *  refused with 404, the LWS address included (as the open web answers it). */
function contextServed(ctx: Record<string, unknown> | null) {
  fetchMock = vi.fn(async (url: string) => {
    if (String(url) === CTX && ctx) return new Response(JSON.stringify({ "@context": ctx }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
}
/** How many requests went to an address starting with `prefix`. */
const asked = (prefix: string) => fetchMock.mock.calls.filter(([u]) => String(u).startsWith(prefix)).length;

beforeEach(() => {
  setUp();
  resetVaultContextCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

describe("factsAsServed — what a full-state write sends", () => {
  it("C214-42-N1-U1: no edit (a share): every served fact as served — a link stays {\"@id\"}, a list stays a list, a language value and a grant are kept", async () => {
    contextServed(VAULT_CTX);
    const { facts } = await factsAsServed(doc({ name: "Ann", statedBy: LINK, memberOf: LIST, jobTitle: LANG, directReader: GRANT }), AT);
    expect(facts).toEqual({ name: "Ann", statedBy: LINK, memberOf: LIST, jobTitle: LANG, directReader: GRANT });
  });

  it("C214-42-N1-U2: with an edit: an unedited fact goes as served; the person's edit as typed; a fact the editor held but the write drops is omitted; a fact the editor never held is kept; a new fact as typed", async () => {
    contextServed(VAULT_CTX);
    const served = doc({ name: "Ann", label: "Ann", email: "a@x.test", statedBy: LINK, memberOf: LIST, directReader: GRANT });
    // The editor's strings, as `factToString` handed them over.
    const held = { name: "Ann", label: "Ann", email: "b@x.test", statedBy: LINK["@id"], memberOf: `${LIST[0]!["@id"]}, ${LIST[1]!["@id"]}` };
    // The retype into a party kind drops the legacy label (W4) and adds a new field.
    const { label: _dropped, ...rest } = held;
    void _dropped;
    const send = { ...rest, phone: "123" };
    const { facts } = await factsAsServed(served, AT, { held, send });
    expect(facts).toEqual({ name: "Ann", email: "b@x.test", statedBy: LINK, memberOf: LIST, directReader: GRANT, phone: "123" });
  });

  it("C214-42-N1-U3: a served empty string nobody edited is carried (keepEmpty); a field the person cleared is not", async () => {
    contextServed(null);
    const { facts, keepEmpty } = await factsAsServed(doc({ unitTag: "", note: "x" }), AT, {
      held: { unitTag: "", note: "x" },
      send: { unitTag: "", note: "" },
    });
    expect(facts).toEqual({ unitTag: "", note: "" });
    expect([...keepEmpty]).toEqual(["unitTag"]);
  });

  it("C214-42-N1-U4: a short form is expanded by a prefix the DOCUMENT itself declares inline (GilbPlatform's open fix: documents declare what they use), at any depth; a term typed \"@type\": \"@id\" served as a short form goes back as {\"@id\"}", async () => {
    contextServed(VAULT_CTX);
    const { facts } = await factsAsServed(
      doc(
        { statedBy: { "@id": "base:e/vsc-holder" }, memberOf: [{ "@id": "base:e/ann" }], fvParent: "base:e/p1", cond: { ref: { "@id": "base:e/c1" }, n: 2 } },
        [LWS, { base: `${VAULT}/base/` }],
      ),
      AT,
    );
    expect(facts).toEqual({
      statedBy: LINK,
      memberOf: [{ "@id": `${VAULT}/base/e/ann` }],
      fvParent: { "@id": `${VAULT}/base/e/p1` },
      cond: { ref: { "@id": `${VAULT}/base/e/c1` }, n: 2 },
    });
    expect(asked(LWS), "the document's LWS context address is never fetched").toBe(0);
  });

  it("C214-42-N1-U5: served as GET /lws/r serves it (the LWS context, no prefix declared): a short form is REFUSED (ServedShortFormError), ⛔ never guessed, and the LWS address is not fetched", async () => {
    contextServed(VAULT_CTX);
    await expect(factsAsServed(doc({ statedBy: { "@id": "base:e/vsc-holder" } }), AT)).rejects.toBeInstanceOf(ServedShortFormError);
    expect(asked(LWS)).toBe(0);
  });

  it("C214-42-N1-U6: the vault's context declares base: but the document does not: a short form is refused, ⛔ not expanded with the vault's prefixes (/lws/r compacts with OWNER_HOST's, BVedanta F2 point 3)", async () => {
    contextServed({ ...VAULT_CTX, base: `${VAULT}/base/` });
    await expect(factsAsServed(doc({ statedBy: { "@id": "base:e/vsc-holder" } }), AT)).rejects.toBeInstanceOf(ServedShortFormError);
  });
});

// ── GAPP214.42 F2 (BVedanta) / B1 (VAScaling): term types come from the VAULT'S OWN context ──────
// `GET /lws/r` names `https://www.w3.org/ns/lws/v1` as the record's `@context` (404). At 6f2764a
// `factsAsServed` read THAT, so the id-valued arm never ran there: `fvParent`, `fvOf`, `solution`
// (served as bare strings) went back as text, and every such write asked www.w3.org twice, with no
// time limit and no memory of the empty answer.
describe("factsAsServed — term types from the vault's own context (F2, B1)", () => {
  const FV = { fvParent: `${VAULT}/base/e/fn-parent`, fvOf: `${VAULT}/base/e/v1`, solution: `${VAULT}/base/e/s1` };

  it("C214-42-F2-U8: links served as a bare string (fvParent, fvOf, solution) go back as {\"@id\"}; text shaped like an address stays text; one read of the vault's context, none of the LWS address", async () => {
    contextServed(VAULT_CTX);
    const { facts } = await factsAsServed(doc({ name: "Fn", ...FV, url: "https://example.test/" }), AT);
    expect(facts).toEqual({
      name: "Fn",
      fvParent: { "@id": FV.fvParent },
      fvOf: { "@id": FV.fvOf },
      solution: { "@id": FV.solution },
      url: "https://example.test/",
    });
    expect(asked(CTX), "the vault's own context, read once").toBe(1);
    expect(asked(LWS), "www.w3.org is never asked").toBe(0);
  });

  it("C214-42-F2-U9: the vault's context is read once for many writes (terms and prefixes from one read; A8)", async () => {
    contextServed(VAULT_CTX);
    for (let i = 0; i < 3; i++) await factsAsServed(doc({ ...FV }), AT);
    expect(asked(CTX)).toBe(1);
    expect(fetchMock.mock.calls.length, "no other request").toBe(1);
  });

  it("C214-42-F2-U10: an EMPTY answer is kept too: a vault context with no typed terms is read once, and its address-shaped text goes back as text", async () => {
    contextServed({});
    for (let i = 0; i < 3; i++) {
      const { facts } = await factsAsServed(doc({ url: "https://example.test/" }), AT);
      expect(facts).toEqual({ url: "https://example.test/" });
    }
    expect(asked(CTX)).toBe(1);
  });

  it("C214-42-F2-U11: the vault's context cannot be read: a bare address-shaped value is REFUSED (it may be a link; ⛔ never sent as text), the failure is kept for a minute (one request), then asked again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      contextServed(null);
      await expect(factsAsServed(doc({ ...FV }), AT)).rejects.toBeInstanceOf(ServedLinkUnreadableError);
      await expect(factsAsServed(doc({ ...FV }), AT)).rejects.toBeInstanceOf(ServedLinkUnreadableError);
      expect(asked(CTX), "the failed read is kept").toBe(1);
      vi.setSystemTime(Date.now() + 61_000);
      await expect(factsAsServed(doc({ ...FV }), AT)).rejects.toBeInstanceOf(ServedLinkUnreadableError);
      expect(asked(CTX), "asked again after a minute").toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("C214-42-F2-U12: a vault that does not answer: the write is refused after 5 s, ⛔ not left waiting; the next write within the minute does not wait again", async () => {
    vi.useFakeTimers();
    try {
      fetchMock = vi.fn(() => new Promise<Response>(() => {}));
      vi.stubGlobal("fetch", fetchMock);
      let outcome: unknown = "pending";
      void factsAsServed(doc({ ...FV }), AT).then(
        () => (outcome = "sent"),
        (e) => (outcome = e),
      );
      await vi.advanceTimersByTimeAsync(4_900);
      expect(outcome, "still waiting before the limit").toBe("pending");
      await vi.advanceTimersByTimeAsync(200);
      expect(outcome, "refused at the limit").toBeInstanceOf(ServedLinkUnreadableError);
      await expect(factsAsServed(doc({ ...FV }), AT)).rejects.toBeInstanceOf(ServedLinkUnreadableError);
      expect(fetchMock.mock.calls.length, "one request in all").toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("C214-42-F2-U14: the vault's context is read at the vault's own door, as every other vault call: on a local rig (platform origin http://rig.example.test:8787) a https://<name>.rig.example.test:8787 vault is asked over http; elsewhere at the URI's own origin", async () => {
    expect(vaultContextUrl(AT)).toBe(CTX);
    // The rig half needs the rig's platform origin and rig host (set here in place of the environment and the module reload).
    setBaseOrigin("http://rig.example.test:8787");
    setLocalRigHosts(["rig.example.test"]);
    expect(vaultContextUrl("https://ann.rig.example.test:8787/vault/e/rec1")).toBe("http://ann.rig.example.test:8787/base/context.jsonld");
  });

  it("C214-42-F2-U13: control: a record whose links are all full {\"@id\"} objects and whose text is plain makes no request at all", async () => {
    contextServed(VAULT_CTX);
    const { facts } = await factsAsServed(doc({ name: "Ann", statedBy: LINK, memberOf: LIST }), AT);
    expect(facts).toEqual({ name: "Ann", statedBy: LINK, memberOf: LIST });
    expect(fetchMock.mock.calls.length).toBe(0);
  });
});

describe("readRecord keeps the served document", () => {
  it("C214-42-N1-U7: the facts unflattened, with the document's context and ETag; the editor's strings are unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ "@context": CTX, "@id": AT, "@type": "t:Person", "a:name": "Ann", "a:statedBy": LINK, memberOf: LIST }), {
          status: 200,
          headers: { etag: '"sha256:7"' },
        }),
      ),
    );
    const rec = (await readRecord("rec1", AT))!;
    expect(rec.facts).toEqual({ name: "Ann", statedBy: LINK["@id"], memberOf: `${LIST[0]!["@id"]}, ${LIST[1]!["@id"]}` });
    expect(rec.served).toEqual({ facts: { name: "Ann", statedBy: LINK, memberOf: LIST }, context: CTX, etag: '"sha256:7"', prefixedKeys: ["name", "statedBy"] });
  });
});

// ── GAPP214.42 A1 (BVedanta): a term's type applies only to a value served under its OWN name ─────
// The read serves a link as `fvParent`. A value stored as TEXT under `a:fvParent` is served as
// `a:fvParent`. At 5058f46 `readRecord` dropped the `a:`, so the link type was applied to it and a
// retype or share the person did not make turned their text into a link; with a second, unrelated
// address-shaped value the write was refused. The documents go through the REAL `readRecord`.
describe("factsAsServed — a value served as a:<term> goes back as served (A1)", () => {
  const PARENT = `${VAULT}/base/e/fn-parent`;
  /** `GET /lws/r/rec1` answers `body`; the vault's context answers VAULT_CTX; every request counted. */
  async function servedFrom(body: Record<string, unknown>): Promise<ServedDocument> {
    fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u === CTX) return new Response(JSON.stringify({ "@context": VAULT_CTX }), { status: 200 });
      if (u.includes("/lws/r/rec1")) return new Response(JSON.stringify({ "@context": LWS, "@id": AT, "@type": "t:Function", ...body }), { status: 200, headers: { etag: '"sha256:9"' } });
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return (await readRecord("rec1", AT))!.served!;
  }

  it("C214-42-A1-TEXT: an address stored as text under a:fvParent goes back as that text, ⛔ not a link; the vault's context is not asked", async () => {
    const served = await servedFrom({ "a:name": "Fn", "a:fvParent": PARENT });
    const { facts } = await factsAsServed(served, AT);
    expect(facts).toEqual({ name: "Fn", fvParent: PARENT });
    expect(asked(CTX)).toBe(0);
  });

  it("C214-42-A1-SHORT: control: a bare word stored under a:fvParent goes back as served, with no request", async () => {
    const served = await servedFrom({ "a:fvParent": "fn-parent" });
    const { facts } = await factsAsServed(served, AT);
    expect(facts).toEqual({ fvParent: "fn-parent" });
    expect(asked(CTX)).toBe(0);
  });

  it("C214-42-A1-MIXED: a word stored as text under a:fvParent next to an address-shaped url: both sent as stored, ⛔ not refused", async () => {
    const served = await servedFrom({ "a:fvParent": "fn-parent", url: "https://example.test/" });
    const { facts } = await factsAsServed(served, AT);
    expect(facts).toEqual({ fvParent: "fn-parent", url: "https://example.test/" });
  });

  it("C214-42-A1-BOTH: a document serving both a:fvParent (text) and fvParent (a link): the value kept is the one under the term's own name, and it goes back as a link", async () => {
    const served = await servedFrom({ "a:fvParent": "old text", fvParent: PARENT });
    const { facts } = await factsAsServed(served, AT);
    expect(facts).toEqual({ fvParent: { "@id": PARENT } });
  });

  it("C214-42-A1-OWNNAME: discriminating pair in one document: fvParent under its own name is a link, fvOf stored as text under a:fvOf stays text", async () => {
    const served = await servedFrom({ fvParent: PARENT, "a:fvOf": `${VAULT}/base/e/v1` });
    const { facts } = await factsAsServed(served, AT);
    expect(facts).toEqual({ fvParent: { "@id": PARENT }, fvOf: `${VAULT}/base/e/v1` });
    expect(asked(CTX)).toBe(1);
  });
});
