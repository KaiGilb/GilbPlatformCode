/**
 * A person record's multi-valued contact fields (Email, Phone, Social), stored exactly as the profile app stores them, so either
 * app reads the other's rows. ONE row mechanism for the three (first built for email alone): the person must be able to add any
 * number of emails, work and private, and the fields are made exactly like the profile app's, ideally with the same code.
 *
 * The two facts' spellings are TYPE LOOKUPS (the master's terms — `a/email`, `a/phone`,
 * `a/account`, and `a/fieldMeta`), passed in by the caller:
 *   - the field's term — its values, a list (one value may be served as a plain string);
 *   - the profile app's sidecar term — one entry per row, `{ type, label?, order, access, valueIndex }`, keyed
 *     as the profile app's `nextKeyForType` keys it (`src/model/profile.ts`): `email`, `emailPrivate`,
 *     `email2`, …; `phone`, `phone2`, …; `account`, `account2`, …. `valueIndex` is the row's own
 *     position in the value list (rows are paired by it, never by position).
 * Other entries of the sidecar (another field's rows) are carried through untouched.
 *
 * ⚠ The entry `type` (`email` / `phone` / `social`) and the key prefixes are the profile app's sidecar DATA
 * format (its `FIELD_TYPE_META`: email keyPrefix "email", phone keyPrefix "phone", social
 * keyPrefix "account"), ⛔ not fact spellings and ⛔ not labels.
 *
 * Pure: no reads, no writes.
 */

/** The contact fields that are rows of one multi-valued term (the profile app's `MULTI_VALUED_TYPES`).
 *  `skill` (the profile app's `FIELD_TYPE_META.skill`, keyPrefix "skill") is a row of the term `a/skill`. */
export type ContactKind = "email" | "phone" | "social" | "skill";

export interface ContactRow {
  /** The sidecar key (`email`, `emailPrivate`, `email2`, `phone`, `phone2`, `account`, …). */
  key: string;
  /** The profile app's sub-label ("Work" / "Private" for email; for phone and social only a stored one, else ""). */
  label: string;
  value: string;
  /**
   * Skill rows only: the catalogue referent a picked skill stands for (the profile app's
   * `ProfileField.functionUri`, the `/base/t/<PascalName>` URI). Stored as the profile app's writer stores it:
   * the value is the REFERENCE `{"@id": ref}` and `value` (the skill's name) is the
   * sidecar entry's cached `label`. Absent for a free-text skill.
   */
  ref?: string;
}

/** The profile app's sidecar data format per kind (its `FIELD_TYPE_META`). */
const KIND: Record<ContactKind, { entryType: string; keyPrefix: string; workPrivate: boolean }> = {
  email: { entryType: "email", keyPrefix: "email", workPrivate: true },
  phone: { entryType: "phone", keyPrefix: "phone", workPrivate: false },
  social: { entryType: "social", keyPrefix: "account", workPrivate: false },
  skill: { entryType: "skill", keyPrefix: "skill", workPrivate: false },
};

/** A value as the profile app stores it on a multi-valued term: a literal, or (skill) a reference. */
export type ContactValue = string | { "@id": string };

/** The profile app's `refIdOf`: the `@id` of a reference value, else null. */
function refOf(v: unknown): string | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const id = (v as Record<string, unknown>)["@id"];
  return typeof id === "string" && id ? id : null;
}

/** The term's values as a list. A reference is kept for a skill only (`a:skill` carries both
 *  encodings); for email, phone and social only literals are read. */
function asValues(kind: ContactKind, v: unknown): ContactValue[] {
  const list = Array.isArray(v) ? v : v == null ? [] : [v];
  const out: ContactValue[] = [];
  for (const x of list) {
    if (typeof x === "string") {
      if (Array.isArray(v) || x.trim()) out.push(x);
    } else if (kind === "skill") {
      const ref = refOf(x);
      if (ref) out.push({ "@id": ref });
    }
  }
  return out;
}

/** Whether this kind's rows carry the profile app's Work / Private label and its switch (email only). */
export function hasWorkPrivate(kind: ContactKind): boolean {
  return KIND[kind].workPrivate;
}

type Meta = Record<string, Record<string, unknown>>;

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

/** The profile app's `decodeValue` for a phone: a legacy `tel:` value reads as the number. (Email is read
 *  as stored.) */
function decode(kind: ContactKind, v: string): string {
  return kind === "phone" && v.startsWith("tel:") ? v.slice("tel:".length) : v;
}

/** The rows the profile app would show for these served facts (the value list and the sidecar, as served). */
export function readContactRows(kind: ContactKind, served: { values?: unknown; meta?: unknown }): ContactRow[] {
  const { entryType, workPrivate } = KIND[kind];
  const values = asValues(kind, served.values).map((v) => (typeof v === "string" ? decode(kind, v) : v));
  const meta = asMeta(served.meta);
  const entries = Object.entries(meta)
    .filter(([, m]) => m && m.type === entryType)
    // Equal orders are broken by key, as the profile app's reader sorts
    // (`profileModelFromDoc`: `(a.order ?? 0) - (b.order ?? 0) || ka.localeCompare(kb)`).
    .sort(([ka, a], [kb, b]) => Number(a.order ?? 0) - Number(b.order ?? 0) || ka.localeCompare(kb));
  const rows: ContactRow[] = [];
  const taken = new Set<number>();
  const indexed = entries.some(([, m]) => typeof m.valueIndex === "number");
  let pos = 0;
  for (const [key, m] of entries) {
    const stored = typeof m.label === "string" && m.label ? m.label : null;
    let raw: ContactValue | undefined;
    if (indexed) {
      if (typeof m.valueIndex === "number" && values[m.valueIndex] !== undefined) {
        raw = values[m.valueIndex]!;
        taken.add(m.valueIndex);
      }
    } else if (pos < values.length) {
      raw = values[pos]!;
      taken.add(pos);
      pos++;
    }
    // The profile app's `profileModelFromDoc`: a reference value's text is the entry's cached label, and that
    // label is then the skill's name, ⛔ not a sub-label.
    const refValue = raw !== undefined && typeof raw !== "string" ? raw["@id"] : null;
    // Before the reference encoding, the profile app kept a picked skill's catalogue
    // link in the sidecar entry's `functionUri`, with the name as plain text. It still reads that
    // (`profileModelFromDoc`: `refIdOf(raw) ?? m.functionUri`, the value then the text), so this does
    // too; the next save writes the link the current way (`{"@id"}`), as its own save does.
    const legacyRef = kind === "skill" && typeof m.functionUri === "string" && m.functionUri ? m.functionUri : null;
    const ref = refValue ?? legacyRef;
    if (ref) {
      rows.push({ key, label: "", value: refValue ? (stored ?? "") : typeof raw === "string" ? raw : (stored ?? ""), ref });
      continue;
    }
    const text = typeof raw === "string" ? raw : "";
    // An online account with NO address is not "on" any platform. A row the profile app or
    // this card emptied used to keep the platform it had held ("X", with nothing after it), which read as an
    // empty duplicate X row. The label belongs to the value, so it is not read without one.
    const label = kind === "social" && !text.trim() ? "" : (stored ?? (workPrivate ? (key === "emailPrivate" ? "Private" : "Work") : ""));
    rows.push({ key, label, value: text });
  }
  // Values no row speaks for (another app wrote them): shown as their own rows, never dropped.
  values.forEach((v, i) => {
    if (taken.has(i)) return;
    const label = workPrivate ? (rows.length === 0 ? "Work" : "Private") : "";
    const key = nextContactKey(kind, rows);
    rows.push(typeof v === "string" ? { key, label, value: v } : { key, label: "", value: "", ref: v["@id"] });
  });
  return rows;
}

/**
 * The profile app's key for the next row of this kind (`nextKeyForType`): email, emailPrivate, email2, …;
 * phone, phone2, …; account, account2, …; skill, skill2, ….
 */
export function nextContactKey(kind: ContactKind, rows: readonly { key: string }[]): string {
  const base = KIND[kind].keyPrefix;
  const used = new Set(rows.map((r) => r.key));
  if (!used.has(base)) return base;
  if (kind === "email" && !used.has("emailPrivate")) return "emailPrivate";
  let n = 2;
  while (used.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/**
 * The patch that stores these rows the profile app's way: the field's term gets the non-empty values in row
 * order, and the sidecar gets every entry of this kind replaced (order, label, valueIndex) and every
 * other entry kept. An empty row is kept in the sidecar (the profile app keeps a row's structure) and given no
 * `valueIndex`. A phone or social row's label is written only when it has one (the profile app writes `label`
 * only when present); an email row always carries its Work / Private label.
 * A picked skill (a row with `ref`) is written as the profile app's writer writes it: the
 * value is the reference `{"@id": ref}`, and the entry's `label` caches the skill's name (the profile app:
 * `label = f.label ?? (f.functionUri && f.value.trim() ? f.value.trim() : undefined)`).
 */
export function contactRowsPatch(
  kind: ContactKind,
  rows: readonly ContactRow[],
  servedMeta: unknown,
): { values: ContactValue[] | null; meta: Meta } {
  const { entryType, workPrivate } = KIND[kind];
  const served = asMeta(servedMeta);
  const meta: Meta = {};
  for (const [k, m] of Object.entries(served)) if (!(m && m.type === entryType)) meta[k] = m;
  // A row keeps its stored order and rung; a new row goes after every stored field. (The rung is
  // the profile app's audience field; a holder's own record publishes nothing, so a new row is "private".)
  let next = Math.max(-1, ...Object.values(served).map((m) => Number(m?.order ?? -1))) + 1;
  const list: ContactValue[] = [];
  rows.forEach((r) => {
    const v = r.value.trim();
    const was = served[r.key];
    const order = was && typeof was.order === "number" ? was.order : next++;
    const access = was && typeof was.access === "string" ? was.access : "private";
    const label = r.ref ? v : r.label;
    const entry: Record<string, unknown> = { type: entryType, ...(workPrivate || label ? { label } : {}), order, access };
    if (r.ref) {
      entry.valueIndex = list.length;
      list.push({ "@id": r.ref });
    } else if (v) {
      entry.valueIndex = list.length;
      list.push(v);
    }
    meta[r.key] = entry;
  });
  // A row the person removed: an explicit null, so a merge that recurses into the sidecar drops it
  // too. (Both readers skip a null entry: the profile app's `profile.ts` and `readContactRows` above.)
  for (const [k, m] of Object.entries(served)) {
    if (m && m.type === entryType && !rows.some((r) => r.key === k)) (meta as Record<string, unknown>)[k] = null;
  }
  return { values: list.length ? list : null, meta };
}

/**
 * The rows to resend after a 412. `base` is the rows as last stored (the
 * section's last read or save), `mine` the person's rows now, `fresh` the rows as stored now. Only
 * the person's own changes are applied to `fresh`, as the profile app re-applies its intent to the fresh state:
 *   - a row the person removed (in `base`, not in `mine`) is dropped;
 *   - a row the person changed (value, label) takes the person's version;
 *   - a row the person added (in `mine`, not in `base`) is appended, re-keyed with the profile app's next key
 *     when someone else's new row took its key meanwhile;
 *   - every other fresh row is kept as stored, including rows this section had never seen.
 * A row someone else removed is dropped, unless the person changed it (their edit is kept).
 */
export function mergeContactRows(
  kind: ContactKind,
  base: readonly ContactRow[],
  mine: readonly ContactRow[],
  fresh: readonly ContactRow[],
): ContactRow[] {
  const same = (a: ContactRow, b: ContactRow) => a.label === b.label && a.value === b.value && (a.ref ?? null) === (b.ref ?? null);
  const baseBy = new Map(base.map((r) => [r.key, r]));
  const mineBy = new Map(mine.map((r) => [r.key, r]));
  const freshKeys = new Set(fresh.map((r) => r.key));
  const out: ContactRow[] = [];
  for (const f of fresh) {
    const b = baseBy.get(f.key);
    const m = mineBy.get(f.key);
    if (b && !m) continue;
    out.push(b && m && !same(b, m) ? m : f);
  }
  for (const m of mine) {
    const b = baseBy.get(m.key);
    if (b) {
      if (!freshKeys.has(m.key) && !same(b, m)) out.push(m);
      continue;
    }
    out.push(out.some((r) => r.key === m.key) ? { ...m, key: nextContactKey(kind, out) } : m);
  }
  return out;
}

// ── Email: the first version's names, unchanged in behaviour ─────────────────────────────────

export type EmailRow = ContactRow;
export const readEmailRows = (served: { values?: unknown; meta?: unknown }): ContactRow[] => readContactRows("email", served);
export const nextEmailKey = (rows: readonly { key: string }[]): string => nextContactKey("email", rows);
export const emailRowsPatch = (rows: readonly ContactRow[], servedMeta: unknown) => contactRowsPatch("email", rows, servedMeta);
