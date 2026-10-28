// The levels of a Value as records: what one edit of the list writes, in what order, what the list shows while the writes run, and
// what a Development Resource writes differently.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { carryRaw, levelKey, resolveLevelKey, type ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";
import { MoveStopped, useValueLevels } from "./index";
import { planFindRows } from "./planFind";
import { makeBrowser } from "../test/fakeHost";
import { createServer, type Srv } from "../test/server";
import { planVaultOf, seedValueParts, type LevelEntry } from "../test/testkit";
import { level, P, settle, valueRow, VALUE_URI } from "../test/value";

const server = createServer({ ifMatch: true, patchTagCheck: true });
beforeEach(() => server.reset());
afterEach(cleanup);

function mount(entries: LevelEntry[], opts: { value?: BaseRecord; variableOrder?: string[] } = {}) {
  const value = opts.value ?? valueRow();
  const b = makeBrowser(server);
  const PV = planVaultOf(value, P);
  const rows = seedValueParts(b.qc, P, value, { levels: entries });
  for (const r of rows) {
    r.etag = '"v0"';
    server.set({ id: r.id, typeUri: r.typeUri, served: { ...(r.served!.facts as Record<string, unknown>) }, n: 0 } satisfies Srv);
  }
  const notices: (string | null)[] = [];
  const onTouched = vi.fn();
  const hook = renderHook(
    () => {
      // The rows are the live find of the Value, as the card gets them.
      const [find] = b.host.usePlanFinds(PV, "a:partOf", [{ id: value.id, entityUri: value.entityUri, enabled: true }]);
      return useValueLevels({ enabled: true, record: value, vaultId: P, planVault: PV, rows: planFindRows(find?.data), variableOrder: opts.variableOrder ?? [], onNotice: (n) => notices.push(n), onTouched });
    },
    { wrapper: b.Frame },
  );
  return { b, hook, notices, onTouched, rows, PV };
}
const edit = (items: ValueLevel[], i: number, f: (l: ValueLevel) => ValueLevel) => items.map((l, n) => (n === i ? f(l) : l));
const names = (b: ReturnType<typeof makeBrowser>) => b.calls.map((c) => c.split(" ")[0]);

describe("reading", () => {
  it("shows the level records of the Value, and none while the hook is not enabled", () => {
    const b = makeBrowser(server);
    const value = valueRow();
    const rows = seedValueParts(b.qc, P, value, { levels: [{ levelKind: "Goal", levelValue: 5 }, { levelKind: "Past", levelValue: 14 }] });
    const on = renderHook(() => useValueLevels({ enabled: true, record: value, vaultId: P, planVault: planVaultOf(value, P), rows, variableOrder: [], onNotice: () => {} }), { wrapper: b.Frame });
    expect(on.result.current.items.map((l) => [l.kind, l.value])).toEqual([["Goal", 5], ["Past", 14]]);
    expect(on.result.current.busy).toBe(false);
    expect(on.result.current.progress).toBeNull();
    const off = renderHook(() => useValueLevels({ enabled: false, record: value, vaultId: P, planVault: planVaultOf(value, P), rows, variableOrder: [], onNotice: () => {} }), { wrapper: b.Frame });
    expect(off.result.current.items).toEqual([]);
  });
});

describe("one edit is the smallest writes", () => {
  it("a new level is one POST: the type of its kind, its tag, its place after the others and a link to the Value; the key now names its record", async () => {
    const t = mount([{ levelKind: "Goal", levelValue: 5, "a:levelWhen": "2027-06-30" }]);
    const added = level("Wish", 7, { when: "2028-01-01" });
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const real = t.b.host.createRecord.getMockImplementation()!;
    t.b.host.createRecord.mockImplementationOnce(async (...args) => {
      await held;
      return real(...args);
    });
    await act(async () => t.hook.result.current.commit([...t.hook.result.current.items, added]));
    expect(t.hook.result.current.busy).toBe(true);
    expect(t.hook.result.current.items.map((l) => l.kind)).toEqual(["Goal", "Wish"]);
    await act(async () => release());
    await settle();
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]!.typeUri).toBe("t:Wish");
    expect(server.creates[0]!.vault).toBe(t.PV);
    expect(server.creates[0]!.facts).toMatchObject({ unitTag: "Speed.Wish.2028-01-01", partOf: { "@id": VALUE_URI }, elementOrder: 2, scaleNumber: "7", levelWhen: "2028-01-01" });
    expect(server.patches).toEqual([]);
    expect(server.deletes).toEqual([]);
    expect(levelKey(added)).toBe("new:1");
    expect(resolveLevelKey("new:1")).toBe("made1");
    expect(t.hook.result.current.busy).toBe(false);
  });

  it("a changed level is one PATCH of its record with only what changed, conditional on the version", async () => {
    const t = mount([{ levelKind: "Goal", levelValue: 5 }, { levelKind: "Past", levelValue: 14 }]);
    await act(async () => t.hook.result.current.commit(edit(t.hook.result.current.items, 1, (l) => carryRaw({ ...l, value: 6 }, l))));
    await settle();
    // The items are in the order of their records, so the second is the Past.
    expect(server.log).toEqual([{ id: "lvl2", body: { scaleNumber: "6" }, ifMatch: '"v0"' }]);
    expect(server.creates).toEqual([]);
  });

  it("a level taken out of the list is one DELETE of its record, and the card is told", async () => {
    const t = mount([{ levelKind: "Goal", levelValue: 5 }, { levelKind: "Past", levelValue: 14 }]);
    await act(async () => t.hook.result.current.commit(t.hook.result.current.items.slice(1)));
    await settle();
    expect(server.deletes).toEqual(["lvl1"]);
    expect(t.onTouched).toHaveBeenCalledTimes(1);
    expect(server.patches).toEqual([]);
  });

  it("the same list again writes nothing", async () => {
    const t = mount([{ levelKind: "Goal", levelValue: 5 }]);
    await act(async () => t.hook.result.current.commit(t.hook.result.current.items));
    await settle();
    expect(server.log).toEqual([]);
    expect(server.creates).toEqual([]);
    expect(t.b.calls).toEqual([]);
  });

  it("a level whose kind changes is a new record of the new kind, made first, and then the old record is ended", async () => {
    const t = mount([{ levelKind: "Goal", levelValue: 5 }]);
    await act(async () => t.hook.result.current.commit(edit(t.hook.result.current.items, 0, (l) => carryRaw({ ...l, kind: "Wish" }, l))));
    await settle();
    expect(server.creates.map((c) => c.typeUri)).toEqual(["t:Wish"]);
    expect(server.deletes).toEqual(["lvl1"]);
    expect(names(t.b).indexOf("createRecord")).toBeLessThan(names(t.b).indexOf("delete"));
    expect(server.patches).toEqual([]);
  });

  it("the list shows the person's edit at once and the writes behind it run one after the other", async () => {
    const t = mount([{ levelKind: "Goal", levelValue: 5 }]);
    const items = t.hook.result.current.items;
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    t.b.host.patchRecord.mockImplementationOnce(async (...args) => {
      await held;
      return server.patch(args[0], args[1], args[4]);
    });
    await act(async () => {
      t.hook.result.current.commit(edit(items, 0, (l) => carryRaw({ ...l, value: 6 }, l)));
    });
    expect(t.hook.result.current.items[0]!.value).toBe(6);
    expect(t.hook.result.current.busy).toBe(true);
    expect(server.get("lvl1")!.served.scaleNumber).toBe("5");
    await act(async () => release());
    await settle();
    expect(t.hook.result.current.busy).toBe(false);
    expect(t.hook.result.current.items[0]!.value).toBe(6);
    expect(server.get("lvl1")!.served.scaleNumber).toBe("6");
  });

  it("an edit queued behind another is written after it: the second job starts when the first has ended", async () => {
    const t = mount([{ levelKind: "Goal", levelValue: 5 }]);
    const order: string[] = [];
    t.b.host.patchRecord.mockImplementationOnce(async (...args) => {
      order.push("first start");
      await new Promise((r) => setTimeout(r, 30));
      order.push("first end");
      return server.patch(args[0], args[1], args[4]);
    });
    const items = t.hook.result.current.items;
    await act(async () => {
      t.hook.result.current.commit(edit(items, 0, (l) => carryRaw({ ...l, value: 6 }, l)));
    });
    await act(async () => {
      t.hook.result.current.commit(edit(t.hook.result.current.items, 0, (l) => carryRaw({ ...l, value: 7 }, l)));
    });
    t.b.host.patchRecord.mockImplementationOnce(async (...args) => {
      order.push("second");
      return server.patch(args[0], args[1], args[4]);
    });
    await settle();
    await settle();
    expect(order).toEqual(["first start", "first end", "second"]);
    expect(server.get("lvl1")!.served.scaleNumber).toBe("7");
  });
});

describe("the edit shown", () => {
  it("stays until the last queued write has ended, not only the first", async () => {
    const t = mount([{ levelKind: "Goal", levelValue: 5 }]);
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = new Promise<void>((r) => (releaseFirst = r));
    const second = new Promise<void>((r) => (releaseSecond = r));
    t.b.host.patchRecord.mockImplementationOnce(async (...args) => {
      await first;
      return server.patch(args[0], args[1], args[4]);
    });
    t.b.host.patchRecord.mockImplementationOnce(async (...args) => {
      await second;
      return server.patch(args[0], args[1], args[4]);
    });
    await act(async () => {
      t.hook.result.current.commit(edit(t.hook.result.current.items, 0, (l) => carryRaw({ ...l, value: 6 }, l)));
    });
    await act(async () => {
      t.hook.result.current.commit(edit(t.hook.result.current.items, 0, (l) => carryRaw({ ...l, value: 7 }, l)));
    });
    await act(async () => releaseFirst());
    await settle();
    expect(server.get("lvl1")!.served.scaleNumber).toBe("6");
    // The second write has not landed: the list still shows what the person typed last.
    expect(t.hook.result.current.busy).toBe(true);
    expect(t.hook.result.current.items[0]!.value).toBe(7);
    await act(async () => releaseSecond());
    await settle();
    expect(t.hook.result.current.busy).toBe(false);
    expect(t.hook.result.current.items[0]!.value).toBe(7);
  });
});

describe("commitAndWait", () => {
  it("answers true when the writes landed and false when one failed and was rolled back", async () => {
    const t = mount([{ levelKind: "Goal", levelValue: 5 }]);
    let ok: boolean | undefined;
    await act(async () => {
      ok = await t.hook.result.current.commitAndWait!(edit(t.hook.result.current.items, 0, (l) => carryRaw({ ...l, value: 6 }, l)));
    });
    expect(ok).toBe(true);
    server.failPatch.add(2);
    let bad: boolean | undefined;
    await act(async () => {
      bad = await t.hook.result.current.commitAndWait!(edit(t.hook.result.current.items, 0, (l) => carryRaw({ ...l, value: 8 }, l)));
    });
    expect(bad).toBe(false);
    expect(t.notices.filter(Boolean)).toEqual(["boom"]);
    expect(server.get("lvl1")!.served.scaleNumber).toBe("6");
    await settle();
    expect(t.hook.result.current.items[0]!.value).toBe(6);
  });
});

describe("a failed write", () => {
  it("is told in the sentence of the failure, or in a plain one when the failure has none, and reads the Value's find again", async () => {
    const t = mount([{ levelKind: "Goal", levelValue: 5 }]);
    t.b.host.patchRecord.mockRejectedValueOnce("not an error");
    await act(async () => t.hook.result.current.commit(edit(t.hook.result.current.items, 0, (l) => carryRaw({ ...l, value: 6 }, l))));
    await settle();
    expect(t.notices.filter(Boolean)).toEqual(["Couldn't save the level. Your change was rolled back. Try again."]);
    expect(t.b.host.invalidatePlanFind).toHaveBeenCalledWith(t.PV, "a:partOf", "val1", { members: [expect.stringContaining("/lvl1")] });
  });

  it("a Value with no address cannot take a level, and says so", async () => {
    const value = { ...valueRow(), entityUri: undefined } as BaseRecord;
    const t = mount([], { value });
    await act(async () => t.hook.result.current.commit([level("Goal", 5)]));
    await settle();
    expect(t.notices.filter(Boolean)).toEqual(["This Value has no address yet, so a level cannot be added."]);
    expect(server.creates).toEqual([]);
  });
});

describe("moveIn", () => {
  it("makes a record for each old level under a new key, one after the other, and gives back what undoes it", async () => {
    const t = mount([]);
    const old = [level("Past", 14), level("Goal", 5)];
    let moved!: { undo: () => Promise<string[]> };
    await act(async () => {
      moved = await t.hook.result.current.moveIn(old);
    });
    expect(server.creates.map((c) => c.typeUri)).toEqual(["t:Past", "t:Goal"]);
    expect(old.map((l) => levelKey(l))).toEqual(["new:1", "new:2"]);
    expect(server.creates.map((c) => c.facts.elementOrder)).toEqual([1, 2]);
    let left: string[] = [];
    await act(async () => {
      left = await moved.undo();
    });
    expect(left).toEqual([]);
    // The undo ends what was made, the last one first.
    expect(server.deletes).toEqual(["made2", "made1"]);
  });

  it("a record that cannot be made stops the move with the undo of what was made; the undo names what it could not end", async () => {
    const t = mount([]);
    server.failCreate.add(2);
    const err = await act(async () => t.hook.result.current.moveIn([level("Past", 14), level("Goal", 5)]).catch((e) => e));
    expect(err).toBeInstanceOf(MoveStopped);
    expect((err as MoveStopped).message).toBe("create refused");
    server.failDelete.add("made1");
    let left: string[] = [];
    await act(async () => {
      left = await (err as MoveStopped).undo();
    });
    expect(left).toEqual(["Speed.Past"]);
    server.failDelete.clear();
    await act(async () => {
      left = await (err as MoveStopped).undo();
    });
    expect(left).toEqual([]);
    expect(server.deletes).toEqual(["made1"]);
  });
});

describe("a group of levels edited together", () => {
  const three: LevelEntry[] = [
    { levelKind: "Past", levelValue: 14, levelVariables: { Country: "Norway" } },
    { levelKind: "Status", levelValue: 9, "a:levelWhen": "2026-10-27", levelVariables: { Country: "Norway" } },
    { levelKind: "Goal", levelValue: 5, "a:levelWhen": "2027-06-30", levelVariables: { Country: "Norway" } },
  ];
  const toSweden = (items: ValueLevel[]) => items.map((l) => carryRaw({ ...l, qualifier: { ...l.qualifier, variables: { Country: "Sweden" } } }, l));

  it("is written in order, one patch for each record, and reports how far it is", async () => {
    const t = mount(three);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    t.b.host.patchRecord.mockImplementationOnce(async (...args) => server.patch(args[0], args[1], args[4]));
    t.b.host.patchRecord.mockImplementationOnce(async (...args) => {
      await held;
      return server.patch(args[0], args[1], args[4]);
    });
    await act(async () => t.hook.result.current.commit(toSweden(t.hook.result.current.items)));
    expect(t.hook.result.current.progress).toEqual({ done: 1, total: 3 });
    await act(async () => release());
    await settle();
    expect(server.log.map((w) => w.id)).toEqual(["lvl1", "lvl2", "lvl3"]);
    expect(t.hook.result.current.progress).toBeNull();
  });

  it("when the third fails the first two are put back, and the notice says none moved", async () => {
    const t = mount(three);
    server.failPatch.add(3);
    await act(async () => t.hook.result.current.commit(toSweden(t.hook.result.current.items)));
    await settle();
    expect(server.log.map((w) => w.id)).toEqual(["lvl1", "lvl2", "lvl3", "lvl2", "lvl1"]);
    expect(t.notices.filter(Boolean).join(" ")).toBe("boom None of the 3 levels moved; they are back as they were.");
  });

  it("when a level cannot be put back the notice names it and the ones that did not move", async () => {
    const t = mount(three);
    server.failPatch.add(3);
    server.failPatch.add(4);
    await act(async () => t.hook.result.current.commit(toSweden(t.hook.result.current.items)));
    await settle();
    expect(t.notices.filter(Boolean).join(" ")).toBe(
      "boom Only some levels moved. Moved and could not be put back: Speed.Status.Norway. Not moved: Speed.Past.Norway, Speed.Goal.Norway.",
    );
  });
});

describe("a Development Resource", () => {
  const resource = () => valueRow({}, "t:Resource", "Cost");

  it("writes a new Goal row as a t:Budget record", async () => {
    const t = mount([], { value: resource() });
    await act(async () => t.hook.result.current.commit([level("Goal", 100, { when: "2027-06-30" })]));
    await settle();
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]!.typeUri).toBe("t:Budget");
    expect(server.creates[0]!.facts).toMatchObject({ unitTag: "Cost.Goal.2027-06-30", partOf: { "@id": VALUE_URI }, scaleNumber: "100" });
    expect(t.b.host.typeUriForVaultNamespace).toHaveBeenCalledWith("Budget", t.PV);
  });

  it("a level of kind Budget is a t:Budget record on a Resource, with no label of its own; on a Value it is a custom word with one", async () => {
    const t = mount([], { value: resource() });
    await act(async () => t.hook.result.current.commit([level("Budget", 100)]));
    await settle();
    expect(server.creates[0]!.typeUri).toBe("t:Budget");
    expect("label" in server.creates[0]!.facts).toBe(false);
    server.reset();
    const v = mount([]);
    await act(async () => v.hook.result.current.commit([level("Budget", 100)]));
    await settle();
    expect(server.creates[0]!.facts.label).toBe("Budget");
    expect(server.creates[0]!.typeUri).not.toBe("t:Budget");
  });

  it("a Value writes the same row as a t:Goal record", async () => {
    const t = mount([]);
    await act(async () => t.hook.result.current.commit([level("Goal", 100, { when: "2027-06-30" })]));
    await settle();
    expect(server.creates[0]!.typeUri).toBe("t:Goal");
    expect(t.b.host.typeUriForVaultNamespace).toHaveBeenCalledWith("Goal", t.PV);
  });

  it("a Budget level is read as a Budget on a Resource", () => {
    const value = resource();
    const b = makeBrowser(server);
    const rows = seedValueParts(b.qc, P, value, { levels: [{ levelKind: "Budget", levelValue: 100 }] });
    const hook = renderHook(() => useValueLevels({ enabled: true, record: value, vaultId: P, planVault: planVaultOf(value, P), rows, variableOrder: [], onNotice: () => {} }), { wrapper: b.Frame });
    expect(hook.result.current.items.map((l) => l.kind)).toEqual(["Budget"]);
  });
});

describe("a different Value", () => {
  it("drops the edit shown for the last one and the keys of its records", async () => {
    const b = makeBrowser(server);
    const a = valueRow();
    const other = { ...valueRow({}, "t:Value", "Cost"), id: "val2", entityUri: "https://h.example.test/base/e/val2" } as BaseRecord;
    const rows = seedValueParts(b.qc, P, a, { levels: [{ levelKind: "Goal", levelValue: 5 }] });
    for (const r of rows) server.set({ id: r.id, typeUri: r.typeUri, served: { ...(r.served!.facts as Record<string, unknown>) }, n: 0 } satisfies Srv);
    const hook = renderHook(
      ({ record, list }: { record: BaseRecord; list: readonly BaseRecord[] }) =>
        useValueLevels({ enabled: true, record, vaultId: P, planVault: planVaultOf(a, P), rows: list, variableOrder: [], onNotice: () => {} }),
      { wrapper: b.Frame, initialProps: { record: a, list: rows as readonly BaseRecord[] } },
    );
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const real = b.host.createRecord.getMockImplementation()!;
    b.host.createRecord.mockImplementationOnce(async (...args) => {
      await held;
      return real(...args);
    });
    await act(async () => hook.result.current.commit([...hook.result.current.items, level("Wish", 7)]));
    expect(hook.result.current.items.map((l) => l.kind)).toEqual(["Goal", "Wish"]);
    hook.rerender({ record: other, list: [] });
    expect(hook.result.current.items).toEqual([]);
    // The edit shown is gone; the write already queued for the last Value still runs to its end.
    expect(hook.result.current.busy).toBe(false);
    expect(server.creates).toEqual([]);
    await act(async () => release());
    await settle();
    expect(server.creates.map((c) => c.typeUri)).toEqual(["t:Wish"]);
  });
});
