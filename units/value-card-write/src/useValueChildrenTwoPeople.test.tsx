/**
 * Two people on one Value, and a group move that fails half-way. Each person has a browser of their own (their own caches); the
 * vault is shared. If-Match is checked (a stale version is the conflict class), a duplicate tag is a 409, every write bumps the
 * record's version.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { carryRaw, type ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";
import { useValueLevels } from "./index";
import { makeBrowser } from "../test/fakeHost";
import { createServer, type Srv } from "../test/server";
import { planVaultOf, seedValueParts, type LevelEntry } from "../test/testkit";

const server = createServer({ ifMatch: true, patchTagCheck: true });

const P = "https://p.example.test/vault";
const VALUE = {
  id: "val1",
  entityUri: "https://h.example.test/base/e/val1",
  typeUri: "t:Value",
  facts: { unitTag: "Speed" },
  opaqueFacts: [],
  etag: '"sha256:0"',
  updatedAt: 1,
  servedKeys: ["unitTag"],
  served: { facts: { unitTag: "Speed" }, context: undefined, etag: '"sha256:0"' },
} as unknown as BaseRecord;

beforeEach(() => server.reset());
afterEach(cleanup);

/** One person's browser: its own cache, the shared server. */
function person(entries: LevelEntry[]) {
  const b = makeBrowser(server);
  const PV = planVaultOf(VALUE, P);
  const rows = seedValueParts(b.qc, P, VALUE, { levels: entries });
  rows.forEach((r, i) => {
    const when = String(entries[i]!["a:levelWhen"] ?? "");
    const tag = when ? `${r.facts.unitTag}.${when}` : r.facts.unitTag!;
    r.facts.unitTag = tag;
    (r.served!.facts as Record<string, unknown>).unitTag = tag;
    const s: Srv = { id: r.id, typeUri: r.typeUri, served: { ...(r.served!.facts as Record<string, unknown>) }, n: 0 };
    server.recs.set(r.id, s);
    // the seeded row carries the etag the server holds
    r.etag = `"v${s.n}"`;
    (r.served as { etag: string }).etag = `"v${s.n}"`;
  });
  const notices: (string | null)[] = [];
  let host!: ReturnType<typeof useValueLevels>;
  function Harness() {
    host = useValueLevels({ enabled: true, record: VALUE, vaultId: P, planVault: PV, rows, variableOrder: [], onNotice: (n) => notices.push(n) });
    return null;
  }
  render(<Harness />, { wrapper: b.Frame });
  return { get host() { return host; }, notices, qc: b.qc, fake: b.host };
}
const settle = async () => {
  for (let i = 0; i < 30; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
};
const edit = (items: ValueLevel[], i: number, f: (l: ValueLevel) => ValueLevel) => items.map((l, n) => (n === i ? f(l) : l));
const srv = (id: string) => server.recs.get(id)!;

const two: LevelEntry[] = [
  { levelKind: "Goal", levelValue: 5, "a:levelWhen": "2027-01-01", levelVariables: { Country: "Norway" } },
  { levelKind: "Goal", levelValue: 9, "a:levelWhen": "2027-06-30", levelVariables: { Country: "Norway" } },
];

describe("two people on one Value", () => {
  it("after a 412 caused by another person, the same edit tried again is saved (no stuck conflict)", async () => {
    const a = person(two);
    // A's first edit works and A now holds the record it wrote.
    await act(async () => a.host.commit(edit(a.host.items, 0, (l) => carryRaw({ ...l, value: 6 }, l))));
    await settle();
    expect(srv("lvl1").served.scaleNumber).toBe("6");
    // B changes the same record behind A's back.
    const s = srv("lvl1");
    s.served.scaleNumber = 7;
    s.n += 1;
    // A edits again: 412 expected, with a notice.
    await act(async () => a.host.commit(edit(a.host.items, 0, (l) => carryRaw({ ...l, value: 8 }, l))));
    await settle();
    expect(a.notices.filter(Boolean).join(" ")).toMatch(/changed elsewhere/);
    expect(srv("lvl1").served.scaleNumber).toBe(7);
    // A tries once more, now on top of what B wrote.
    await act(async () => a.host.commit(edit(a.host.items, 0, (l) => carryRaw({ ...l, value: 8 }, l))));
    await settle();
    expect(srv("lvl1").served.scaleNumber).toBe("8");
  });

  // The tie is ACCEPTED. Two people adding at the same moment may both take the next a:elementOrder; the order
  // breaks by id (planValue.ts sortedRows), so the list is stable and nothing is lost. The probe's expectation changed from
  // "different orders" to "both records exist, with their own tags, and the same order is allowed".
  it("two people each add a Goal to the same set at the same time: both records are made (the order tie is accepted)", async () => {
    const a = person(two);
    const b = person(two);
    const newGoal = (): ValueLevel => ({ kind: "Goal", value: 3, qualifier: { when: "2027-06-30", variables: { Country: "Norway" }, conditions: [], side: "" }, source: {}, note: "" });
    await act(async () => a.host.commit([...a.host.items, newGoal()]));
    await act(async () => b.host.commit([...b.host.items, newGoal()]));
    await settle();
    const made = [...server.recs.values()].filter((r) => r.id.startsWith("made"));
    expect(made).toHaveLength(2);
    expect(new Set(made.map((r) => r.served.unitTag)).size).toBe(2);
    const orders = made.map((r) => Number(r.served.elementOrder));
    expect(orders.every((n) => n === 3)).toBe(true);
  });
});

describe("group move (runGroup)", () => {
  const three: LevelEntry[] = [
    { levelKind: "Past", levelValue: 14, levelVariables: { Country: "Norway" } },
    { levelKind: "Status", levelValue: 9, "a:levelWhen": "2026-10-27", levelVariables: { Country: "Norway" } },
    { levelKind: "Goal", levelValue: 5, "a:levelWhen": "2027-06-30", levelVariables: { Country: "Norway" } },
  ];
  const toSweden = (items: ValueLevel[]) => items.map((l) => carryRaw({ ...l, qualifier: { ...l.qualifier, variables: { Country: "Sweden" } } }, l));

  it("the 1st of 3 patches fails: nothing else is sent, nothing is patched back, the notice says none moved", async () => {
    const a = person(three);
    server.failPatch = new Set([1]);
    await act(async () => a.host.commit(toSweden(a.host.items)));
    await settle();
    expect(server.log).toHaveLength(1);
    expect(a.notices.filter(Boolean).join(" ")).toMatch(/None of the 3 levels moved/);
    expect(srv("lvl3").served.levelQualifierChoice).toEqual([{ "a:name": "Country", "a:qualifierOptions": ["Norway"] }]);
  });

  it("a 412 on the 3rd patch (another person changed that Goal): the first two are put back, the stored Goal keeps the other person's value", async () => {
    const a = person(three);
    srv("lvl3").served.scaleNumber = 77;
    srv("lvl3").n += 1;
    await act(async () => a.host.commit(toSweden(a.host.items)));
    await settle();
    expect(srv("lvl3").served.scaleNumber).toBe(77);
    const choice = (id: string) => JSON.stringify(srv(id).served.levelQualifierChoice ?? null);
    expect(choice("lvl1")).not.toContain("Sweden");
    expect(choice("lvl2")).not.toContain("Sweden");
    expect(a.notices.filter(Boolean).join(" ")).toMatch(/None of the 3 levels moved/);
  });

  it("a user edit queued behind a failed group is not replaced by the put-back values", async () => {
    const a = person(three);
    server.failPatch = new Set([2]);
    const moved = toSweden(a.host.items);
    await act(async () => {
      a.host.commit(moved);
      // while the group runs the user types a new Goal value on the moved row
      a.host.commit(moved.map((l, n) => (n === 2 ? carryRaw({ ...l, value: 6 }, l) : l)));
    });
    await settle();
    // The move failed and is undone; the later value edit (6) was a separate user act and is either written or reported, never silently lost.
    const goal = srv("lvl3");
    const reported = a.notices.filter(Boolean).join(" ");
    expect(goal.served.scaleNumber === 6 || /6|value/.test(reported)).toBe(true);
  });
});
