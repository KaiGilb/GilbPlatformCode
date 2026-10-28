// The Scale of a Value (or of a Development Resource) as one record: what a save writes, and what a Resource does differently.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { ValueScale } from "@kaigilb/gilbplatformcode-value-card-model";
import { useValueScale, type PlanFind } from "./index";
import { makeBrowser, planFindKey } from "../test/fakeHost";
import { createServer, entityUriOf, type Srv } from "../test/server";
import { planVaultOf, seedValueParts, type ValuePartsSeed } from "../test/testkit";
import { P, valueRow, VALUE_URI } from "../test/value";

const server = createServer({ ifMatch: true, patchTagCheck: true });
beforeEach(() => server.reset());
afterEach(cleanup);

const scale = (over: Partial<ValueScale> = {}): ValueScale => ({ text: "", unit: "", rate: "", context: "", direction: "higher", source: {}, ...over });

function mount(value: BaseRecord, seed: ValuePartsSeed = {}) {
  const b = makeBrowser(server);
  const PV = planVaultOf(value, P);
  const rows = seedValueParts(b.qc, P, value, seed);
  for (const r of rows) r.etag = '"v0"';
  for (const r of rows) server.set({ id: r.id, typeUri: r.typeUri, served: { ...(r.served!.facts as Record<string, unknown>) }, n: 0 } satisfies Srv);
  server.set({ id: value.id, typeUri: value.typeUri, served: { ...(value.served!.facts as Record<string, unknown>) }, n: 1 });
  const notices: (string | null)[] = [];
  const onTouched = vi.fn();
  const hook = renderHook(() => useValueScale({ enabled: true, record: value, vaultId: P, planVault: PV, onNotice: (n) => notices.push(n), onTouched }), { wrapper: b.Frame });
  return { b, hook, notices, onTouched, PV };
}

describe("a Value", () => {
  it("a Scale with nothing in it but the direction 'lower' is a Scale: its record is made, with the direction written", async () => {
    const t = mount(valueRow());
    const link = vi.fn(async () => true);
    await act(async () => t.hook.result.current.save(scale({ direction: "lower" }), link));
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]!.facts).toEqual({ unitTag: "Speed.Scale", partOf: { "@id": VALUE_URI }, scaleDirection: "lower" });
    expect(link).toHaveBeenCalledWith(entityUriOf("made1"));
  });

  it("a Scale with nothing in it and the default direction 'higher' writes nothing", async () => {
    const t = mount(valueRow());
    const link = vi.fn(async () => true);
    await act(async () => t.hook.result.current.save(scale(), link));
    expect(server.creates).toEqual([]);
    expect(link).not.toHaveBeenCalled();
  });
});

describe("a Development Resource", () => {
  const resource = () => valueRow({}, "t:Resource", "Cost");

  it("a Scale with nothing in it and the direction 'lower' is the default: nothing is written, the Value is not linked", async () => {
    const t = mount(resource());
    const link = vi.fn(async () => true);
    await act(async () => t.hook.result.current.save(scale({ direction: "lower" }), link));
    expect(server.creates).toEqual([]);
    expect(server.patches).toEqual([]);
    expect(link).not.toHaveBeenCalled();
  });

  it("a Scale with a unit is written with the direction 'lower' stored in it, as a t:Scale record of the Resource", async () => {
    const t = mount(resource());
    const link = vi.fn(async () => true);
    await act(async () => t.hook.result.current.save(scale({ direction: "lower", unit: "USD" }), link));
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]!.typeUri).toBe("t:Scale");
    expect(server.creates[0]!.facts).toEqual({ unitTag: "Cost.Scale", partOf: { "@id": VALUE_URI }, unit: "USD", scaleDirection: "lower" });
    expect(link).toHaveBeenCalledWith(entityUriOf("made1"));
  });

  it("the direction 'higher' is not the default of a Resource: it is a Scale, and it is written", async () => {
    const t = mount(resource());
    const link = vi.fn(async () => true);
    await act(async () => t.hook.result.current.save(scale({ direction: "higher" }), link));
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]!.facts.scaleDirection).toBe("higher");
  });

  it("a stored Scale record is changed in the same way, a change of direction alone included", async () => {
    const value = valueRow({ hasScale: { "@id": entityUriOf("scale1") } }, "t:Resource", "Cost");
    const t = mount(value, { scale: { "a:unit": "USD", "a:scaleDirection": "lower" } });
    await act(async () => t.hook.result.current.save(scale({ unit: "USD", direction: "higher" }), async () => true));
    // The seeded record carries the Value's tag; the Resource's Scale tag is written with the change.
    expect(server.patches).toEqual([{ id: "scale1", body: { scaleDirection: "higher", unitTag: "Cost.Scale" } }]);
    expect(t.b.host.typeUriForVaultNamespace).not.toHaveBeenCalled();
  });
});

describe("a Scale the Value points at", () => {
  it("that the find did not show is read by its id and address, and changed in place; no second record is made", async () => {
    const ref = entityUriOf("scale9");
    const value = valueRow({ hasScale: { "@id": ref } });
    const t = mount(value);
    server.set({ id: "scale9", typeUri: "t:Scale", served: { unitTag: "Speed.Scale", partOf: { "@id": VALUE_URI }, unit: "min", scaleDirection: "higher" }, n: 0 });
    const link = vi.fn(async () => true);
    await act(async () => t.hook.result.current.save(scale({ unit: "seconds" }), link));
    expect(t.b.host.readRecord).toHaveBeenCalledWith("scale9", ref);
    expect(server.patches).toEqual([{ id: "scale9", body: { unit: "seconds" } }]);
    expect(server.creates).toEqual([]);
    expect(link).not.toHaveBeenCalled();
  });
});

describe("the save", () => {
  it("a Value with no address cannot take a Scale, and says so", async () => {
    const t = mount({ ...valueRow(), entityUri: undefined } as BaseRecord);
    await expect(t.hook.result.current.save(scale({ unit: "min" }), async () => true)).rejects.toThrow("This Value has no address yet, so its Scale cannot be saved.");
    expect(server.creates).toEqual([]);
  });

  it("an answer without a status that the host calls a refusal is not a lost answer: the new record is ended at once, with no re-read of the Value", async () => {
    const t = mount(valueRow());
    t.b.host.isForbidden.mockImplementation((e) => e instanceof Error && e.message === "denied");
    await expect(
      t.hook.result.current.save(scale({ unit: "min" }), async () => {
        throw new Error("denied");
      }),
    ).rejects.toThrow("denied Nothing was changed; the Scale is back as it was.");
    expect(server.deletes).toEqual(["made1"]);
    expect(t.b.host.reconcileAfterConflict).not.toHaveBeenCalled();
  });

  it("an answer without a status that the host calls a conflict is not a lost answer either", async () => {
    const t = mount(valueRow());
    t.b.host.isConflict.mockImplementation((e) => e instanceof Error && e.message === "stale");
    await expect(
      t.hook.result.current.save(scale({ unit: "min" }), async () => {
        throw new Error("stale");
      }),
    ).rejects.toThrow("stale Nothing was changed; the Scale is back as it was.");
    expect(t.b.host.reconcileAfterConflict).not.toHaveBeenCalled();
  });

  it("a lost answer and a Value that cannot be read keeps the new record and says it could not be checked", async () => {
    const t = mount(valueRow());
    server.recs.delete("val1");
    await expect(
      t.hook.result.current.save(scale({ unit: "min" }), async () => {
        throw new Error("network lost");
      }),
    ).rejects.toThrow("network lost It could not be checked whether the Scale was saved; reload to see. The Scale record Speed.Scale was kept.");
    expect(server.deletes).toEqual([]);
    expect(server.get("made1")).toBeDefined();
  });

  it("the older Scale records that cannot be removed are named in a notice, and the Scale is saved", async () => {
    const value = valueRow({ hasScale: { "a:unit": "minutes" } });
    const t = mount(value, { scale: { "a:description": "older words", "a:scaleDirection": "lower" } });
    const key = planFindKey(t.PV, "a:partOf", "val1");
    const find = t.b.qc.getQueryData<PlanFind>(key)!;
    const first = find.rows[0]!;
    const newer = { ...first, id: "scale2", entityUri: entityUriOf("scale2"), updatedAt: 99 } as BaseRecord;
    server.set({ id: "scale2", typeUri: first.typeUri, served: { ...(first.served!.facts as Record<string, unknown>) }, n: 0 });
    t.b.qc.setQueryData(key, { ...find, rows: [first, newer], total: 2 });
    server.failDelete.add("scale1");
    const link = vi.fn(async () => true);
    await act(async () => t.hook.result.current.save(scale({ unit: "seconds" }), link));
    expect(link).toHaveBeenCalledWith(entityUriOf("scale2"));
    expect(t.notices.filter(Boolean)).toEqual(["The Scale was saved. These older Scale records could not be removed: Speed.Scale. Remove them by hand."]);
  });

  it("an orphan Scale record that cannot be linked is changed back, and the error says so", async () => {
    const value = valueRow({ hasScale: { "a:unit": "minutes" } });
    const t = mount(value, { scale: { "a:description": "older words", "a:unit": "kg", "a:scaleDirection": "lower" } });
    await expect(t.hook.result.current.save(scale({ unit: "seconds" }), async () => false)).rejects.toThrow(
      "Couldn't save the Scale. Nothing was changed; the Scale is back as it was.",
    );
    expect(server.patches.map((p) => p.body)).toEqual([
      { description: null, scaleDirection: "higher", unit: "seconds" },
      { description: "older words", scaleDirection: "lower", unit: "kg" },
    ]);
  });
});
