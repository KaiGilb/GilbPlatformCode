// The facts a Function, Solution or Value card reads and writes on the record itself: who a line came
// from (source), the meters, the status lines (Status and Past), the concept, and the vault's inline
// lists. Plain functions over the stored wire shapes (`a:source`, `a:statedBy`, `a:lineSources`, ...).
// The vocabulary loader is not here: an app loads its own.

/** Structured Function lines: shown, not edited. Membership stays the master's. */
export const PLAN_SHOWN_FIELDS: ReadonlySet<string> = new Set([
  "stakeholders",
  "concept",
  "fvParent",
  "hasMeter",
  "levelStatements",
  "lineSources",
]);

/** Status / Past words. The latest date is Status; an earlier date is Past. */
export const PLAN_STATUS_WORDS = ["Planned", "Developed", "In-Production", "Retired"] as const;

const METER_KINDS = ["human", "ai", "instrument"] as const;
export type PlanMeterKind = (typeof METER_KINDS)[number];

/**
 * Who a line came from. `text` is words when there is no record yet.
 * `statedBy` / `derivedFrom` are record URIs. A link and text may both be
 * stored; writing a link clears the text.
 */
export type PlanSourceValue = {
  text?: string;
  statedBy?: string;
  derivedFrom?: string;
};

export type PlanMeterDraft = {
  method: string;
  source: PlanSourceValue;
  /** The served member, when this kind was read from one. Not enumerable. */
  raw?: Record<string, unknown>;
};
export type PlanMeters = Record<PlanMeterKind, PlanMeterDraft> & {
  /** Unknown kinds and members that did not parse, in served order. Absent when empty. */
  others?: unknown[];
};

export type PlanLevelLine = {
  status: string;
  when: string;
  source: PlanSourceValue;
  /** The served member, when this line was read from one. Not enumerable. */
  raw?: Record<string, unknown>;
};

export type PlanConcept = { label: string; id: string };

function blankMeter(): PlanMeterDraft {
  return { method: "", source: {} };
}

function asData(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return null;
    }
  }
  return raw;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function addressTail(id: string): string {
  const s = id.trim();
  const i = s.lastIndexOf("/");
  return i >= 0 && i < s.length - 1 ? s.slice(i + 1) : s;
}

function itemsOf(raw: unknown): unknown[] {
  const data = asData(raw);
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

function stakeholderText(raw: unknown): string {
  const data = asData(raw);
  if (typeof data === "string") return data.trim() || "—";
  const parts: string[] = [];
  for (const item of itemsOf(raw)) {
    if (typeof item === "string") {
      if (item.trim()) parts.push(item.trim());
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const tag = str(memberValue(o, "unitTag")) ?? str(memberValue(o, "label")) ?? str(memberValue(o, "tag"));
    if (tag) parts.push(tag);
    else if (typeof o["@id"] === "string") parts.push(addressTail(o["@id"]));
  }
  return parts.length ? parts.join(", ") : "—";
}

function conceptText(raw: unknown): string {
  const data = asData(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) return "—";
  const o = data as Record<string, unknown>;
  return str(memberValue(o, "label")) ?? "—";
}

function parentText(raw: unknown): string {
  const data = asData(raw);
  if (typeof data === "string") return data.trim() ? addressTail(data) : "—";
  if (data && typeof data === "object" && !Array.isArray(data) && typeof (data as { "@id"?: unknown })["@id"] === "string") {
    return addressTail((data as { "@id": string })["@id"]) || "—";
  }
  return "—";
}

const METER_WORD: Record<string, string> = { human: "HumanAgent", ai: "AiAgent", instrument: "Instrument" };

function meterText(raw: unknown): string {
  const lines: string[] = [];
  for (const o of servedList(raw)) {
    const kind = String(memberValue(o, "meterAgentKind") ?? "").trim().toLowerCase();
    const word = METER_WORD[kind];
    if (!word) continue;
    const method = str(memberValue(o, "method")) ?? "";
    lines.push(method ? `${word}: ${method}` : `${word}:`);
  }
  return lines.length ? lines.join("\n") : "—";
}

function statusText(raw: unknown): string {
  const rows = servedList(raw).map((o) => {
    const whenValue = memberValue(o, "statusWhen");
    const when = typeof whenValue === "string" ? whenValue : "";
    const statusValue = memberValue(o, "status");
    return { when, date: when.slice(0, 10), word: typeof statusValue === "string" ? statusValue.trim() : "" };
  });
  if (rows.length === 0) return "—";
  rows.sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0));
  return rows.map((row, i) => `${i === 0 ? "Status" : "Past"} [${row.date}] ${row.word}`).join("\n");
}

function sourcesText(raw: unknown): string {
  const n = servedList(raw).length;
  if (n === 0) return "—";
  return n === 1 ? "1 source" : `${n} sources`;
}

/** Today's date in the person's local calendar, `YYYY-MM-DD`. */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** A served object/array, or the same value as a JSON string. Junk is null. Never throws. */
function parseStructured(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const t = raw.trim();
  if (!t || (!t.startsWith("{") && !t.startsWith("["))) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

function isFullIri(key: string): boolean {
  return /^https?:\/\//i.test(key);
}

/**
 * One field of a stored member.
 * `a:<name>`, else `<name>`, else a full IRI key ending in `/a/<name>` (preferred) or `/<name>`.
 * `null` and a missing key fall through. An empty string does not.
 */
export function memberValue(o: Record<string, unknown> | null | undefined, name: string): unknown {
  if (!o || typeof o !== "object" || Array.isArray(o)) return undefined;
  if (Object.prototype.hasOwnProperty.call(o, `a:${name}`)) {
    const prefixed = o[`a:${name}`];
    if (prefixed !== undefined && prefixed !== null) return prefixed;
  }
  if (Object.prototype.hasOwnProperty.call(o, name)) {
    const bare = o[name];
    if (bare !== undefined && bare !== null) return bare;
  }
  const suffixA = `/a/${name}`;
  const suffix = `/${name}`;
  let fallback: unknown;
  for (const key of Object.keys(o)) {
    if (!isFullIri(key)) continue;
    const value = o[key];
    if (value === undefined || value === null) continue;
    if (key.endsWith(suffixA)) return value;
    if (fallback === undefined && key.endsWith(suffix)) fallback = value;
  }
  return fallback;
}

function isIdOnlyLink(o: Record<string, unknown>): boolean {
  const keys = Object.keys(o);
  return keys.length === 1 && keys[0] === "@id";
}

function isValueObject(o: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(o, "@value");
}

function plainMember(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (isIdOnlyLink(o) || isValueObject(o)) return null;
  return o;
}

/**
 * The vault's inline list. `null` / `undefined` is []. An array contributes its object
 * members (including an `{"@id"}` link). One plain object is `[raw]`. A JSON string of
 * either is the same. A lone `{"@id"}` link, an `{"@value"}` object, and anything else are [].
 */
export function servedList(raw: unknown): Record<string, unknown>[] {
  let data = raw;
  if (typeof data === "string") {
    const t = data.trim();
    if (!t || (!t.startsWith("{") && !t.startsWith("["))) return [];
    try {
      data = JSON.parse(t) as unknown;
    } catch {
      return [];
    }
  }
  if (data == null) return [];
  if (Array.isArray(data)) {
    const out: Record<string, unknown>[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      out.push(item as Record<string, unknown>);
    }
    return out;
  }
  const one = plainMember(data);
  return one ? [one] : [];
}

function factKeyRank(key: string): number {
  if (key.startsWith("a:")) return 0;
  if (isFullIri(key)) return 2;
  return 1;
}

function localFactKey(key: string): string {
  if (key === "@id" || key === "@type" || key === "@value" || key === "@context") return key;
  if (key.startsWith("a:")) return key.slice(2);
  if (isFullIri(key)) {
    const i = key.lastIndexOf("/");
    return i >= 0 ? key.slice(i + 1) : key;
  }
  return key;
}

/** Spelling-insensitive member, so `a:status` and `status` are the same content. */
function canonicalMember(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalMember);
  if (!value || typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort((a, b) => factKeyRank(a) - factKeyRank(b) || (a < b ? -1 : a > b ? 1 : 0));
  const bag: Record<string, unknown> = {};
  for (const key of keys) {
    const v = o[key];
    if (v === undefined || v === null) continue;
    const name = localFactKey(key);
    if (bag[name] !== undefined) continue;
    bag[name] = canonicalMember(v);
  }
  const sorted: Record<string, unknown> = {};
  for (const name of Object.keys(bag).sort()) sorted[name] = bag[name];
  return sorted;
}

/**
 * True when two inline lists are the same members, in order.
 * `a:` / bare / full-IRI keys match. One object and a one-member array match.
 */
export function sameServedList(a: unknown, b: unknown): boolean {
  return JSON.stringify(servedList(a).map(canonicalMember)) === JSON.stringify(servedList(b).map(canonicalMember));
}

/**
 * A top-level fact. The bare slug wins when that key is present (even as `null`).
 * Otherwise {@link memberValue}: `a:<slug>`, then a full IRI key.
 * Served facts win over the flat map.
 */
export function rowServedFact(
  row: {
    facts?: Readonly<Record<string, unknown>> | Record<string, string> | null;
    served?: { facts?: Readonly<Record<string, unknown>> | null } | null;
  },
  name: string,
): unknown {
  const served = row.served?.facts;
  if (served && Object.prototype.hasOwnProperty.call(served, name)) return served[name];
  if (served) {
    const v = memberValue(served as Record<string, unknown>, name);
    if (v !== undefined) return v;
  }
  const facts = row.facts;
  if (facts && Object.prototype.hasOwnProperty.call(facts, name)) return facts[name];
  if (facts) return memberValue(facts as Record<string, unknown>, name);
  return undefined;
}

function sourceKey(key: string): string {
  const k = key.trim();
  if (!k) return "";
  return k.startsWith("a:") ? k : `a:${k}`;
}

function refId(v: unknown): string | null {
  if (typeof v === "string") {
    const s = v.trim();
    return s.startsWith("http") || s.startsWith("urn:") ? s : null;
  }
  if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as { "@id"?: unknown })["@id"] === "string") {
    const id = (v as { "@id": string })["@id"].trim();
    return id.startsWith("http") || id.startsWith("urn:") ? id : null;
  }
  return null;
}

/** A source object, or the old text-only string. Anything else is empty. */
export function asPlanSource(raw: unknown): PlanSourceValue {
  if (typeof raw === "string") return raw.trim() ? { text: raw.trim() } : {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: PlanSourceValue = {};
  if (typeof o.text === "string" && o.text.trim()) out.text = o.text.trim();
  if (typeof o.statedBy === "string" && o.statedBy.trim()) out.statedBy = o.statedBy.trim();
  if (typeof o.derivedFrom === "string" && o.derivedFrom.trim()) out.derivedFrom = o.derivedFrom.trim();
  return out;
}

export function planSourceEmpty(source: PlanSourceValue | string | null | undefined): boolean {
  const s = asPlanSource(source);
  return !s.text && !s.statedBy && !s.derivedFrom;
}

export function planSourceEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(asPlanSource(a)) === JSON.stringify(asPlanSource(b));
}

/** Words beside whatever link was already there. An empty string clears the words only. */
export function sourceWithText(prev: PlanSourceValue | string | null | undefined, text: string): PlanSourceValue {
  const base = asPlanSource(prev);
  const t = text.trim();
  const out: PlanSourceValue = {};
  if (base.statedBy) out.statedBy = base.statedBy;
  if (base.derivedFrom) out.derivedFrom = base.derivedFrom;
  if (t) out.text = t;
  return out;
}

/** A stakeholder said it. The words are dropped. A derived-from link stays. */
export function sourceWithStatedBy(prev: PlanSourceValue | string | null | undefined, uri: string): PlanSourceValue {
  const base = asPlanSource(prev);
  const id = uri.trim();
  const out: PlanSourceValue = {};
  if (base.derivedFrom) out.derivedFrom = base.derivedFrom;
  if (id) out.statedBy = id;
  return out;
}

/** A document or decision the line was taken from. The person who said it, and any words, stay. */
export function sourceWithDerivedFrom(prev: PlanSourceValue | string | null | undefined, uri: string): PlanSourceValue {
  const base = asPlanSource(prev);
  const id = uri.trim();
  const out: PlanSourceValue = {};
  if (base.statedBy) out.statedBy = base.statedBy;
  if (id) out.derivedFrom = id;
  if (base.text) out.text = base.text;
  return out;
}

/** `a:source` is only ever a string. An `{"@id"}` under it is ignored. */
function readMemberSource(o: Record<string, unknown>): PlanSourceValue {
  const out: PlanSourceValue = {};
  const text = memberValue(o, "source");
  if (typeof text === "string" && text.trim()) out.text = text.trim();
  const stated = refId(memberValue(o, "statedBy"));
  const derived = refId(memberValue(o, "derivedFrom"));
  if (stated) out.statedBy = stated;
  if (derived) out.derivedFrom = derived;
  return out;
}

function sourceWire(source: PlanSourceValue | string | null | undefined): Record<string, unknown> {
  const s = asPlanSource(source);
  const out: Record<string, unknown> = {};
  if (s.text) out["a:source"] = s.text;
  if (s.statedBy) out["a:statedBy"] = { "@id": s.statedBy };
  if (s.derivedFrom) out["a:derivedFrom"] = { "@id": s.derivedFrom };
  return out;
}

/**
 * String, or `{ text }` with no link: set the words and keep a link already stored.
 * A link with no `text` key: drop the words. An empty object or blank string with
 * nothing else left: remove the member. Both keys together are written as given.
 */
function mergeSource(prev: PlanSourceValue, who: string | PlanSourceValue): PlanSourceValue | null {
  if (typeof who === "string") {
    const text = who.trim();
    if (!text) {
      const rest: PlanSourceValue = {};
      if (prev.statedBy) rest.statedBy = prev.statedBy;
      if (prev.derivedFrom) rest.derivedFrom = prev.derivedFrom;
      return planSourceEmpty(rest) ? null : rest;
    }
    return { ...prev, text };
  }
  const hasText = "text" in who && typeof who.text === "string";
  const hasLink =
    ("statedBy" in who && typeof who.statedBy === "string") ||
    ("derivedFrom" in who && typeof who.derivedFrom === "string");
  if (!hasText && !hasLink) return null;
  const next = asPlanSource(who);
  if (hasLink && !hasText) {
    const out: PlanSourceValue = {};
    if (next.statedBy) out.statedBy = next.statedBy;
    else if (prev.statedBy) out.statedBy = prev.statedBy;
    if (next.derivedFrom) out.derivedFrom = next.derivedFrom;
    else if (prev.derivedFrom) out.derivedFrom = prev.derivedFrom;
    return planSourceEmpty(out) ? null : out;
  }
  if (!hasLink && hasText) {
    if (!next.text) {
      const rest: PlanSourceValue = {};
      if (prev.statedBy) rest.statedBy = prev.statedBy;
      if (prev.derivedFrom) rest.derivedFrom = prev.derivedFrom;
      return planSourceEmpty(rest) ? null : rest;
    }
    const out: PlanSourceValue = { ...prev, text: next.text };
    return out;
  }
  return planSourceEmpty(next) ? null : next;
}

function writeMember(key: string, source: PlanSourceValue | null): Record<string, unknown> | null {
  if (!source || planSourceEmpty(source)) return null;
  return { "a:sourceOf": key, ...sourceWire(source) };
}

const SOURCE_NAMES = ["source", "statedBy", "derivedFrom"] as const;
const METER_OWNED = new Set<string>(["meterAgentKind", "method", ...SOURCE_NAMES]);
const LEVEL_OWNED = new Set<string>(["status", "statusWhen", ...SOURCE_NAMES]);

function cloneMember(o: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(o)) as Record<string, unknown>;
}

function cloneUnknown(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as unknown;
}

/** A value equality checks skip. Callers that spread a draft must copy it back. */
function hide<T extends object>(obj: T, key: string, value: unknown): T {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: false, configurable: true });
  return obj;
}

function carriedRaw(value: object | null | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const raw = (value as { raw?: unknown }).raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as Record<string, unknown>;
}

export function carryMeter<T extends PlanMeterDraft>(next: T, prev: PlanMeterDraft | null | undefined): T {
  const raw = carriedRaw(prev ?? undefined);
  if (raw && !carriedRaw(next)) hide(next, "raw", raw);
  return next;
}

export function carryLine<T extends PlanLevelLine>(next: T, prev: PlanLevelLine | null | undefined): T {
  const raw = carriedRaw(prev ?? undefined);
  if (raw && !carriedRaw(next)) hide(next, "raw", raw);
  return next;
}

export function lineOthers(lines: readonly PlanLevelLine[] | null | undefined): unknown[] {
  if (!lines) return [];
  const extras = (lines as { others?: unknown }).others;
  return Array.isArray(extras) ? extras.slice() : [];
}

/** `others` rides on the array. An empty list leaves the array untouched. */
export function withLineOthers<T extends PlanLevelLine[]>(lines: T, others: readonly unknown[]): T {
  if (others.length === 0) return lines;
  Object.defineProperty(lines, "others", {
    value: others.slice(),
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return lines;
}

function spellings(o: Record<string, unknown>, name: string): string[] {
  const keys: string[] = [];
  if (Object.prototype.hasOwnProperty.call(o, `a:${name}`)) keys.push(`a:${name}`);
  if (Object.prototype.hasOwnProperty.call(o, name)) keys.push(name);
  const suffixA = `/a/${name}`;
  const suffix = `/${name}`;
  for (const key of Object.keys(o)) {
    if (!isFullIri(key)) continue;
    if (key.endsWith(suffixA) || key.endsWith(suffix)) keys.push(key);
  }
  return keys;
}

function deleteSpellings(o: Record<string, unknown>, name: string): void {
  for (const key of spellings(o, name)) delete o[key];
}

function hasUnknown(o: Record<string, unknown>, owned: ReadonlySet<string>): boolean {
  for (const key of Object.keys(o)) {
    if (!owned.has(localFactKey(key))) return true;
  }
  return false;
}

function isSkippableSingleton(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  return isIdOnlyLink(o) || isValueObject(o);
}

/** One served list, in order. A JSON string is parsed. A lone link is nothing. */
function listItems(raw: unknown): unknown[] {
  let data = raw;
  if (typeof data === "string") {
    const parsed = parseStructured(data);
    if (parsed == null) return [];
    data = parsed;
  }
  if (data == null) return [];
  if (Array.isArray(data)) return data.slice();
  if (typeof data === "object") return [data];
  return [];
}

function asMember(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  return item as Record<string, unknown>;
}

/**
 * Copy a line-source member the card is not editing.
 * Bare local keys are spelled `a:`. Values are not rebuilt, so a statedBy list and
 * unknown fields stay. `@` keys and full IRIs stay as served.
 */
function copyUntouchedSource(o: Record<string, unknown>): Record<string, unknown> {
  const copy = cloneMember(o);
  let bare = false;
  for (const key of Object.keys(copy)) {
    if (key.startsWith("a:") || key.startsWith("@") || isFullIri(key)) continue;
    bare = true;
    break;
  }
  if (!bare) return copy;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(copy)) {
    if (key.startsWith("a:") || key.startsWith("@") || isFullIri(key)) {
      out[key] = value;
      continue;
    }
    const prefixed = `a:${key}`;
    if (Object.prototype.hasOwnProperty.call(out, prefixed)) out[key] = value;
    else out[prefixed] = value;
  }
  return out;
}

function readMethod(o: Record<string, unknown>): string {
  const methodRaw = memberValue(o, "method");
  return typeof methodRaw === "string" ? methodRaw : "";
}

function meterUntouched(draft: PlanMeterDraft): boolean {
  const raw = carriedRaw(draft);
  if (!raw) return false;
  return (draft.method ?? "") === readMethod(raw) && planSourceEqual(draft.source, readMemberSource(raw));
}

function levelRead(raw: Record<string, unknown>): { status: string; when: string } {
  const whenValue = memberValue(raw, "statusWhen");
  const whenRaw = typeof whenValue === "string" ? whenValue.trim() : "";
  const statusValue = memberValue(raw, "status");
  return {
    status: typeof statusValue === "string" ? statusValue.trim() : "",
    when: whenRaw.slice(0, 10),
  };
}

function levelUntouched(line: PlanLevelLine): boolean {
  const raw = carriedRaw(line);
  if (!raw) return false;
  const read = levelRead(raw);
  return line.status === read.status && line.when === read.when && planSourceEqual(line.source, readMemberSource(raw));
}

/** `a:lineSources` as key → source. At most one source per key. Junk is {}. */
export function readLineSources(raw: unknown): Record<string, PlanSourceValue> {
  try {
    const out: Record<string, PlanSourceValue> = {};
    for (const o of servedList(raw)) {
      const keyRaw = memberValue(o, "sourceOf");
      const key = sourceKey(typeof keyRaw === "string" ? keyRaw : "");
      if (!key) continue;
      const source = readMemberSource(o);
      if (planSourceEmpty(source)) continue;
      out[key] = source;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Set, replace, or remove the one member for `key`.
 * A string is the old text-only write. An empty value removes the member when nothing else is on it.
 * A member for another key is copied, not rebuilt. A member with no `sourceOf` is copied as served.
 * A later duplicate of `key` is kept.
 *
 * A `statedBy` that is a list of parties is kept until this edit changes that line's source.
 * Setting a new source replaces the list: that is the person's edit.
 */
export function writeLineSource(raw: unknown, key: string, who: string | PlanSourceValue): unknown[] {
  const want = sourceKey(key);
  const next: unknown[] = [];
  let placed = false;
  let items: unknown[] = [];
  try {
    items = isSkippableSingleton(raw) ? [] : listItems(raw);
  } catch {
    items = [];
  }
  for (const item of items) {
    const o = asMember(item);
    if (!o) {
      next.push(cloneUnknown(item));
      continue;
    }
    const keyRaw = memberValue(o, "sourceOf");
    const k = sourceKey(typeof keyRaw === "string" ? keyRaw : "");
    if (!k) {
      next.push(cloneMember(o));
      continue;
    }
    if (want && k === want) {
      if (!placed) {
        const prev = readMemberSource(o);
        const merged = mergeSource(prev, who);
        if (merged && planSourceEqual(merged, prev)) {
          next.push(cloneMember(o));
        } else if (merged && !planSourceEmpty(merged)) {
          next.push(writeEditedSource(o, want, merged));
        } else {
          const kept = sourceMemberWithoutSource(o, want);
          if (kept) next.push(kept);
        }
        placed = true;
      } else {
        next.push(copyUntouchedSource(o));
      }
      continue;
    }
    next.push(copyUntouchedSource(o));
  }
  if (want && !placed) {
    const member = writeMember(want, mergeSource({}, who));
    if (member) next.push(member);
  }
  return next;
}

function writeEditedSource(o: Record<string, unknown>, key: string, source: PlanSourceValue): Record<string, unknown> {
  const entry = cloneMember(o);
  deleteSpellings(entry, "sourceOf");
  for (const name of SOURCE_NAMES) deleteSpellings(entry, name);
  entry["a:sourceOf"] = key;
  Object.assign(entry, sourceWire(source));
  return entry;
}

/** Source cleared. The member stays only when a key this card does not own is still on it. */
function sourceMemberWithoutSource(o: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const entry = cloneMember(o);
  deleteSpellings(entry, "sourceOf");
  for (const name of SOURCE_NAMES) deleteSpellings(entry, name);
  if (!hasUnknown(entry, new Set(["sourceOf", ...SOURCE_NAMES]))) return null;
  entry["a:sourceOf"] = key;
  return entry;
}

function blankMeters(): PlanMeters {
  return { human: blankMeter(), ai: blankMeter(), instrument: blankMeter() };
}

/** The three meter kinds. A missing kind is empty. Junk is three empty kinds. */
export function readMeters(raw: unknown): PlanMeters {
  const out = blankMeters();
  const others: unknown[] = [];
  try {
    if (!isSkippableSingleton(raw)) {
      for (const item of listItems(raw)) {
        const o = asMember(item);
        if (!o) {
          others.push(cloneUnknown(item));
          continue;
        }
        const kind = String(memberValue(o, "meterAgentKind") ?? "").trim().toLowerCase();
        if (kind !== "human" && kind !== "ai" && kind !== "instrument") {
          others.push(cloneMember(o));
          continue;
        }
        // A second member of a known kind is kept in others. The first stays.
        if (carriedRaw(out[kind])) {
          others.push(cloneMember(o));
          continue;
        }
        const draft: PlanMeterDraft = {
          method: readMethod(o),
          source: readMemberSource(o),
        };
        hide(draft, "raw", cloneMember(o));
        out[kind] = draft;
      }
    }
  } catch {
    return blankMeters();
  }
  if (others.length) out.others = others;
  return out;
}

function writeMeterMember(kind: PlanMeterKind, draft: PlanMeterDraft): Record<string, unknown> | null {
  if (meterUntouched(draft)) return cloneMember(carriedRaw(draft)!);
  const method = (draft.method ?? "").trim();
  const facts = sourceWire(draft.source);
  const raw = carriedRaw(draft);
  if (!method && Object.keys(facts).length === 0 && !raw) return null;
  const entry: Record<string, unknown> = raw ? cloneMember(raw) : {};
  deleteSpellings(entry, "meterAgentKind");
  deleteSpellings(entry, "method");
  for (const name of SOURCE_NAMES) deleteSpellings(entry, name);
  entry["a:meterAgentKind"] = kind;
  if (method) entry["a:method"] = method;
  Object.assign(entry, facts);
  if (!method && Object.keys(facts).length === 0 && !hasUnknown(entry, METER_OWNED)) return null;
  return entry;
}

/** Human, then ai, then instrument. Unknown members follow, in the order they were served. An entry with no method, no source, and no other key is omitted. */
export function writeMeters(meters: PlanMeters): unknown[] {
  const out: unknown[] = [];
  for (const kind of METER_KINDS) {
    const written = writeMeterMember(kind, meters?.[kind] ?? blankMeter());
    if (written) out.push(written);
  }
  for (const other of meters?.others ?? []) out.push(cloneUnknown(other));
  return out;
}

/**
 * Latest date is Status; the rest are Past, newest first.
 * The same date: the later entry in `raw` is newer (a new line is appended).
 * `lines` for {@link writeLevelLines} is newest first, so the write stores the newest last.
 */
export function readLevelLines(raw: unknown): { status: PlanLevelLine | null; past: PlanLevelLine[]; others?: unknown[] } {
  try {
    const rows: { line: PlanLevelLine; index: number }[] = [];
    const others: unknown[] = [];
    if (!isSkippableSingleton(raw)) {
      listItems(raw).forEach((item, index) => {
        const o = asMember(item);
        if (!o) {
          others.push(cloneUnknown(item));
          return;
        }
        const read = levelRead(o);
        if (!read.when && !read.status) {
          others.push(cloneMember(o));
          return;
        }
        const line: PlanLevelLine = { status: read.status, when: read.when, source: readMemberSource(o) };
        hide(line, "raw", cloneMember(o));
        rows.push({ line, index });
      });
    }
    rows.sort((a, b) => {
      if (a.line.when !== b.line.when) return a.line.when < b.line.when ? 1 : -1;
      return b.index - a.index;
    });
    const status = rows[0]?.line ?? null;
    const past = rows.slice(1).map((r) => r.line);
    return others.length ? { status, past, others } : { status, past };
  } catch {
    return { status: null, past: [] };
  }
}

function writeLevelMember(line: PlanLevelLine): Record<string, unknown> | null {
  if (levelUntouched(line)) return cloneMember(carriedRaw(line)!);
  const status = (line?.status ?? "").trim();
  const when = (line?.when ?? "").trim();
  const facts = sourceWire(line?.source);
  const raw = carriedRaw(line);
  if (!status && !when && !raw) return null;
  const entry: Record<string, unknown> = raw ? cloneMember(raw) : {};
  deleteSpellings(entry, "status");
  deleteSpellings(entry, "statusWhen");
  for (const name of SOURCE_NAMES) deleteSpellings(entry, name);
  if (status) entry["a:status"] = status;
  if (when) entry["a:statusWhen"] = when;
  Object.assign(entry, facts);
  if (!status && !when && Object.keys(facts).length === 0 && !hasUnknown(entry, LEVEL_OWNED)) return null;
  return entry;
}

/**
 * `lines` is newest first (Status, then Past). Stored oldest first so the next read keeps that order.
 * Known lines are reordered, so an other's original index is not a slot in that order.
 * Others are appended, in the order they were served.
 */
export function writeLevelLines(lines: readonly PlanLevelLine[]): unknown[] {
  const out: unknown[] = [];
  for (const line of [...lines].reverse()) {
    const written = writeLevelMember(line);
    if (written) out.push(written);
  }
  for (const other of lineOthers(lines)) out.push(cloneUnknown(other));
  return out;
}

/** Concept label and, when the record has one, its GilbVeda URL. No source on the object. */
export function readConcept(raw: unknown): PlanConcept {
  try {
    const data = parseStructured(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return { label: "", id: "" };
    const o = data as Record<string, unknown>;
    const label = memberValue(o, "label");
    return {
      label: typeof label === "string" ? label : "",
      id: typeof o["@id"] === "string" ? o["@id"] : "",
    };
  } catch {
    return { label: "", id: "" };
  }
}

/** `{ a:label, @id? }`. `@id` only when given. Null when both are empty. Never `a:source`. */
export function writeConcept(concept: PlanConcept): Record<string, string> | null {
  const label = (concept?.label ?? "").trim();
  const id = (concept?.id ?? "").trim();
  if (!label && !id) return null;
  const out: Record<string, string> = {};
  if (label) out["a:label"] = label;
  if (id) out["@id"] = id;
  return out;
}

/** Readable text for a structured Plan line. `raw` may be the served object or a JSON string. Empty is "—". */
export function planValueText(localName: string, raw: unknown): string {
  switch (localName) {
    case "stakeholders":
      return stakeholderText(raw);
    case "concept":
      return conceptText(raw);
    case "fvParent":
      return parentText(raw);
    case "hasMeter":
      return meterText(raw);
    case "levelStatements":
      return statusText(raw);
    case "lineSources":
      return sourcesText(raw);
    default: {
      if (raw == null || raw === "") return "—";
      return typeof raw === "string" ? raw : "—";
    }
  }
}
