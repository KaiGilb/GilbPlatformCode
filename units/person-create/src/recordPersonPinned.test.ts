// The unit's recordPerson side pinned, beside the ported tests: the export list, the held-vault rule, the kinds and the boxes of a form, the
// reading query and its key (the origin read at call time), the find and its test hook, the host calls of a create and of what follows it, the
// module's own query client (in the host-call tests), and the self-card lookup. The host is the recording fake of `test/fakeHost.ts`.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, skipToken } from "@tanstack/react-query";
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { readPickerVocabulary, type CreateResult, type PickerReading } from "@kaigilb/gilbplatformcode-pick-or-create";
import { resolveFieldSets, type KindFieldSet, type StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { RECORDS_SNAPSHOT_KEY_HEAD, type ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { recordsKey } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { selfCardEntityUri } from "@kaigilb/gilbplatformcode-self-card";
import { fixtureMaster, ID, RIG, t } from "../test/support";
import { withTagStandard } from "../test/fixtureTag";
import { withWritableFieldsAdjudicated } from "../test/writableFields";
import { fixturePlatform, type FixturePlatform } from "../test/fixturePlatform";
import { fakeHost, NO_OWN_VAULT_SAYS } from "../test/fakeHost";
import * as unit from "./index";
import {
  NotTheHolderError,
  __setFindPeopleForTest,
  afterRecordPerson,
  fieldsFromBoxes,
  findPeople,
  heldLabelsWritten,
  holderSelfCard,
  isHeldVault,
  personBoxes,
  pickerReadingQuery,
  pickerReadingQueryKey,
  readHolderSelfCard,
  recordPerson,
  recordableKinds,
  type PersonBox,
} from "./recordPerson";

const P = "https://holder.example.test/vault";
const Q = "https://holder.example.test/base/pq1";
const AGENT = "https://holder.example.test/vault/e/app-example";

beforeEach(() => {
  resetBaseOrigin();
  setBaseOrigin("https://example.test");
  resetTermOrigin();
  setTermOrigin(ID);
});
afterEach(() => {
  __setFindPeopleForTest(null);
  vi.unstubAllGlobals();
});

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
const parentOf = (v: ReachableVault) => ({ entity: v.entity!, vaultId: v.vaultId });

describe("the export list", () => {
  it("is the source's names; the picker key is a function", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "NotTheHolderError", "STAKEHOLDER_FIND_DEBOUNCE_MS", "STAKEHOLDER_FIND_MIN_CHARS", "__setFindPeopleForTest", "afterRecordPerson", "answeredNoTag",
        "defaultHeldVaultId", "fieldsFromBoxes", "findPeople", "heldLabelsWritten", "heldVaults", "holderSelfCard", "isHeldVault", "isStakeholderKindOption",
        "personBoxes", "pickerReadingQuery", "pickerReadingQueryKey", "readHolderSelfCard", "recordPerson", "recordableKinds", "stakeholderErrorText",
        "stakeholderTypeOptions", "stakeholderTypeSearch", "stepsNotWrittenSentence",
      ].sort(),
    );
  });
});

describe("isHeldVault", () => {
  const landing = vault("https://h.example.test/vault", { isLandingVault: true });
  const nested = vault("https://h.example.test/base/n", { parent: parentOf(landing) });
  const deeper = vault("https://h.example.test/base/d", { parent: parentOf(nested) });
  const shared = vault("https://h.example.test/base/s");
  const all = [landing, nested, deeper, shared];

  it("the landing vault and everything nested under it, at any depth, is held", () => {
    expect(isHeldVault(landing, all)).toBe(true);
    expect(isHeldVault(nested, all)).toBe(true);
    expect(isHeldVault(deeper, all)).toBe(true);
  });
  it("a vault shared with write that is not under the landing vault is not held", () => {
    expect(isHeldVault(shared, all)).toBe(false);
  });
  it("a vault the person cannot write is not held, whatever its place", () => {
    expect(isHeldVault({ ...nested, modes: ["read"] }, all)).toBe(false);
    expect(isHeldVault({ ...landing, modes: [] }, all)).toBe(false);
  });
  it("with no landing vault in the list nothing is held", () => {
    expect(isHeldVault(nested, [nested, shared])).toBe(false);
  });
  it("a parent that is not in the list ends the walk as not held", () => {
    const orphan = vault("https://h.example.test/base/o", { parent: { entity: "x", vaultId: "https://h.example.test/base/missing" } });
    expect(isHeldVault(orphan, [landing, orphan])).toBe(false);
  });
  it("a cycle in the parent chain ends the walk", () => {
    const a = vault("https://h.example.test/base/a");
    const b = vault("https://h.example.test/base/b", { parent: parentOf(a) });
    const a2 = { ...a, parent: parentOf(b) };
    expect(isHeldVault(a2, [landing, a2, b])).toBe(false);
  });
});

describe("recordableKinds and personBoxes", () => {
  const kindWith = (name: string, label: string | null, readKeys: string[]) =>
    ({ name, label, kind: `k/${name}`, fields: [{ readKeys, writeKey: readKeys[0] }] }) as unknown as KindFieldSet;
  const setsOf = (nameKey: string | null, kinds: KindFieldSet[]) =>
    ({ kinds: { predicates: { name: { writeKey: nameKey } } }, byKind: Object.fromEntries(kinds.map((k) => [k.name, k])) }) as unknown as StakeholderFieldSets;

  it("is empty when the master names no write spelling for the name", () => {
    expect(recordableKinds(setsOf(null, [kindWith("A", "A", ["a:name"])]))).toEqual([]);
  });
  it("keeps the kinds whose set offers the name, in the order of their labels (the bare name when there is none)", () => {
    const sets = setsOf("a:name", [
      kindWith("Zed", "Alpha", ["a:name"]),
      kindWith("Beta", null, ["a:other", "a:name"]),
      kindWith("NoName", "Gamma", ["a:other"]),
      kindWith("Able", "Able", ["a:name"]),
    ]);
    expect(recordableKinds(sets).map((k) => k.name)).toEqual(["Able", "Zed", "Beta"]);
  });

  const field = (writeKey: string | null, encoding: string | null, extra: Record<string, unknown> = {}) => ({ writeKey, encoding, label: null, ...extra });
  const kind = (fields: unknown[]) => ({ name: "K", fields }) as unknown as KindFieldSet;
  const sets = setsOf("a:name", []);

  it("a text field is a box, the name first excluded, and a field with no write key, a token and a reference get none", () => {
    const boxes = personBoxes(
      sets,
      kind([
        field("a:name", "inline-literal:text"),
        field("a:email", "inline-literal:text", { label: "Email" }),
        field("a:plain", "inline-literal:text"),
        field(null, "inline-literal:text"),
        field("a:level", "inline-literal:token"),
        field("a:ref", "reference"),
        field("a:when", null),
      ]),
    );
    expect(boxes).toEqual([
      { key: "a:email", label: "Email", field: "a:email", sub: null },
      { key: "a:plain", label: "a:plain", field: "a:plain", sub: null },
    ]);
  });
  it("a field that holds a record gives a box per text sub-field, keyed field/sub; one with no type name gives none", () => {
    const sub = (writeKey: string | null, encoding: string | null, label: string | null = null) => ({ writeKey, encoding, label });
    const boxes = personBoxes(
      sets,
      kind([
        field("a:employment", "x", { record: { typeName: "Employment", fields: [sub("a:org", "inline-literal:text", "Works for"), sub("a:since", "inline-literal:date"), sub(null, "inline-literal:text"), sub("a:title", "inline-literal:text")] } }),
        field("a:badge", "x", { record: { typeName: null, fields: [sub("a:no", "inline-literal:text")] } }),
      ]),
    );
    expect(boxes).toEqual([
      { key: "a:employment/a:org", label: "Works for", field: "a:employment", sub: "a:org" },
      { key: "a:employment/a:title", label: "a:title", field: "a:employment", sub: "a:title" },
    ]);
  });
});

describe("fieldsFromBoxes and heldLabelsWritten", () => {
  const box = (field: string, sub: string | null, label = field): PersonBox => ({ key: sub ? `${field}/${sub}` : field, label, field, sub });
  const boxes = [box("a:email", null), box("a:employment", "a:org"), box("a:employment", "a:title"), box("a:address", "a:line")];

  it("trims, sends nothing for an empty or absent box, and groups the sub-fields of a held record under its field", () => {
    expect(fieldsFromBoxes(boxes, { "a:email": "  e@x  ", "a:employment/a:org": "Acme", "a:employment/a:title": "  ", "a:address/a:line": "Main St" })).toEqual({
      "a:email": "e@x",
      "a:employment": { record: { "a:org": "Acme" } },
      "a:address": { record: { "a:line": "Main St" } },
    });
    expect(fieldsFromBoxes(boxes, {})).toEqual({});
  });
  it("a held record's fields are listed in the order of their first box, after the plain fields", () => {
    const out = fieldsFromBoxes(boxes, { "a:address/a:line": "x", "a:employment/a:org": "y", "a:email": "z" });
    expect(Object.keys(out)).toEqual(["a:email", "a:employment", "a:address"]);
  });
  it("heldLabelsWritten names the labels of the first N held fields, in order", () => {
    const labelled = [box("a:employment", "a:org", "Works for"), box("a:employment", "a:title", "Job title"), box("a:address", "a:line", "Street")];
    const values = { "a:employment/a:org": "A", "a:employment/a:title": "T", "a:address/a:line": "S" };
    expect(heldLabelsWritten(labelled, values, 1)).toEqual(["Works for", "Job title"]);
    expect(heldLabelsWritten(labelled, values, 2)).toEqual(["Works for", "Job title", "Street"]);
    expect(heldLabelsWritten(labelled, values, 3)).toBeNull();
  });
});

describe("the reading query", () => {
  it("its key names the ontology origin that is set when it is asked, and fails when none is set", () => {
    expect(pickerReadingQueryKey()).toEqual(["gilb-stakeholders", "picker-reading", ID]);
    setTermOrigin("https://other.example.test");
    expect(pickerReadingQueryKey()).toEqual(["gilb-stakeholders", "picker-reading", "https://other.example.test"]);
    resetTermOrigin();
    expect(() => pickerReadingQueryKey()).toThrow(/setTermOrigin/);
  });
  it("its options keep the reading for the session and never retry", () => {
    const q = pickerReadingQuery({} as StakeholderFieldSets);
    expect({ ...q, queryFn: undefined }).toEqual({
      queryKey: ["gilb-stakeholders", "picker-reading", ID],
      queryFn: undefined,
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
      retryOnMount: false,
    });
    expect(pickerReadingQuery(null).queryFn).toBe(skipToken);
  });
  it("its query function reads the grammar and the stater's spelling from the master that is set", async () => {
    const m = withWritableFieldsAdjudicated(withTagStandard(fixtureMaster()));
    const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
    const fieldSets = await resolveFieldSets(source);
    const want = await readPickerVocabulary(source, fieldSets);
    setTermOrigin(RIG);
    vi.stubGlobal("fetch", m.fetch);
    const fn = pickerReadingQuery(fieldSets).queryFn;
    expect(typeof fn).toBe("function");
    expect(await (fn as () => Promise<PickerReading>)()).toEqual(want);
  });
});

/** The platform, the master and the reading of the fixtures, and a host that answers the adder's card. */
async function world(tags?: "auto" | "ensure-only" | "off") {
  const m = withWritableFieldsAdjudicated(withTagStandard(fixtureMaster()));
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readPickerVocabulary(source, await resolveFieldSets(source));
  const p: FixturePlatform = fixturePlatform({ origin: new URL(P).origin, ...(tags ? { tags } : {}) });
  p.reach.add(P).add(Q);
  const probe = p.seed(P, "t:Person", { "a:name": "probe" });
  p.entities.delete(probe);
  const derived = await selfCardEntityUri(P);
  const card = p.seed(P, "t:Person", { "a:name": "Ben (self)" }, { id: probe.slice(0, probe.lastIndexOf("/") + 1) + derived.slice(derived.lastIndexOf("/") + 1) });
  const kind = recordableKinds(reading.fieldSets).find((x) => x.kind === t("Person"))!;
  return { reading, p, kind, card, host: fakeHost(card) };
}
const vP = vault(P, { isLandingVault: true });
const vQ = vault(Q, { parent: parentOf(vP) });

describe("recordPerson: what it asks of the host, and when", () => {
  it("asks for the adder's card once, with the list, the query client and the email as given, and writes after it", async () => {
    const { reading, p, kind, host, card } = await world();
    const qc = new QueryClient();
    const vaults = [vP, vQ];
    const made = await recordPerson(host, { reading, fetchImpl: p.fetch, queryClient: qc, email: "ann@example.test" }, { vault: vQ, vaults, agent: AGENT, kind, name: "Ann Lee", boxes: [], values: {} });
    expect(host.log.adder.length).toBe(1);
    expect(host.log.adder[0]!.vaults).toBe(vaults);
    expect(host.log.adder[0]!.qc).toBe(qc);
    expect(host.log.adder[0]!.opts).toEqual({ email: "ann@example.test" });
    expect(p.entities.get(made.record)!.facts["a:statedBy"]).toEqual({ "@id": card });
    expect(made).toMatchObject({ created: true, vaultId: Q });
  });
  it("with no query client of its own the call gets the one the module keeps, the same every time and never a new one", async () => {
    const { reading, p, kind, host } = await world();
    const run = () => recordPerson(host, { reading, fetchImpl: p.fetch }, { vault: vP, vaults: [vP], agent: AGENT, kind, name: "Ann", boxes: [], values: {} });
    await run();
    await run();
    const [first, second] = host.log.adder.map((c) => c.qc);
    expect(first).toBeInstanceOf(QueryClient);
    expect(second).toBe(first);
    const mine = new QueryClient();
    await recordPerson(host, { reading, fetchImpl: p.fetch, queryClient: mine }, { vault: vP, vaults: [vP], agent: AGENT, kind, name: "Ann", boxes: [], values: {} });
    expect(host.log.adder[2]!.qc).toBe(mine);
    expect(mine).not.toBe(first);
  });
  it("a vault that cannot be written is refused with the exact words, before the host is asked and before any request", async () => {
    const { reading, p, kind, host } = await world();
    const err = await recordPerson(host, { reading, fetchImpl: p.fetch }, { vault: vault(Q, { modes: ["read"] }), vaults: [vP], agent: AGENT, kind, name: "X", boxes: [], values: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotTheHolderError);
    expect((err as Error).name).toBe("NotTheHolderError");
    expect((err as Error).message).toBe("you may not write to this vault, so a person cannot be recorded in it");
    expect(host.log.order).toEqual([]);
    expect(p.requests).toEqual([]);
  });
  it("a host that refuses stops the create with its words, and nothing is written", async () => {
    const { reading, p, kind, host } = await world();
    await expect(recordPerson(host, { reading, fetchImpl: p.fetch }, { vault: vP, vaults: [vQ], agent: AGENT, kind, name: "X", boxes: [], values: {} })).rejects.toThrow(NO_OWN_VAULT_SAYS);
    expect(p.requests).toEqual([]);
  });
  it("on a platform with no tag routes the answer lists the held records written, and not the person's own record", async () => {
    const { reading, p, kind, host } = await world("off");
    const boxes = personBoxes(reading.fieldSets, kind);
    const made = await recordPerson(host, { reading, fetchImpl: p.fetch }, { vault: vP, vaults: [vP], agent: AGENT, kind, name: "Ann", boxes, values: { "a:employment/a:org": "Acme" } });
    expect(made.tag).toBeNull();
    expect(made.held.length).toBe(1);
    expect(p.entities.get(made.held[0]!)!.type).toBe("t:Employment");
    expect(made.held).not.toContain(made.record);
    expect(p.entities.get(made.record)!.facts["a:name"]).toBe("Ann");
  });
  it("an error that is not the tag routes' absence is thrown as it is", async () => {
    const { reading, p, kind, host } = await world();
    p.failNext("POST", "/lws/vault", 500);
    const err = await recordPerson(host, { reading, fetchImpl: p.fetch }, { vault: vP, vaults: [vP], agent: AGENT, kind, name: "X", boxes: [], values: {} }).catch((e: unknown) => e);
    expect((err as Error).name).toBe("PlatformError");
    expect((err as Error).message).toMatch(/answered 500/);
  });
});

describe("findPeople and its test hook", () => {
  it("with the hook set it answers the hook's answer to the same four arguments; with null the package's find answers", async () => {
    const { reading, p } = await world();
    const answer = { candidates: [], complete: true } as never;
    const hook = vi.fn(async () => answer);
    __setFindPeopleForTest(hook);
    const f = (async () => new Response("{}")) as typeof fetch;
    expect(await findPeople(reading, "v", "ann", f)).toBe(answer);
    expect(hook).toHaveBeenCalledWith(reading, "v", "ann", f);
    __setFindPeopleForTest(null);
    const real = await findPeople(reading, P, "zzz-nobody", p.fetch);
    expect(real.candidates).toEqual([]);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(p.requests.length).toBeGreaterThan(0);
  });
});

describe("afterRecordPerson", () => {
  const made = { created: true, record: `${Q}/e/rec1`, vaultId: Q, tag: null, tagHandle: null, held: [] } as unknown as CreateResult;

  it("remembers the vault the create wrote into, under the record's short id, and marks the vault's list and every snapshot list to be read again", async () => {
    const host = fakeHost("x");
    const qc = new QueryClient();
    const snapshot = [...RECORDS_SNAPSHOT_KEY_HEAD, Q, "live", "Person"];
    qc.setQueryData(recordsKey(Q), { rows: 1 });
    qc.setQueryData(snapshot, { rows: 1 });
    qc.setQueryData(["unrelated"], 1);
    await afterRecordPerson(host, qc, made);
    expect(host.log.remembered).toEqual([{ qc, recordId: "rec1", vaultId: Q }]);
    expect(qc.getQueryState(recordsKey(Q))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(snapshot)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["unrelated"])?.isInvalidated).toBe(false);
  });
  it("the vault is remembered before the lists are marked", async () => {
    const host = fakeHost("x");
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await afterRecordPerson(host, qc, made);
    expect(host.log.order).toEqual(["rememberCreatedIn"]);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.invocationCallOrder[0]!).toBeGreaterThan(0);
  });
});

describe("readHolderSelfCard and holderSelfCard", () => {
  const ROOT = "https://holder.example.test/base";
  const NS = `${ROOT}/pq1`;
  const cardUri = () => selfCardEntityUri(ROOT);

  it("a vault id that is not an address is refused with its own words", async () => {
    await expect(readHolderSelfCard("not an address")).rejects.toThrow(new NotTheHolderError("not an address is not a vault address"));
  });
  it("reads the card at the address derived from the vault root and answers the card's own @id", async () => {
    const uri = await cardUri();
    const read = vi.fn(async () => ({ entityUri: "https://holder.example.test/base/e/served-id" }) as never);
    expect(await readHolderSelfCard(NS, read)).toBe("https://holder.example.test/base/e/served-id");
    expect(read).toHaveBeenCalledWith(uri.slice(uri.lastIndexOf("/") + 1), uri);
  });
  it("a vault with no card is null", async () => {
    expect(await readHolderSelfCard(NS, async () => null as never)).toBeNull();
  });
  it("holderSelfCard: found, it answers; with none and no door it refuses", async () => {
    expect(await holderSelfCard(NS, async () => ({ entityUri: "u" }) as never)).toBe("u");
    await expect(holderSelfCard(NS, async () => null as never)).rejects.toThrow("this vault has no card of its holder yet, so the person recorded would have no source");
  });
  it("holderSelfCard: with a door it makes the card, names the holder, and reads it back where the door says it is", async () => {
    const reads: [string, string][] = [];
    const read = vi.fn(async (id: string, at: string) => {
      reads.push([id, at]);
      return reads.length === 1 ? null : ({ entityUri: `${ROOT}/e/${id}` } as never);
    });
    const door = vi.fn(async () => ({ id: "made1" }));
    expect(await holderSelfCard(NS, read as never, { card: door, holderName: "Ann" })).toBe(`${ROOT}/e/made1`);
    expect(door).toHaveBeenCalledWith(NS, "Ann");
    expect(reads[1]).toEqual(["made1", `${ROOT}/e/made1`]);
  });
  it("holderSelfCard: a door that fails, and a card that cannot be read back, are refused with the reason", async () => {
    const none = async () => null as never;
    await expect(holderSelfCard(NS, none, { card: async () => { throw new Error("door shut"); }, holderName: "Ann" })).rejects.toThrow(
      "this vault's own card could not be made, so the person recorded would have no source (door shut)",
    );
    await expect(holderSelfCard(NS, none, { card: async () => ({ id: "m" }), holderName: "Ann" })).rejects.toThrow(
      "this vault's own card was made but could not be read back, so the person recorded would have no source",
    );
  });
});

