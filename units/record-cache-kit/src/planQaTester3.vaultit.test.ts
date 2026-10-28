// Hostile probes of the row cache and the multi-vault search. Each describe names the rule it checks.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { searchVaults } from "./planSearch";
import { applyPatch, liveRow } from "./planRowCache";
import { planRecordKey } from "./planFind";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { recordsKey } from "./recordCaches";
import { setUp, tearDown } from "../test/support";

const A = "https://a.platform.example.test/base";
const B = "https://b.platform.example.test/base";

beforeEach(() => {
  setUp();
});
afterEach(() => tearDown());

function uri(vault: string, id: string): string {
  return `${vault}/e/${id}`;
}

function value(vault: string, id: string, name: string): BaseRecord {
  return {
    id,
    entityUri: uri(vault, id),
    typeUri: "t:Value",
    facts: { name },
    opaqueFacts: [],
    etag: '"sha256:0"',
    servedKeys: ["name"],
    served: { facts: { name }, context: undefined, etag: '"sha256:0"' },
  } as BaseRecord;
}

type Found = { ids?: readonly string[]; next?: string | null };

function searcher(byVault: Record<string, Found | "fail">) {
  return async (_q: string, _t: unknown, _f: undefined, vaultId: string): Promise<Found> => {
    const a = byVault[vaultId];
    if (a === "fail" || a === undefined) throw new Error("search down");
    return a;
  };
}

function reader(rows: BaseRecord[], fail: Set<string> = new Set()) {
  let inFlight = 0;
  let peak = 0;
  const calls: string[] = [];
  const read = async (id: string): Promise<BaseRecord | null> => {
    calls.push(id);
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight -= 1;
    if (fail.has(id)) return null;
    return rows.find((r) => r.id === id) ?? null;
  };
  return { read, calls, peak: () => peak };
}

// ---------------------------------------------------------------------------------------------------------------------
describe("QA3-V searchVaults' complete rules (false when a read failed, the hits were cut, a next page, or a vault failed)", () => {
  it("known answer: one vault, 3 ids, next null, every read works: complete, 3 hits", async () => {
    const rows = [value(A, "v1", "Speed one"), value(A, "v2", "Speed two"), value(A, "v3", "Speed three")];
    const r = reader(rows);
    const out = await searchVaults([A], "Speed", ["Value"], {
      search: searcher({ [A]: { ids: rows.map((x) => x.entityUri!), next: null } }) as never,
      read: r.read,
    });
    expect({ complete: out.complete, hits: out.hits.length, missed: out.vaultsMissed }).toEqual({ complete: true, hits: 3, missed: false });
  });

  it("a server that leaves out `next` is not taken as a whole answer", async () => {
    const rows = [value(A, "v1", "Speed one")];
    const out = await searchVaults([A], "Speed", ["Value"], {
      search: searcher({ [A]: { ids: [rows[0]!.entityUri!] } }) as never,
      read: reader(rows).read,
    });
    expect(out.complete).toBe(false);
  });

  it("one vault fails, the other answers: its hits are kept, the answer is not complete, vaultsMissed is set", async () => {
    const rows = [value(A, "v1", "Speed one")];
    const out = await searchVaults([A, B], "Speed", ["Value"], {
      search: searcher({ [A]: { ids: [rows[0]!.entityUri!], next: null }, [B]: "fail" }) as never,
      read: reader(rows).read,
    });
    expect({ complete: out.complete, missed: out.vaultsMissed, hits: out.hits.map((h) => h.id) }).toEqual({
      complete: false,
      missed: true,
      hits: ["v1"],
    });
  });

  it("the same ids from two vaults count once against the cap: 15 unique is complete", async () => {
    const rows = Array.from({ length: 15 }, (_, i) => value(A, `v${i}`, `Speed ${i}`));
    const ids = rows.map((x) => x.entityUri!);
    const out = await searchVaults([A, B], "Speed", ["Value"], {
      search: searcher({ [A]: { ids, next: null }, [B]: { ids, next: null } }) as never,
      read: reader(rows).read,
    });
    expect({ complete: out.complete, hits: out.hits.length }).toEqual({ complete: true, hits: 15 });
  });

  it("exactly 20 ids is complete; 21 is not, and only 20 are read, at most 6 at a time", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => value(A, `v${String(i).padStart(2, "0")}`, `Speed ${i}`));
    const twenty = reader(rows);
    const at20 = await searchVaults([A], "Speed", ["Value"], {
      search: searcher({ [A]: { ids: rows.slice(0, 20).map((x) => x.entityUri!), next: null } }) as never,
      read: twenty.read,
    });
    const r21 = reader(rows);
    const at21 = await searchVaults([A], "Speed", ["Value"], {
      search: searcher({ [A]: { ids: rows.map((x) => x.entityUri!), next: null } }) as never,
      read: r21.read,
    });
    expect({
      c20: at20.complete,
      c21: at21.complete,
      reads21: r21.calls.length,
      peak: Math.max(twenty.peak(), r21.peak()),
    }).toEqual({ c20: true, c21: false, reads21: 20, peak: 6 });
  });

  it("a read that comes back empty makes the answer not complete", async () => {
    const rows = [value(A, "v1", "Speed one"), value(A, "v2", "Speed two")];
    const out = await searchVaults([A], "Speed", ["Value"], {
      search: searcher({ [A]: { ids: rows.map((x) => x.entityUri!), next: null } }) as never,
      read: reader(rows, new Set(["v2"])).read,
    });
    expect({ complete: out.complete, hits: out.hits.map((h) => h.id) }).toEqual({ complete: false, hits: ["v1"] });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("QA3-W planRowCache (a missing ETag is null)", () => {
  function grid(etag: string | null, updatedAt: number, name = "x"): GridRecord {
    return {
      ...(value(A, "fn", name) as GridRecord),
      typeUri: "t:Function",
      etag,
      updatedAt,
      served: { facts: { name }, context: undefined, etag },
    };
  }

  function client(list: GridRecord[] | null, read: BaseRecord | null): QueryClient {
    const qc = new QueryClient();
    if (list) {
      qc.setQueryData(recordsKey(A), {
        pages: [{ records: list, total: list.length, complete: true, pageSize: 50, offset: 0 }],
        pageParams: [0],
      });
    }
    if (read) qc.setQueryData(planRecordKey(read.id, read.entityUri ?? null), read);
    return qc;
  }

  it("applyPatch with no ETag in the answer stores null, both on the row and on served", () => {
    const next = applyPatch(grid('"e1"', 1), { name: "y" }, null);
    expect({ etag: next.etag, served: next.served?.etag, name: next.facts.name }).toEqual({ etag: null, served: null, name: "y" });
  });

  it("liveRow: the row this card just saved (newer, null ETag) is not replaced by an older row that still has an ETag", () => {
    const saved = grid(null, 10, "saved");
    const qc = client([saved], saved);
    const out = liveRow(qc, A, "fn", grid('"e1"', 5, "old"));
    expect({ etag: out.etag, name: out.facts.name }).toEqual({ etag: null, name: "saved" });
  });

  it("liveRow: with nothing cached, the fallback is used and nothing is written to the screen list", () => {
    const qc = client(null, null);
    const out = liveRow(qc, A, "fn", grid('"e1"', 5));
    expect({ etag: out.etag, list: qc.getQueryData(recordsKey(A)) ?? null }).toEqual({ etag: '"e1"', list: null });
  });
});
