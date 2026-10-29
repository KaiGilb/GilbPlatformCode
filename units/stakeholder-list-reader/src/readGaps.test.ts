// Gap tests of the reader with fake doors: one row per person, failing inputs, window-limited names, limits.
import { describe, expect, it } from "vitest";
import { sleep } from "../test/clock";
import {
  createStakeholderListReader,
  type RecordsPage,
  type StakeholderListDeps,
} from "./index";
import {
  type ConnectionsReading,
  type ResolveOutcome,
} from "@kaigilb/gilbplatformcode-person-connections";
import {
  type LinkReading,
} from "@kaigilb/gilbplatformcode-online-card-link";

const H = "https://holder.example.test/vault";
const V = (n: number) => (n === 0 ? H : `https://holder-v${n}.example.test/vault`);
const P = (n: string | number) => `https://p${n}.example.test/vault`;
const OWN_LWSR = "https://holder.example.test/lws/r/vsc-cora";
const OWN_ENTITY = "https://holder.example.test/vault/e/vsc-cora";
const tick = (ms = 2) => sleep(ms);

type Rec = { id: string; title: string; target: string | null };
function deps(opts: {
  people?: { principal: string }[];
  vaults?: Record<string, Rec[]>;
  resolves?: Record<string, string>;
  canonical?: StakeholderListDeps["canonical"];
  failConnections?: unknown;
  failPage?: (v: string) => boolean;
  failLink?: (id: string) => boolean;
  failName?: (p: string) => boolean;
  own?: string[];
  pageSize?: number;
}) {
  const peak = { readLink: 0, resolve: 0, readName: 0 };
  const now = { readLink: 0, resolve: 0, readName: 0 };
  const count = { readLink: 0, resolve: 0, readName: 0, listRecords: 0, connections: 0 };
  const names: string[] = [];
  const vaults = opts.vaults ?? { [H]: [] };
  const byId = new Map<string, Rec>();
  for (const list of Object.values(vaults)) for (const r of list) byId.set(r.id, r);
  const enter = (k: keyof typeof now) => { now[k]++; peak[k] = Math.max(peak[k], now[k]); };
  const d: StakeholderListDeps = {
    holder: H,
    holderVault: H,
    vaults: Object.keys(vaults),
    ownCardIds: opts.own ?? [OWN_LWSR],
    async connections(): Promise<ConnectionsReading> {
      count.connections++;
      if (opts.failConnections) throw opts.failConnections;
      return { holder: H, vaultId: H, sets: [], people: (opts.people ?? []).map((p) => ({ principal: p.principal, placements: [{ context: "professional", depth: "first-degree" }] })) } as ConnectionsReading;
    },
    async listRecords(v: string, offset: number): Promise<RecordsPage> {
      count.listRecords++;
      await tick(1);
      if (opts.failPage?.(v)) throw new Error(`records 500 for ${v}`);
      const size = opts.pageSize ?? 20;
      const all = vaults[v] ?? [];
      return { records: all.slice(offset, offset + size).map((r) => ({ recordId: r.id, title: r.title, updatedAt: 1 })), next: offset + size < all.length ? offset + size : null };
    },
    async readLink(id: string): Promise<LinkReading> {
      count.readLink++;
      enter("readLink");
      await tick();
      now.readLink--;
      if (opts.failLink?.(id)) throw new Error("record 500");
      const r = byId.get(id);
      return r?.target ? { state: "linked", target: r.target } : { state: "none" };
    },
    async resolve(id: string): Promise<ResolveOutcome> {
      count.resolve++;
      enter("resolve");
      await tick();
      now.resolve--;
      const p = opts.resolves?.[id];
      return p ? { kind: "person", principal: p, entity: p } : { kind: "none" };
    },
    ...(opts.canonical ? { canonical: opts.canonical } : {}),
    async readName(p: string) {
      count.readName++;
      names.push(p);
      enter("readName");
      await tick(3);
      now.readName--;
      if (opts.failName?.(p)) return { kind: "unavailable" as const };
      return { kind: "name" as const, name: `Name of ${p}` };
    },
  };
  return { d, peak, count, names };
}
const recs = (v: string, n: number, linkTo?: (i: number) => string | null) =>
  Array.from({ length: n }, (_, i) => ({ id: `${v}/e/r${i}`, title: `Contact ${i}`, target: linkTo ? linkTo(i) : null }));

describe("concurrency bounds", () => {
  it("link reads stay at most 6 at a time across ALL held vaults (plan: 6 at a time)", async () => {
    const vaults = { [V(0)]: recs(V(0), 20), [V(1)]: recs(V(1), 20), [V(2)]: recs(V(2), 20) };
    const h = deps({ vaults });
    await createStakeholderListReader(h.d).read();
    expect(h.count.readLink).toBe(60);
    expect(h.peak.readLink).toBeLessThanOrEqual(6);
  });
  it("resolves stay at most 6 at a time across ALL held vaults", async () => {
    const vaults = { [V(0)]: recs(V(0), 20, (i) => P(`a${i}`)), [V(1)]: recs(V(1), 20, (i) => P(`b${i}`)) };
    const h = deps({ vaults });
    await createStakeholderListReader(h.d).read();
    expect(h.count.resolve).toBe(40);
    expect(h.peak.resolve).toBeLessThanOrEqual(6);
  });
  it("names stay at most 3 at a time when two windows are asked at once (a scroll)", async () => {
    const people = Array.from({ length: 24 }, (_, i) => ({ principal: P(i) }));
    const h = deps({ people });
    const r = createStakeholderListReader(h.d);
    const l = await r.read();
    const keys = l.rows.filter((x) => x.kind === "placed").map((x) => x.key);
    await Promise.all([r.names(keys.slice(0, 12)), r.names(keys.slice(12))]);
    expect(h.count.readName).toBe(24);
    expect(h.peak.readName).toBeLessThanOrEqual(3);
  });
  it("names stay at most 3 at a time within one window, and a window is read once", async () => {
    const people = Array.from({ length: 30 }, (_, i) => ({ principal: P(i) }));
    const h = deps({ people });
    const r = createStakeholderListReader(h.d);
    const l = await r.read();
    const keys = l.rows.slice(0, 20).map((x) => x.key);
    await r.names(keys);
    await r.names(keys);
    expect(h.peak.readName).toBeLessThanOrEqual(3);
    expect(h.count.readName).toBe(19); // the self row is not a placed row
  });
});

describe("window-limited names", () => {
  it("names() reads only the placed-only rows among the keys, never the whole list, never a record or both row", async () => {
    const people = Array.from({ length: 300 }, (_, i) => ({ principal: P(i) }));
    const vaults = { [H]: [{ id: `${H}/e/x`, title: "X", target: P(0) }, { id: `${H}/e/y`, title: "Name of " + P(1), target: null }] };
    const h = deps({ people, vaults, resolves: { [`${H}/e/x`]: P(0) } });
    const r = createStakeholderListReader(h.d);
    const l = await r.read();
    expect(h.count.readName).toBe(0); // a draw reads no name
    const both = l.rows.find((x) => x.kind === "both")!;
    const rec = l.rows.find((x) => x.kind === "record")!;
    const placed = l.rows.filter((x) => x.kind === "placed").slice(0, 5).map((x) => x.key);
    const out = await r.names([both.key, rec.key, l.rows[0]!.key, ...placed, "https://nobody.example/vault"]);
    expect(h.names.sort()).toEqual([...placed].sort());
    expect([...out.keys()].sort()).toEqual([...placed].sort());
  });
});

describe("never by name", () => {
  it("an unlinked record whose title is a placed person's name AND principal joins nobody", async () => {
    const people = [{ principal: P("ann") }];
    const vaults = { [H]: [{ id: `${H}/e/a1`, title: "Name of " + P("ann"), target: null }, { id: `${H}/e/a2`, title: P("ann"), target: null }, { id: `${H}/e/a3`, title: "Ann", target: P("ann") }] };
    const h = deps({ people, vaults, resolves: { [`${H}/e/a3`]: P("ann") } });
    const r = createStakeholderListReader(h.d);
    const l = await r.read();
    await r.names(l.rows.map((x) => x.key));
    const l2 = await r.refresh();
    for (const list of [l, l2]) {
      const ann = list.rows.filter((x) => x.principal === P("ann"));
      expect(ann).toHaveLength(1);
      expect(ann[0]!.recordId).toBe(`${H}/e/a3`);
      expect(ann[0]!.alsoRecords).toBe(0);
      expect(list.rows.find((x) => x.recordId === `${H}/e/a1`)?.kind).toBe("record");
      expect(list.rows.find((x) => x.recordId === `${H}/e/a2`)?.kind).toBe("record");
    }
  });
  it("an unlinked record with the SAME title as a linked record stays its own record row (reader level)", async () => {
    const people = [{ principal: P("ann") }];
    const vaults = { [H]: [{ id: `${H}/e/l`, title: "Ann Lee", target: P("ann") }, { id: `${H}/e/u`, title: "Ann Lee", target: null }, { id: `${H}/e/v`, title: "ann lee ", target: null }] };
    const h = deps({ people, vaults, resolves: { [`${H}/e/l`]: P("ann") } });
    const l = await createStakeholderListReader(h.d).read();
    const ann = l.rows.find((x) => x.principal === P("ann"))!;
    expect(ann.kind).toBe("both");
    expect(ann.recordId).toBe(`${H}/e/l`);
    expect(ann.alsoRecords).toBe(0);
    expect(l.rows.find((x) => x.recordId === `${H}/e/u`)?.kind).toBe("record");
    expect(l.rows.find((x) => x.recordId === `${H}/e/v`)?.kind).toBe("record");
  });
  it("two records with the same title linked to two different people stay two people", async () => {
    const people = [{ principal: P(1) }, { principal: P(2) }];
    const vaults = { [H]: [{ id: `${H}/e/s1`, title: "Ivy", target: P(1) }, { id: `${H}/e/s2`, title: "Ivy", target: P(2) }] };
    const h = deps({ people, vaults, resolves: { [`${H}/e/s1`]: P(1), [`${H}/e/s2`]: P(2) } });
    const l = await createStakeholderListReader(h.d).read();
    expect(l.rows.filter((x) => x.kind === "both").map((x) => x.key).sort()).toEqual([P(1), P(2)].sort());
  });
});

describe("own card first", () => {
  for (const own of [[OWN_LWSR], [OWN_ENTITY], [OWN_LWSR, OWN_ENTITY]]) {
    it(`self first and its card never a contact, own card given as ${own.map((o) => (o.includes("/lws/r/") ? "/lws/r/" : "entity")).join(" + ")}`, async () => {
      const vaults = { [H]: [{ id: OWN_ENTITY, title: "Ann", target: null }, ...recs(H, 3)] };
      const h = deps({ vaults, own, people: [{ principal: P(1) }] });
      const l = await createStakeholderListReader(h.d).read();
      expect(l.rows[0]!.kind).toBe("self");
      expect(l.rows[0]!.recordId).toBe(OWN_ENTITY);
      expect(l.rows.filter((x) => x.recordId === OWN_ENTITY)).toHaveLength(1);
    });
  }
});

describe("each input failing gives a clear flag and the rest", () => {
  it("connections fail: records listed, connections failed, partial", async () => {
    const h = deps({ failConnections: new Error("AudienceRungMembership 500"), vaults: { [H]: recs(H, 5) } });
    const l = await createStakeholderListReader(h.d).read();
    expect(l.connections).toEqual({ state: "failed", reason: "AudienceRungMembership 500" });
    expect(l.partial).toBe(true);
    expect(l.rows.map((x) => x.kind)).toEqual(["self", "record", "record", "record", "record", "record"]);
  });
  it("one vault's page fails: the others listed, that vault failed, partial; more() asks it again", async () => {
    let fail = true;
    const h = deps({ vaults: { [V(0)]: recs(V(0), 3), [V(1)]: recs(V(1), 3) }, failPage: (v) => fail && v === V(1) });
    const r = createStakeholderListReader(h.d);
    const l = await r.read();
    expect(l.vaults.map((x) => x.state)).toEqual(["read", "failed"]);
    expect(l.partial).toBe(true);
    expect(l.rows.filter((x) => x.kind === "record")).toHaveLength(3);
    fail = false;
    const m = await r.more();
    expect(m.vaults.map((x) => x.state)).toEqual(["read", "read"]);
    expect(m.partial).toBe(false);
    expect(m.rows.filter((x) => x.kind === "record")).toHaveLength(6);
  });
  it("a link read fails: that record is a record row, listed as unchecked, partial", async () => {
    const vaults = { [H]: [{ id: `${H}/e/a`, title: "A", target: P(1) }] };
    const h = deps({ vaults, people: [{ principal: P(1) }], resolves: { [`${H}/e/a`]: P(1) }, failLink: () => true });
    const l = await createStakeholderListReader(h.d).read();
    expect(l.links.unchecked).toEqual([`${H}/e/a`]);
    expect(l.partial).toBe(true);
    expect(l.rows.map((x) => x.kind)).toEqual(["self", "record", "placed"]);
  });
  it("names fail: 'unavailable' per row, never kept, asked again", async () => {
    let fail = true;
    const h = deps({ people: [{ principal: P(1) }], failName: () => fail });
    const r = createStakeholderListReader(h.d);
    const l = await r.read();
    const k = l.rows[1]!.key;
    expect((await r.names([k])).get(k)).toEqual({ state: "unavailable" });
    fail = false;
    expect((await r.names([k])).get(k)).toEqual({ state: "name", name: `Name of ${P(1)}` });
  });
  it("the canonicaliser cannot answer and a person shows as two rows: the list says so (partial)", async () => {
    // P('legacy') is the person's old spelling as placed; the record links today's principal P('today').
    const people = [{ principal: P("legacy") }];
    const vaults = { [H]: [{ id: `${H}/e/d`, title: "Hal", target: P("today") }] };
    const h = deps({ people, vaults, resolves: { [`${H}/e/d`]: P("today") }, canonical: async () => { throw new Error("resolve-person 500"); } });
    const l = await createStakeholderListReader(h.d).read();
    const two = l.rows.filter((x) => x.key === P("legacy") || x.key === P("today"));
    expect(two).toHaveLength(2); // the documented fallback: compared as stored
    expect(l.partial).toBe(true); // ... but then "something may be unjoined" (StakeholderList.partial)
  });
});
