// Test-only. The four relation doors the kind-as-relation code uses, over one in-memory store, so a test can see exactly what was written
// (type, the two roles and the extra facts), what the reverse lookup says and what an END does. Copied from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/contact/__fixtures__/relationStoreFake.ts`, unchanged except these header lines. The real doors are covered at the wire by the `kind-relation` unit.
import { vi } from "vitest";

export interface FakeRelation {
  id: string;
  uri: string;
  type: string;
  source: string;
  target: string;
  extra: Record<string, unknown>;
  vault: string | null | undefined;
  ended: boolean;
}

export const rels = new Map<string, FakeRelation>();
export const fail = { write: false, readBack: false, end: false, lookup: false };
/** How a PUT to the id of an ENDED relation behaves (the platform's answer is measured): revive it, refuse it (409), or accept and leave it ended. */
export const ended = { put: "revive" as "revive" | "refuse" | "keep-ended" };

export function resetRelationStore(): void {
  rels.clear();
  fail.write = fail.readBack = fail.end = fail.lookup = false;
  ended.put = "revive";
  writePairRelation.mockClear();
  endRelation.mockClear();
  readRelations.mockClear();
  readRelationDoc.mockClear();
}

const tail = (u: string) => u.slice(u.lastIndexOf("/") + 1);

export const writePairRelation = vi.fn(async (input: { sourceId: string; targetId: string; sourceEntityUri?: string | null; targetEntityUri?: string | null; typeCurie?: string; relationId?: string; vaultNamespace?: string | null; extraFacts?: Record<string, unknown> }) => {
  if (fail.write) throw new Error("relation write failed: 403 refused");
  const id = tail(input.relationId ?? `new${rels.size + 1}`);
  const uri = `${(input.vaultNamespace ?? "").replace(/\/+$/, "")}/r/${id}`;
  const had = rels.has(uri);
  const was = rels.get(uri);
  if (was?.ended && ended.put === "refuse") throw new Error("relation write failed: 409 ended");
  if (was?.ended && ended.put === "keep-ended") return { id, changed: false, uri };
  rels.set(uri, { id, uri, type: input.typeCurie ?? "", source: input.sourceEntityUri ?? input.sourceId, target: input.targetEntityUri ?? input.targetId, extra: input.extraFacts ?? {}, vault: input.vaultNamespace, ended: false });
  return { id, changed: !had, uri };
});

export const endRelation = vi.fn(async (uri: string) => {
  if (fail.end) throw new Error("Not ended: the vault refused (403).");
  const r = rels.get(uri);
  if (!r) return { relation: null, changed: false, verified: null };
  r.ended = true;
  return { relation: uri, changed: true, verified: true };
});

export const readRelations = vi.fn(async (_id: string, at: string | null) => {
  if (fail.lookup) throw new Error("relations read failed: 500");
  return [...rels.values()]
    .filter((r) => !r.ended && (r.source === at || r.target === at))
    .map((r) => ({
      relation: r.uri,
      role: r.source === at ? "role:source" : "role:target",
      type: r.type,
      members: [
        { member: r.source, role: "role:source" },
        { member: r.target, role: "role:target" },
      ],
    }));
});

export const readRelationDoc = vi.fn(async (uri: string) => {
  const r = rels.get(uri);
  if (!r || fail.readBack) return null;
  if (r.ended) return { id: r.id, uri, typeCurie: null, sourceUri: null, targetUri: null, extras: {} };
  return { id: r.id, uri, typeCurie: r.type, sourceUri: r.source, targetUri: r.target, extras: r.extra };
});

export const relationsLive = () => [...rels.values()].filter((r) => !r.ended);
