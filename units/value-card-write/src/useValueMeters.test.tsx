// A Value's Meters and Meter lines as records: one edit of the list is the smallest writes; ending a Meter ends its lines first;
// the lines of each Meter are found by their own find, and the list keeps its identity while no find changed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { carryRaw, levelKey, type ValueMeter } from "@kaigilb/gilbplatformcode-value-card-model";
import { MoveStopped, useValueMeters } from "./index";
import { planFindRows } from "./planFind";
import { makeBrowser, planFindKey } from "../test/fakeHost";
import { createServer, entityUriOf, type Srv } from "../test/server";
import { planVaultOf, seedValueParts, type PartEntry } from "../test/testkit";
import { P, settle, valueRow, VALUE_URI } from "../test/value";

const server = createServer({ ifMatch: true, patchTagCheck: true });
beforeEach(() => server.reset());
afterEach(cleanup);

const DURING: PartEntry = { "a:meterQualifier": "During", lines: [{ "a:meterAgentKind": "human", "a:meterMethod": "stopwatch" }, { "a:meterAgentKind": "ai", "a:meterMethod": "log" }] };

function mount(meters: PartEntry[], opts: { value?: BaseRecord } = {}) {
  const value = opts.value ?? valueRow();
  const b = makeBrowser(server);
  const PV = planVaultOf(value, P);
  const rows = seedValueParts(b.qc, P, value, { meters });
  for (const r of rows) {
    r.etag = '"v0"';
    server.set({ id: r.id, typeUri: r.typeUri, served: { ...(r.served!.facts as Record<string, unknown>) }, n: 0 } satisfies Srv);
  }
  const notices: (string | null)[] = [];
  const onTouched = vi.fn();
  const hook = renderHook(
    () => {
      const [find] = b.host.usePlanFinds(PV, "a:partOf", [{ id: value.id, entityUri: value.entityUri, enabled: true }]);
      return useValueMeters({ enabled: true, record: value, vaultId: P, planVault: PV, rows: planFindRows(find?.data), onNotice: (n) => notices.push(n), onTouched });
    },
    { wrapper: b.Frame },
  );
  return { b, hook, notices, onTouched, PV, value };
}
const meter = (qualifier: string, lines: ValueMeter["lines"] = []): ValueMeter => ({ qualifier, lines });
const line = (kind: "human" | "ai" | "instrument", method: string) => ({ kind, method, source: {} });

describe("reading", () => {
  it("shows each Meter with the lines found by its own find, and the line records beside the list", () => {
    const t = mount([DURING]);
    const items = t.hook.result.current.items;
    expect(items).toHaveLength(1);
    expect(items[0]!.qualifier).toBe("During");
    expect(items[0]!.lines.map((l) => [l.kind, l.method])).toEqual([["human", "stopwatch"], ["ai", "log"]]);
    expect(t.hook.result.current.lineRows.map((r) => r.id)).toEqual(["mline1_1", "mline1_2"]);
    expect(t.b.host.usePlanFinds).toHaveBeenCalledWith(t.PV, "a:partOf", [{ id: "meter1", entityUri: entityUriOf("meter1"), enabled: true }]);
  });

  it("is empty while the hook is not enabled", () => {
    const value = valueRow();
    const b = makeBrowser(server);
    const rows = seedValueParts(b.qc, P, value, { meters: [DURING] });
    const hook = renderHook(() => useValueMeters({ enabled: false, record: value, vaultId: P, planVault: planVaultOf(value, P), rows, onNotice: () => {} }), { wrapper: b.Frame });
    expect(hook.result.current.items).toEqual([]);
    expect(hook.result.current.lineRows).toEqual([]);
  });

  it("keeps the same list while no find changed, and a host that builds new find data on every render makes it a new list each time", () => {
    const t = mount([DURING]);
    const first = t.hook.result.current;
    t.hook.rerender();
    expect(t.hook.result.current.items).toBe(first.items);
    expect(t.hook.result.current.lineRows).toBe(first.lineRows);

    const bad = mount([DURING]);
    const real = bad.b.host.usePlanFinds.getMockImplementation()!;
    bad.b.host.usePlanFinds.mockImplementation((...args) => real(...args).map((q) => ({ data: q.data ? { ...q.data, rows: [...q.data.rows] } : q.data })));
    bad.hook.rerender();
    const before = bad.hook.result.current;
    bad.hook.rerender();
    expect(bad.hook.result.current.items).not.toBe(before.items);
    expect(bad.hook.result.current.lineRows).not.toBe(before.lineRows);
  });
});

describe("one edit is the smallest writes", () => {
  it("a new Meter with a line: the Meter is made first, then its line, a part of the Meter", async () => {
    const t = mount([]);
    const added = meter("Release", [line("ai", "auto")]);
    await act(async () => t.hook.result.current.commit([added]));
    await settle();
    expect(server.creates.map((c) => c.typeUri)).toEqual(["t:Meter", "t:MeterLine"]);
    expect(server.creates[0]!.facts).toMatchObject({ unitTag: "Speed.Meter.Release", partOf: { "@id": VALUE_URI }, elementOrder: 1, meterQualifier: "Release" });
    expect(server.creates[1]!.facts).toMatchObject({ unitTag: "Speed.Meter.Release.AI", partOf: { "@id": entityUriOf("made1") }, elementOrder: 1, meterAgentKind: "ai", meterMethod: "auto" });
    expect(levelKey(added)).toBe("new:1");
    expect(levelKey(added.lines[0]!)).toBe("new:2");
    expect(server.patches).toEqual([]);
  });

  it("a changed method is one PATCH of that line, and the Meter is not written", async () => {
    const t = mount([DURING]);
    const m = t.hook.result.current.items[0]!;
    await act(async () => t.hook.result.current.commit([edited(m, { lines: [edited(m.lines[0]!, { method: "clock" }), m.lines[1]!] })]));
    await settle();
    expect(server.log).toEqual([{ id: "mline1_1", body: { meterMethod: "clock" }, ifMatch: '"v0"' }]);
  });

  it("a Meter given another name is patched with its new tag, and its lines follow it", async () => {
    const t = mount([DURING]);
    const m = t.hook.result.current.items[0]!;
    await act(async () => t.hook.result.current.commit([edited(m, { qualifier: "Dev", lines: m.lines.map((l) => edited(l, {})) })]));
    await settle();
    expect(server.log.map((w) => [w.id, w.body])).toEqual([
      ["meter1", { meterQualifier: "Dev", unitTag: "Speed.Meter.Dev" }],
      ["mline1_1", { unitTag: "Speed.Meter.Dev.Human" }],
      ["mline1_2", { unitTag: "Speed.Meter.Dev.AI" }],
    ]);
  });

  it("a line taken out is one DELETE of its record", async () => {
    const t = mount([DURING]);
    const m = t.hook.result.current.items[0]!;
    await act(async () => t.hook.result.current.commit([edited(m, { lines: [m.lines[0]!] })]));
    await settle();
    expect(server.deletes).toEqual(["mline1_2"]);
    expect(server.log).toEqual([]);
  });

  it("a Meter taken out of the list ends its lines first, then itself, and the card is told for each", async () => {
    const t = mount([DURING]);
    await act(async () => t.hook.result.current.commit([]));
    await settle();
    expect(server.deletes).toEqual(["mline1_1", "mline1_2", "meter1"]);
    expect(t.onTouched).toHaveBeenCalledTimes(3);
  });

  it("a Meter emptied of its name and its lines is ended like a removed one", async () => {
    const t = mount([DURING]);
    const m = t.hook.result.current.items[0]!;
    await act(async () => t.hook.result.current.commit([edited(m, { qualifier: "", lines: m.lines.map((l) => edited(l, { method: "" })) })]));
    await settle();
    expect(server.deletes).toEqual(["mline1_1", "mline1_2", "meter1"]);
  });

  it("a Meter with records of it that could not be read is not removed, and nothing is deleted", async () => {
    const t = mount([DURING]);
    const key = planFindKey(t.PV, "a:partOf", "meter1");
    const find = t.b.qc.getQueryData<{ rows: BaseRecord[] }>(key)!;
    t.b.qc.setQueryData(key, { ...find, unread: 2 });
    await act(async () => t.hook.result.current.commit([]));
    await settle();
    expect(server.deletes).toEqual([]);
    expect(t.notices.filter(Boolean)).toEqual(["The meter was not removed. 2 of its records could not be read, so they could not be ended first. Nothing was deleted."]);
  });

  it("stops at the first record that cannot be ended and names what remains", async () => {
    const t = mount([DURING]);
    server.failDelete.add("mline1_2");
    await act(async () => t.hook.result.current.commit([]));
    await settle();
    expect(server.deletes).toEqual(["mline1_1"]);
    expect(t.notices.filter(Boolean)).toEqual(["The meter was not removed (delete refused). These records of it remain: Speed.Meter.During.AI."]);
    expect(t.b.host.invalidatePlanFind).toHaveBeenCalledWith(t.PV, "a:partOf", "val1");
  });

  it("a Value with no address cannot take a Meter, and says so", async () => {
    const t = mount([], { value: { ...valueRow(), entityUri: undefined } as BaseRecord });
    await act(async () => t.hook.result.current.commit([meter("Release", [line("ai", "auto")])]));
    await settle();
    expect(t.notices.filter(Boolean)).toEqual(["This Value has no address yet, so a meter cannot be added."]);
    expect(server.creates).toEqual([]);
  });

  it("a Meter with nothing in it is not written", async () => {
    const t = mount([]);
    await act(async () => t.hook.result.current.commit([meter("", [line("human", "")])]));
    await settle();
    expect(server.creates).toEqual([]);
  });
});

describe("moveIn", () => {
  it("makes each Meter and its lines (blank ones are skipped) and gives back an undo that ends them, last first", async () => {
    const t = mount([]);
    const old = [meter("Release", [line("ai", "auto"), line("human", "")]), meter("", [line("human", "")])];
    let moved!: { undo: () => Promise<string[]> };
    await act(async () => {
      moved = await t.hook.result.current.moveIn(old);
    });
    expect(server.creates.map((c) => c.typeUri)).toEqual(["t:Meter", "t:MeterLine"]);
    let left: string[] = [];
    await act(async () => {
      left = await moved.undo();
    });
    expect(left).toEqual([]);
    expect(server.deletes).toEqual(["made2", "made1"]);
  });

  it("stops with the undo of what was made when a record cannot be made", async () => {
    const t = mount([]);
    server.failCreate.add(2);
    const err = await act(async () => t.hook.result.current.moveIn([meter("Release", [line("ai", "auto")])]).catch((e) => e));
    expect(err).toBeInstanceOf(MoveStopped);
    let left: string[] = [];
    await act(async () => {
      left = await (err as MoveStopped).undo();
    });
    expect(left).toEqual([]);
    expect(server.deletes).toEqual(["made1"]);
  });

  it("an undo that cannot end a record names it", async () => {
    const t = mount([]);
    let moved!: { undo: () => Promise<string[]> };
    await act(async () => {
      moved = await t.hook.result.current.moveIn([meter("Release", [line("ai", "auto")])]);
    });
    server.failDelete.add("made1");
    let left: string[] = [];
    await act(async () => {
      left = await moved.undo();
    });
    expect(left).toEqual(["Speed.Meter.Release"]);
  });
});

/** An edit of a Meter or of a line the way the card makes it: a copy that keeps the record key. */
const edited = <T extends object>(from: T, over: Partial<T>): T => carryRaw({ ...from, ...over }, from);
