/**
 * The safety rules of the write layer, each as a test: the migration of an older qualifier is safe for a second editor (the old
 * record is ended with its version; a 404 or a 412 is not success; a twin made by someone else is adopted), a Scale whose reference
 * is dangling is repaired, a lost answer is checked against the Value, and several orphan Scale records are folded into one.
 * The in-memory vault of test/server.ts answers the reads and the writes through the fake host; a write can be made to fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { carryRaw, readValueCard, type ScaleVariable, type ValueScale } from "@kaigilb/gilbplatformcode-value-card-model";
import { useValueQualifiers, useValueScale } from "./index";
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
/** An edit of a variable the way the card makes it: a copy that keeps the variable's record key. */
const edited = (v: ScaleVariable, over: Partial<ScaleVariable>): ScaleVariable => carryRaw({ ...v, ...over }, v);
const srv = (id: string) => server.recs.get(id);

describe("migrate-on-edit safety", () => {
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
  const OLD = { qualifiers: [{ "a:name": "Country", "a:definition": "where", "a:qualifierOptions": [{ "a:name": "Norway", "a:definition": "the country" }], __legacy: true }] };

  it("P1: the old variable was changed by someone else after this browser read it: migrating must not delete their edit", async () => {
    const t = qualHost(valueRow(), OLD);
    await settle();
    // Another person edits the OLD record (definition) on the server; this browser still shows the old text.
    const s = srv("qual1")!;
    s.served.definition = "Ann's newer definition";
    s.n += 1;
    await act(async () => { t.host.commit([edited(t.host.items[0]!, { name: "Nation" })]); });
    await settle();
    // Lawful outcomes: nothing written (conflict), or the new record carries Ann's text. Unlawful: old record ended, new one holds the stale text.
    const made = server.creates.find((c) => /ScaleQualifier$/.test(c.typeUri));
    const lost = server.deletes.includes("qual1") && made?.facts.definition !== "Ann's newer definition";
    expect(lost, `old record ended: ${server.deletes}; new definition: ${String(made?.facts.definition)}`).toBe(false);
  });

  it("P2: another editor already migrated this variable (old record gone on the server): this browser must not add a second one", async () => {
    const t = qualHost(valueRow(), OLD);
    await settle();
    // The other editor's work: a new t:ScaleQualifier "Country" exists, the old record is gone.
    server.recs.delete("qual1");
    server.recs.set("theirs", { id: "theirs", typeUri: "t:ScaleQualifier", served: { name: "Country", partOf: { "@id": VALUE_URI }, unitTag: "Speed.Q.Country" }, n: 1 });
    await act(async () => { t.host.commit([edited(t.host.items[0]!, { definition: "where now" })]); });
    await settle();
    const live = [...server.recs.values()].filter((r) => /ScaleQualifier$/.test(r.typeUri) && (r.served.name as string) === "Country");
    expect(live.length, `qualifiers named Country on the server: ${live.map((l) => l.id)}`).toBe(1);
  });

  it("P3: a:hasScale points at a Scale record that no longer exists (find complete): the Scale can still be saved", async () => {
    const value = valueRow({ hasScale: { "@id": "https://h.example.test/base/e/gone" } });
    const t = scaleHost(value, {});
    let err: unknown = null;
    const link = vi.fn(async () => true);
    await act(async () => { await t.host.save(scale({ text: "minutes" }), link).catch((e) => (err = e)); });
    expect(err, String((err as Error)?.message)).toBeNull();
  });

  it("P4: an orphan t:Scale record is a part of the Value while a:hasScale is still inline: an edit must not make a second Scale record", async () => {
    const value = valueRow({ hasScale: { "a:unit": "minutes" } });
    const t = scaleHost(value, { scale: { "a:description": "orphan words", "a:scaleDirection": "lower" } });
    await act(async () => { await t.host.save(scale({ unit: "seconds" }), async () => true).catch(() => {}); });
    const scales = [...server.recs.values()].filter((r) => /Scale$/.test(r.typeUri) && !/Qualifier/.test(r.typeUri));
    expect(scales.length, `Scale records: ${scales.map((s) => s.id)}`).toBe(1);
  });

  it("P5: link PATCH reaches the server but the answer is lost (throws): the record the Value now points at must not be ended", async () => {
    const value = valueRow();
    const t = scaleHost(value);
    let linkedTo: string | null = null;
    await act(async () => {
      await t.host.save(scale({ unit: "min" }), async (uri) => { linkedTo = uri; throw new Error("network lost after the server applied it"); }).catch(() => {});
    });
    // The server applied the link: the record must still exist.
    expect(linkedTo).not.toBeNull();
    expect(srv("made1"), "Scale record ended although the Value may point at it").toBeDefined();
  });
});


describe("migrate-on-edit: the old record is ended with If-Match, and 404/412 are not success", () => {
  const OLD = { qualifiers: [{ "a:name": "Country", "a:definition": "where", "a:qualifierOptions": [{ "a:name": "Norway", "a:definition": "the country" }], __legacy: true }] };
  const SENTENCE = "Someone else changed this qualifier; it is shown as it is now.";
  function qualHost(value: BaseRecord, seed: ValuePartsSeed, rowsOf?: (all: BaseRecord[]) => BaseRecord[]) {
    const b = browser(value, seed);
    let host!: ReturnType<typeof useValueQualifiers>;
    function Harness() {
      const all = b.rows.filter((r) => /Qualifier|Scale|Level|Meter/.test(r.typeUri) && !/^optdef/.test(r.id));
      host = useValueQualifiers({ enabled: true, record: value, vaultId: P, planVault: b.PV, rows: rowsOf ? rowsOf(all) : all, onNotice: (n) => b.notices.push(n) });
      return null;
    }
    render(<Harness />, { wrapper: b.wrapper });
    return { ...b, get host() { return host; } };
  }

  it("a normal migration ends the old record once, with If-Match (the version just read)", async () => {
    const t = qualHost(valueRow(), OLD);
    await settle();
    await act(async () => { t.host.commit([edited(t.host.items[0]!, { definition: "where now" })]); });
    await settle();
    const ends = server.deleteArgs.filter((d) => d.id === "qual1");
    expect(ends).toEqual([{ id: "qual1", ifMatch: '"v0"' }]);
    expect(server.creates.filter((c) => /ScaleQualifier$/.test(c.typeUri))).toHaveLength(1);
  });

  for (const status of [404, 412]) {
    it(`DELETE of the old record answers ${status}: the new record is ended again, the card says so, nothing is duplicated`, async () => {
      const t = qualHost(valueRow(), OLD);
      await settle();
      server.deleteStatus.set("qual1", status);
      await act(async () => { t.host.commit([edited(t.host.items[0]!, { definition: "where now" })]); });
      await settle();
      expect(t.notices).toContain(SENTENCE);
      expect(server.deletes).toContain("made1");
      const live = [...server.recs.values()].filter((r) => /ScaleQualifier(Definition)?$/.test(r.typeUri) && r.served.name === "Country");
      expect(live.map((l) => l.id)).toEqual(["qual1"]);
    });
  }

  it("the old record is already gone: nothing is made", async () => {
    const t = qualHost(valueRow(), OLD);
    await settle();
    server.recs.delete("qual1");
    await act(async () => { t.host.commit([edited(t.host.items[0]!, { definition: "where now" })]); });
    await settle();
    expect(server.creates).toEqual([]);
    expect(t.notices).toContain(SENTENCE);
  });

  it("a t:ScaleQualifier of the same name already stands in the Value's parts (someone else migrated): adopted, nothing made, nothing ended", async () => {
    const seed: ValuePartsSeed = { qualifiers: [...OLD.qualifiers, { "a:name": "Country", "a:definition": "theirs" }] };
    // This browser's rows (the hook's input) do not have their record yet; the Value's part cache (the find) does.
    const t = qualHost(valueRow(), seed, (all) => all.filter((r) => r.id !== "qual2"));
    await settle();
    expect(t.host.items.map((i) => i.name)).toEqual(["Country"]);
    await act(async () => { t.host.commit([edited(t.host.items[0]!, { definition: "where now" })]); });
    await settle();
    expect(server.creates).toEqual([]);
    expect(server.deletes).toEqual([]);
    expect(t.notices).toContain(SENTENCE);
  });
});

describe("Scale: a dangling a:hasScale, a lost answer, orphan records", () => {
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
  const putValue = (served: Record<string, unknown>) => server.recs.set("val1", { id: "val1", typeUri: "t:Value", served: { unitTag: "Speed", ...served }, n: 1 });

  it("a reference to a gone record is no Scale for reading (the older valueScale key shows); the next edit makes a fresh record and relinks to it", async () => {
    const value = valueRow({ hasScale: { "@id": "https://h.example.test/base/e/gone" }, valueScale: { "a:unit": "OLDUNIT" } });
    expect(readValueCard({ hasScale: { "@id": "https://h.example.test/base/e/gone" }, valueScale: { "a:unit": "OLDUNIT" } }).scale.unit).toBe("OLDUNIT");
    expect(readValueCard({ hasScale: { "@id": "https://h.example.test/base/e/gone" } }).scale.unit).toBe("");
    const t = scaleHost(value);
    const link = vi.fn(async () => true);
    await act(async () => { await t.host.save(scale({ unit: "minutes" }), link); });
    expect(link).toHaveBeenCalledTimes(1);
    expect(link).toHaveBeenCalledWith("https://h.example.test/base/e/made1");
    expect(server.creates.filter((c) => c.typeUri.endsWith("Scale"))).toHaveLength(1);
  });

  it("a reference to a record that is not a Scale of this Value is a dangling reference too (repair, no error)", async () => {
    server.recs.set("other", { id: "other", typeUri: "t:Note", served: {}, n: 1 });
    const value = valueRow({ hasScale: { "@id": "https://h.example.test/base/e/other" } });
    const t = scaleHost(value);
    const link = vi.fn(async () => true);
    await act(async () => { await t.host.save(scale({ unit: "minutes" }), link); });
    expect(link).toHaveBeenCalledWith("https://h.example.test/base/e/made1");
  });

  it("a reference that cannot be read says so and writes nothing", async () => {
    const value = valueRow({ hasScale: { "@id": "https://h.example.test/base/e/val-x" } });
    const t = scaleHost(value);
    t.fake.readRecord.mockRejectedValueOnce(new Error("offline"));
    let err: unknown = null;
    await act(async () => { await t.host.save(scale({ unit: "minutes" }), async () => true).catch((e) => (err = e)); });
    expect(String((err as Error).message)).toMatch(/could not be read/);
    expect(server.creates).toEqual([]);
  });

  it("lost link answer, the Value DOES point at the new record: kept, no error, nothing ended", async () => {
    const t = scaleHost(valueRow());
    let err: unknown = null;
    await act(async () => {
      await t.host.save(scale({ unit: "min" }), async (uri) => { putValue({ hasScale: { "@id": uri } }); throw new Error("network lost"); }).catch((e) => (err = e));
    });
    expect(err).toBeNull();
    expect(srv("made1")).toBeDefined();
    expect(server.deletes).toEqual([]);
  });

  it("lost link answer, the Value does NOT point at it: the new record is ended and the error says so", async () => {
    const t = scaleHost(valueRow());
    putValue({});
    let err: unknown = null;
    await act(async () => {
      await t.host.save(scale({ unit: "min" }), async () => { throw new Error("network lost"); }).catch((e) => (err = e));
    });
    expect(String((err as Error)?.message)).toMatch(/Nothing was changed/);
    expect(srv("made1")).toBeUndefined();
  });

  it("a refusal WITH a status is not a lost answer: the new record is ended without a re-read", async () => {
    const t = scaleHost(valueRow());
    let err: unknown = null;
    await act(async () => {
      await t.host.save(scale({ unit: "min" }), async () => { throw Object.assign(new Error("refused"), { status: 500 }); }).catch((e) => (err = e));
    });
    expect(err).not.toBeNull();
    expect(srv("made1")).toBeUndefined();
  });

  it("several orphan Scale records: the newest is adopted (changed, linked); the others are ended; none is made", async () => {
    const value = valueRow({ hasScale: { "a:unit": "minutes" } });
    const t = scaleHost(value, { scale: { "a:description": "older words", "a:scaleDirection": "lower" } });
    const first = t.rows.find((r) => r.id === "scale1")!;
    const newer = { ...first, id: "scale2", entityUri: "https://h.example.test/base/e/scale2", updatedAt: 99 } as BaseRecord;
    server.recs.set("scale2", { id: "scale2", typeUri: first.typeUri, served: { ...(first.served!.facts as Record<string, unknown>), description: "newer words" }, n: 0 } satisfies Srv);
    t.qc.setQueryData(planFindKey(t.PV, "a:partOf", "val1"), { rows: [first, newer], total: 2, capped: false, unread: 0 });
    const link = vi.fn(async () => true);
    await act(async () => { await t.host.save(scale({ unit: "seconds" }), link); });
    expect(link).toHaveBeenCalledWith("https://h.example.test/base/e/scale2");
    expect(server.creates).toEqual([]);
    expect(server.deletes).toEqual(["scale1"]);
    expect(server.patches.some((p) => p.id === "scale2" && p.body.unit === "seconds")).toBe(true);
  });
});
