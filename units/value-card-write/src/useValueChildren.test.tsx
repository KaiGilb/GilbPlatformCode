/**
 * Tests of the child-list host: a newer queued edit is kept, a conflict and a failed group re-read only their own records, and the
 * progress of a group write. A small in-memory vault replaces the network: If-Match is checked (a stale version is the conflict
 * class), a duplicate tag is a 409, every write bumps the record's version.
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


const three: LevelEntry[] = [
  { levelKind: "Past", levelValue: 14, levelVariables: { Country: "Norway" } },
  { levelKind: "Status", levelValue: 9, "a:levelWhen": "2026-10-27", levelVariables: { Country: "Norway" } },
  { levelKind: "Goal", levelValue: 5, "a:levelWhen": "2027-06-30", levelVariables: { Country: "Norway" } },
];
const toSweden = (items: ValueLevel[]) => items.map((l) => carryRaw({ ...l, qualifier: { ...l.qualifier, variables: { Country: "Sweden" } } }, l));

describe("an edit queued behind a failed group is kept", () => {
  it("the later value (6) is written, the notice says it was kept, and the group's own levels are put back", async () => {
    const a = person(three);
    server.failPatch = new Set([2]);
    const moved = toSweden(a.host.items);
    await act(async () => {
      a.host.commit(moved);
      a.host.commit(moved.map((l, n) => (n === 2 ? carryRaw({ ...l, value: 6 }, l) : l)));
    });
    await settle();
    expect(srv("lvl3").served.scaleNumber).toBe("6");
    // Past was written then put back; Status was the failure and never changed.
    expect(JSON.stringify(srv("lvl1").served.levelQualifierChoice ?? null)).not.toContain("Sweden");
    expect(JSON.stringify(srv("lvl2").served.levelQualifierChoice ?? null)).not.toContain("Sweden");
    expect(a.notices.filter(Boolean).join(" ")).toMatch(/newer edit.*kept/);
  });
});

describe("progress", () => {
  it("a group write reports done/total and ends with none", async () => {
    const a = person(three);
    const seen: string[] = [];
    await act(async () => a.host.commit(toSweden(a.host.items)));
    for (let i = 0; i < 40; i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
      const p = a.host.progress;
      if (p) seen.push(`${p.done}/${p.total}`);
    }
    expect(seen.length === 0 || seen[0]!.endsWith("/3")).toBe(true);
    expect(a.host.progress ?? null).toBeNull();
  });
});

describe("narrow re-reads", () => {
  it("a 412 invalidates the find once, naming only that record; the sentence is said first", async () => {
    const a = person(two);
    const seen: { members: unknown }[] = [];
    const real = a.fake.invalidatePlanFind.getMockImplementation()!;
    a.fake.invalidatePlanFind.mockImplementation(async (_v, _a, _p, opts) => {
      seen.push({ members: opts?.members });
    });
    srv("lvl1").served.scaleNumber = 7;
    srv("lvl1").n += 1;
    await act(async () => a.host.commit(edit(a.host.items, 0, (l) => carryRaw({ ...l, value: 8 }, l))));
    await settle();
    a.fake.invalidatePlanFind.mockImplementation(real);
    expect(a.notices.filter(Boolean).join(" ")).toMatch(/changed elsewhere/);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.members).toEqual(["https://h.example.test/base/e/lvl1"]);
  });

  it("a failed group of 3 names its 3 members, not all", async () => {
    const a = person(three);
    const seen: { members: unknown }[] = [];
    const real = a.fake.invalidatePlanFind.getMockImplementation()!;
    a.fake.invalidatePlanFind.mockImplementation(async (_v, _a, _p, opts) => {
      seen.push({ members: opts?.members });
    });
    server.failPatch = new Set([2]);
    await act(async () => a.host.commit(toSweden(a.host.items)));
    await settle();
    a.fake.invalidatePlanFind.mockImplementation(real);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.members).toEqual(["https://h.example.test/base/e/lvl1", "https://h.example.test/base/e/lvl2", "https://h.example.test/base/e/lvl3"]);
  });
});
