/**
 * The Value card is written in the shapes its terms were minted for:
 *   1  the Scale is a t:Scale record, a:partOf the Value; the Value carries a:hasScale = {"@id": record}.
 *   2  a Scale variable is a t:ScaleQualifier (a:qualifierOptions = option NAME strings); an option with a definition is a
 *      t:ScaleQualifierDefinition record, a:partOf its variable. An older variable is replaced on its next edit.
 * The in-memory vault of test/server.ts answers the reads and the writes through the fake host; a write can be made to fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { carryRaw, type ScaleVariable, type ValueScale } from "@kaigilb/gilbplatformcode-value-card-model";
import { useValueQualifiers, useValueScale, type PlanFind } from "./index";
import { planFindRows } from "./planFind";
import { makeBrowser, planFindKey } from "../test/fakeHost";
import { createServer, type Srv } from "../test/server";
import { planVaultOf, seedValueParts, type ValuePartsSeed } from "../test/testkit";

const server = createServer();

const P = "https://p.example.test/vault";
const VALUE_URI = "https://h.example.test/base/e/val1";
const valueRow = (served: Record<string, unknown> = {}): BaseRecord => {
  const facts = { unitTag: "Speed", ...served };
  return {
    id: "val1",
    entityUri: VALUE_URI,
    typeUri: "t:Value",
    facts: Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])),
    opaqueFacts: [],
    etag: '"sha256:0"',
    updatedAt: 1,
    servedKeys: Object.keys(facts),
    served: { facts, context: undefined, etag: '"sha256:0"' },
  } as unknown as BaseRecord;
};

beforeEach(() => server.reset());
afterEach(cleanup);

const settle = async () => {
  for (let i = 0; i < 30; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
};

/** A browser with the Value's parts seeded (and known to the server). */
function browser(value: BaseRecord, seed: ValuePartsSeed) {
  const b = makeBrowser(server);
  const PV = planVaultOf(value, P);
  const rows = seedValueParts(b.qc, P, value, seed);
  for (const r of rows) server.recs.set(r.id, { id: r.id, typeUri: r.typeUri, served: { ...(r.served!.facts as Record<string, unknown>) }, n: 0 } satisfies Srv);
  const notices: (string | null)[] = [];
  return { qc: b.qc, fake: b.host, calls: b.calls, PV, rows, notices, wrapper: b.Frame };
}

const scale = (over: Partial<ValueScale> = {}): ValueScale => ({ text: "", unit: "", rate: "", context: "", direction: "higher", source: {}, ...over });
const variable = (name: string, options: { name: string; definition: string }[] = [], over: Partial<ScaleVariable> = {}): ScaleVariable => ({
  name,
  definition: "",
  defaultOption: "",
  options,
  source: {},
  ...over,
});
/** An edit of a variable the way the card makes it: a copy that keeps the variable's record key. */
const edited = (v: ScaleVariable, over: Partial<ScaleVariable>): ScaleVariable => carryRaw({ ...v, ...over }, v);
const srv = (id: string) => server.recs.get(id);

/* ------------------------------------------------------------------ FAIL 1 */

describe("the Scale is a t:Scale record", () => {
  function scaleHost(value: BaseRecord, seed: ValuePartsSeed = {}) {
    const b = browser(value, seed);
    let host!: ReturnType<typeof useValueScale>;
    function Harness() {
      host = useValueScale({ enabled: true, record: value, vaultId: P, planVault: b.PV, onNotice: (n) => b.notices.push(n) });
      return null;
    }
    render(<Harness />, { wrapper: b.wrapper });
    return { ...b, get host() { return host; } };
  }

  it("the first Scale: ONE t:Scale record in the Value's own vault, a:partOf the Value, tag <ValueTag>.Scale, direction written; then the Value is linked", async () => {
    const value = valueRow();
    const t = scaleHost(value);
    const linked: (string | null)[] = [];
    await act(async () => {
      await t.host.save(scale({ text: "minutes to [Task]", unit: "minutes", rate: "per [Task]", context: "in [Country]" }), async (uri) => (linked.push(uri), true));
    });
    expect(server.creates).toHaveLength(1);
    const c = server.creates[0]!;
    expect(c.vault).toBe(t.PV);
    expect(c.typeUri).toMatch(/Scale$/);
    expect(c.facts).toEqual({
      unitTag: "Speed.Scale",
      partOf: { "@id": VALUE_URI },
      description: "minutes to [Task]",
      unit: "minutes",
      rate: "per [Task]",
      scaleContext: "in [Country]",
      scaleDirection: "higher",
    });
    expect(linked).toEqual(["https://h.example.test/base/e/made1"]);
    expect(server.patches).toEqual([]);
    expect(server.deletes).toEqual([]);
  });

  it("direction lower is written too (never left to a default)", async () => {
    const t = scaleHost(valueRow());
    await act(async () => {
      await t.host.save(scale({ unit: "min", direction: "lower" }), async () => true);
    });
    expect(server.creates[0]!.facts.scaleDirection).toBe("lower");
  });

  it("an edit of a Scale that is a record patches that record alone, with only the facts that changed", async () => {
    const value = valueRow({ hasScale: { "@id": "https://h.example.test/base/e/scale1" } });
    const t = scaleHost(value, { scale: { "a:description": "words", "a:unit": "minutes", "a:scaleDirection": "higher" } });
    const link = vi.fn(async () => true);
    await act(async () => {
      await t.host.save(scale({ text: "words", unit: "seconds" }), link);
    });
    expect(server.patches).toEqual([{ id: "scale1", body: { unit: "seconds" } }]);
    expect(server.creates).toEqual([]);
    expect(link).not.toHaveBeenCalled();
  });

  it("migrate on edit: an inline a:hasScale (and the older valueScale) becomes a record from the merged values, then the Value is linked (old keys nulled by the caller's patch)", async () => {
    const value = valueRow({ hasScale: { "a:unit": "minutes", "a:rate": "per [Task]" } });
    const t = scaleHost(value);
    const link = vi.fn(async () => true);
    await act(async () => {
      await t.host.save(scale({ unit: "seconds", rate: "per [Task]", direction: "lower" }), link);
    });
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]!.facts).toMatchObject({ unit: "seconds", rate: "per [Task]", scaleDirection: "lower", partOf: { "@id": VALUE_URI } });
    expect(link).toHaveBeenCalledWith("https://h.example.test/base/e/made1");
    expect(server.deletes).toEqual([]);
  });

  it("rollback: if the Value cannot be linked (second write fails) the new record is ended; no orphan; the group notice is the error", async () => {
    const value = valueRow({ hasScale: { "a:unit": "minutes" } });
    const t = scaleHost(value);
    let err: unknown = null;
    await act(async () => {
      await t.host.save(scale({ unit: "seconds" }), async () => false).catch((e) => (err = e));
    });
    expect(server.creates).toHaveLength(1);
    expect(server.deletes).toEqual(["made1"]);
    expect(srv("made1")).toBeUndefined();
    expect(String((err as Error).message)).toMatch(/Nothing was changed; the Scale is back as it was/);
    // The Value's part-of find no longer lists it.
    expect(planFindRows(t.qc.getQueryData<PlanFind>(planFindKey(t.PV, "a:partOf", "val1"))).some((r) => r.id === "made1")).toBe(false);
  });

  it("rollback when the link throws: the sentence of the failure is kept, the record is ended", async () => {
    const t = scaleHost(valueRow());
    // An answer with no status is checked against the Value: here the Value is read and does not point at the new record.
    server.recs.set("val1", { id: "val1", typeUri: "t:Value", served: { unitTag: "Speed" }, n: 1 });
    let err: unknown = null;
    await act(async () => {
      await t.host
        .save(scale({ unit: "min" }), async () => { throw new Error("the vault did not answer"); }, (e) => (e instanceof Error ? `Not saved: ${e.message}.` : null))
        .catch((e) => (err = e));
    });
    expect(server.deletes).toEqual(["made1"]);
    expect(String((err as Error).message)).toContain("Not saved: the vault did not answer.");
  });

  it("the new record cannot be removed: the notice names it (no silent orphan)", async () => {
    const t = scaleHost(valueRow());
    server.failDelete.add("made1");
    let err: unknown = null;
    await act(async () => {
      await t.host.save(scale({ unit: "min" }), async () => false).catch((e) => (err = e));
    });
    expect(String((err as Error).message)).toMatch(/could not be removed/);
    expect(String((err as Error).message)).toContain("Speed.Scale");
  });

  it("a failed create writes nothing and leaves no orphan", async () => {
    const t = scaleHost(valueRow());
    server.failCreate.add(1);
    const link = vi.fn(async () => true);
    let err: unknown = null;
    await act(async () => {
      await t.host.save(scale({ unit: "min" }), link).catch((e) => (err = e));
    });
    expect(err).toBeTruthy();
    expect(link).not.toHaveBeenCalled();
    expect(server.recs.size).toBe(0);
  });

  it("a Value that points at a Scale record the card could not read: nothing is made beside it", async () => {
    // A record that is GONE (404) is a dangling reference and is repaired (see the Scale case P3 in useValueSafety.test.tsx). Only a read that FAILS stops the save.
    const value = valueRow({ hasScale: { "@id": "https://h.example.test/base/e/gone" } });
    const t = scaleHost(value);
    t.fake.readRecord.mockRejectedValueOnce(new Error("offline"));
    let err: unknown = null;
    await act(async () => {
      await t.host.save(scale({ unit: "min" }), async () => true).catch((e) => (err = e));
    });
    expect(String((err as Error).message)).toMatch(/could not be read/);
    expect(server.creates).toEqual([]);
  });

  it("clearing an older inline Scale writes no record and unlinks the Value", async () => {
    const value = valueRow({ hasScale: { "a:unit": "minutes" } });
    const t = scaleHost(value);
    const link = vi.fn(async () => true);
    await act(async () => {
      await t.host.save(scale({ direction: "higher" }), link);
    });
    expect(server.creates).toEqual([]);
    expect(link).toHaveBeenCalledWith(null);
  });
});

/* ------------------------------------------------------------------ FAIL 2 */

describe("qualifiers and their options", () => {
  function qualHost(value: BaseRecord, seed: ValuePartsSeed) {
    const b = browser(value, seed);
    let host!: ReturnType<typeof useValueQualifiers>;
    function Harness() {
      host = useValueQualifiers({ enabled: true, record: value, vaultId: P, planVault: b.PV, rows: b.rows.filter((r) => /Qualifier|Scale|Level|Meter/.test(r.typeUri) && !/^optdef/.test(r.id)), onNotice: (n) => b.notices.push(n) });
      return null;
    }
    render(<Harness />, { wrapper: b.wrapper });
    return { ...b, get host() { return host; } };
  }

  it("a new variable is a t:ScaleQualifier with option NAME strings; an option with a definition is its own t:ScaleQualifierDefinition, a:partOf the variable", async () => {
    const t = qualHost(valueRow(), {});
    await act(async () => {
      t.host.commit([variable("Country", [{ name: "Norway", definition: "the country" }, { name: "Sweden", definition: "" }], { definition: "where", defaultOption: "Norway" })]);
    });
    await settle();
    expect(server.creates).toHaveLength(2);
    const [q, d] = server.creates;
    expect(q!.vault).toBe(t.PV);
    expect(q!.typeUri).toMatch(/ScaleQualifier$/);
    expect(q!.facts).toMatchObject({
      unitTag: "Speed.Q.Country",
      partOf: { "@id": VALUE_URI },
      name: "Country",
      definition: "where",
      defaultOption: "Norway",
      qualifierOptions: ["Norway", "Sweden"],
    });
    expect(d!.vault).toBe(t.PV);
    expect(d!.typeUri).toMatch(/ScaleQualifierDefinition$/);
    expect(d!.facts).toMatchObject({ partOf: { "@id": "https://h.example.test/base/e/made1" }, name: "Norway", definition: "the country" });
    expect(JSON.stringify(d!.facts)).not.toContain("Sweden");
    expect(server.deletes).toEqual([]);
  });

  it("read: option names from the strings, definitions from the option records; the older option objects and the older record type are read as they are", async () => {
    const t = qualHost(valueRow(), {
      qualifiers: [
        { "a:name": "Country", "a:qualifierOptions": ["Norway", "Sweden"], __optionDefs: [{ name: "Norway", definition: "the country" }] },
        { "a:name": "Role", "a:qualifierOptions": [{ "a:name": "Boss", "a:definition": "decides" }], __legacy: true },
      ],
    });
    await settle();
    const items = t.host.items;
    expect(items.map((v) => v.name)).toEqual(["Country", "Role"]);
    expect(items[0]!.options).toEqual([{ name: "Norway", definition: "the country" }, { name: "Sweden", definition: "" }]);
    expect(items[1]!.options).toEqual([{ name: "Boss", definition: "decides" }]);
  });

  it("adding a definition to an option makes ONE option record; changing it patches that record; clearing it ends it", async () => {
    const t = qualHost(valueRow(), { qualifiers: [{ "a:name": "Country", "a:qualifierOptions": ["Norway", "Sweden"] }] });
    await settle();
    const withDef = (d: string) => [edited(t.host.items[0]!, { options: [{ name: "Norway", definition: d }, { name: "Sweden", definition: "" }] })];
    await act(async () => { t.host.commit(withDef("the country")); });
    await settle();
    expect(server.creates.map((c) => c.typeUri.split(":").pop())).toEqual(["ScaleQualifierDefinition"]);
    expect(server.creates[0]!.facts).toMatchObject({ partOf: { "@id": "https://h.example.test/base/e/qual1" }, name: "Norway", definition: "the country" });
    expect(server.patches).toEqual([]);
    await act(async () => { t.host.commit(withDef("the land")); });
    await settle();
    expect(server.patches.map((p) => p.body)).toEqual([{ definition: "the land" }]);
    await act(async () => { t.host.commit(withDef("")); });
    await settle();
    expect(server.deletes).toEqual(["made1"]);
  });

  it("removing an option ends its definition record; the names list drops it", async () => {
    const t = qualHost(valueRow(), { qualifiers: [{ "a:name": "Country", "a:qualifierOptions": ["Norway", "Sweden"], __optionDefs: [{ name: "Norway", definition: "d" }] }] });
    await settle();
    await act(async () => { t.host.commit([edited(t.host.items[0]!, { options: [{ name: "Sweden", definition: "" }] })]); });
    await settle();
    expect(server.patches).toEqual([{ id: "qual1", body: { qualifierOptions: ["Sweden"] } }]);
    expect(server.deletes).toEqual(["optdef1_1"]);
  });

  it("ending a variable ends its option records first", async () => {
    const t = qualHost(valueRow(), { qualifiers: [{ "a:name": "Country", "a:qualifierOptions": ["Norway"], __optionDefs: [{ name: "Norway", definition: "d" }] }] });
    await settle();
    await act(async () => { t.host.commit([]); });
    await settle();
    expect(server.deletes).toEqual(["optdef1_1", "qual1"]);
  });

  it("migrate on edit: an older variable (t:ScaleQualifierDefinition, a part of the Value, option objects) becomes a t:ScaleQualifier plus one option record per defined option, then the old record ends", async () => {
    const t = qualHost(valueRow(), {
      qualifiers: [{ "a:name": "Country", "a:definition": "where", "a:qualifierOptions": [{ "a:name": "Norway", "a:definition": "the country" }, { "a:name": "Sweden" }], __legacy: true }],
    });
    await settle();
    await act(async () => { t.host.commit([edited(t.host.items[0]!, { definition: "where now" })]); });
    await settle();
    expect(server.creates.map((c) => c.typeUri.split(":").pop())).toEqual(["ScaleQualifier", "ScaleQualifierDefinition"]);
    expect(server.creates[0]!.facts).toMatchObject({ name: "Country", definition: "where now", qualifierOptions: ["Norway", "Sweden"], partOf: { "@id": VALUE_URI } });
    expect(server.creates[1]!.facts).toMatchObject({ name: "Norway", definition: "the country", partOf: { "@id": "https://h.example.test/base/e/made1" } });
    expect(server.deletes).toEqual(["qual1"]);
    // The old record held the tag while the new one was made (so it first got .2); once the old one is gone it takes the plain tag.
    expect(server.patches).toEqual([{ id: "made1", body: { unitTag: "Speed.Q.Country" } }]);
  });

  it("migrate rollback: if a record of the group fails, what was made is ended and the old record is untouched; the notice says so", async () => {
    const t = qualHost(valueRow(), {
      qualifiers: [{ "a:name": "Country", "a:qualifierOptions": [{ "a:name": "Norway", "a:definition": "the country" }], __legacy: true }],
    });
    await settle();
    server.failCreate.add(3); // 1: the plain tag is held by the old record (409), 2: the new variable, 3: its option record
    await act(async () => { t.host.commit([edited(t.host.items[0]!, { definition: "x" })]); });
    await settle();
    expect(server.deletes).toEqual(["made1"]);
    expect(srv("qual1")).toBeDefined();
    expect(t.notices.filter(Boolean).join(" ")).toMatch(/create refused|Nothing was changed/);
  });

  it("migrate rollback: if the old record cannot be ended, the new records are ended again", async () => {
    const t = qualHost(valueRow(), {
      qualifiers: [{ "a:name": "Country", "a:qualifierOptions": [{ "a:name": "Norway", "a:definition": "the country" }], __legacy: true }],
    });
    await settle();
    server.failDelete.add("qual1");
    await act(async () => { t.host.commit([edited(t.host.items[0]!, { definition: "x" })]); });
    await settle();
    expect(server.deletes.sort()).toEqual(["made1", "made2"]);
    expect(srv("qual1")).toBeDefined();
    expect(srv("made1")).toBeUndefined();
    expect(t.notices.filter(Boolean).join(" ")).toMatch(/back as it was/);
  });

  it("create-door sweep: a variable whose option record fails leaves no orphan (the variable is ended again)", async () => {
    const t = qualHost(valueRow(), {});
    server.failCreate.add(2);
    await act(async () => { t.host.commit([variable("Country", [{ name: "Norway", definition: "the country" }])]); });
    await settle();
    expect(server.deletes).toEqual(["made1"]);
    expect([...server.recs.keys()]).toEqual([]);
    expect(t.notices.filter(Boolean).join(" ")).toMatch(/create refused/);
  });
});
