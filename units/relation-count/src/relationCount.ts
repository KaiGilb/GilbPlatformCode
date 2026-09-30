/**
 * Which record ids stay on screen at a hop depth from the selected record.
 *
 * The URL value is 1, 2, 3, or all. The query key is `grc`. An empty value
 * means hop 2, not the whole graph.
 *
 * Distance is a breadth-first hop count on co-membership. Two records that
 * share one relation URI are one hop apart. A line drawn through a hub is
 * still one hop, not two.
 *
 * The last-segment cut used on a member address is a private copy of uriTail
 * from units/id-tail. It must stay the same function: strip ? and #, strip
 * trailing slashes, decode once, and on a failed decode return the encoded
 * segment.
 */

export type RelationCountFilter = "1" | "2" | "3" | "all";

export const RELATION_COUNT_FILTER_VALUES: readonly RelationCountFilter[] = [
  "1",
  "2",
  "3",
  "all",
] as const;

/** Query key. Do not rename it. Old share links use `grc`. */
export const RELATION_COUNT_URL_PARAM = "grc";

/** What an empty or unknown `grc` value means. */
export const DEFAULT_RELATION_COUNT_FILTER: RelationCountFilter = "2";

/** Most record ids a capped list may keep. The selected id is kept when it is already in the list. */
export const GRAPH_NODE_CAP = 100;

/**
 * One participation row from a reverse lookup the host already holds.
 * This unit does not fetch it.
 */
export interface RecordRelation {
  /** Relation URI. An empty string is ignored by the counters. */
  relation: string;
  role: string;
  /**
   * Co-members named on this row, when the vault sent them.
   * Absent on an older answer. Do not treat absence as "no partners".
   */
  members?: readonly { member: string; role: string }[];
  type?: string;
}

/** Last segment after removing the query and the hash. Same rule as id-tail uriTail. */
function opaqueIdFromUri(uri: string): string {
  const clean = uri.split(/[?#]/)[0]?.replace(/\/+$/, "") ?? "";
  const seg = clean.slice(clean.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(seg) || uri;
  } catch {
    return seg || uri;
  }
}

/**
 * Parse `grc`. Only the four exact strings are accepted.
 * Null, undefined, "", and any other text become the hop-2 default.
 * "4", ">=2", "All", and " 1" are not accepted. They are not trimmed.
 */
export function parseRelationCountFilter(raw: string | null | undefined): RelationCountFilter {
  if (raw === "1" || raw === "2" || raw === "3" || raw === "all") return raw;
  return DEFAULT_RELATION_COUNT_FILTER;
}

/**
 * Write `grc`. The hop-2 default is omitted (null), so a share link stays short.
 * "1", "3", and "all" are written. "2" is not.
 */
export function serializeRelationCountFilter(filter: RelationCountFilter): string | null {
  return filter === DEFAULT_RELATION_COUNT_FILTER ? null : filter;
}

/**
 * Keep at most `max` ids. Order is the order given, except the selected id
 * moves to the front when it is already in the list.
 *
 * A selected id that is not in the list is not added. This function does not
 * invent ids.
 *
 * The length check happens after a push. `max` of 0 or a negative number still
 * returns one id when the list is not empty (the first kept id). Do not "fix"
 * that to an empty list. Callers pass 100.
 *
 * When the list is already within `max`, the result is a copy, not the same array.
 */
export function capVisibleRecordIds(
  ids: readonly string[],
  selectedId: string | null | undefined,
  max: number = GRAPH_NODE_CAP,
): string[] {
  if (ids.length <= max) return [...ids];
  const out: string[] = [];
  const seen = new Set<string>();
  if (selectedId && ids.includes(selectedId)) {
    out.push(selectedId);
    seen.add(selectedId);
  }
  for (const id of ids) {
    if (seen.has(id)) continue;
    out.push(id);
    seen.add(id);
    if (out.length >= max) break;
  }
  return out;
}

/** 1, 2, or 3. `all` is null, meaning no hop limit. */
export function hopDepthForFilter(filter: RelationCountFilter): number | null {
  if (filter === "1") return 1;
  if (filter === "2") return 2;
  if (filter === "3") return 3;
  return null;
}

/**
 * How many different relation URIs are in this list.
 * Empty relation strings are not counted. Duplicate URIs count once.
 * This is a diagnostic. It is not the display filter.
 * Do not pass an unresolved lookup as []. Unresolved is a missing map entry,
 * and that is what {@link countDistinctRelationsForRecord} returns null for.
 */
export function countDistinctRelationUris(rels: readonly RecordRelation[]): number {
  const seen = new Set<string>();
  for (const { relation } of rels) {
    if (relation) seen.add(relation);
  }
  return seen.size;
}

/**
 * Distinct relation URIs for one record.
 * Present in the map, even as [] → a number (0 when nothing resolved).
 * Absent from the map → null. Null means the lookup has not arrived.
 * Do not show null as 0.
 */
export function countDistinctRelationsForRecord(
  recordId: string,
  relationsByRecord: ReadonlyMap<string, readonly RecordRelation[]>,
): number | null {
  if (!relationsByRecord.has(recordId)) return null;
  const rows = relationsByRecord.get(recordId);
  if (!rows) return null;
  return countDistinctRelationUris(rows);
}

/** One entry per id. Null where that id is not in the map. */
export function relationCountsByRecord(
  recordIds: readonly string[],
  relationsByRecord: ReadonlyMap<string, readonly RecordRelation[]>,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const id of recordIds) {
    out.set(id, countDistinctRelationsForRecord(id, relationsByRecord));
  }
  return out;
}

/**
 * Record ids in `inSetIds` that are one hop from `recordId`.
 *
 * Two ways a partner is accepted. They are not the same test:
 *
 * 1. A co-member named on THIS record's own rows. The partner does not have
 *    to report the relation back. The id is the last segment of `member`
 *    (query and hash dropped, decoded once). It must be in the set, and it
 *    must not be `recordId` itself.
 * 2. Another in-set record whose own rows name a relation URI that this
 *    record also names. Both sides must carry that URI. A partner found only
 *    this way is dropped when its lookup is missing.
 *
 * An empty own list returns []. A missing own list returns [].
 * The result is not sorted.
 */
export function coMemberRecordIds(
  recordId: string,
  relationsByRecord: ReadonlyMap<string, readonly RecordRelation[]>,
  inSetIds: ReadonlySet<string>,
): string[] {
  const own = relationsByRecord.get(recordId);
  if (!own || own.length === 0) return [];
  const ownUris = new Set<string>();
  const fromMembers = new Set<string>();
  for (const rel of own) {
    if (rel.relation) ownUris.add(rel.relation);
    if (rel.members?.length) {
      for (const m of rel.members) {
        const mid = opaqueIdFromUri(m.member);
        if (mid && mid !== recordId && inSetIds.has(mid)) fromMembers.add(mid);
      }
    }
  }
  if (ownUris.size === 0 && fromMembers.size === 0) return [];

  const partners = new Set<string>(fromMembers);
  for (const otherId of inSetIds) {
    if (otherId === recordId || partners.has(otherId)) continue;
    const other = relationsByRecord.get(otherId);
    if (!other) continue;
    for (const { relation } of other) {
      if (relation && ownUris.has(relation)) {
        partners.add(otherId);
        break;
      }
    }
  }
  return [...partners];
}

/**
 * One neighbour list per record id, built by {@link coMemberRecordIds}.
 *
 * This is not forced to be symmetric. If A names B as a member and B's own
 * list is empty, A lists B and B lists nobody. A hop walk from A reaches B.
 * A hop walk from B does not reach A.
 */
export function buildRecordAdjacency(
  recordIds: readonly string[],
  relationsByRecord: ReadonlyMap<string, readonly RecordRelation[]>,
): Map<string, string[]> {
  const inSet = new Set(recordIds);
  const adj = new Map<string, string[]>();
  for (const id of recordIds) {
    adj.set(id, coMemberRecordIds(id, relationsByRecord, inSet));
  }
  return adj;
}

/**
 * Hop distances from `origin`. The origin is 0. An id with no path is absent,
 * not infinity.
 *
 * An origin that is not a key of `adjacency` is distance 0 and nothing else.
 * Neighbours are walked breadth-first. The first time an id is seen wins.
 */
export function bfsDistancesFrom(
  origin: string,
  adjacency: ReadonlyMap<string, readonly string[]>,
): Map<string, number> {
  const dist = new Map<string, number>();
  if (!adjacency.has(origin) && !adjacency.get(origin)) {
    dist.set(origin, 0);
    return dist;
  }
  dist.set(origin, 0);
  const queue: string[] = [origin];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined) break;
    const d = dist.get(cur);
    if (d === undefined) break;
    for (const next of adjacency.get(cur) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, d + 1);
      queue.push(next);
    }
  }
  return dist;
}

export interface VisibleRelationCountArgs {
  /** Ids that already passed the text filter. The full set when text is empty. */
  candidateIds: readonly string[];
  /** Every in-set record id. Adjacency is built from these, not from the candidates alone. */
  allRecordIds: readonly string[];
  relationsByRecord: ReadonlyMap<string, readonly RecordRelation[]>;
  filter: RelationCountFilter;
  /**
   * False when the host did not load relation rows (the assembly was capped).
   * Hop distance is then unavailable. The candidate list is returned unchanged.
   * Do not invent a graph.
   */
  countsAvailable: boolean;
  /**
   * The selected record. Null means the hop filter is off, even when the
   * filter is 1, 2, or 3. The candidate list is returned unchanged.
   */
  selectedRecordId: string | null;
}

/**
 * Ids to show.
 *
 * - `all`, or counts unavailable, or no selection → a copy of `candidateIds`.
 *   That copy is not sorted.
 * - The selection is not in `candidateIds` → a sorted copy of `candidateIds`.
 *   The selection is not forced back in. Text already removed it.
 * - Otherwise → candidates whose distance from the selection is ≤ the hop,
 *   sorted. The selection is kept when it is a candidate (its distance is 0).
 *
 * Adjacency uses `allRecordIds`, so a record that failed the text filter can
 * still be a bridge. It is not itself returned unless it is also a candidate.
 */
export function visibleRecordIdsForRelationCountFilter(args: VisibleRelationCountArgs): string[] {
  const {
    candidateIds,
    allRecordIds,
    relationsByRecord,
    filter,
    countsAvailable,
    selectedRecordId,
  } = args;

  const hop = hopDepthForFilter(filter);

  if (!countsAvailable || hop === null || !selectedRecordId) {
    return [...candidateIds];
  }

  const candidateSet = new Set(candidateIds);

  if (!candidateSet.has(selectedRecordId)) {
    return [...candidateIds].sort();
  }

  const adjacency = buildRecordAdjacency(allRecordIds, relationsByRecord);
  const distances = bfsDistancesFrom(selectedRecordId, adjacency);

  const visible: string[] = [];
  for (const id of candidateIds) {
    const d = distances.get(id);
    if (d !== undefined && d <= hop) visible.push(id);
  }

  if (!visible.includes(selectedRecordId)) {
    visible.push(selectedRecordId);
  }

  return visible.sort();
}
