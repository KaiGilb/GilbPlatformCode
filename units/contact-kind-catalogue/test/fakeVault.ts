// Test-only: an in-memory vault behind the host's two vault-record calls (`createResource`, `getResource`), the typed list of the
// vault-sets peer and the term spellings of the term-slots peer. It keeps what a vault keeps: one entity per create, the facts under the STORED key
// (`a:` + the slug the door is handed), served back under the framed WIRE key (one `a:` taken off), merge-patch with `null` clearing a key,
// DELETE retracting the entity, and the typed list (`?type=<bare name>`) in last-write-first order, so a reader that trusted the list order would show it.
import { vi } from "vitest";
import type { OwnKindsHost } from "../src/ownKinds";

export const VAULT = "https://hytta.example.test/base";

interface Entity {
  type: string;
  facts: Record<string, unknown>;
  seq: number;
  /** The vault the entity is held in (Agent.Scaling Delta7 F5: the store keeps entities per vault). */
  vault?: string;
}

export const store = new Map<string, Entity>();
let n = 0;
let writeSeq = 0;

/** A bare uuidv7-base32-shaped id: ascending in mint order, as Base's are. */
function mint(): string {
  n += 1;
  return `06gk${String(n).padStart(22, "0")}`;
}

export function resetStore(): void {
  store.clear();
  n = 0;
  writeSeq = 0;
  createRecord.mockClear();
  patchRecord.mockClear();
  deleteRecord.mockClear();
  readRecord.mockClear();
  listVaultRecordsPage.mockClear();
}

/** Put a document in the store as ANOTHER app wrote it (keys already stored, e.g. `a:claimSubject`). */
export function seed(type: string, storedFacts: Record<string, unknown>, id = mint(), vault = VAULT): string {
  store.set(id, { type, facts: { ...storedFacts }, seq: ++writeSeq, vault });
  return id;
}

const wireKey = (k: string) => (k.startsWith("a:") ? k.slice(2) : k);

export const createRecord = vi.fn(async (vault: string, type: string, facts: Record<string, unknown>) => {
  void vault;
  const stored: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(facts)) stored[`a:${k}`] = v;
  const id = mint();
  store.set(id, { type, facts: stored, seq: ++writeSeq, vault });
  return { id, etag: `"${writeSeq}"` };
});

export const readRecord = vi.fn(async (id: string, at: string | null) => {
  void at;
  const e = store.get(id);
  if (!e) return null;
  const served: Record<string, unknown> = {};
  const facts: Record<string, string> = {};
  for (const [k, v] of Object.entries(e.facts)) {
    served[wireKey(k)] = v;
    facts[wireKey(k)] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return {
    id,
    entityUri: `${e.vault ?? VAULT}/e/${id}`,
    typeUri: e.type,
    facts,
    servedKeys: Object.keys(facts),
    etag: `"${e.seq}"`,
    served: { facts: served, context: undefined, etag: `"${e.seq}"` },
  };
});

export const patchRecord = vi.fn(async (id: string, patch: Record<string, unknown>, at: string | null) => {
  void at;
  const e = store.get(id);
  if (!e) throw new Error(`404 ${id}`);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete e.facts[`a:${k}`];
    else e.facts[`a:${k}`] = v;
  }
  e.seq = ++writeSeq;
  return { etag: `"${e.seq}"` };
});

export const deleteRecord = vi.fn(async (id: string, at: string | null) => {
  void at;
  store.delete(id);
});

export const listVaultRecordsPage = vi.fn(async (vault: string, types: readonly string[] = [], offset = 0) => {
  const want = types[0] ?? "";
  const rows = [...store.entries()]
    .filter(([, e]) => e.type.replace(/^t:/, "") === want)
    // Base: `updated_at DESC` — the newest write first.
    .sort(([, a], [, b]) => b.seq - a.seq)
    .map(([id, e]) => ({ id, entityUri: `${vault}/e/${id}`, typeUri: e.type, updatedAt: e.seq, label: null }));
  return { records: rows.slice(offset), total: rows.length, complete: true, pageSize: 100, offset };
});

/** The master's answers: a term name's spelling is the name itself (as the live master binds them). */
export const attributeSpelling = vi.fn(async (name: string) => name);
export const typeSpelling = vi.fn(async (name: string) => `t:${name}`);

/** MyNet `token.ts` `entityUriInVault`, as the host's calls build an address: a vault namespace + opaque id gives the entity URI. */
const entityUriInVault = (vaultId: string, id: string): string => `${vaultId.replace(/\/$/, "")}/e/${id}`;

/** The host, as the app's place library answers its two calls over its own record client (here the in-memory vault). */
export const host: OwnKindsHost = {
  createResource: async (vaultId, body) => {
    const facts: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.facts)) facts[k.startsWith("a:") ? k.slice(2) : k] = v;
    const { id, etag } = await createRecord(vaultId, body.type, facts);
    return { id, location: entityUriInVault(vaultId, id), etag };
  },
  getResource: async (id, vaultId, entityUri) => {
    const rec = await readRecord(id, entityUri ?? entityUriInVault(vaultId, id));
    if (!rec) return { doc: {}, etag: null, gone: true };
    return { doc: rec.served?.facts ?? rec.facts, etag: rec.etag ?? null, gone: false, ...(rec.typeUri ? { typeUri: rec.typeUri } : {}) };
  },
};
