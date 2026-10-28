// A host for the level readers, standing in for what the app's query cache and find answered in the app's tests.
// Every call is logged in the order it was made; finds and reads can take real time, so "in flight" means in flight.
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { LevelHost } from "../src/planLevelRead";

export const ORIGIN = "https://vault.example.test";
export const VAULT = `${ORIGIN}/base`;
export const OTHER = "https://other.example.test";

export function ent(id: string, origin = ORIGIN): string {
  return `${origin}/base/e/${id}`;
}

const tail = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);

export type Node = { id: string; parent: string; type?: string; origin?: string; tag?: string; order?: number | null };

export function recordOf(n: Node): BaseRecord {
  const served: Record<string, unknown> = { unitTag: n.tag ?? `Walk.${n.id.toUpperCase()}`, partOf: { "@id": ent(n.parent) } };
  if (n.order != null) served.elementOrder = n.order;
  return {
    id: n.id,
    entityUri: ent(n.id, n.origin),
    typeUri: n.type ?? "t:SpecificationElement",
    facts: { unitTag: n.tag ?? `Walk.${n.id.toUpperCase()}`, partOf: ent(n.parent) },
    opaqueFacts: [],
    etag: '"e"',
    served: { facts: served, context: undefined, etag: '"e"' },
  };
}

export class FakeHost implements LevelHost {
  log: string[] = [];
  /** Child ids by parent id, in the order the find answers them. */
  kids = new Map<string, string[]>();
  /** What a read answers, by id. A missing id is an unreadable record (null). */
  rows = new Map<string, BaseRecord>();
  /** Rows the host pins in front of a fresh list, and ids it drops from it. */
  pins: BaseRecord[] = [];
  drops = new Set<string>();
  /** Milliseconds each find, read and mark-stale takes. */
  findMs = 0;
  readMs = 0;
  staleMs = 0;
  /** Extra milliseconds for one read, by id. */
  readExtraMs = new Map<string, number>();
  failFind: (parentId: string) => boolean = () => false;
  failRead: (id: string) => boolean = () => false;
  finds = 0;
  reads = 0;
  peak = 0;
  inFlight = 0;
  staleDone = 0;
  staleSent = 0;
  /** True if a fresh read began while a mark-stale it follows had not yet settled. */
  readBeforeStale = false;
  applied: { planVault: string; attr: string; parentId: string; rowIds: string[]; serverIds: string[] }[] = [];

  constructor(nodes: Node[] = []) {
    this.load(nodes);
  }

  load(nodes: Node[]): void {
    for (const n of nodes) {
      this.kids.set(n.parent, [...(this.kids.get(n.parent) ?? []), n.id]);
      this.rows.set(n.id, recordOf(n));
    }
  }

  private async busy<T>(ms: number, fn: () => T): Promise<T> {
    this.inFlight += 1;
    this.peak = Math.max(this.peak, this.inFlight);
    try {
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      else await Promise.resolve();
      return fn();
    } finally {
      this.inFlight -= 1;
    }
  }

  async pageChildIds(planVault: string, parentUri: string, opts: { cap: number }) {
    const parent = tail(parentUri);
    this.log.push(`page ${parent} cap=${opts.cap} vault=${planVault}`);
    this.finds += 1;
    return this.busy(this.findMs, () => {
      if (this.failFind(parent)) throw new Error("find failed");
      const all = (this.kids.get(parent) ?? []).map((id) => this.rows.get(id)?.entityUri ?? ent(id));
      if (all.length > opts.cap) return { ids: all.slice(0, opts.cap), count: all.length, capped: true };
      return { ids: all, count: all.length, capped: false };
    });
  }

  async markStale(entityUri: string): Promise<void> {
    this.log.push(`stale ${tail(entityUri)}`);
    this.staleSent += 1;
    if (this.staleMs > 0) await new Promise((r) => setTimeout(r, this.staleMs));
    else await Promise.resolve();
    this.staleDone += 1;
  }

  async readMember(entityUri: string, fresh: boolean): Promise<BaseRecord | null> {
    const id = tail(entityUri);
    this.log.push(`read ${id} ${fresh ? "fresh" : "cached"}`);
    if (fresh && this.staleDone < this.staleSent) this.readBeforeStale = true;
    this.reads += 1;
    return this.busy(this.readMs + (this.readExtraMs.get(id) ?? 0), () => {
      if (this.failRead(id)) throw new Error("read failed");
      return this.rows.get(id) ?? null;
    });
  }

  applyPinsAndDrops(planVault: string, attr: string, parentId: string, rows: BaseRecord[], serverIds: ReadonlySet<string>): BaseRecord[] {
    this.log.push("apply");
    this.applied.push({ planVault, attr, parentId, rowIds: rows.map((r) => r.id), serverIds: [...serverIds] });
    const seen = new Set(rows.map((r) => r.id));
    const extras = this.pins.filter((r) => !seen.has(r.id));
    return [...extras, ...rows].filter((r) => !this.drops.has(r.id));
  }
}
