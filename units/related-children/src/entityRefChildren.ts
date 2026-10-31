// Reverse member-of: who points at this record with a:memberOf?
//
// Containment is a fact (`a:memberOf` -> `{ "@id": parent }`), not a relation, so the hop walk never sees children. The find
// page is 20 by default, which is why a parent with many children showed only a handful. Page the reverse index, union the
// records already in the query cache (the child that was just open), hydrate a bounded set, disclose the total.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { entityRefFromFact, entityRefsOf } from "@kaigilb/gilbplatformcode-entity-ref";
import { readRecord, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { SKIP_SLUGS } from "@kaigilb/gilbplatformcode-plan-links-model";
import { cacheRowsOf } from "@kaigilb/gilbplatformcode-record-detail-reads";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { idFromEntityUri, pageAllByAttribute } from "@kaigilb/gilbplatformcode-lws-vault-sets";

/** Stored predicateAttribute of t:MemberOf — the geo catalogue write key. */
export const MEMBER_OF_ATTR = "a:memberOf";

/** One find-by-attribute page (Base ATTR_FIND_PAGE_MAX). */
export const MEMBER_OF_FIND_PAGE = 200;

/** Hydrate cap — keep seed(100)+children ≤ EDGE_ASSEMBLY_MAX(200). */
export const MEMBER_OF_HYDRATE_CAP = 80;

/** Stop paging IDs past this (US admin-7 is thousands). */
const MEMBER_OF_ID_CAP = 600;

export type MemberOfChildren = {
  records: BaseRecord[];
  /** Authorized reverse-index total (`count`), not the hydrated page. */
  total: number;
};

function asRecord(row: Record<string, unknown>): BaseRecord | null {
  if (typeof row.id !== "string" || !row.id) return null;
  const facts = row.facts;
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return null;
  return {
    id: row.id,
    entityUri: typeof row.entityUri === "string" ? row.entityUri : undefined,
    typeUri: typeof row.typeUri === "string" ? row.typeUri : "",
    facts: facts as Record<string, string>,
    // 🔴 The exact mirror of `asCachedBaseRecord` in `record-detail-reads`. Both REBUILD a BaseRecord field by field, so both
    // silently drop anything not named here. Neither consumer of this mapper (the children list, a graph) saves a record, so this
    // carry is latent insurance, kept deliberately so the mirror cannot drift from its twin.
    opaqueFacts: Array.isArray(row.opaqueFacts) ? (row.opaqueFacts as readonly string[]) : [],
    etag: typeof row.etag === "string" ? row.etag : null,
  };
}

/** Records already in React Query whose a URI-fact names `parentUri`. */
export function cachedRecordsPointingAt(qc: QueryClient, parentUri: string): BaseRecord[] {
  const keys = new Set<string>([parentUri]);
  const parsed = entityRefFromFact(parentUri);
  if (parsed) {
    keys.add(parsed.id);
    keys.add(parsed.uri);
  }
  const out: BaseRecord[] = [];
  const seen = new Set<string>();
  for (const [, data] of qc.getQueriesData({ queryKey: ["base"] })) {
    for (const row of cacheRowsOf(data)) {
      if (!row || typeof row !== "object") continue;
      const rec = asRecord(row as Record<string, unknown>);
      if (!rec || seen.has(rec.id)) continue;
      for (const ref of entityRefsOf(rec, SKIP_SLUGS)) {
        if (keys.has(ref.id) || keys.has(ref.uri)) {
          seen.add(rec.id);
          out.push(rec);
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Every record whose `a:memberOf` names `parentUri`, paged, up to {@link MEMBER_OF_ID_CAP}.
 *
 * 🔴 Asked at the PARENT'S OWN HOST (`vaultOriginOf(parentUri)`), ⛔ not the apex. The route answers only from the store behind the
 * host asked: the apex reaches one store, so a parent in a vault minted since 2026-08-20 (its own store, its own host) showed no
 * children, with no error. The DPoP proof is signed for the URL fetched, so for that host. A system-vault parent is asked at its
 * own host. A parent with no host to route by (a bare id) is asked at the base address, as before.
 * ⚠ Children kept in a DIFFERENT store from their parent are not found here; that needs the platform.
 */
export async function findAllMemberOfIds(parentUri: string): Promise<{ count: number; ids: string[] }> {
  const page = await pageAllByAttribute(MEMBER_OF_ATTR, { "@id": parentUri }, vaultOriginOf(parentUri), {
    pageSize: MEMBER_OF_FIND_PAGE,
    cap: MEMBER_OF_ID_CAP,
  });
  return { count: page.count, ids: page.ids };
}

export async function loadMemberOfChildren(
  parentUri: string,
  qc?: QueryClient,
): Promise<MemberOfChildren> {
  const cached = qc ? cachedRecordsPointingAt(qc, parentUri) : [];
  const found = await findAllMemberOfIds(parentUri);
  const have = new Set(cached.map((r) => r.entityUri ?? r.id));
  const room = Math.max(0, MEMBER_OF_HYDRATE_CAP - cached.length);
  const toHydrate = found.ids.filter((uri) => !have.has(uri) && !have.has(idFromEntityUri(uri))).slice(0, room);
  const settled = await Promise.all(
    toHydrate.map((uri) => readRecord(idFromEntityUri(uri), uri).catch(() => null)),
  );
  const records = [...cached];
  const seen = new Set(cached.map((r) => r.id));
  for (const r of settled) {
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    records.push(r);
  }
  return { records, total: Math.max(found.count, records.length) };
}

export function useMemberOfChildren(parentUri: string | null | undefined) {
  const qc = useQueryClient();
  return useQuery<MemberOfChildren, Error>({
    queryKey: ["base", "memberOfChildren", parentUri ?? "none"] as const,
    queryFn: () => loadMemberOfChildren(parentUri!, qc),
    enabled: !!parentUri,
    staleTime: 30_000,
  });
}
