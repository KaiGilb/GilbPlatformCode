// An in-memory vault for the tests: the server the write layer talks to through the fake host. It keeps records by id, bumps a
// record's version on every write, answers 409 to a tag another record holds, and can be told to fail a write. What it did is
// logged (`creates`, `patches`, `deletes`, ...) so a test reads what reached the server, in the order it reached it.
//
// The options say which checks a test wants: `ifMatch` makes a patch conditional on the version (a stale version is a
// ConflictError), `patchTagCheck` answers 409 to a patch that takes a tag another record holds.

export type Srv = { id: string; typeUri: string; served: Record<string, unknown>; n: number };

export const HOST_URL = "https://h.example.test";
export const entityUriOf = (id: string) => `${HOST_URL}/base/e/${id}`;

/** The failure of a conditional write whose version is stale (the 412 class). */
export class ConflictError extends Error {
  status = 412;
  constructor() {
    super("The record changed first.");
  }
}

/** The failure of a write that is not allowed. */
export class ForbiddenError extends Error {
  status = 403;
  constructor() {
    super("Not allowed.");
  }
}

const statusError = (message: string, status: number) => Object.assign(new Error(message), { status });

export interface ServerOptions {
  /** A patch that carries `ifMatch` is refused with a ConflictError when it is not the record's version. */
  ifMatch?: boolean;
  /** A patch whose `unitTag` another record holds is refused with a 409. */
  patchTagCheck?: boolean;
}

export function createServer(options: ServerOptions = {}) {
  const recs = new Map<string, Srv>();
  const s = {
    options,
    recs,
    made: 0,
    createCount: 0,
    patchCount: 0,
    creates: [] as { vault: string; typeUri: string; facts: Record<string, unknown> }[],
    patches: [] as { id: string; body: Record<string, unknown> }[],
    /** The same patches as the transport spells them for a slug the vault did not serve: `a:<slug>`. */
    wire: [] as { id: string; body: Record<string, unknown> }[],
    /** Every patch with the version it was conditional on, in order. */
    log: [] as { id: string; body: Record<string, unknown>; ifMatch: string | null }[],
    deletes: [] as string[],
    deleteArgs: [] as { id: string; ifMatch: string | null }[],
    reads: [] as { id: string; at: string | null }[],
    /** The nth create (1-based) answers 500. */
    failCreate: new Set<number>(),
    /** The nth patch (1-based) answers 500. */
    failPatch: new Set<number>(),
    failDelete: new Set<string>(),
    /** The delete of this id answers this status: 404, or 412 as the conflict class. */
    deleteStatus: new Map<string, number>(),
    /** A patch to this id answers 412 as the conflict class, whatever version it carries. */
    stale: new Set<string>(),
    reset() {
      recs.clear();
      s.made = 0;
      s.createCount = 0;
      s.patchCount = 0;
      // In place: a test may hold the array.
      for (const list of [s.creates, s.patches, s.wire, s.log, s.deletes, s.deleteArgs, s.reads] as unknown[][]) list.length = 0;
      s.failCreate = new Set();
      s.failPatch = new Set();
      s.failDelete = new Set();
      s.deleteStatus = new Map();
      s.stale = new Set();
    },
    get(id: string) {
      return recs.get(id);
    },
    set(rec: Srv) {
      recs.set(rec.id, rec);
    },
    tagTaken(id: string, tag: unknown) {
      return typeof tag === "string" && [...recs.values()].some((o) => o.id !== id && o.served.unitTag === tag);
    },
    asRow(rec: Srv) {
      return {
        id: rec.id,
        entityUri: entityUriOf(rec.id),
        typeUri: rec.typeUri,
        facts: Object.fromEntries(
          Object.entries(rec.served).map(([k, v]) => [k, typeof v === "string" ? v : typeof v === "number" ? String(v) : JSON.stringify(v)]),
        ),
        opaqueFacts: [] as string[],
        etag: `"v${rec.n}"`,
        updatedAt: Date.now(),
        servedKeys: Object.keys(rec.served),
        served: { facts: { ...rec.served }, context: undefined, etag: `"v${rec.n}"` },
      };
    },
    async read(id: string, at: string | null) {
      s.reads.push({ id, at });
      const rec = recs.get(id);
      return rec ? s.asRow(rec) : null;
    },
    async patch(id: string, patch: Record<string, unknown>, pre?: { ifMatch?: string | null }) {
      s.patchCount += 1;
      s.patches.push({ id, body: patch });
      s.wire.push({ id, body: Object.fromEntries(Object.entries(patch).map(([k, v]) => [`a:${k}`, v])) });
      s.log.push({ id, body: patch, ifMatch: pre?.ifMatch ?? null });
      if (s.failPatch.has(s.patchCount)) throw statusError("boom", 500);
      if (s.stale.has(id)) throw new ConflictError();
      const rec = recs.get(id)!;
      if (options.ifMatch && pre?.ifMatch && pre.ifMatch !== `"v${rec.n}"`) throw new ConflictError();
      if (options.patchTagCheck && s.tagTaken(id, patch.unitTag)) throw statusError("tag", 409);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete rec.served[k];
        else rec.served[k] = v;
      }
      rec.n += 1;
      return { etag: `"v${rec.n}"` };
    },
    async create(vault: string, typeUri: string, facts: Record<string, unknown>) {
      s.createCount += 1;
      if (s.failCreate.has(s.createCount)) throw statusError("create refused", 500);
      if (s.tagTaken("", facts.unitTag)) throw statusError("tag", 409);
      s.creates.push({ vault, typeUri, facts });
      s.made += 1;
      const id = `made${s.made}`;
      recs.set(id, { id, typeUri, served: { ...facts }, n: 1 });
      return { id, etag: '"v1"' };
    },
    async del(id: string, _at: string | null, pre?: { ifMatch?: string | null }) {
      s.deleteArgs.push({ id, ifMatch: pre?.ifMatch ?? null });
      const status = s.deleteStatus.get(id);
      if (status === 404) throw statusError("gone", 404);
      if (status === 412) throw new ConflictError();
      if (s.failDelete.has(id)) throw statusError("delete refused", 500);
      s.deletes.push(id);
      recs.delete(id);
    },
    /** The entity addresses of the records that are a part of `parentUri`. */
    partsOf(parentUri: string): string[] {
      return [...recs.values()]
        .filter((r) => (r.served.partOf as { "@id"?: string } | undefined)?.["@id"] === parentUri)
        .map((r) => entityUriOf(r.id));
    },
  };
  return s;
}

export type Server = ReturnType<typeof createServer>;
