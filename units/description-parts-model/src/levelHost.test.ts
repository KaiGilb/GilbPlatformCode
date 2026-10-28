// readLevel, planPartialWrite and removalPlan against a fake LevelHost. The fake answers what the app's tests had a fake
// server answer; the first cases of each block are those tests rewritten (same inputs and expected results). The host
// calls are asserted in order where the order is the contract: every record is marked stale, and the marks settle, before
// the first fresh read.
import { describe, expect, it } from "vitest";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import {
  ORDER_CAP,
  ORDER_TOO_MANY,
  ORDER_UNREAD,
  REMOVAL_MAX_PARTS,
  REMOVAL_TOO_DEEP,
  REMOVAL_TOO_MANY,
  SUBPART_UNREAD,
  planPartialWrite,
  readLevel,
  removalPlan,
  type StoredPart,
} from "./planLevelRead";
import { FakeHost, OTHER, VAULT, ent, recordOf, type Node } from "../test/fakeHost";

const part = (id: string, parent: string, extra: Partial<Node> = {}): Node => ({ id, parent, ...extra });
const root = (id = "step"): BaseRecord => recordOf({ id, parent: "walk", tag: "Walk.Step" });

describe("readLevel", () => {
  const level = () => new FakeHost([part("a", "parent", { tag: "Walk.A" }), part("b", "parent", { tag: "Walk.B" })]);

  it("prepends a pin and omits a drop the server still returns (ported)", async () => {
    const host = level();
    host.pins = [recordOf({ id: "c", parent: "parent", tag: "Walk.C" })];
    host.drops = new Set(["b"]);
    const read = await readLevel(host, VAULT, ent("parent"), { cap: 1000, fresh: false });
    expect(read.ids).toEqual([ent("c"), ent("a")]);
    expect(read.capped).toBe(false);
    expect(read.records.map((r) => r.id)).toEqual(["c", "a"]);
    expect(read.total).toBe(2);
    expect(read.unread).toEqual([]);
  });

  it("hands the host the plan vault, the part-of attribute, the parent id, the rows read and the ids the page returned", async () => {
    const host = level();
    await readLevel(host, VAULT, ent("parent"), { cap: 1000, fresh: false });
    expect(host.applied).toEqual([{ planVault: VAULT, attr: "a:partOf", parentId: "parent", rowIds: ["a", "b"], serverIds: ["a", "b"] }]);
    expect(host.log[0]).toBe(`page parent cap=1000 vault=${VAULT}`);
  });

  it("calls the host in this order for a fresh read: the page, every mark-stale, every read, the pins and drops", async () => {
    const host = level();
    await readLevel(host, VAULT, ent("parent"), { cap: 50, fresh: true });
    expect(host.log).toEqual([`page parent cap=50 vault=${VAULT}`, "stale a", "stale b", "read a fresh", "read b fresh", "apply"]);
  });

  it("does not mark anything stale for a cached read, and reads with fresh=false", async () => {
    const host = level();
    await readLevel(host, VAULT, ent("parent"), { cap: 50, fresh: false });
    expect(host.log).toEqual([`page parent cap=50 vault=${VAULT}`, "read a cached", "read b cached", "apply"]);
  });

  it("waits for every mark-stale to settle before the first fresh read", async () => {
    const host = level();
    host.staleMs = 10;
    await readLevel(host, VAULT, ent("parent"), { cap: 50, fresh: true });
    expect(host.readBeforeStale).toBe(false);
    expect(host.staleDone).toBe(2);
  });

  it("returns a cap refusal with no marks, no reads and no pins or drops", async () => {
    const host = new FakeHost(Array.from({ length: 5 }, (_, i) => part(`p${i}`, "parent")));
    const read = await readLevel(host, VAULT, ent("parent"), { cap: 3, fresh: true });
    expect(read).toEqual({ records: [], ids: [ent("p0"), ent("p1"), ent("p2")], total: 3, capped: true, unread: [] });
    expect(host.log).toEqual([`page parent cap=3 vault=${VAULT}`]);
  });

  it("is not capped for a full level of exactly the cap", async () => {
    const host = new FakeHost(Array.from({ length: 3 }, (_, i) => part(`p${i}`, "parent")));
    const read = await readLevel(host, VAULT, ent("parent"), { cap: 3, fresh: false });
    expect(read.capped).toBe(false);
    expect(read.total).toBe(3);
  });

  it("keeps the order of the page though the reads finish in another order", async () => {
    const host = level();
    host.readExtraMs.set("a", 20);
    const read = await readLevel(host, VAULT, ent("parent"), { cap: 50, fresh: false });
    expect(read.records.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("lists a record that could not be read as unread, keeps its address in 'ids', and leaves it out of 'records'", async () => {
    const host = level();
    host.rows.delete("b");
    const read = await readLevel(host, VAULT, ent("parent"), { cap: 50, fresh: false });
    expect(read.ids).toEqual([ent("a"), ent("b")]);
    expect(read.records.map((r) => r.id)).toEqual(["a"]);
    expect(read.unread).toEqual([ent("b")]);
    expect(read.total).toBe(2);
  });

  it("gives the host an empty placeholder row for a record that could not be read", async () => {
    const seen: BaseRecord[][] = [];
    const host = level();
    host.rows.delete("b");
    const apply = host.applyPinsAndDrops.bind(host);
    host.applyPinsAndDrops = (planVault, attr, parentId, rows, serverIds) => {
      seen.push(rows);
      return apply(planVault, attr, parentId, rows, serverIds);
    };
    await readLevel(host, VAULT, ent("parent"), { cap: 50, fresh: false });
    expect(seen[0]![1]).toEqual({ id: "b", entityUri: ent("b"), typeUri: "", facts: {}, opaqueFacts: [], etag: null });
  });

  it("a pinned row that stands in for an unread record is read as that record", async () => {
    const host = level();
    host.rows.delete("b");
    const pinned = recordOf({ id: "b", parent: "parent", tag: "Walk.PinnedB" });
    host.applyPinsAndDrops = (_v, _a, _p, rows) => [rows[0]!, pinned];
    const read = await readLevel(host, VAULT, ent("parent"), { cap: 50, fresh: false });
    expect(read.unread).toEqual([ent("b")]);
    expect(read.records.map((r) => r.id)).toEqual(["a"]);
  });

  it("skips a merged row that has no address", async () => {
    const host = level();
    const noAddress: BaseRecord = { id: "x", typeUri: "t:SpecificationElement", facts: {}, opaqueFacts: [], etag: null };
    host.pins = [noAddress];
    const read = await readLevel(host, VAULT, ent("parent"), { cap: 50, fresh: false });
    expect(read.ids).toEqual([ent("a"), ent("b")]);
    expect(read.records.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("is an empty level for a parent with no children", async () => {
    const host = new FakeHost();
    const read = await readLevel(host, VAULT, ent("parent"), { cap: 50, fresh: true });
    expect(read).toEqual({ records: [], ids: [], total: 0, capped: false, unread: [] });
    expect(host.log).toEqual([`page parent cap=50 vault=${VAULT}`, "apply"]);
  });

  it("rejects with the host's error when the page, or a read, throws", async () => {
    const pageFails = level();
    pageFails.failFind = () => true;
    await expect(readLevel(pageFails, VAULT, ent("parent"), { cap: 50, fresh: false })).rejects.toThrow("find failed");
    const readFails = level();
    readFails.failRead = (id) => id === "a";
    await expect(readLevel(readFails, VAULT, ent("parent"), { cap: 50, fresh: false })).rejects.toThrow("read failed");
  });
});

describe("planPartialWrite", () => {
  const abc = () =>
    new FakeHost([
      part("a", "parent", { tag: "Walk.A", order: 1 }),
      part("b", "parent", { tag: "Walk.B", order: 2 }),
      part("c", "parent", { tag: "Walk.C", order: 3 }),
    ]);

  it("reads the level fresh up to the cap, then plans the move over what it read", async () => {
    const host = abc();
    const plan = await planPartialWrite(host, VAULT, ent("parent"), "c", { kind: "step", dir: -1 }, []);
    expect(plan).toMatchObject({ ok: true, order: 2, changes: [{ id: "b", order: 3 }] });
    expect(host.log).toEqual([
      `page parent cap=${ORDER_CAP} vault=${VAULT}`,
      "stale a",
      "stale b",
      "stale c",
      "read a fresh",
      "read b fresh",
      "read c fresh",
      "apply",
    ]);
    if (plan?.ok) {
      expect(plan.stored).toEqual([
        { id: "a", order: 1, tag: "Walk.A" },
        { id: "b", order: 2, tag: "Walk.B" },
        { id: "c", order: 3, tag: "Walk.C" },
      ]);
      expect([...plan.byId.keys()]).toEqual(["a", "b", "c"]);
    }
  });

  it("takes the move from a function of the stored parts", async () => {
    const host = abc();
    let given: readonly StoredPart[] = [];
    const plan = await planPartialWrite(host, VAULT, ent("parent"), "a", (stored) => ((given = stored), { kind: "remove" }), []);
    expect(given.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(plan).toMatchObject({ ok: true, order: 0, changes: [{ id: "b", order: 1 }, { id: "c", order: 2 }] });
  });

  it("is null for a step past the end, and for a part that is not in the level", async () => {
    expect(await planPartialWrite(abc(), VAULT, ent("parent"), "a", { kind: "step", dir: -1 }, [])).toBeNull();
    expect(await planPartialWrite(abc(), VAULT, ent("parent"), "nobody", { kind: "step", dir: 1 }, [])).toBeNull();
  });

  it("treats a part with no finite order as having none", async () => {
    const host = new FakeHost([part("a", "parent", { tag: "Walk.A" }), part("b", "parent", { tag: "Walk.B", order: 2 })]);
    const plan = await planPartialWrite(host, VAULT, ent("parent"), "a", { kind: "new" }, []);
    expect(plan).toMatchObject({ ok: true, order: 3 });
    if (plan?.ok) expect(plan.stored.map((p) => p.order)).toEqual([null, 2]);
  });

  it("steps over the parts the card does not show", async () => {
    const host = abc();
    const plan = await planPartialWrite(host, VAULT, ent("parent"), "c", { kind: "step", dir: -1 }, [], new Set(["a", "c"]));
    expect(plan).toMatchObject({ ok: true, order: 1, changes: [{ id: "a", order: 2 }, { id: "b", order: 3 }] });
  });

  it("refuses with the unread sentence when the page or a read throws", async () => {
    const pageFails = abc();
    pageFails.failFind = () => true;
    expect(await planPartialWrite(pageFails, VAULT, ent("parent"), "c", { kind: "new" }, [])).toEqual({ ok: false, notice: ORDER_UNREAD });
    const readFails = abc();
    readFails.failRead = () => true;
    expect(await planPartialWrite(readFails, VAULT, ent("parent"), "c", { kind: "new" }, [])).toEqual({ ok: false, notice: ORDER_UNREAD });
  });

  it("refuses with the too-many sentence when the level is capped at 1000", async () => {
    const host = new FakeHost(Array.from({ length: ORDER_CAP + 1 }, (_, i) => part(`p${i}`, "parent")));
    expect(await planPartialWrite(host, VAULT, ent("parent"), "p0", { kind: "new" }, [])).toEqual({ ok: false, notice: ORDER_TOO_MANY });
    expect(host.reads).toBe(0);
  });

  it("fills a record that could not be read from the first loaded list that holds it", async () => {
    const host = abc();
    host.rows.delete("b");
    const fromFirst = recordOf({ id: "b", parent: "parent", tag: "Walk.FirstB", order: 2 });
    const fromSecond = recordOf({ id: "b", parent: "parent", tag: "Walk.SecondB", order: 9 });
    const plan = await planPartialWrite(host, VAULT, ent("parent"), "c", { kind: "step", dir: -1 }, [[fromFirst], [fromSecond]]);
    expect(plan).toMatchObject({ ok: true, order: 2, changes: [{ id: "b", order: 3 }] });
    if (plan?.ok) expect(plan.stored.find((p) => p.id === "b")).toEqual({ id: "b", order: 2, tag: "Walk.FirstB" });
    const later = await planPartialWrite(host, VAULT, ent("parent"), "c", { kind: "new" }, [[], [fromSecond]]);
    if (later?.ok) expect(later.stored.find((p) => p.id === "b")).toEqual({ id: "b", order: 9, tag: "Walk.SecondB" });
  });

  it("refuses when a record could not be read and no list holds it", async () => {
    const host = abc();
    host.rows.delete("b");
    expect(await planPartialWrite(host, VAULT, ent("parent"), "c", { kind: "new" }, [])).toEqual({ ok: false, notice: ORDER_UNREAD });
    expect(await planPartialWrite(host, VAULT, ent("parent"), "c", { kind: "new" }, [[recordOf({ id: "x", parent: "p" })]])).toEqual({
      ok: false,
      notice: ORDER_UNREAD,
    });
  });
});

describe("removalPlan: the tree", () => {
  it("keeps preorder for the sentence and postorder for the deletes (ported)", async () => {
    const host = new FakeHost([
      part("step", "walk", { tag: "Walk.Step" }),
      part("k0", "step", { tag: "Walk.Step.K0" }),
      part("g0", "k0", { tag: "Walk.Step.K0.G0" }),
      part("k1", "step", { tag: "Walk.Step.K1" }),
      part("g1", "k1", { tag: "Walk.Step.K1.G1" }),
    ]);
    const plan = await removalPlan(host, host.rows.get("step")!, "Step", "walk", VAULT, new Set());
    expect(plan.pre.map((g) => g.id)).toEqual(["step", "k0", "g0", "k1", "g1"]);
    expect(plan.post.map((g) => g.id)).toEqual(["g0", "k0", "g1", "k1", "step"]);
  });

  it("refuses a 50 by 50 tree after 51 finds and 50 reads, with at most 6 in flight (ported)", async () => {
    const kids = Array.from({ length: 50 }, (_, i) => `k${i}`);
    const nodes: Node[] = [part("step", "walk", { tag: "Walk.Step" })];
    for (const kid of kids) {
      nodes.push(part(kid, "step", { tag: `Walk.Step.${kid}` }));
      for (let j = 0; j < 50; j++) nodes.push(part(`${kid}g${j}`, kid, { tag: `Walk.Step.${kid}.${kid}g${j}` }));
    }
    const host = new FakeHost(nodes);
    host.findMs = 2;
    host.readMs = 2;
    await expect(removalPlan(host, host.rows.get("step")!, "Step", "walk", VAULT, new Set())).rejects.toThrow(REMOVAL_TOO_MANY);
    expect({ finds: host.finds, reads: host.reads }).toEqual({ finds: 51, reads: 50 });
    expect(host.peak).toBeLessThanOrEqual(6);
  });

  it("a wide, uneven tree (40 sub-parts, 2 under each, 1 under some): never more than 6 requests in flight (ported)", async () => {
    const nodes: Node[] = [part("step", "walk", { tag: "Walk.Step" })];
    for (let i = 0; i < 40; i++) {
      nodes.push(part(`k${i}`, "step"));
      nodes.push(part(`k${i}a`, `k${i}`), part(`k${i}b`, `k${i}`));
      if (i % 5 === 0) nodes.push(part(`k${i}a1`, `k${i}a`));
    }
    const host = new FakeHost(nodes);
    host.findMs = 2;
    host.readMs = 2;
    const plan = await removalPlan(host, root(), "Step", "walk", VAULT, new Set());
    expect({ peak: host.peak <= 6, gone: plan.post.length }).toEqual({ peak: true, gone: 1 + 40 + 80 + 8 });
    expect(host.peak).toBeGreaterThan(1);
  });

  it("the budget is checked before a depth is read: 1 + 3 + 297 parts is refused after reading only the 3 (ported)", async () => {
    const nodes: Node[] = [];
    for (let i = 0; i < 3; i++) {
      nodes.push(part(`k${i}`, "step"));
      for (let j = 0; j < 99; j++) nodes.push(part(`k${i}g${j}`, `k${i}`));
    }
    const host = new FakeHost(nodes);
    await expect(removalPlan(host, root(), "Step", "walk", VAULT, new Set())).rejects.toThrow(REMOVAL_TOO_MANY);
    expect({ reads: host.reads, finds: host.finds }).toEqual({ reads: 3, finds: 4 });
  });

  it("known answer at the edge: 1 + 3 + 296 = 300 parts is allowed (ported)", async () => {
    const nodes: Node[] = [];
    for (let i = 0; i < 3; i++) {
      nodes.push(part(`k${i}`, "step"));
      for (let j = 0; j < (i === 2 ? 98 : 99); j++) nodes.push(part(`k${i}g${j}`, `k${i}`));
    }
    const host = new FakeHost(nodes);
    const plan = await removalPlan(host, root(), "Step", "walk", VAULT, new Set());
    expect(plan.post.length).toBe(300);
    expect(REMOVAL_MAX_PARTS).toBe(300);
  });

  it("pre is preorder and post removes every part after all of its own sub-parts, on an uneven tree 4 deep (ported)", async () => {
    const nodes = [
      part("k0", "step"),
      part("k1", "step"),
      part("g0", "k0"),
      part("d0", "g0"),
      part("g1", "k1"),
      part("g2", "k1"),
      part("d1", "g2"),
    ];
    const host = new FakeHost(nodes);
    const plan = await removalPlan(host, root(), "Step", "walk", VAULT, new Set());
    const parentOf = new Map(nodes.map((n) => [n.id, n.parent]));
    const post = plan.post.map((g) => g.id);
    const under = (child: string, ancestor: string) => {
      let p = parentOf.get(child);
      while (p && p !== "walk") {
        if (p === ancestor) return true;
        p = parentOf.get(p);
      }
      return false;
    };
    // A part removed before one of its own sub-parts is wrong.
    const badPost = post.filter((id, i) => post.slice(i + 1).some((later) => under(later, id)));
    expect({ pre: plan.pre.map((g) => g.id), badPost, parents: plan.pre.map((g) => `${g.id}<${g.parentId}`) }).toEqual({
      pre: ["step", "k0", "g0", "d0", "k1", "g1", "g2", "d1"],
      badPost: [],
      parents: ["step<walk", "k0<step", "g0<k0", "d0<g0", "k1<step", "g1<k1", "g2<k1", "d1<g2"],
    });
  });

  it("a record in another vault three levels down refuses the whole removal and names the part it points at (ported)", async () => {
    const host = new FakeHost([
      part("k0", "step"),
      part("g0", "k0", { tag: "Walk.Step.K0.G0" }),
      part("f0", "g0", { origin: OTHER, tag: "Elsewhere.F0" }),
    ]);
    await expect(removalPlan(host, root(), "Step", "walk", VAULT, new Set())).rejects.toThrow(
      /G0 is not removed: 1 other record names it as its part-of \(Elsewhere\.F0\)/,
    );
  });

  it("a record in this vault that is not a part, three levels down: kept, named under its parent, and not in the deletes (ported)", async () => {
    const host = new FakeHost([part("k0", "step"), part("g0", "k0", { tag: "Walk.Step.K0.G0" }), part("s0", "g0", { type: "t:System", tag: "Pump" })]);
    const plan = await removalPlan(host, root(), "Step", "walk", VAULT, new Set());
    expect({ post: plan.post.map((g) => g.id), kept: plan.kept }).toEqual({
      post: ["g0", "k0", "step"],
      kept: [{ tag: "Pump", parentKeyword: "G0" }],
    });
  });

  it("one find fails on a wide depth: the walk refuses, and no further request starts after the refusal (ported)", async () => {
    const nodes: Node[] = [];
    for (let i = 0; i < 30; i++) nodes.push(part(`k${i}`, "step"));
    const host = new FakeHost(nodes);
    host.findMs = 2;
    host.failFind = (parent) => parent === "k0";
    // Depth 1 reads the 30 sub-parts; depth 2 asks for each one's children and k0's find fails.
    host.readMs = 2;
    const out = await removalPlan(host, root(), "Step", "walk", VAULT, new Set()).then(
      () => "removed",
      () => "refused",
    );
    const atRefusal = host.finds;
    await new Promise((r) => setTimeout(r, 100));
    expect({ out, laterFinds: host.finds - atRefusal }).toEqual({ out: "refused", laterFinds: 0 });
    // The first find is the step's, then the first 6 of the 30 start together; no more.
    expect(atRefusal).toBe(1 + 6);
  });
});

const small = () =>
  new FakeHost([part("k0", "step", { tag: "Walk.Step.K0" }), part("k1", "step", { tag: "Walk.Step.K1" }), part("g0", "k0", { tag: "Walk.Step.K0.G0" })]);

describe("removalPlan: the contract with the host", () => {
  it("asks one depth at a time: the page for each parent, then every mark-stale, then every fresh read", async () => {
    const host = small();
    await removalPlan(host, root(), "Step", "walk", VAULT, new Set());
    expect(host.log).toEqual([
      `page step cap=${REMOVAL_MAX_PARTS + 1} vault=${VAULT}`,
      "stale k0",
      "stale k1",
      "read k0 fresh",
      "read k1 fresh",
      `page k0 cap=${REMOVAL_MAX_PARTS + 1} vault=${VAULT}`,
      `page k1 cap=${REMOVAL_MAX_PARTS + 1} vault=${VAULT}`,
      "stale g0",
      "read g0 fresh",
      `page g0 cap=${REMOVAL_MAX_PARTS + 1} vault=${VAULT}`,
    ]);
  });

  it("never applies pins or drops, and waits for the marks before the first fresh read", async () => {
    const host = small();
    host.staleMs = 8;
    await removalPlan(host, root(), "Step", "walk", VAULT, new Set());
    expect(host.readBeforeStale).toBe(false);
    expect(host.log).not.toContain("apply");
  });

  it("is refused when the host says a level is capped", async () => {
    const host = new FakeHost(Array.from({ length: REMOVAL_MAX_PARTS + 2 }, (_, i) => part(`p${i}`, "step")));
    await expect(removalPlan(host, root(), "Step", "walk", VAULT, new Set())).rejects.toThrow(REMOVAL_TOO_MANY);
    expect(host.reads).toBe(0);
  });

  it("is refused when a sub-part cannot be read", async () => {
    const host = small();
    host.rows.delete("k1");
    await expect(removalPlan(host, root(), "Step", "walk", VAULT, new Set())).rejects.toThrow(SUBPART_UNREAD);
  });

  it("rejects with the host's error when a find throws", async () => {
    const host = small();
    host.failFind = (parent) => parent === "step";
    await expect(removalPlan(host, root(), "Step", "walk", VAULT, new Set())).rejects.toThrow("find failed");
  });
});

describe("removalPlan: the rules", () => {
  it("gives each part its id, address, keyword and parent id; a part with no tag word is named by its id", async () => {
    const host = new FakeHost([part("k0", "step", { tag: "Walk.Step.Lift" }), part("k1", "step", { tag: "" })]);
    const plan = await removalPlan(host, root(), "Step", "walk", VAULT, new Set());
    expect(plan.pre).toEqual([
      { id: "step", entityUri: ent("step"), keyword: "Step", parentId: "walk" },
      { id: "k0", entityUri: ent("k0"), keyword: "Lift", parentId: "step" },
      { id: "k1", entityUri: ent("k1"), keyword: "k1", parentId: "step" },
    ]);
    expect(plan.kept).toEqual([]);
  });

  it("is empty, and asks the host nothing, for a part already in 'seen'; it adds the part it plans", async () => {
    const host = small();
    const seen = new Set(["step"]);
    expect(await removalPlan(host, root(), "Step", "walk", VAULT, seen)).toEqual({ pre: [], post: [], kept: [] });
    expect(host.log).toEqual([]);
    const fresh = new Set<string>();
    await removalPlan(small(), root(), "Step", "walk", VAULT, fresh);
    expect([...fresh].sort()).toEqual(["g0", "k0", "k1", "step"]);
  });

  it("skips a sub-part already in 'seen'", async () => {
    const host = small();
    const plan = await removalPlan(host, root(), "Step", "walk", VAULT, new Set(["k1"]));
    expect(plan.pre.map((g) => g.id)).toEqual(["step", "k0", "g0"]);
  });

  it("takes a record two parents name once, under the first parent", async () => {
    const host = new FakeHost([part("k0", "step"), part("k1", "step"), part("x", "k0")]);
    host.kids.set("k1", ["x"]);
    const plan = await removalPlan(host, root(), "Step", "walk", VAULT, new Set());
    expect(plan.pre.map((g) => `${g.id}<${g.parentId}`)).toEqual(["step<walk", "k0<step", "x<k0", "k1<step"]);
  });

  it("throws 'no address' for a part with no address", async () => {
    const host = small();
    const bare: BaseRecord = { id: "step", typeUri: "t:SpecificationElement", facts: {}, opaqueFacts: [], etag: null };
    await expect(removalPlan(host, bare, "Step", "walk", VAULT, new Set())).rejects.toThrow("no address");
  });

  it("reads an address with nothing before '/e/' (or no '/e/' at all) as belonging to no vault, even for an empty plan vault", async () => {
    for (const address of ["/e/k0", "k0"]) {
      const host = new FakeHost([part("k0", "step", { tag: "Walk.Step.K0" })]);
      host.rows.set("k0", { ...host.rows.get("k0")!, entityUri: address });
      await expect(removalPlan(host, root(), "Step", "walk", "", new Set())).rejects.toThrow(
        "Step is not removed: 1 other record names it as its part-of (Walk.Step.K0). Change those first.",
      );
    }
  });

  it("reads a sub-part the host returned without an address as a record of another vault, and refuses", async () => {
    const host = small();
    const row = host.rows.get("k0")!;
    host.rows.set("k0", { ...row, entityUri: undefined });
    await expect(removalPlan(host, root(), "Step", "walk", VAULT, new Set())).rejects.toThrow(
      "Step is not removed: 1 other record names it as its part-of (Walk.Step.K0). Change those first.",
    );
  });

  it("names the parts of one level at most three at a time when another vault's records name them", async () => {
    const host = new FakeHost([
      part("k0", "step", { tag: "Walk.Step.K0" }),
      part("f0", "k0", { origin: OTHER, tag: "E.One" }),
      part("f1", "k0", { origin: OTHER, tag: "E.Two" }),
      part("f2", "k0", { origin: OTHER, tag: "E.Three" }),
      part("f3", "k0", { origin: OTHER, tag: "E.Four" }),
    ]);
    await expect(removalPlan(host, root(), "Step", "walk", VAULT, new Set())).rejects.toThrow(
      "K0 is not removed: 4 other records name it as their part-of (E.One, E.Two, E.Three). Change those first.",
    );
  });

  it("keeps a record of this vault that is not a part, does not walk below it, and lists it in preorder", async () => {
    const host = new FakeHost([
      part("k0", "step", { tag: "Walk.Step.K0" }),
      part("s0", "k0", { type: "t:System", tag: "Pump" }),
      part("below", "s0", { tag: "Walk.Below" }),
      part("s1", "step", { type: "t:System", tag: "" }),
    ]);
    const plan = await removalPlan(host, root(), "Step", "walk", VAULT, new Set());
    expect(plan.post.map((g) => g.id)).toEqual(["k0", "step"]);
    expect(plan.kept).toEqual([{ tag: "s1", parentKeyword: "Step" }, { tag: "Pump", parentKeyword: "K0" }]);
    expect(host.log.some((l) => l.startsWith("page below") || l.startsWith("page s0"))).toBe(false);
  });

  it("refuses a chain more than 11 levels below the part, because the twelfth depth is not read", async () => {
    const chain = (n: number) => {
      const nodes: Node[] = [];
      for (let i = 1; i <= n; i++) nodes.push(part(`c${i}`, i === 1 ? "step" : `c${i - 1}`));
      return new FakeHost(nodes);
    };
    const ok = await removalPlan(chain(11), root(), "Step", "walk", VAULT, new Set());
    expect(ok.post).toHaveLength(12);
    await expect(removalPlan(chain(12), root(), "Step", "walk", VAULT, new Set())).rejects.toThrow(REMOVAL_TOO_DEEP);
  });

  it("starts the depth count at the 'depth' it is given, and refuses outright at the maximum", async () => {
    const chain = (n: number) => {
      const nodes: Node[] = [];
      for (let i = 1; i <= n; i++) nodes.push(part(`c${i}`, i === 1 ? "step" : `c${i - 1}`));
      return new FakeHost(nodes);
    };
    await expect(removalPlan(chain(6), root(), "Step", "walk", VAULT, new Set(), 5)).resolves.toMatchObject({ post: expect.any(Array) });
    await expect(removalPlan(chain(7), root(), "Step", "walk", VAULT, new Set(), 5)).rejects.toThrow(REMOVAL_TOO_DEEP);
    const host = chain(0);
    await expect(removalPlan(host, root(), "Step", "walk", VAULT, new Set(), 12)).rejects.toThrow(REMOVAL_TOO_DEEP);
    expect(host.log).toEqual([]);
    await expect(removalPlan(host, root(), "Step", "walk", VAULT, new Set(), 11)).resolves.toBeDefined();
  });
});
