// The main tag of a record, or of a page of records, read from the platform and kept in one shared cache.
//
// A record's tag is the platform's: it makes one when the record is created. This file asks for it at the record's OWN vault origin, signed
// for each request, one call for a record and one call for fifty records of a vault, and keeps the answers under two query keys:
//   ["main-tag", entityUri]                       one record
//   ["main-tags", vault, ...sortedEntityUris]     one batch of a vault
// A writer of tags makes every reader read again by invalidating both heads.
import { useMemo } from "react";
import { useQuery, useQueries, type QueryClient } from "@tanstack/react-query";
import { readMainTags, MASTERS_BATCH_MAX, type MainTagRead } from "@kaigilb/gilbplatformcode-tag-client";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { platformFetch } from "@kaigilb/gilbplatformcode-platform-fetch";
import { boundAwait } from "@kaigilb/gilbplatformcode-lws-relations";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { needsMainTag } from "./needsMainTag";

/** How long a tag read may take before it is called unreadable. */
export const TAG_READ_BOUND_MS = 12_000;
export { MASTERS_BATCH_MAX };

export const mainTagKey = (entityUri: string) => ["main-tag", entityUri] as const;
/** The key of one batch main-tag read: the vault and the sorted records asked. */
export const mainTagsKey = (vault: string, entityUris: readonly string[]) => ["main-tags", vault, ...[...entityUris].sort()] as const;

const originOf = (entityUri: string) => vaultOriginOf(entityUri).replace(/\/+$/, "");

/** The vault a record lives in, from its own address: everything before `/e/<id>` (`https://ann.example.test/base`). */
export function vaultOfEntity(entityUri: string): string | null {
  const m = /^(https?:\/\/[^/]+\/(?:base|vault))\/e\/[^/?#]+$/.exec(entityUri.trim());
  return m ? m[1]! : null;
}

/**
 * The package's platform client for ONE record: the record's own vault origin and the app's DPoP-signed fetch, bounded so a silent service ends as an error.
 * ⛔ Never the apex. (`cache: no-store` is the package's own for its reads.)
 */
export function tagPlatformFor(entityUri: string): PlatformClient {
  const sign = platformFetch();
  return {
    origin: originOf(entityUri),
    fetch: (url, init) => boundAwait(sign(url, init), TAG_READ_BOUND_MS, "reaching the tag service"),
  };
}

/** One record's main tag, or why it cannot be stated. */
export type MainTag = MainTagRead;

/** `readMainTags` (POST /base/tag/masters) for at most {@link MASTERS_BATCH_MAX} records of ONE vault: one call. */
export async function readMasterTags(vault: string, entityUris: readonly string[]): Promise<Map<string, MainTag>> {
  if (entityUris.length === 0) return new Map();
  if (entityUris.length > MASTERS_BATCH_MAX) throw new Error(`at most ${MASTERS_BATCH_MAX} records in one read`);
  return readMainTags(tagPlatformFor(entityUris[0]!), vault, entityUris);
}

/** One record's main tag, from the batch route (one call): the single source of "the tag of this record". Key `["main-tag", entityUri]`. */
export function useMainTag(entityUri: string | null | undefined) {
  const vault = entityUri ? vaultOfEntity(entityUri) : null;
  return useQuery<MainTag, Error>({
    queryKey: mainTagKey(entityUri ?? ""),
    queryFn: async () => (await readMasterTags(vault!, [entityUri!])).get(entityUri!) ?? { tag: null, known: false },
    enabled: !!entityUri && !!vault,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * The main tags of a page of records: ONE batch call per vault per 50 records (a list page). Records of other vaults are asked at their own vaults.
 * Answers a map by record address; a record not yet answered is absent.
 */
export function useMainTags(entityUris: readonly string[]): { tags: ReadonlyMap<string, MainTag>; pending: boolean } {
  const groups = useMemo(() => {
    const byVault = new Map<string, string[]>();
    for (const u of entityUris) {
      const v = vaultOfEntity(u);
      if (!v) continue;
      byVault.set(v, [...(byVault.get(v) ?? []), u]);
    }
    const out: { vault: string; uris: string[] }[] = [];
    for (const [vault, uris] of byVault) for (let i = 0; i < uris.length; i += MASTERS_BATCH_MAX) out.push({ vault, uris: uris.slice(i, i + MASTERS_BATCH_MAX) });
    return out;
  }, [entityUris]);
  const results = useQueries({
    queries: groups.map((g) => ({
      queryKey: mainTagsKey(g.vault, g.uris),
      queryFn: () => readMasterTags(g.vault, g.uris),
      staleTime: 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });
  const tags = useMemo(() => {
    const m = new Map<string, MainTag>();
    for (const r of results) if (r.data) for (const [k, v] of r.data) m.set(k, v);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.dataUpdatedAt).join(",")]);
  return { tags, pending: results.some((r) => r.isPending) };
}

/** A row that may be named by its main tag: its address and its facts. */
export interface MainTagRow {
  entityUri?: string | null;
  facts: Record<string, string | undefined> | null | undefined;
}

/** The addresses of the rows whose chrome name would fall past the tag step (no name, no label, no `unitTag`/`tag`): only those are asked, deduplicated. */
export function rowsNeedingMainTag(rows: readonly MainTagRow[]): string[] {
  const out = new Set<string>();
  for (const r of rows) if (r.entityUri && vaultOfEntity(r.entityUri) && needsMainTag(r.facts)) out.add(r.entityUri);
  return [...out];
}

const knownTags = (m: ReadonlyMap<string, MainTag>): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [uri, t] of m) if (t.known && t.tag) out.set(uri, t.tag);
  return out;
};

/**
 * The main tags of the rows of a list (or a pool), for the rows that need one to be named: ONE batch call per vault per 50 rows, never one per row. The
 * answer is a map from a record address to its main tag; a row not in it keeps the name it had. Shares the cache (and the invalidation) of {@link useMainTags}.
 */
export function useMainTagsForRows(rows: readonly MainTagRow[]): ReadonlyMap<string, string> {
  const key = rowsNeedingMainTag(rows).join("\n");
  const uris = useMemo(() => (key === "" ? [] : key.split("\n")), [key]);
  const { tags } = useMainTags(uris);
  return useMemo(() => knownTags(tags), [tags]);
}

/** The same, for code that is not a component (a search): one batch call per vault per 50 rows, through the query client's cache. A group that cannot be read gives no tags. */
export async function fetchMainTagsForRows(qc: QueryClient, rows: readonly MainTagRow[]): Promise<Map<string, string>> {
  const byVault = new Map<string, string[]>();
  for (const u of rowsNeedingMainTag(rows)) {
    const v = vaultOfEntity(u)!;
    byVault.set(v, [...(byVault.get(v) ?? []), u]);
  }
  const out = new Map<string, string>();
  for (const [vault, uris] of byVault) {
    for (let i = 0; i < uris.length; i += MASTERS_BATCH_MAX) {
      const chunk = uris.slice(i, i + MASTERS_BATCH_MAX);
      try {
        const got = await qc.fetchQuery({ queryKey: mainTagsKey(vault, chunk), queryFn: () => readMasterTags(vault, chunk), staleTime: 60_000 });
        for (const [uri, tag] of knownTags(got)) out.set(uri, tag);
      } catch {
        /* a group that cannot be read: its rows keep the name they had */
      }
    }
  }
  return out;
}
