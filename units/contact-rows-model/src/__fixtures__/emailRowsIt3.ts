// Test fixture only: the first version of the email row code, kept so `contactRows.test.ts` can show the shared
// mechanism stores and reads email exactly as that version did. ⛔ Not imported by app code.

/**
 * A person record's emails, stored exactly as the profile app stores them, so either app reads the
 * other's rows (the person must be able to add any number of emails, work and private). The two
 * facts' spellings are TYPE LOOKUPS (the master's terms `a/email` and `a/fieldMeta`), passed in by the caller:
 *   - the email term — the addresses, a list (one value may be served as a plain string);
 *   - the profile app's sidecar term — one entry per row, keyed `email`, `emailPrivate`, `email2`,
 *     `email3`, … (its `nextKeyForType`), `{ type: "email", label, order, access, valueIndex }`,
 *     where `valueIndex` is the row's own position in `a:email` (rows are paired by it,
 *     never by position).
 * Other entries of `a:fieldMeta` (another field's rows) are carried through untouched.
 *
 * Pure: no reads, no writes.
 */

export interface EmailRow {
  /** The sidecar key (`email`, `emailPrivate`, `email2`, …). */
  key: string;
  /** The profile app's sub-label: "Work" or "Private". */
  label: string;
  value: string;
}

type Meta = Record<string, Record<string, unknown>>;

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return typeof v === "string" && v.trim() ? [v] : [];
}

function asMeta(v: unknown): Meta {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Meta;
  if (typeof v === "string" && v.trim().startsWith("{")) {
    try {
      const o = JSON.parse(v) as unknown;
      if (o && typeof o === "object" && !Array.isArray(o)) return o as Meta;
    } catch {
      /* not a sidecar */
    }
  }
  return {};
}

/** The rows the profile app would show for these served facts (the address list and the sidecar, as served).
 *  ⚠ The row keys and the entry `type: "email"` are the profile app's sidecar DATA format (its
 *  `FIELD_TYPE_META`), ⛔ not fact spellings. */
export function readEmailRows(served: { values?: unknown; meta?: unknown }): EmailRow[] {
  const values = asList(served.values);
  const meta = asMeta(served.meta);
  const entries = Object.entries(meta)
    .filter(([, m]) => m && m.type === "email")
    .sort(([, a], [, b]) => Number(a.order ?? 0) - Number(b.order ?? 0));
  const rows: EmailRow[] = [];
  const taken = new Set<number>();
  const indexed = entries.some(([, m]) => typeof m.valueIndex === "number");
  let pos = 0;
  for (const [key, m] of entries) {
    const label = typeof m.label === "string" && m.label ? m.label : key === "emailPrivate" ? "Private" : "Work";
    let value = "";
    if (indexed) {
      if (typeof m.valueIndex === "number" && values[m.valueIndex] !== undefined) {
        value = values[m.valueIndex]!;
        taken.add(m.valueIndex);
      }
    } else if (pos < values.length) {
      value = values[pos]!;
      taken.add(pos);
      pos++;
    }
    rows.push({ key, label, value });
  }
  // Addresses no row speaks for (another app wrote them): shown as their own rows, never dropped.
  values.forEach((v, i) => {
    if (!taken.has(i)) rows.push({ key: nextEmailKey(rows), label: rows.length === 0 ? "Work" : "Private", value: v });
  });
  return rows;
}

/** The profile app's key for the next email row (`nextKeyForType`): email, emailPrivate, email2, email3, … */
export function nextEmailKey(rows: readonly { key: string }[]): string {
  const used = new Set(rows.map((r) => r.key));
  if (!used.has("email")) return "email";
  if (!used.has("emailPrivate")) return "emailPrivate";
  let n = 2;
  while (used.has(`email${n}`)) n++;
  return `email${n}`;
}

/**
 * The patch that stores these rows the profile app's way: `email` the non-empty addresses in row order, and
 * `fieldMeta` with every email entry replaced (order, label, valueIndex) and every other entry kept.
 * An empty row is kept in the sidecar (the profile app keeps a row's structure) and given no `valueIndex`.
 */
export function emailRowsPatch(
  rows: readonly EmailRow[],
  servedMeta: unknown,
): { values: string[] | null; meta: Meta } {
  const served = asMeta(servedMeta);
  const meta: Meta = {};
  for (const [k, m] of Object.entries(served)) if (!(m && m.type === "email")) meta[k] = m;
  // A row keeps its stored order and rung; a new row goes after every stored field. (The rung is
  // the profile app's audience field; a holder's own record publishes nothing, so a new row is "private".)
  let next = Math.max(-1, ...Object.values(served).map((m) => Number(m?.order ?? -1))) + 1;
  const email: string[] = [];
  rows.forEach((r) => {
    const v = r.value.trim();
    const was = served[r.key];
    const order = was && typeof was.order === "number" ? was.order : next++;
    const access = was && typeof was.access === "string" ? was.access : "private";
    const entry: Record<string, unknown> = { type: "email", label: r.label, order, access };
    if (v) {
      entry.valueIndex = email.length;
      email.push(v);
    }
    meta[r.key] = entry;
  });
  // A row the person removed: an explicit null, so a merge that recurses into the sidecar drops it
  // too. (Both readers skip a null entry: the profile app's `profile.ts` and `readEmailRows` above.)
  for (const [k, m] of Object.entries(served)) {
    if (m && m.type === "email" && !rows.some((r) => r.key === k)) (meta as Record<string, unknown>)[k] = null;
  }
  return { values: email.length ? email : null, meta };
}
