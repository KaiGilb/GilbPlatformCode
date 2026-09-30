/**
 * A stored fact whose value is an address of another record.
 *
 * The address must be `http(s)://<host>/<base-or-vault>/e/<id>`.
 * A type address (`/t/`) is not a record address. A bare id is not an address.
 *
 * This file does not fetch, and it does not skip any fact name on its own.
 * The app that draws the graph skips a fixed set of names before it calls
 * these functions, because another walker already drew those. Pass that set
 * if you are that app. Pass nothing, and every matching address is a pointer.
 */

export type EntityRef = { uri: string; id: string; slug: string };

export type EntityRefPair = {
  sourceId: string;
  targetId: string;
  slug: string;
};

export type EntityRefRecord = {
  id: string;
  entityUri?: string;
  facts: Record<string, string>;
};

/** Last segment after `?` and `#` are removed. Same contract as id-tail `uriTail`, not `slashTail`. */
function uriTail(uri: string): string {
  const clean = uri.split(/[?#]/)[0]?.replace(/\/+$/, "") ?? "";
  const seg = clean.slice(clean.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(seg) || uri;
  } catch {
    return seg || uri;
  }
}

/**
 * Read one stored string as a pointer to another record.
 *
 * Returns null for null, undefined, blank, a type address, a bare word, or
 * anything that is not `http(s)://host/(base|vault)/e/<id>`.
 *
 * The id in the result is decoded once. The rebuilt address uses that decoded
 * id, the same scheme and host, and the same `base` or `vault` segment it was
 * given. It does not keep a query, a hash, or anything after the id.
 *
 * A broken percent-encoding throws. It is not turned into null.
 */
export function entityRefFromFact(raw: string | null | undefined): { uri: string; id: string } | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(https?:\/\/[^/\s]+)\/(base|vault)\/e\/([^/?#\s]+)/i);
  if (!m) return null;
  const origin = m[1];
  const segment = m[2];
  const idRaw = m[3];
  if (origin === undefined || segment === undefined || idRaw === undefined) return null;
  const id = decodeURIComponent(idRaw);
  if (!id) return null;
  return { uri: `${origin}/${segment}/e/${id}`, id };
}

/**
 * Every fact on one record whose value is a record address.
 *
 * `skipSlugs` is the caller's list. This function does not have one of its own.
 * A name in the set is not returned, even when the value is a real address.
 * Omit the set and nothing is skipped.
 */
export function entityRefsOf(record: { facts: Record<string, string> }, skipSlugs?: ReadonlySet<string>): EntityRef[] {
  const out: EntityRef[] = [];
  for (const [slug, value] of Object.entries(record.facts)) {
    if (skipSlugs?.has(slug)) continue;
    const ref = entityRefFromFact(value);
    if (!ref) continue;
    out.push({ ...ref, slug });
  }
  return out;
}

/**
 * A name to show for a record that was named by one of these facts, in this order:
 * `label`, `termLabel`, `title`, `name`.
 *
 * The first non-blank wins, after trim. `a:label` is not read. An empty string
 * does not win.
 *
 * If none of those is present, the last segment of `entityUri` is used
 * (query and hash removed, percent-encoding decoded). If that is also missing,
 * the result is the word `Untitled`.
 *
 * `Untitled` is a stand-in for the screen. It is not a stored name. Do not write
 * it back. A process name uses a different rule and stays blank when nothing
 * was stored.
 */
export function refDisplayName(
  facts: Record<string, string> | null | undefined,
  entityUri?: string | null,
): string {
  if (facts) {
    for (const slug of ["label", "termLabel", "title", "name"] as const) {
      const v = facts[slug]?.trim();
      if (v) return v;
    }
  }
  if (entityUri) {
    const tail = uriTail(entityUri);
    if (tail) return tail;
  }
  return "Untitled";
}

function indexRecords(records: readonly EntityRefRecord[]): Map<string, string> {
  const keyToId = new Map<string, string>();
  const add = (key: string, id: string) => {
    if (key && !keyToId.has(key)) keyToId.set(key, id);
  };
  for (const r of records) {
    if (!r.id) continue;
    add(r.id, r.id);
    if (r.entityUri) {
      add(r.entityUri, r.id);
      const parsed = entityRefFromFact(r.entityUri);
      if (parsed) add(parsed.id, r.id);
    }
  }
  return keyToId;
}

/**
 * Pair edges from address-valued facts when both ends are in `records`.
 *
 * The record that holds the fact is the source. The record the address names
 * is the target. A fact that names something outside the set is not an edge
 * (see `missingEntityRefTargets`). A fact that names the same record is not an edge.
 *
 * First-seen wins when the same id is indexed twice. Children stay in the
 * order of `records`. Duplicate slug+source+target pairs are dropped.
 */
export function findEntityRefPairs(
  records: readonly EntityRefRecord[],
  skipSlugs?: ReadonlySet<string>,
): EntityRefPair[] {
  const keyToId = indexRecords(records);
  const pairs: EntityRefPair[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const ref of entityRefsOf(r, skipSlugs)) {
      const targetId = keyToId.get(ref.id) ?? keyToId.get(ref.uri);
      if (!targetId || targetId === r.id) continue;
      const k = `${ref.slug}:${r.id}:${targetId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pairs.push({ sourceId: r.id, targetId, slug: ref.slug });
    }
  }
  return pairs;
}

/**
 * Addresses named by `records` whose target is not itself in the set.
 *
 * `cap` is applied after a target is added. The default is 24, so the 25th
 * is not returned. A cap below 1 still returns the first missing target,
 * because the check happens after the push. Do not treat 0 as "return nothing".
 */
export function missingEntityRefTargets(
  records: readonly EntityRefRecord[],
  cap = 24,
  skipSlugs?: ReadonlySet<string>,
): { id: string; uri: string }[] {
  const present = new Set<string>();
  for (const r of records) {
    if (r.id) present.add(r.id);
    if (r.entityUri) {
      present.add(r.entityUri);
      const p = entityRefFromFact(r.entityUri);
      if (p) present.add(p.id);
    }
  }
  const missing: { id: string; uri: string }[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const ref of entityRefsOf(r, skipSlugs)) {
      if (present.has(ref.id) || present.has(ref.uri) || seen.has(ref.id)) continue;
      seen.add(ref.id);
      missing.push({ id: ref.id, uri: ref.uri });
      if (missing.length >= cap) return missing;
    }
  }
  return missing;
}

export type EntityRefChild = {
  id: string;
  slug: string;
  facts: Record<string, string>;
  entityUri?: string;
};

/**
 * Records in `pool` that point at `record` by an address-valued fact.
 *
 * `record` itself is not included. The first matching fact name on a child
 * wins; later facts on that same child are not a second row. Order is the
 * order of `pool`.
 */
export function childrenPointingAt(
  record: { id: string; entityUri?: string },
  pool: readonly EntityRefRecord[],
  skipSlugs?: ReadonlySet<string>,
): EntityRefChild[] {
  const keys = new Set<string>([record.id]);
  if (record.entityUri) {
    keys.add(record.entityUri);
    const p = entityRefFromFact(record.entityUri);
    if (p) keys.add(p.id);
  }
  const out: EntityRefChild[] = [];
  for (const r of pool) {
    if (r.id === record.id) continue;
    for (const ref of entityRefsOf(r, skipSlugs)) {
      if (keys.has(ref.id) || keys.has(ref.uri)) {
        const row: EntityRefChild = { id: r.id, slug: ref.slug, facts: r.facts };
        if (r.entityUri !== undefined) row.entityUri = r.entityUri;
        out.push(row);
        break;
      }
    }
  }
  return out;
}
