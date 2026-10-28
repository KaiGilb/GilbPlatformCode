// The list hook under every Value child, with a toy kind of child (a "thing" with a name): what it reads, what it leaves unwritten
// and what an item without a record key is.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { levelKey, resolveLevelKey, setLevelKey } from "@kaigilb/gilbplatformcode-value-card-model";
import { useChildList, type ChildKind } from "./index";
import { planFindRows } from "./planFind";
import { makeBrowser } from "../test/fakeHost";
import { createServer, type Srv } from "../test/server";
import { planVaultOf } from "../test/testkit";
import { P, settle, valueRow, VALUE_URI } from "../test/value";

type Thing = { name: string };
const server = createServer({ ifMatch: true, patchTagCheck: true });
beforeEach(() => server.reset());
afterEach(cleanup);

const kindOf = (prefix: string): ChildKind<Thing> => ({
  noun: "thing",
  typeName: () => "Thing",
  isType: (t) => t === "t:Thing",
  tag: (i) => `${prefix}.${i.name}`,
  createFacts: (i, tag, parentUri, order) => ({ unitTag: tag, partOf: { "@id": parentUri }, elementOrder: order, name: i.name }),
  patch: (row, i) => (row.facts.name === i.name ? {} : { name: i.name }),
});
const read = (rows: readonly BaseRecord[]): Thing[] => rows.filter((r) => r.typeUri === "t:Thing").map((r) => setLevelKey({ name: r.facts.name ?? "" }, r.id));

function mount(over: { enabled?: boolean; prefix?: string; isBlank?: (t: Thing) => boolean } = {}) {
  const value = valueRow();
  const b = makeBrowser(server);
  const PV = planVaultOf(value, P);
  server.set({ id: "t1", typeUri: "t:Thing", served: { unitTag: "Speed.A", name: "A", partOf: { "@id": VALUE_URI }, elementOrder: 1 }, n: 0 } satisfies Srv);
  const row = { ...server.asRow(server.get("t1")!), updatedAt: 1 } as unknown as BaseRecord;
  b.qc.setQueryData(["plan-find", PV, "a:partOf", "val1"], { rows: [row], total: 1, capped: false, unread: 0 });
  const notices: (string | null)[] = [];
  const readSpy = vi.fn(read);
  const hook = renderHook(
    ({ prefix }: { prefix: string }) => {
      const [find] = b.host.usePlanFinds(PV, "a:partOf", [{ id: value.id, entityUri: value.entityUri, enabled: true }]);
      return useChildList<Thing>({
        enabled: over.enabled ?? true,
        record: value,
        vaultId: P,
        planVault: PV,
        rows: planFindRows(find?.data),
        read: readSpy,
        kind: kindOf(prefix),
        isBlank: over.isBlank,
        onNotice: (n) => notices.push(n),
      });
    },
    { wrapper: b.Frame, initialProps: { prefix: over.prefix ?? "Speed" } },
  );
  return { b, hook, notices, readSpy, value };
}

describe("reading", () => {
  it("reads the Value's find rows with the Value's address, and shows what the reader gives", () => {
    const t = mount();
    expect(t.hook.result.current.items.map((i) => i.name)).toEqual(["A"]);
    expect(t.readSpy).toHaveBeenCalledWith(expect.any(Array), VALUE_URI);
  });
  it("shows nothing, and does not read, while it is not enabled", () => {
    const t = mount({ enabled: false });
    expect(t.hook.result.current.items).toEqual([]);
    expect(t.readSpy).not.toHaveBeenCalled();
  });
});

describe("writing", () => {
  it("an item with nothing in it (by the kind's own word for blank) is not written until it has something", async () => {
    const t = mount({ isBlank: (i) => !i.name.trim() });
    await act(async () => t.hook.result.current.commit([...t.hook.result.current.items, { name: " " }]));
    await settle();
    expect(server.creates).toEqual([]);
    const typed = t.hook.result.current.items.find((i) => i.name === " ");
    expect(typed).toBeUndefined();
  });

  it("an item whose record key was lost by a copy is a new item: its record is made, the old record stays", async () => {
    const t = mount();
    const first = t.hook.result.current.items[0]!;
    await act(async () => t.hook.result.current.commit([first, { ...first }]));
    await settle();
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]!.facts).toMatchObject({ unitTag: "Speed.A.2", name: "A", elementOrder: 2 });
    expect(server.deletes).toEqual([]);
  });

  it("the kind is built on each render: the next write uses the tag of the latest render", async () => {
    const t = mount();
    t.hook.rerender({ prefix: "Cost" });
    await act(async () => t.hook.result.current.commit([...t.hook.result.current.items, { name: "B" }]));
    await settle();
    expect(server.creates[0]!.facts.unitTag).toBe("Cost.B");
  });

  it("an item made here keeps its new:n key, and the key alias now names its record", async () => {
    const t = mount();
    const added = { name: "B" };
    await act(async () => t.hook.result.current.commit([...t.hook.result.current.items, added]));
    await settle();
    expect(levelKey(added)).toBe("new:1");
    expect(resolveLevelKey("new:1")).toBe("made1");
  });
});
