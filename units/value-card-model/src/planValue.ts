/**
 * The Value card's reading, writing and level-line text. Pure: no React.
 *
 * Every stored name is a live GilbVeda term: VALUE_TERMS (planValueModel.ts), LEVEL_TERMS and
 * VALUE_CHILD_TERMS below. The older names are read as bare slugs only (fallback) and are never written; a record that
 * holds them gets the new keys and the old ones nulled in the same patch.
 * Reading never throws: junk in is empty data. Members this file does not own are kept and written back.
 */
import {
  asPlanSource,
  memberValue,
  planSourceEmpty,
  planSourceEqual,
  readLineSources,
  rowServedFact,
  writeLineSource,
  type PlanSourceValue,
} from "@kaigilb/gilbplatformcode-plan-card-facts";
import { isResourceType } from "@kaigilb/gilbplatformcode-plan-kinds";
import { ALL_VALUE, eq, packQualifierValues, qualifierValues } from "@kaigilb/gilbplatformcode-qualifier-values";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { isTypeName } from "@kaigilb/gilbplatformcode-type-key";
import type { BaseRecord } from "./baseRecord";
import {
  STANDARD_LEVEL_KINDS,
  kindClass,
  LEGACY_VALUE_SLUGS,
  VALUE_TERMS,
  type EndpointPart,
  type LevelQualifier,
  type MeterKind,
  type ScaleDirection,
  type ScaleVariable,
  type ValueCardData,
  type ValueLevel,
  type ValueMeter,
  type ValueMeterLine,
} from "./planValueModel";

type Rec = Record<string, unknown>;

/** The slug (no `a:`) each Value line is patched under. `patchRecord` adds the `a:`. */
/** The Endpoint's older stored name (it is now a:endpoint). Still read, never written. */
export const LEGACY_ENDPOINT_SLUG = LEGACY_VALUE_SLUGS.endpoint;
/** The Scale's older stored name (renamed to a:hasScale). Still read, never written. */
export const LEGACY_SCALE_SLUG = LEGACY_VALUE_SLUGS.scale;

/** `scale` and `endpoint` are written; `scaleVariables`, `meters` and `levels` are the old stored lists (read-only). */
export const VALUE_SLUGS = {
  scale: VALUE_TERMS.scale.slice(2),
  endpoint: VALUE_TERMS.endpoint.slice(2),
  scaleVariables: LEGACY_VALUE_SLUGS.scaleVariables,
  meters: LEGACY_VALUE_SLUGS.meters,
  levels: LEGACY_VALUE_SLUGS.levels,
} as const;

/** Every Value member the card reads (the old names are read, never written). */
export const VALUE_SLUG_LIST: readonly string[] = [...Object.values(VALUE_SLUGS), LEGACY_ENDPOINT_SLUG, LEGACY_SCALE_SLUG];
/** The members the card writes into the Value. The Scale, levels, qualifiers and meters are their own records; the old lists are never written again. */
export const VALUE_PATCH_SLUGS: readonly string[] = [VALUE_SLUGS.endpoint];

/* ------------------------------------------------------------------ blanks */

export function blankLevelQualifier(): LevelQualifier {
  return { when: "", variables: {}, conditions: [], side: "" };
}

export function blankLevel(kind = "Goal"): ValueLevel {  // a Resource card passes "Budget"
  return { kind, value: null, qualifier: blankLevelQualifier(), source: {}, note: "" };
}

/** What {@link levelLike} needs to know about the set the new level joins. */
export interface LevelLikeOpts {
  /** The levels of the set (the Arrow row, the Timeline series) the new one joins. */
  members: readonly ValueLevel[];
  /** The middle of the value axis, used when the set has no Status and no Tolerable + Goal. */
  axisMid: number;
  /** Snaps a value to the axis step (the graph's `snapValue`). Default: as is. */
  snap?: (v: number) => number;
  /** Today as YYYY-MM-DD (default: the user's own calendar day). */
  today?: string;
  /** Click-to-place: this date ("" = none) replaces the default date. */
  when?: string;
  /** Click-to-place: this value replaces the default value. */
  value?: number;
  /** The card is a Development Resource: Budget counts as the Goal point. */
  resource?: boolean;
}

/** The member of `kinds` (lower case) with the latest date, ties to the later one, that has a value. */
function latestOf(members: readonly ValueLevel[], kinds: string[], needValue: boolean, resource?: boolean): ValueLevel | undefined {
  let best: ValueLevel | undefined;
  for (const l of members) {
    if (!kinds.includes(kindClass(l.kind, resource))) continue;
    if (needValue && l.value === null) continue;
    if (!best || l.qualifier.when >= best.qualifier.when) best = l;
  }
  return best;
}

/** The user's own calendar day as YYYY-MM-DD (not the UTC day: east of UTC it is a day ahead just after local midnight). */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * A new level of `kind` in the same qualifier set as `from` (the level that defines the set: the first level of the Timeline series,
 * the first target of the Arrow row). The qualifier is a fresh copy (choices, free conditions, side). The date puts it where the
 * user added it from: Status today; Past none; any other kind the row's date on the Arrow (rows are keyed by it) and the date of
 * the set's latest Tolerable/Goal/Wish on the Timeline (none when it has none). The value is the set's latest Status, else the
 * middle of its Tolerable and Goal, else the axis middle, snapped.
 */
export function levelLike(from: ValueLevel, kind: string, opts: LevelLikeOpts): ValueLevel {
  const k = kind.toLowerCase();
  const q = from.qualifier;
  const variables: Record<string, string | string[]> = {};
  for (const [name, v] of Object.entries(q.variables)) variables[name] = Array.isArray(v) ? [...v] : v;
  let when: string;
  if (opts.when !== undefined) when = opts.when;
  else if (k === "status") when = opts.today ?? localToday();
  else if (k === "past") when = "";
  else when = latestOf(opts.members, ["tolerable", "goal", "wish"], false, opts.resource)?.qualifier.when ?? "";
  let value: number;
  if (opts.value !== undefined) value = opts.value;
  else {
    const status = latestOf(opts.members, ["status"], true);
    const tol = latestOf(opts.members, ["tolerable"], true);
    const goal = latestOf(opts.members, ["goal"], true, opts.resource);
    if (status) value = status.value as number;
    else if (tol && goal) value = ((tol.value as number) + (goal.value as number)) / 2;
    else value = opts.axisMid;
  }
  if (opts.snap) value = opts.snap(value);
  return { kind, value, qualifier: { when, variables, conditions: [...q.conditions], side: q.side }, source: {}, note: "" };
}

export function blankEndpointPart(): EndpointPart {
  return { typeIri: "", typeLabel: "", words: "" };
}

/** An Endpoint part built as a type pick builds it (same IRI form and label), words empty. */
function defaultEndpointPart(typeName: string): EndpointPart {
  return { typeIri: `${termOrigin()}/base/t/${typeName}`, typeLabel: typeName, words: "" };
}

/** The Endpoint types a card shows before any Endpoint is stored: a Value Thing / Person, a Development Resource Organization / Person. */
export function defaultEndpointFor(resource?: boolean): { subject: EndpointPart; reference: EndpointPart } {
  return { subject: defaultEndpointPart(resource ? "Organization" : "Thing"), reference: defaultEndpointPart("Person") };
}

/** The Scale direction a card shows before any Scale is stored: a Development Resource "lower" (less cost is better), a Value "higher". */
export function defaultDirectionFor(resource?: boolean): ScaleDirection {
  return resource ? "lower" : "higher";
}

export function emptyValueCard(): ValueCardData {
  return {
    scale: { text: "", unit: "", rate: "", context: "", direction: "higher", source: {} },
    variables: [],
    endpoint: { subject: blankEndpointPart(), reference: blankEndpointPart(), text: "", source: {} },
    meters: [],
    levels: [],
  };
}

/* ------------------------------------------------------- carried raw members */

function hide<T extends object>(obj: T, key: string, value: unknown): T {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: false, configurable: true });
  return obj;
}

function rawOf(obj: object | null | undefined): Rec | undefined {
  const raw = (obj as { raw?: unknown } | null | undefined)?.raw;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Rec) : undefined;
}

/** Copy the carried unknown members of `prev` onto `next` (an edit that spread the object loses them). */
export function carryRaw<T extends object>(next: T, prev: object | null | undefined): T {
  const raw = rawOf(prev);
  if (raw && !rawOf(next)) hide(next, "raw", raw);
  const rec = recOf(prev);
  if (rec && !recOf(next)) hide(next, "rec", rec);
  const key = levelKey(prev);
  if (key && !levelKey(next)) hide(next, "lkey", key);
  return next;
}

/** A level's identity while it is edited: its record id, or `new:n` before its record exists. Not enumerable. */
export function levelKey(level: object | null | undefined): string | undefined {
  const key = (level as { lkey?: unknown } | null | undefined)?.lkey;
  return typeof key === "string" && key ? key : undefined;
}

export function setLevelKey<T extends object>(level: T, key: string): T {
  return hide(level, "lkey", key);
}

// A level made on the card has the key `new:n` until its record exists; the record's id is its key from then on. The host says which
// became which, so a popover or a drag held on the new level finds it again after the save.
const keyAlias = new Map<string, string>();
export function aliasLevelKey(from: string, to: string): void {
  keyAlias.set(from, to);
}
export function resolveLevelKey(key: string): string {
  return keyAlias.get(key) ?? key;
}

/** The level record a level was read from (not enumerable, so an edit that spreads the level must carry it). */
export function recOf(level: object | null | undefined): BaseRecord | undefined {
  const rec = (level as { rec?: unknown } | null | undefined)?.rec;
  return rec && typeof rec === "object" ? (rec as BaseRecord) : undefined;
}

/** Items of a list that did not parse ride on the array, not enumerable. */
export function othersOf(list: readonly unknown[] | null | undefined): unknown[] {
  const o = (list as { others?: unknown } | null | undefined)?.others;
  return Array.isArray(o) ? o.slice() : [];
}

export function withOthers<T extends unknown[]>(list: T, others: readonly unknown[]): T {
  if (others.length) hide(list, "others", others.slice());
  return list;
}

/** A list built by an edit keeps the unknown items of the list it came from. */
export function carryOthers<T extends unknown[]>(next: T, prev: readonly unknown[] | null | undefined): T {
  return withOthers(next, othersOf(prev));
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function localKey(key: string): string {
  if (key.startsWith("a:")) return key.slice(2);
  if (/^https?:\/\//i.test(key)) return key.slice(key.lastIndexOf("/") + 1);
  return key;
}

const SOURCE_KEYS = ["source", "statedBy", "derivedFrom"];

/** A clone of the carried member with the owned keys removed, ready for the owned keys to be written. */
function base(obj: object, owned: readonly string[]): Rec {
  const raw = rawOf(obj);
  const out: Rec = raw ? clone(raw) : {};
  for (const k of Object.keys(out)) if (owned.includes(localKey(k))) delete out[k];
  return out;
}

function hasUnknown(entry: Rec, owned: readonly string[]): boolean {
  return Object.keys(entry).some((k) => !owned.includes(localKey(k)));
}

/* ------------------------------------------------------------- raw reading */

function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const t = raw.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

function listOf(raw: unknown): unknown[] {
  const data = parseJson(raw);
  if (data == null) return [];
  if (Array.isArray(data)) return data.slice();
  if (typeof data === "object") return [data];
  return [];
}

function asRec(item: unknown): Rec | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const o = item as Rec;
  const keys = Object.keys(o);
  if (keys.length === 1 && keys[0] === "@id") return null;
  if ("@value" in o) return null;
  return o;
}

function str(o: Rec, name: string): string {
  const v = memberValue(o, name);
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function refId(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const id = (v as Rec)["@id"];
    if (typeof id === "string") return id.trim();
  }
  return "";
}

function readSource(o: Rec): PlanSourceValue {
  const out: PlanSourceValue = {};
  const text = memberValue(o, "source");
  if (typeof text === "string" && text.trim()) out.text = text.trim();
  const stated = refId(memberValue(o, "statedBy"));
  const derived = refId(memberValue(o, "derivedFrom"));
  if (stated) out.statedBy = stated;
  if (derived) out.derivedFrom = derived;
  return out;
}

function sourceWire(source: PlanSourceValue | null | undefined): Rec {
  const s = asPlanSource(source ?? {});
  const out: Rec = {};
  if (s.text) out["a:source"] = s.text;
  if (s.statedBy) out["a:statedBy"] = { "@id": s.statedBy };
  if (s.derivedFrom) out["a:derivedFrom"] = { "@id": s.derivedFrom };
  return out;
}

function set(entry: Rec, name: string, value: unknown): void {
  if (value === "" || value === null || value === undefined) return;
  if (Array.isArray(value) && value.length === 0) return;
  entry[`a:${name}`] = value;
}

/* ------------------------------------------------------------------- scale */

// The Scale sentence is a:description inside a:hasScale. The older a:scale / a:scaleText are owned too, so they are read but never carried.
const SCALE_OWNED = ["unit", "rate", "scaleContext", "scaleDirection", "description", "scale", "scaleText", ...SOURCE_KEYS];
const DIRECTIONS: readonly ScaleDirection[] = ["lower", "higher", "target"];

/** A stored Scale with no (or an unknown) direction is an old one and keeps meaning "lower". */
function readDirection(v: string): ScaleDirection {
  const t = v.trim().toLowerCase();
  return (DIRECTIONS as readonly string[]).includes(t) ? (t as ScaleDirection) : "lower";
}

/**
 * The one resolved Scale direction every reader uses (graph arrow and bands, geometry, Timeline "better", the Better field).
 * A Value with no Scale yet is "higher"; an old stored Scale with no direction was read as "lower" by readScale.
 */
export function scaleDirectionOf(data: { scale?: { direction?: ScaleDirection } } | null | undefined): ScaleDirection {
  const d = data?.scale?.direction;
  return d && (DIRECTIONS as readonly string[]).includes(d) ? d : "higher";
}

function readScale(raw: unknown): ValueCardData["scale"] {
  const o = asRec(listOf(raw)[0]);
  const out = emptyValueCard().scale; // no Scale yet: "higher"
  if (!o) return out;
  // Read a:description first, then the older a:scale / a:scaleText (read-only; dropped on the next write).
  out.text = str(o, "description") || str(o, "scale") || str(o, "scaleText");
  out.unit = str(o, "unit");
  out.rate = str(o, "rate");
  out.context = str(o, "scaleContext");
  out.direction = readDirection(str(o, "scaleDirection"));
  out.source = readSource(o);
  return hide(out, "raw", clone(o));
}

/**
 * The facts of the Value's Scale RECORD (a t:Scale, `a:partOf` the Value), keyed `a:`. Null when the Scale is empty.
 * The Value itself carries only `a:hasScale` = `{"@id": record}`; the Scale is never written inline.
 */
export function scaleFacts(s: ValueCardData["scale"], resource?: boolean): Rec | null {
  const entry = base(s, SCALE_OWNED);
  const text = s.text.trim();
  set(entry, "description", text);
  set(entry, "unit", s.unit.trim());
  set(entry, "rate", s.rate.trim());
  set(entry, "scaleContext", s.context.trim());
  const facts = sourceWire(s.source);
  const any = text || s.unit.trim() || s.rate.trim() || s.context.trim() || Object.keys(facts).length || s.direction !== defaultDirectionFor(resource);
  if (!any && !hasUnknown(entry, SCALE_OWNED)) return null;
  // Always stored, "lower" included, so a later change of the default can never flip a saved Value.
  entry["a:scaleDirection"] = s.direction;
  Object.assign(entry, facts);
  return entry;
}

/* --------------------------------------------------------------- variables */

function readVariables(raw: unknown): ScaleVariable[] {
  const out: ScaleVariable[] = [];
  const others: unknown[] = [];
  for (const item of listOf(raw)) {
    const o = asRec(item);
    if (!o) {
      others.push(clone(item));
      continue;
    }
    const options = listOf(memberValue(o, "qualifierOptions") ?? memberValue(o, "options"))
      .map((x) => asRec(x))
      .filter((x): x is Rec => !!x)
      .map((x) => ({ name: str(x, "name"), definition: str(x, "definition") }));
    const v: ScaleVariable = {
      name: str(o, "name"),
      definition: str(o, "definition"),
      defaultOption: str(o, "defaultOption"),
      options,
      source: readSource(o),
    };
    out.push(hide(v, "raw", clone(o)));
  }
  return withOthers(out, others);
}

/* ---------------------------------------------------------------- endpoint */

// Endpoint: `a:endpoint` holds `a:endpointSubject` / `a:endpointReference`, each { "@id": type IRI, "a:label", "a:description" }.
// The older `a:valueEndpoint` and the part words under `a:text` are still read; only the new names are written.
// The old free text lives under `a:endpointText`; `a:definition` is still read as a fallback for older writes.
// The sentence is `a:description` of the a:endpoint container. The older endpointText / definition are owned too:
// they are read, moved to a:description on the first edit, and never carried (even when no part is typed).
const END_OWNED = ["endpointSubject", "endpointReference", "definition", "endpointText", "description", ...SOURCE_KEYS];

function readPart(o: Rec, key: string): EndpointPart {
  const first = listOf(memberValue(o, key))[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return blankEndpointPart();
  const part = first as Rec;
  const id = part["@id"];
  return { typeIri: typeof id === "string" ? id : "", typeLabel: str(part, "label"), words: str(part, "description") || str(part, "text") };
}

function writePart(part: EndpointPart): Rec | null {
  if (!part.typeIri && !part.words.trim()) return null;
  const out: Rec = {};
  if (part.typeIri) out["@id"] = part.typeIri;
  if (part.typeLabel) out["a:label"] = part.typeLabel;
  if (part.words.trim()) out["a:description"] = part.words.trim();
  return out;
}

function readEndpoint(raw: unknown): ValueCardData["endpoint"] {
  const o = asRec(listOf(raw)[0]);
  if (!o) return { subject: blankEndpointPart(), reference: blankEndpointPart(), text: "", source: {} };
  return hide(
    {
      subject: readPart(o, "endpointSubject"),
      reference: readPart(o, "endpointReference"),
      text: str(o, "description") || str(o, "endpointText") || str(o, "definition"),
      source: readSource(o),
    },
    "raw",
    clone(o),
  );
}

function writeEndpoint(e: ValueCardData["endpoint"]): Rec | null {
  const entry = base(e, END_OWNED);
  const sub = writePart(e.subject);
  const ref = writePart(e.reference);
  if (sub) entry["a:endpointSubject"] = sub;
  if (ref) entry["a:endpointReference"] = ref;
  // Once a part is typed the types carry what the old free text said, so the sentence is dropped.
  // With no part typed the sentence moves to a:description (the old key is never carried).
  if (!sub && !ref) set(entry, "description", e.text.trim());
  const facts = sourceWire(e.source);
  if (!Object.keys(entry).length && !Object.keys(facts).length) return null;
  return Object.assign(entry, facts);
}

/* ------------------------------------------------------------------ meters */

const METER_KINDS: readonly MeterKind[] = ["human", "ai", "instrument"];

export function readLegacyMeters(raw: unknown): ValueMeter[] {
  return readMeters(raw);
}

export function readLegacyVariables(raw: unknown): ScaleVariable[] {
  return readVariables(raw);
}

function readMeters(raw: unknown): ValueMeter[] {
  const out: ValueMeter[] = [];
  const others: unknown[] = [];
  for (const item of listOf(raw)) {
    const o = asRec(item);
    if (!o) {
      others.push(clone(item));
      continue;
    }
    const lines: ValueMeterLine[] = [];
    const lineOthers: unknown[] = [];
    for (const li of listOf(memberValue(o, "lines"))) {
      const lo = asRec(li);
      const kind = lo ? str(lo, "meterAgentKind").trim().toLowerCase() : "";
      if (!lo || !(METER_KINDS as readonly string[]).includes(kind)) {
        lineOthers.push(clone(li));
        continue;
      }
      lines.push(hide({ kind: kind as MeterKind, method: str(lo, "meterMethod") || str(lo, "method") || str(lo, "measurementMethod"), source: readSource(lo) }, "raw", clone(lo)));
    }
    withOthers(lines, lineOthers);
    out.push(hide({ qualifier: str(o, "meterQualifier") || str(o, "qualifier"), lines }, "raw", clone(o)));
  }
  return withOthers(out, others);
}

/* ------------------------------------------------------------------ levels */

/**
 * A typed number. A comma followed by exactly 3 digits (and no other comma or dot) is a thousands separator
 * (1,000 -> 1000; 1,000,000 -> 1000000); a comma followed by 1-2 or 4+ digits is a decimal comma (9,5 -> 9.5).
 * With both , and . the last one is the decimal mark. null when the text is not a number. May return +-Infinity
 * (too large): callers must check Number.isFinite.
 */
export function parseNumberText(text: string): number | null {
  const s = String(text ?? "").trim();
  if (!/^-?\d+(?:[.,]\d+)*$/.test(s)) return null;
  const count = (ch: string) => s.split(ch).length - 1;
  const lastC = s.lastIndexOf(",");
  const lastD = s.lastIndexOf(".");
  let norm: string;
  if (lastC >= 0 && lastD >= 0) {
    const dec = lastC > lastD ? "," : ".";
    const thou = dec === "," ? "." : ",";
    if (count(dec) !== 1) return null;
    norm = s.split(thou).join("").replace(dec, ".");
  } else if (lastC >= 0) {
    const groups = s.split(",");
    if (groups.length > 2) {
      if (!groups.slice(1).every((g) => g.length === 3)) return null;
      norm = groups.join("");
    } else norm = groups[1]!.length === 3 ? groups.join("") : `${groups[0]}.${groups[1]}`;
  } else {
    if (count(".") > 1) return null;
    norm = s;
  }
  return Number(norm);
}

function numberOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = parseNumberText(v);
    if (n !== null && Number.isFinite(n)) return n;
  }
  return null;
}

/* ------------------------------------------------------------------ levels */

/**
 * Each level is its own record, a part of the Value (`a:partOf`), typed by its kind.
 * Every level term name is in this one map. All are live GilbVeda terms.
 */
export const LEVEL_TERMS = {
  value: "a:scaleNumber",
  when: "a:levelWhen",
  conditions: "a:levelCondition",
  choice: "a:levelQualifierChoice",
  side: "a:levelSide",
  note: "a:note",
  tag: "a:unitTag",
  label: "a:label",
  sources: "a:lineSources",
  partOf: "a:partOf",
  order: "a:elementOrder",
} as const;

/** `a:${slug}`, built so an older name is a read key and not a written term. */
const termOf = (slug: string) => `a:${slug}`;

/** The older stored names of each level fact (bare slugs), tried in order after the new one. Read-only. */
const LEVEL_LEGACY: Readonly<Record<string, readonly string[]>> = {
  scaleNumber: ["measurementValue", "levelValue"],
  levelCondition: ["qualifierCondition", "levelConditions"],
  levelQualifierChoice: ["levelVariables"],
};

/** The older record type of a custom-word level (now t:Level). Read-only. */
const LEGACY_CUSTOM_LEVEL_TYPE = "PlanguageLevel";

const slugOf = (term: string) => term.slice(2);

/** The type name (no `t:`) of a custom-word level. The word itself is in `a:label`. */
export const CUSTOM_LEVEL_TYPE = "Level";

/** The stored type of a Development Resource's Budget level (`t:Budget`). A Value's custom word "Budget" stays `t:Level`. */
export const BUDGET_LEVEL_TYPE = "Budget";

/** On a Development Resource the level word "Goal" is Budget (typed, pasted or chosen). Any other kind, and every Value, is unchanged. */
export function resourceKind(kind: string, resource?: boolean): string {
  return resource && kind.trim().toLowerCase() === "goal" ? "Budget" : kind;
}

/** The record type name a level kind is stored under. On a Resource card, "Budget" is `t:Budget`; `cardTypeUri` is left out for a Value. */
export function levelTypeName(kind: string, cardTypeUri?: string): string {
  if (cardTypeUri) kind = resourceKind(kind, isResourceType(cardTypeUri));
  const hit = STANDARD_LEVEL_KINDS.find((k) => k.toLowerCase() === kind.trim().toLowerCase());
  if (!hit && cardTypeUri && isResourceType(cardTypeUri) && kind.trim().toLowerCase() === "budget") return BUDGET_LEVEL_TYPE;
  return hit ?? CUSTOM_LEVEL_TYPE;
}

/** Is this record type one of the level types? (The older custom type is still read.) */
export function isLevelType(typeUri: string): boolean {
  return (
    isTypeName(typeUri, CUSTOM_LEVEL_TYPE) ||
    isTypeName(typeUri, LEGACY_CUSTOM_LEVEL_TYPE) ||
    isTypeName(typeUri, BUDGET_LEVEL_TYPE) ||
    STANDARD_LEVEL_KINDS.some((k) => isTypeName(typeUri, k))
  );
}

/** The served value of a fact under its new slug, else under the first older slug that holds one. */
function servedWithLegacy(row: BaseRecord, slug: string): unknown {
  for (const s of [slug, ...(LEVEL_LEGACY[slug] ?? [])]) {
    const v = rowServedFact(row, s);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/** Is this record one choice `{a:name, a:qualifierOptions?}` (so never a map of Name -> options)? */
function isChoiceRec(o: Rec): boolean {
  return memberValue(o, "name") !== undefined;
}

/**
 * Qualifier choices from any wire shape, as `{ name: options }`: the list `[{a:name, a:qualifierOptions}]`, ONE such object
 * (the Base serves a one-item list as a lone object), a JSON string of either, or the older map `{Name: "Option" | [..]}`.
 * An object with a `name` / `a:name` key is a choice and is NEVER read as a map (read as a map it would give "name = Brand", "qualifierOptions = Volvo").
 */
function choiceMap(raw: unknown): Record<string, string | string[]> {
  const data = parseJson(raw);
  const out: Record<string, string | string[]> = {};
  const pack = (name: string, list: unknown[]) => {
    const names = list.filter((x): x is string => typeof x === "string" && !!x.trim());
    if (names.length === 1) out[name] = names[0]!;
    else if (names.length > 1) out[name] = names;
  };
  const lone = !Array.isArray(data) ? asRec(data) : null;
  if (Array.isArray(data) || (lone && isChoiceRec(lone))) {
    for (const item of Array.isArray(data) ? data : [data]) {
      const o = asRec(parseJson(item));
      const name = o ? str(o, "name").trim() : "";
      if (!o || !name) continue;
      const opts = listOf(memberValue(o, "qualifierOptions"));
      // No options = ALL (the term's a:does); the older ["ALL"] list reads the same way.
      if (opts.length === 0) out[name] = ALL_VALUE;
      else pack(name, opts);
    }
  } else if (lone) {
    for (const [k, v] of Object.entries(lone)) pack(k, Array.isArray(v) ? v : [v]);
  }
  return out;
}

/** The wire list for a level's qualifier choices. ALL is a choice with no a:qualifierOptions (the term's a:does). */
function choiceWire(choice: Record<string, string | string[]>): Rec[] {
  return Object.entries(choice)
    .filter(([, v]) => qualifierValues(v).length > 0)
    .map(([name, v]) => {
      const vals = qualifierValues(v);
      return vals.some((x) => eq(x, ALL_VALUE)) ? { "a:name": name } : { "a:name": name, "a:qualifierOptions": vals };
    });
}

/** A number as plain decimal text: never an exponent (1e21 is "1000000000000000000000", 1e-7 is "0.0000001"). */
export function plainNumberText(n: number): string {
  const t = String(n);
  if (!/e/i.test(t)) return t;
  return n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

/** The text the author typed for a level's number (a field of the level). */
export function levelNumberTyped(level: object | null | undefined): string | undefined {
  const t = (level as { valueText?: unknown } | null | undefined)?.valueText;
  return typeof t === "string" && t.trim() ? t.trim() : undefined;
}

/**
 * The number a level's text DRAWS at, or null when it is not a number. Never rewrites the text.
 *   - "5", "5.50", "-3" are numbers. A comma: "1,000" and "12,500" are thousands (1000, 12500); "1,5" and "3,25" are decimals;
 *     with a dot too the LAST mark is the decimal ("1.000,5" and "1,000.5" are 1000.5); "1,000,000" is 1000000.
 *   - "1 000 000" (spaced groups of three) is 1000000.
 *   - A range "5-10" (also "5 to 10", "5–10") is drawn at its midpoint, 7.5.
 */
export function levelDrawNumber(text: string): number | null {
  const one = (t: string): number | null => {
    const s = t.trim();
    // One comma + exactly 3 digits is thousands (1,000); other digit counts are a decimal comma (1,5); with both marks the last
    // one is the decimal (1.000,5 and 1,000.5 are 1000.5); several commas are thousands (1,000,000). That is parseNumberText.
    const parsed = parseNumberText(s);
    if (parsed !== null) return Number.isFinite(parsed) ? parsed : null;
    let norm: string | null = null;
    if (/^-?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?$/.test(s) && !(s.includes(",") && s.includes("."))) norm = s.replace(/[ \u00a0\u202f]/g, "").replace(",", ".");
    if (norm === null) return null;
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  };
  const whole = one(text);
  if (whole !== null) return whole;
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(?:-|\u2013|\u2014|to)\s*(-?\d+(?:[.,]\d+)?)\s*$/i.exec(text);
  if (m) {
    const a = one(m[1]!);
    const b = one(m[2]!);
    if (a !== null && b !== null) return (a + b) / 2;
  }
  return null;
}

/** The two ends of a range text ("5-10", "5 to 10"), or null when the text is not a range. */
export function levelRangeEnds(text: string): [number, number] | null {
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(?:-|\u2013|\u2014|to)\s*(-?\d+(?:[.,]\d+)?)\s*$/i.exec(text);
  if (!m) return null;
  const a = levelDrawNumber(m[1]!);
  const b = levelDrawNumber(m[2]!);
  return a !== null && b !== null ? [Math.min(a, b), Math.max(a, b)] : null;
}

/** A level's number fields from the author's text: what it draws at, and the text itself when that is not just that number. */
export function levelOfText(text: string): { value: number | null; valueText: string | undefined } {
  const t = text.trim();
  if (!t) return { value: null, valueText: undefined };
  const value = levelDrawNumber(t);
  return { value, valueText: value !== null && t === plainNumberText(value) ? undefined : t };
}

/**
 * The number fields of what a person TYPED in a level's value box. A typed number is written plainly as before (1,000 -> 1000,
 * 9,5 -> 9.5; 5.50 stays 5.50); any other text is kept as typed ("5-10", "approx. 5"): never refused, never rewritten.
 */
export function levelOfTyped(text: string): { value: number | null; valueText: string | undefined } {
  const t = text.trim();
  if (!t) return levelOfText(t);
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return levelOfText(t);
  const n = parseNumberText(t);
  return n !== null && Number.isFinite(n) ? levelOfText(plainNumberText(n)) : levelOfText(t);
}

/** The number fields of a stored a:scaleNumber (text, or an older JSON number). */
function levelNumberFields(raw: unknown): { value: number | null; valueText?: string } {
  if (typeof raw === "number") return { value: Number.isFinite(raw) ? raw : null };
  if (typeof raw === "string") {
    const f = levelOfText(raw);
    return f.valueText === undefined ? { value: f.value } : { value: f.value, valueText: f.valueText };
  }
  return { value: null };
}

/** The text to show for a level's number: the author's text, else the number as plain decimal text (never an exponent). "" when none. */
export function levelNumberDisplay(level: ValueLevel): string {
  return levelNumberText(level) ?? "";
}

/**
 * a:scaleNumber is TEXT, the author's own. It is the level's `valueText` while that still draws at the level's `value`
 * (a drag or a number edit that moved the value makes the plain number the text); else the number as plain decimal text.
 */
export function levelNumberText(level: ValueLevel): string | null {
  const typed = levelNumberTyped(level);
  if (typed && levelDrawNumber(typed) === level.value) return typed;
  if (level.value === null || !Number.isFinite(level.value)) return null;
  return plainNumberText(level.value);
}

/** The facts of one level, keyed by slug, as a level record holds them. Empty facts are left out. */
function levelFacts(level: ValueLevel, cardTypeUri?: string): Rec {
  const out: Rec = {};
  const q = level.qualifier;
  const numText = levelNumberText(level);
  if (numText !== null) out[slugOf(LEVEL_TERMS.value)] = numText;
  if (q.when.trim()) out[slugOf(LEVEL_TERMS.when)] = q.when.trim();
  if (q.conditions.length) out[slugOf(LEVEL_TERMS.conditions)] = q.conditions.slice();
  const choice = choiceWire(q.variables);
  if (choice.length) out[slugOf(LEVEL_TERMS.choice)] = choice;
  if (q.side) out[slugOf(LEVEL_TERMS.side)] = q.side;
  if (level.note.trim()) out[slugOf(LEVEL_TERMS.note)] = level.note.trim();
  if (levelTypeName(level.kind, cardTypeUri) === CUSTOM_LEVEL_TYPE) out[slugOf(LEVEL_TERMS.label)] = level.kind.trim();
  return out;
}

const cleanWord = (w: string) => w.replace(/[\s.]+/g, "");

/**
 * `<ValueTag>.<Kind>[.<choices>][.<Side>][.<YYYY-MM-DD>]`. Choices are the chosen values (ALL and unset left out), spaces
 * removed, joined by "-", in the order of `variableOrder` (then any other).
 */
export function levelTag(valueTag: string, level: ValueLevel, variableOrder: readonly string[] = []): string {
  const q = level.qualifier;
  const names = [
    ...variableOrder.filter((n) => Object.keys(q.variables).some((k) => eq(k, n))),
    ...Object.keys(q.variables).filter((k) => !variableOrder.some((n) => eq(n, k))),
  ];
  const picks: string[] = [];
  for (const name of names) {
    const key = Object.keys(q.variables).find((k) => eq(k, name))!;
    for (const v of qualifierValues(q.variables[key])) if (!eq(v, ALL_VALUE)) picks.push(cleanWord(v));
  }
  const parts = [valueTag.trim(), cleanWord(level.kind)];
  if (picks.filter(Boolean).length) parts.push(picks.filter(Boolean).join("-"));
  if (q.side) parts.push(q.side === "low" ? "Low" : "High");
  if (q.when.trim()) parts.push(q.when.trim());
  return parts.filter(Boolean).join(".");
}

/** The tag to try on the nth collision: n = 1 is the plain tag, 2 is `.2`, 3 is `.3`. */
export function levelTagTry(tag: string, n: number): string {
  return n <= 1 ? tag : `${tag}.${n}`;
}

/** The facts to create a level record with (slugs). `order` is its `a:elementOrder`; `source` rides in `a:lineSources`. */
export function levelCreateFacts(level: ValueLevel, tag: string, parentUri: string, order: number, cardTypeUri?: string): Rec {
  const facts: Rec = {
    [slugOf(LEVEL_TERMS.tag)]: tag,
    [slugOf(LEVEL_TERMS.partOf)]: { "@id": parentUri },
    [slugOf(LEVEL_TERMS.order)]: order,
    ...levelFacts(level, cardTypeUri),
  };
  if (!planSourceEmpty(level.source)) {
    facts[slugOf(LEVEL_TERMS.sources)] = writeLineSource([], LEVEL_TERMS.value, level.source);
  }
  return facts;
}

const LEVEL_FACT_SLUGS = [
  LEVEL_TERMS.value,
  LEVEL_TERMS.when,
  LEVEL_TERMS.conditions,
  LEVEL_TERMS.choice,
  LEVEL_TERMS.side,
  LEVEL_TERMS.note,
].map(slugOf);

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Normalise one level fact (so "5" and 5, or the two wire shapes of the choices, compare equal). */
function normLevelFact(slug: string, raw: unknown): unknown {
  // The number is compared as the text it is stored as.
  if (slug === slugOf(LEVEL_TERMS.value)) return typeof raw === "number" ? (Number.isFinite(raw) ? plainNumberText(raw) : null) : typeof raw === "string" && raw.trim() ? raw.trim() : null;
  if (slug === slugOf(LEVEL_TERMS.conditions)) {
    const list = listOf(raw).filter((c): c is string => typeof c === "string");
    return list.length ? list : null;
  }
  if (slug === slugOf(LEVEL_TERMS.choice)) {
    const o = choiceMap(raw);
    return Object.keys(o).length ? o : null;
  }
  if (typeof raw === "string") return raw.trim() ? raw : null;
  return raw ?? null;
}

/** Source of a level's number, from the new key or the older one (`a:measurementValue`). */
function levelSourceOf(raw: unknown): PlanSourceValue {
  const all = readLineSources(raw);
  return all[LEVEL_TERMS.value] ?? all[termOf("measurementValue")] ?? {};
}

/** `a:lineSources` without the member of the older key `legacyKey`. */
function withoutSourceKey(raw: unknown, legacyKey: string): unknown[] {
  return listOf(raw).filter((item) => {
    const o = asRec(item);
    const k = o ? memberValue(o, "sourceOf") : undefined;
    return !(typeof k === "string" && (k === legacyKey || k === legacyKey.slice(2)));
  });
}

/**
 * The patch that takes the stored level record `row` to `level`: only the facts that differ, `null` for one now empty.
 * Empty when nothing changed. Does not include the tag (the caller rebuilds it when this is not empty).
 * A record that still holds an older key is rewritten whole when it is edited: the new keys are written and the old ones nulled.
 */
export function levelPatch(row: BaseRecord, level: ValueLevel, cardTypeUri?: string): Record<string, unknown> {
  const want = levelFacts(level, cardTypeUri);
  const patch: Record<string, unknown> = {};
  const slugs = [...LEVEL_FACT_SLUGS, slugOf(LEVEL_TERMS.label)];
  for (const slug of slugs) {
    const next = normLevelFact(slug, want[slug]);
    const prev = normLevelFact(slug, servedWithLegacy(row, slug));
    if (!same(next, prev)) patch[slug] = want[slug] ?? null;
  }
  const srcSlug = slugOf(LEVEL_TERMS.sources);
  const prevRaw = rowServedFact(row, srcSlug);
  const legacySrc = termOf("measurementValue");
  const hasLegacySource = !!readLineSources(prevRaw)[legacySrc];
  if (!planSourceEqual(level.source, levelSourceOf(prevRaw))) {
    patch[srcSlug] = writeLineSource(hasLegacySource ? withoutSourceKey(prevRaw, legacySrc) : prevRaw, LEVEL_TERMS.value, level.source);
  }
  if (Object.keys(patch).length) {
    // Edited: move every older key to its new name in this same patch.
    const olds = Object.entries(LEVEL_LEGACY).flatMap(([slug, list]) => list.map((o) => [slug, o] as const));
    for (const [slug, old] of olds) {
      if (rowServedFact(row, old) === undefined || rowServedFact(row, old) === null) continue;
      if (!(slug in patch) && want[slug] !== undefined) patch[slug] = want[slug];
      patch[old] = null;
    }
    // A number stored as a JSON number is rewritten as text on its next edit.
    const numSlug = slugOf(LEVEL_TERMS.value);
    if (typeof rowServedFact(row, numSlug) === "number" && !(numSlug in patch) && want[numSlug] !== undefined) patch[numSlug] = want[numSlug];
    // The older choices were a map under the same name; the new wire shape is a list.
    const choiceSlug = slugOf(LEVEL_TERMS.choice);
    const heldChoice = parseJson(servedWithLegacy(row, choiceSlug));
    if (heldChoice && !Array.isArray(heldChoice) && !(choiceSlug in patch) && want[choiceSlug] !== undefined) patch[choiceSlug] = want[choiceSlug];
    if (hasLegacySource && !(srcSlug in patch)) {
      patch[srcSlug] = writeLineSource(withoutSourceKey(prevRaw, legacySrc), LEVEL_TERMS.value, level.source);
    }
  }
  return patch;
}

function kindOfRow(row: BaseRecord): string | null {
  for (const k of STANDARD_LEVEL_KINDS) if (isTypeName(row.typeUri, k)) return k;
  if (isTypeName(row.typeUri, BUDGET_LEVEL_TYPE)) return "Budget";
  if (isTypeName(row.typeUri, CUSTOM_LEVEL_TYPE) || isTypeName(row.typeUri, LEGACY_CUSTOM_LEVEL_TYPE)) {
    const word = rowServedFact(row, slugOf(LEVEL_TERMS.label));
    return typeof word === "string" && word.trim() ? word.trim() : null;
  }
  return null;
}

/** One level record as a level. Null when the record is not a level. The record rides on the level (see {@link recOf}). */
export function readLevelRecord(row: BaseRecord): ValueLevel | null {
  const kind = kindOfRow(row);
  if (!kind) return null;
  const fact = (term: string) => servedWithLegacy(row, slugOf(term));
  const vars = choiceMap(fact(LEVEL_TERMS.choice));
  const side = String(fact(LEVEL_TERMS.side) ?? "").trim().toLowerCase();
  const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
  const level: ValueLevel = {
    kind,
    ...levelNumberFields(fact(LEVEL_TERMS.value)),
    qualifier: {
      when: text(fact(LEVEL_TERMS.when)),
      variables: vars,
      conditions: listOf(fact(LEVEL_TERMS.conditions)).filter((c): c is string => typeof c === "string"),
      side: side === "low" || side === "high" ? side : "",
    },
    source: levelSourceOf(fact(LEVEL_TERMS.sources)),
    note: text(fact(LEVEL_TERMS.note)),
  };
  hide(level, "rec", row);
  return setLevelKey(level, row.id);
}

function orderOf(row: BaseRecord): number {
  const n = numberOf(rowServedFact(row, slugOf(LEVEL_TERMS.order)));
  return n === null ? Number.POSITIVE_INFINITY : n;
}

/**
 * True when the record's `a:partOf` points at `parentUri`. The uri is compared whole, then by its last path piece.
 * No `parentUri` = no check (the caller does not know its parent).
 */
export function isPartOfParent(row: BaseRecord, parentUri: string | null | undefined): boolean {
  if (!parentUri) return true;
  const raw = rowServedFact(row, "partOf");
  const target = typeof raw === "string" ? raw : raw && typeof raw === "object" ? (raw as { "@id"?: unknown })["@id"] : undefined;
  if (typeof target !== "string" || !target) return false;
  if (target === parentUri) return true;
  const tail = (u: string) => u.split(/[/?#]/).filter(Boolean).pop() ?? "";
  return tail(target) !== "" && tail(target) === tail(parentUri);
}

/** The level records among a Value's parts, in `a:elementOrder` (then id). With `parentUri`, only those that are a part of it. */
export function readLevelRecords(rows: readonly BaseRecord[], parentUri?: string | null): ValueLevel[] {
  return rows
    .filter((r) => isLevelType(r.typeUri) && isPartOfParent(r, parentUri))
    .slice()
    .sort((a, b) => orderOf(a) - orderOf(b) || a.id.localeCompare(b.id))
    .map((r) => readLevelRecord(r))
    .filter((l): l is ValueLevel => !!l);
}

/* ------------------------------------------- qualifiers and meters */

/**
 * Each Scale qualifier definition, each Meter and each Meter line is its own record, a part (`a:partOf`) of the Value
 * (a Meter line: of its Meter). All names are live GilbVeda terms, in this one map.
 * The older names are read-only (CHILD_LEGACY, bare slugs).
 */
export const VALUE_CHILD_TERMS = {
  /** A Scale variable (e.g. [Country]). */
  qualifierType: "t:ScaleQualifier",
  /** The definition of ONE option of a Scale variable, `a:partOf` that variable. (Before the Scale became a record this type was the variable itself.) */
  optionDefType: "t:ScaleQualifierDefinition",
  meterType: "t:Meter",
  meterLineType: "t:MeterLine",
  name: "a:name",
  definition: "a:definition",
  options: "a:qualifierOptions",
  defaultOption: "a:defaultOption",
  meterQualifier: "a:meterQualifier",
  agentKind: "a:meterAgentKind",
  method: "a:meterMethod",
  tag: "a:unitTag",
  sources: "a:lineSources",
  partOf: "a:partOf",
  order: "a:elementOrder",
} as const;

const CT = VALUE_CHILD_TERMS;

/** The older stored names of the child-record facts (bare slugs), tried in order after the new one. Read-only. */
const CHILD_LEGACY: Readonly<Record<string, readonly string[]>> = {
  qualifierOptions: ["options"],
  meterQualifier: ["qualifier"],
  meterMethod: ["method", "measurementMethod"],
};

/** The served value of a child fact under its new slug, else under the first older slug that holds one. */
function servedChild(row: BaseRecord, slug: string): unknown {
  for (const s of [slug, ...(CHILD_LEGACY[slug] ?? [])]) {
    const v = rowServedFact(row, s);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/** Null the older names of `slugs` that the record still holds, in a patch that is being written anyway. */
function nullChildLegacy(row: BaseRecord, patch: Record<string, unknown>, slugs: readonly string[]): void {
  for (const slug of slugs) {
    for (const old of CHILD_LEGACY[slug] ?? []) {
      const v = rowServedFact(row, old);
      if (v !== undefined && v !== null) patch[old] = null;
    }
  }
}
export const QUALIFIER_TYPE = CT.qualifierType.slice(2);
export const OPTION_DEF_TYPE = CT.optionDefType.slice(2);
export const METER_TYPE = CT.meterType.slice(2);
export const METER_LINE_TYPE = CT.meterLineType.slice(2);

export const isQualifierType = (typeUri: string) => isTypeName(typeUri, QUALIFIER_TYPE);
/** The type of an option's definition record; before that also the type of a variable that is a part of the Value (see isLegacyQualifierRow). */
export const isOptionDefType = (typeUri: string) => isTypeName(typeUri, OPTION_DEF_TYPE);
/** A record that can be a Scale variable of a Value: the new type, or the older one (read; an edit makes the new record). */
export const isQualifierRowType = (typeUri: string) => isQualifierType(typeUri) || isOptionDefType(typeUri);
/** An older Scale variable: typed t:ScaleQualifierDefinition and a part of the Value itself. */
export const isLegacyQualifierRow = (row: BaseRecord, valueUri?: string | null) => isOptionDefType(row.typeUri) && !!valueUri && isPartOfParent(row, valueUri);
export const isMeterType = (typeUri: string) => isTypeName(typeUri, METER_TYPE);
export const isMeterLineType = (typeUri: string) => isTypeName(typeUri, METER_LINE_TYPE);

/** `a:elementOrder` for a new child: one past the highest among the rows of the type `isType` accepts. */
export function nextOrderOf(rows: readonly BaseRecord[], isType: (typeUri: string) => boolean): number {
  let top = 0;
  for (const r of rows) {
    if (!isType(r.typeUri)) continue;
    const n = orderOf(r);
    if (Number.isFinite(n) && n > top) top = n;
  }
  return Math.floor(top) + 1;
}

function sortedRows(rows: readonly BaseRecord[], isType: (typeUri: string) => boolean): BaseRecord[] {
  return rows
    .filter((r) => isType(r.typeUri))
    .slice()
    .sort((a, b) => orderOf(a) - orderOf(b) || a.id.localeCompare(b.id));
}

function textOf(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

function childBase(tag: string, parentUri: string, order: number): Rec {
  return { [slugOf(CT.tag)]: tag, [slugOf(CT.partOf)]: { "@id": parentUri }, [slugOf(CT.order)]: order };
}

/* the Scale record */

/** The Scale is one record of this type, `a:partOf` the Value; the Value points at it with `a:hasScale` = `{"@id": record}`. */
export const SCALE_TYPE = "Scale";
export const isScaleType = (typeUri: string) => isTypeName(typeUri, SCALE_TYPE);

/** `<ValueTag>.Scale` */
export function scaleTag(valueTag: string): string {
  return [valueTag.trim(), "Scale"].filter(Boolean).join(".");
}

/** The tail of an address (its last path piece), for comparing a record's address with a reference to it. */
const addressTail = (u: string) => u.split(/[/?#]/).filter(Boolean).pop() ?? "";

/** The address `a:hasScale` points at, or "" when it is not a reference (absent, or an inline Scale). */
export function scaleRefOf(valueFacts: Record<string, unknown> | null | undefined): string {
  const raw = parseJson(memberValue(valueFacts ?? {}, VALUE_SLUGS.scale));
  const o = Array.isArray(raw) ? raw[0] : raw;
  return refId(o);
}

/** The Scale record among a Value's parts: the one `a:hasScale` points at. Undefined when it is not a reference or not among the rows. */
export function scaleRowOf(
  valueFacts: Record<string, unknown> | null | undefined,
  rows: readonly BaseRecord[],
  parentUri?: string | null,
): BaseRecord | undefined {
  const ref = scaleRefOf(valueFacts);
  if (!ref) return undefined;
  const tail = addressTail(ref);
  return rows.find(
    (r) => isScaleType(r.typeUri) && isPartOfParent(r, parentUri) && (r.entityUri === ref || r.id === tail || (!!r.entityUri && addressTail(r.entityUri) === tail)),
  );
}

const SCALE_FACT_SLUGS = ["description", "unit", "rate", "scaleContext"] as const;

/** The Scale record's served facts as one `a:` object, so the one Scale reader reads a record and an inline Scale alike. */
function scaleRecOf(row: BaseRecord): Rec {
  const out: Rec = {};
  for (const k of SCALE_OWNED) {
    const v = rowServedFact(row, k);
    if (v !== undefined && v !== null) out[`a:${k}`] = v;
  }
  return out;
}

export function readScaleRecord(row: BaseRecord): ValueCardData["scale"] {
  return readScale(scaleRecOf(row));
}

/** The facts to create the Scale record with (slugs): tag, `a:partOf`, then the Scale's own facts (direction always). */
export function scaleCreateFacts(s: ValueCardData["scale"], tag: string, parentUri: string, _order?: number, resource?: boolean): Rec {
  const facts: Rec = { [slugOf(CT.tag)]: tag, [slugOf(CT.partOf)]: { "@id": parentUri } };
  for (const [k, v] of Object.entries(scaleFacts(s, resource) ?? { "a:scaleDirection": s.direction })) facts[k.slice(2)] = v;
  return facts;
}

/** The patch that takes the stored Scale record to `s`: only the facts that differ. Empty when nothing changed. */
export function scalePatch(row: BaseRecord, s: ValueCardData["scale"], resource?: boolean): Record<string, unknown> {
  const want = scaleFacts(s, resource) ?? {};
  const patch: Record<string, unknown> = {};
  for (const slug of SCALE_FACT_SLUGS) {
    const next = textOf(want[`a:${slug}`]) || null;
    const prev = textOf(rowServedFact(row, slug)) || null;
    if (next !== prev) patch[slug] = next;
  }
  const prevDir = textOf(rowServedFact(row, "scaleDirection"));
  if (prevDir.toLowerCase() !== s.direction) patch.scaleDirection = s.direction;
  const prevSource = readSource(scaleRecOf(row));
  if (!planSourceEqual(s.source, prevSource)) {
    const w = sourceWire(s.source);
    patch.source = w["a:source"] ?? null;
    patch.statedBy = w["a:statedBy"] ?? null;
    patch.derivedFrom = w["a:derivedFrom"] ?? null;
  }
  // Written by something else without a direction: any edit also states it (always stored).
  if (Object.keys(patch).length && !("scaleDirection" in patch) && !prevDir) patch.scaleDirection = s.direction;
  return patch;
}

/**
 * The patch of the VALUE that points it at its Scale record (`uri`), or clears the Scale (`null`). The older Scale (an inline
 * a:hasScale, replaced by the reference) and a:valueScale (nulled) are dropped in the same patch.
 */
export function scaleLinkPatch(valueRow: BaseRecord, uri: string | null): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const had = rowServedFact(valueRow, VALUE_SLUGS.scale);
  if (uri) patch[VALUE_SLUGS.scale] = { "@id": uri };
  else if (had !== undefined && had !== null) patch[VALUE_SLUGS.scale] = null;
  const old = rowServedFact(valueRow, LEGACY_SCALE_SLUG);
  if (old !== undefined && old !== null) patch[LEGACY_SCALE_SLUG] = null;
  return patch;
}

/* qualifier (t:ScaleQualifier; an option with a definition is a t:ScaleQualifierDefinition record, a part of it) */

export function qualifierTag(valueTag: string, v: ScaleVariable): string {
  return [valueTag.trim(), "Q", cleanWord(v.name) || "Unnamed"].filter(Boolean).join(".");
}

export function qualifierIsBlank(v: ScaleVariable): boolean {
  return !v.name.trim();
}

/** The option NAMES of a qualifier record: a list of strings; the older option objects `{a:name, a:definition}` read as their names. */
function optionNames(raw: unknown): string[] {
  const out: string[] = [];
  for (const x of listOf(raw)) {
    const name = typeof x === "string" ? x.trim() : asRec(x) ? str(asRec(x)!, "name").trim() : "";
    if (name && !out.some((o) => eq(o, name))) out.push(name);
  }
  return out;
}

/** The option names a qualifier record holds (strings; older option objects read as their names). */
export function qualifierRowOptionNames(row: BaseRecord): string[] {
  return optionNames(servedChild(row, slugOf(CT.options)));
}

const hasOptionObjects = (raw: unknown) => listOf(raw).some((x) => typeof x !== "string");

/** Canonical options: [{name, definition}] without empty ones (an option object, or a name string, in any stored shape). */
function optionList(raw: unknown): { name: string; definition: string }[] {
  return listOf(raw)
    .map((x) => (typeof x === "string" ? { name: x.trim(), definition: "" } : asRec(x) ? { name: str(asRec(x)!, "name").trim(), definition: str(asRec(x)!, "definition").trim() } : null))
    .filter((x): x is { name: string; definition: string } => !!x && !!(x.name || x.definition));
}

/** The option names a qualifier is written with (strings, one per option). */
export function qualifierOptionNames(v: ScaleVariable): string[] {
  return optionNames(v.options.map((o) => ({ "a:name": o.name })));
}

function qualifierFacts(v: ScaleVariable): Rec {
  const out: Rec = {};
  set(out, "name", v.name.trim());
  set(out, "definition", v.definition.trim());
  set(out, "defaultOption", v.defaultOption.trim());
  set(out, "qualifierOptions", qualifierOptionNames(v));
  return out;
}

export function qualifierCreateFacts(v: ScaleVariable, tag: string, parentUri: string, order: number): Rec {
  const facts: Rec = { ...childBase(tag, parentUri, order) };
  for (const [k, val] of Object.entries(qualifierFacts(v))) facts[k.slice(2)] = val;
  if (!planSourceEmpty(v.source)) facts[slugOf(CT.sources)] = writeLineSource([], CT.name, v.source);
  return facts;
}

export function qualifierPatch(row: BaseRecord, v: ScaleVariable): Record<string, unknown> {
  const want = qualifierFacts(v);
  const patch: Record<string, unknown> = {};
  for (const term of [CT.name, CT.definition, CT.defaultOption]) {
    const slug = slugOf(term);
    const next = textOf(want[`a:${slug}`]) || null;
    const prev = textOf(rowServedFact(row, slug)) || null;
    if (next !== prev) patch[slug] = next;
  }
  const wantNames = qualifierOptionNames(v);
  const prevRaw = servedChild(row, slugOf(CT.options));
  if (!same(wantNames, optionNames(prevRaw)) || hasOptionObjects(prevRaw)) patch[slugOf(CT.options)] = wantNames.length ? wantNames : null;
  const prevSource = readLineSources(rowServedFact(row, slugOf(CT.sources)))[CT.name] ?? {};
  if (!planSourceEqual(v.source, prevSource)) {
    patch[slugOf(CT.sources)] = writeLineSource(rowServedFact(row, slugOf(CT.sources)), CT.name, v.source);
  }
  if (Object.keys(patch).length) {
    // Edited: an older options list moves to the new name in this same patch.
    const oldHeld = CHILD_LEGACY.qualifierOptions!.some((o) => rowServedFact(row, o) != null);
    if (oldHeld && !(slugOf(CT.options) in patch) && wantNames.length) patch[slugOf(CT.options)] = wantNames;
    nullChildLegacy(row, patch, [slugOf(CT.options)]);
  }
  return patch;
}

/** The option-definition records among `rows` that are a part of the qualifier record `qual`. */
export function optionDefRowsOf(qual: BaseRecord, rows: readonly BaseRecord[]): BaseRecord[] {
  if (!qual.entityUri) return [];
  return rows.filter((r) => isOptionDefType(r.typeUri) && r.id !== qual.id && isPartOfParent(r, qual.entityUri));
}

/** `<QualifierTag>.<Option>` */
export function optionDefTag(qualifierTagText: string, option: string): string {
  return [qualifierTagText.trim(), cleanWord(option) || "Option"].filter(Boolean).join(".");
}

/** The facts of one option-definition record: a:name, a:definition. */
export function optionDefCreateFacts(o: { name: string; definition: string }, tag: string, parentUri: string, order: number): Rec {
  const facts: Rec = { ...childBase(tag, parentUri, order) };
  if (o.name.trim()) facts[slugOf(CT.name)] = o.name.trim();
  if (o.definition.trim()) facts[slugOf(CT.definition)] = o.definition.trim();
  return facts;
}

export function optionDefPatch(row: BaseRecord, o: { name: string; definition: string }): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const slug of ["name", "definition"] as const) {
    const next = o[slug].trim() || null;
    const prev = textOf(rowServedFact(row, slug)) || null;
    if (next !== prev) patch[slug] = next;
  }
  return patch;
}

/**
 * One qualifier record as a Scale variable. `optionRows`: records that may be its option definitions (picked by type and a:partOf).
 * An older record (typed t:ScaleQualifierDefinition, a part of the Value) holds its options as objects; they are read as they are.
 */
export function readQualifierRecord(row: BaseRecord, optionRows: readonly BaseRecord[] = []): ScaleVariable {
  const fact = (term: string) => rowServedFact(row, slugOf(term));
  const defs = new Map<string, string>();
  for (const d of optionDefRowsOf(row, optionRows)) {
    const n = textOf(rowServedFact(d, "name")).toLowerCase();
    if (n && !defs.has(n)) defs.set(n, textOf(rowServedFact(d, "definition")));
  }
  const options = optionList(servedChild(row, slugOf(CT.options))).map((o) => ({
    name: o.name,
    definition: o.definition || defs.get(o.name.toLowerCase()) || "",
  }));
  const v: ScaleVariable = {
    name: textOf(fact(CT.name)),
    definition: textOf(fact(CT.definition)),
    defaultOption: textOf(fact(CT.defaultOption)),
    options,
    source: readLineSources(fact(CT.sources))[CT.name] ?? {},
  };
  hide(v, "rec", row);
  return setLevelKey(v, row.id);
}

/** The Value's qualifier records. `rows` holds the Value's parts and, after them, any option-definition records (picked by a:partOf). */
export function readQualifierRecords(rows: readonly BaseRecord[], parentUri?: string | null): ScaleVariable[] {
  const mine = sortedRows(
    rows.filter((r) => isPartOfParent(r, parentUri)),
    isQualifierRowType,
  );
  // While an older variable is being replaced (the new record is made, the old one not yet ended) only the new one shows.
  const made = new Set(mine.filter((r) => isQualifierType(r.typeUri)).map((r) => textOf(rowServedFact(r, slugOf(CT.name))).toLowerCase()));
  return mine
    .filter((r) => !(isLegacyQualifierRow(r, parentUri) && made.has(textOf(rowServedFact(r, slugOf(CT.name))).toLowerCase())))
    .map((r) => readQualifierRecord(r, rows));
}

/* meter and meter line */

const AGENT_WORD: Record<MeterKind, string> = { human: "Human", ai: "AI", instrument: "Instrument" };

export function meterTag(valueTag: string, m: ValueMeter): string {
  const name = cleanWord(m.qualifier);
  return [valueTag.trim(), "Meter", name].filter(Boolean).join(".");
}

export function meterLineTag(meterTagText: string, line: ValueMeterLine): string {
  return [meterTagText.trim(), AGENT_WORD[line.kind]].filter(Boolean).join(".");
}

export function meterLineIsBlank(line: ValueMeterLine): boolean {
  return !line.method.trim() && planSourceEmpty(line.source);
}

export function meterIsBlank(m: ValueMeter): boolean {
  return !m.qualifier.trim() && m.lines.every(meterLineIsBlank);
}

export function meterCreateFacts(m: ValueMeter, tag: string, parentUri: string, order: number): Rec {
  const facts: Rec = { ...childBase(tag, parentUri, order) };
  if (m.qualifier.trim()) facts[slugOf(CT.meterQualifier)] = m.qualifier.trim();
  return facts;
}

export function meterPatch(row: BaseRecord, m: ValueMeter): Record<string, unknown> {
  const next = m.qualifier.trim() || null;
  const prev = textOf(servedChild(row, slugOf(CT.meterQualifier))) || null;
  const patch: Record<string, unknown> = next === prev ? {} : { [slugOf(CT.meterQualifier)]: next };
  if (Object.keys(patch).length) nullChildLegacy(row, patch, [slugOf(CT.meterQualifier)]);
  return patch;
}

export function meterLineCreateFacts(line: ValueMeterLine, tag: string, parentUri: string, order: number): Rec {
  const facts: Rec = { ...childBase(tag, parentUri, order), [slugOf(CT.agentKind)]: line.kind };
  if (line.method.trim()) facts[slugOf(CT.method)] = line.method.trim();
  if (!planSourceEmpty(line.source)) facts[slugOf(CT.sources)] = writeLineSource([], CT.method, line.source);
  return facts;
}

/** Source of a meter line's method, from the new key or an older one (`a:measurementMethod`, `a:method`). */
function meterSourceOf(raw: unknown): PlanSourceValue {
  const all = readLineSources(raw);
  return all[CT.method] ?? all[termOf("measurementMethod")] ?? all[termOf("method")] ?? {};
}

export function meterLinePatch(row: BaseRecord, line: ValueMeterLine): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const next = line.method.trim() || null;
  const prev = textOf(servedChild(row, slugOf(CT.method))) || null;
  if (next !== prev) patch[slugOf(CT.method)] = next;
  const srcSlug = slugOf(CT.sources);
  const prevRaw = rowServedFact(row, srcSlug);
  const legacyKeys = [termOf("measurementMethod"), termOf("method")].filter((k) => !!readLineSources(prevRaw)[k]);
  const dropOld = (raw: unknown) => legacyKeys.reduce<unknown>((acc, k) => withoutSourceKey(acc, k), raw);
  if (!planSourceEqual(line.source, meterSourceOf(prevRaw))) {
    patch[srcSlug] = writeLineSource(dropOld(prevRaw), CT.method, line.source);
  }
  if (Object.keys(patch).length) {
    // Edited: the method and its source move to the new names in this same patch.
    if (!(slugOf(CT.method) in patch) && CHILD_LEGACY.meterMethod!.some((o) => rowServedFact(row, o) != null) && next) {
      patch[slugOf(CT.method)] = next;
    }
    nullChildLegacy(row, patch, [slugOf(CT.method)]);
    if (legacyKeys.length && !(srcSlug in patch)) patch[srcSlug] = writeLineSource(dropOld(prevRaw), CT.method, line.source);
  }
  return patch;
}

export function readMeterLineRecord(row: BaseRecord): ValueMeterLine | null {
  const kind = textOf(rowServedFact(row, slugOf(CT.agentKind))).toLowerCase();
  if (!(METER_KINDS as readonly string[]).includes(kind)) return null;
  const line: ValueMeterLine = {
    kind: kind as MeterKind,
    method: textOf(servedChild(row, slugOf(CT.method))),
    source: meterSourceOf(rowServedFact(row, slugOf(CT.sources))),
  };
  hide(line, "rec", row);
  return setLevelKey(line, row.id);
}

/** The Meter records among a Value's parts, each with its line records (`linesOf(meterId)`: the rows partOf that Meter). */
export function readMeterRecords(
  rows: readonly BaseRecord[],
  linesOf: (meterId: string) => readonly BaseRecord[],
  parentUri?: string | null,
): ValueMeter[] {
  return sortedRows(
    rows.filter((r) => isPartOfParent(r, parentUri)),
    isMeterType,
  ).map((row) => {
    const lines = sortedRows(
      linesOf(row.id).filter((l) => isPartOfParent(l, row.entityUri)),
      isMeterLineType,
    )
      .map(readMeterLineRecord)
      .filter((l): l is ValueMeterLine => !!l);
    const m: ValueMeter = { qualifier: textOf(servedChild(row, slugOf(CT.meterQualifier))), lines };
    hide(m, "rec", row);
    return setLevelKey(m, row.id);
  });
}

/**
 * Rename a qualifier in a level's choices (`from` matched without case). Same level when it does not use `from`.
 * A level that already has a choice under the new name keeps both (as a set): a value is never dropped.
 */
export function renameLevelQualifier(level: ValueLevel, from: string, to: string): ValueLevel {
  const vars = level.qualifier.variables;
  const key = Object.keys(vars).find((k) => eq(k, from));
  if (key === undefined) return level;
  const target = to.trim();
  const next: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(vars)) {
    const name = k === key ? target : k;
    const copy = Array.isArray(v) ? v.slice() : v;
    const clash = Object.keys(next).find((n) => n !== name && eq(n, name));
    const same = Object.keys(next).find((n) => n === name) ?? clash;
    if (same === undefined) {
      next[name] = copy;
      continue;
    }
    const merged = [...qualifierValues(next[same]), ...qualifierValues(copy)].filter((x, i, all) => all.indexOf(x) === i);
    next[same] = packQualifierValues(merged);
  }
  return carryRaw({ ...level, qualifier: { ...level.qualifier, variables: next } }, level);
}

/** A level without the choice for qualifier `name` (matched without case). Same level when it does not use it. */
export function removeLevelQualifier(level: ValueLevel, name: string): ValueLevel {
  const vars = level.qualifier.variables;
  if (!Object.keys(vars).some((k) => eq(k, name))) return level;
  const next: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(vars)) if (!eq(k, name)) next[k] = Array.isArray(v) ? v.slice() : v;
  return carryRaw({ ...level, qualifier: { ...level.qualifier, variables: next } }, level);
}

/** True when some level has a choice under both qualifiers (a merge of the two would have to drop one). */
export function levelsSettingBoth(levels: readonly ValueLevel[], a: string, b: string): boolean {
  return levels.some((l) => {
    const keys = Object.keys(l.qualifier.variables);
    return keys.some((k) => eq(k, a)) && keys.some((k) => eq(k, b));
  });
}

/** The levels whose choices use the qualifier `name`. */
export function levelsUsingQualifier(levels: readonly ValueLevel[], name: string): ValueLevel[] {
  return levels.filter((l) => Object.keys(l.qualifier.variables).some((k) => eq(k, name)));
}

/** `a:elementOrder` for a new level: one past the highest in use. */
export function nextLevelOrder(rows: readonly BaseRecord[]): number {
  let top = 0;
  for (const r of rows) {
    if (!isLevelType(r.typeUri)) continue;
    const n = orderOf(r);
    if (Number.isFinite(n) && n > top) top = n;
  }
  return Math.floor(top) + 1;
}

/** The old stored list `a:valueLevels`. Read-only: it is never written again. Items that do not parse ride on `others`. */
export function readLegacyLevels(raw: unknown): ValueLevel[] {
  const out: ValueLevel[] = [];
  const others: unknown[] = [];
  for (const item of listOf(raw)) {
    const o = asRec(item);
    const kind = o ? str(o, "levelKind").trim() : "";
    if (!o || !kind) {
      others.push(clone(item));
      continue;
    }
    const vars = choiceMap(memberValue(o, "levelVariables"));
    const conditions = listOf(memberValue(o, "levelConditions")).filter((c): c is string => typeof c === "string");
    const side = str(o, "levelSide").trim().toLowerCase();
    out.push({
      kind,
      value: numberOf(memberValue(o, "levelValue")),
      qualifier: { when: str(o, "levelWhen"), variables: vars, conditions, side: side === "low" || side === "high" ? side : "" },
      source: readSource(o),
      note: str(o, "note"),
    });
  }
  return withOthers(out, others);
}

/* ----------------------------------------------------- the whole card data */

/** Read the five Value members from a record's facts (bare slug or `a:` key, object or JSON string). Never throws. */
export function readValueCard(facts: Record<string, unknown> | null | undefined, scaleRow?: BaseRecord | null, resource?: boolean): ValueCardData {
  const f = facts ?? {};
  const safe = <T>(fn: () => T, empty: T): T => {
    try {
      return fn();
    } catch {
      return empty;
    }
  };
  const blank = emptyValueCard();
  const card: ValueCardData = {
    // The Scale record (a:hasScale -> @id), else an inline a:hasScale, else the older a:valueScale.
    // A reference with no record behind it (gone, or not among the Value's parts) is no Scale: the older a:valueScale shows if it is there.
    scale: safe(
      () =>
        scaleRow
          ? readScaleRecord(scaleRow)
          : scaleRefOf(f)
            ? readScale(memberValue(f, LEGACY_SCALE_SLUG))
            : readScale(memberValue(f, VALUE_SLUGS.scale) ?? memberValue(f, LEGACY_SCALE_SLUG)),
      blank.scale,
    ),
    variables: safe(() => readVariables(memberValue(f, VALUE_SLUGS.scaleVariables)), []),
    endpoint: safe(() => readEndpoint(memberValue(f, VALUE_SLUGS.endpoint) ?? memberValue(f, LEGACY_ENDPOINT_SLUG)), blank.endpoint),
    meters: safe(() => readMeters(memberValue(f, VALUE_SLUGS.meters)), []),
    levels: safe(() => readLegacyLevels(memberValue(f, VALUE_SLUGS.levels)), []),
  };
  // Defaults are shown until something is stored (`raw` is set only on a stored member): a Resource's Scale direction is "lower"
  // (a Value's stays "higher"), and the Endpoint types come from defaultEndpointFor. A stored Scale or Endpoint is never overridden,
  // an old stored Scale with no direction still reads "lower", and nothing is written by showing them.
  if (resource && !rawOf(card.scale)) card.scale = { ...card.scale, direction: defaultDirectionFor(true) };
  if (!rawOf(card.endpoint)) card.endpoint = { ...card.endpoint, ...defaultEndpointFor(resource) };
  return card;
}

/** The patch for the whole card, keyed by slug. An empty member is `null` (removed). */
export function valueCardPatch(data: ValueCardData): Record<string, unknown> {
  // The Scale is its own record (scaleFacts, scaleLinkPatch); the Value is patched with the Endpoint only.
  return {
    [VALUE_SLUGS.endpoint]: writeEndpoint(data.endpoint),
  };
}

/** Which Value lines have nothing in them (the group shows its quiet empty state). */
export function valueLinesEmpty(data: ValueCardData) {
  const s = data.scale;
  return {
    scale: !s.text.trim() && !s.unit.trim() && !s.rate.trim() && !s.context.trim() && planSourceEmpty(s.source),
    scaleVariables: data.variables.length === 0,
    endpoint: !data.endpoint.text.trim() && !writePart(data.endpoint.subject) && !writePart(data.endpoint.reference) && planSourceEmpty(data.endpoint.source),
    valueMeters: data.meters.length === 0,
    valueLevels: data.levels.length === 0,
  };
}

/* --------------------------------------------------------- Scale variables */

/** The `[Name]` words in the Scale sentence, in order, each once. */
export function scaleVariableNames(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\[([^\[\]]+)\]/g)) {
    const name = m[1]!.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * The qualifier names the Scale gives: the `[Name]` words of the Scale sentence, then Unit, Rate and Context, in that order,
 * each name once (case-insensitive, trimmed, spelled as first written).
 */
export function scaleQualifierNames(scale: { text?: string; unit?: string; rate?: string; context?: string }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const field of [scale.text, scale.unit, scale.rate, scale.context]) {
    for (const name of scaleVariableNames(field ?? "")) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** One row of the Qualifiers section: a Scale name (with its definition record, or none yet) or a defined name the Scale no longer has. */
export interface QualifierRow {
  name: string;
  /** Where its definition is in `data.variables`; null = no record yet (nothing is written until a value or definition is added). */
  index: number | null;
  inScale: boolean;
  variable: ScaleVariable;
}

/** The rows: one per Scale name in Scale order, then the defined names the Scale lacks, in their stored order. */
export function qualifierRows(data: Pick<ValueCardData, "scale" | "variables">): QualifierRow[] {
  const norm = (n: string) => n.trim().toLowerCase();
  const rows: QualifierRow[] = [];
  const used = new Set<number>();
  for (const name of scaleQualifierNames(data.scale)) {
    const index = data.variables.findIndex((v, i) => !used.has(i) && norm(v.name) === norm(name));
    if (index >= 0) used.add(index);
    rows.push({ name, index: index >= 0 ? index : null, inScale: true, variable: index >= 0 ? data.variables[index]! : blankVariable(name) });
  }
  data.variables.forEach((v, i) => {
    if (used.has(i) || !v.name.trim()) return;
    rows.push({ name: v.name.trim(), index: i, inScale: false, variable: v });
  });
  return rows;
}

/**
 * The card data for READING qualifiers (the level picker, the graph chips, the filter chips): `variables` is the rows' list, Scale order first.
 * A name with no record yet is a blank definition (only ALL to offer). Never hand this to a writer: those names have no records.
 */
export function withScaleQualifiers(data: ValueCardData): ValueCardData {
  const rows = qualifierRows(data);
  return { ...data, variables: rows.map((r) => r.variable) };
}

/** The pair the rename helper offers: exactly one defined name the Scale no longer has, and exactly one Scale name with no record. */
export function renameCandidate(data: Pick<ValueCardData, "scale" | "variables">): { from: string; to: string } | null {
  const rows = qualifierRows(data);
  const gone = rows.filter((r) => !r.inScale && r.index !== null);
  const fresh = rows.filter((r) => r.inScale && r.index === null);
  return gone.length === 1 && fresh.length === 1 ? { from: gone[0]!.name, to: fresh[0]!.name } : null;
}

/** One-click Qualifier names under the Qualifiers line (Date is built into every level, so it is not offered). */
export const PRESET_QUALIFIERS: readonly string[] = [
  "Release",
  "User type",
  "Task",
  "Device",
  "Country",
  "Region",
  "Age-Group",
  "Language",
  "Market",
  "Customer segment",
  "Scenario",
];

/** The three blank rows an empty Value shows in Edit, ready to fill. */
export const DEFAULT_LEVEL_ROWS: readonly string[] = ["Status", "Tolerable", "Goal"];
/** The same three rows on a Development Resource: Budget for Goal. */
export const RESOURCE_DEFAULT_LEVEL_ROWS: readonly string[] = ["Status", "Tolerable", "Budget"];

/** The kinds "+ Level" offers directly, always, even when one exists. Fail and Survival are behind "More ▾"; any other word is typed. */
export const OFFERED_LEVEL_KINDS: readonly string[] = ["Past", "Status", "Tolerable", "Goal", "Wish"];
/** The same on a Development Resource: Budget for Goal. */
export const RESOURCE_OFFERED_LEVEL_KINDS: readonly string[] = ["Past", "Status", "Tolerable", "Budget", "Wish"];

/** The per-type lists the Levels line and the graph's menu use. `resource` = the card is a Development Resource. */
export function defaultLevelRowsFor(resource?: boolean): readonly string[] {
  return resource ? RESOURCE_DEFAULT_LEVEL_ROWS : DEFAULT_LEVEL_ROWS;
}
export function offeredLevelKindsFor(resource?: boolean): readonly string[] {
  return resource ? RESOURCE_OFFERED_LEVEL_KINDS : OFFERED_LEVEL_KINDS;
}

/**
 * The row a "+ Level" click adds. Status gets today, any other kind no date. The qualifier choices (names, conditions, side)
 * are copied from the most recent level by date (the later one on a tie or when none has a date), else left empty (= ALL).
 */
export function newLevelFromClick(kind: string, existing: readonly ValueLevel[], today: string = localToday()): ValueLevel {
  let recent: ValueLevel | undefined;
  for (const l of existing) if (!recent || l.qualifier.when >= recent.qualifier.when) recent = l;
  const l = blankLevel(kind);
  if (recent) {
    const variables: Record<string, string | string[]> = {};
    for (const [n, v] of Object.entries(recent.qualifier.variables)) variables[n] = Array.isArray(v) ? [...v] : v;
    l.qualifier = { when: "", variables, conditions: [...recent.qualifier.conditions], side: recent.qualifier.side };
  }
  if (kind.trim().toLowerCase() === "status") l.qualifier.when = today;
  return l;
}

/** A level with nothing but its kind: not written. */
export function levelIsBlank(l: ValueLevel): boolean {
  const q = l.qualifier;
  return (
    l.value === null &&
    !levelNumberTyped(l) &&
    !l.note.trim() &&
    planSourceEmpty(l.source) &&
    !q.when &&
    !q.side &&
    q.conditions.length === 0 &&
    Object.keys(q.variables).length === 0
  );
}

export function blankVariable(name: string): ScaleVariable {
  return { name, definition: "", defaultOption: "", options: [], source: {} };
}

/* ------------------------------------------------------------- level lines */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function realDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `2027-01-30` or `30 Jan 2027` → ISO. Anything else → null. */
export function parseLevelDate(item: string): string | null {
  const t = item.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return realDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(t);
  if (m) {
    const mon = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase());
    if (mon >= 0) return realDate(Number(m[3]), mon + 1, Number(m[1]));
  }
  return null;
}

function standardKind(word: string): string {
  const hit = STANDARD_LEVEL_KINDS.find((k) => k.toLowerCase() === word.toLowerCase());
  return hit ?? word;
}

export { ALL_VALUE, packQualifierValues, qualifierValues };

/**
 * A definition that is really a list of values ("Norway, Sweden"): 2-20 items, each at most 25 chars and 3 words, split on
 * , or ;. Text that ends with a period is a sentence, not a list. Else null.
 */
export function listLikeDefinition(text: string): string[] | null {
  if (/\.\s*$/.test(text ?? "")) return null;
  const items: string[] = [];
  for (const raw of (text ?? "").split(/[,;]/)) {
    const t = raw.trim();
    if (!t) continue;
    if (t.length > 25 || t.split(/\s+/).length > 3 || items.some((x) => eq(x, t))) return null;
    items.push(t);
  }
  return items.length >= 2 && items.length <= 20 ? items : null;
}

/** Split on commas that are outside { } and outside "quotes". A quote opens only at the start of a value (after `=`, `{`, `,`). */
export function splitOutsideBraces(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  let quoted = false;
  let prev = "";
  for (const ch of text) {
    if (quoted) {
      if (ch === '"' && prev !== "\\") quoted = false;
    } else if (ch === '"' && (!cur.trim() || /[={]\s*$/.test(cur))) quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    prev = ch;
    if (ch === "," && depth === 0 && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** A qualifier value as written in a line: quoted when it holds a comma, brace or quote. */
export function quoteValue(v: string): string {
  return /[,{}"]/.test(v) ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v;
}

function unquoteValue(v: string): string {
  const m = /^"([\s\S]*)"$/.exec(v);
  return m ? m[1]!.replace(/\\(["\\])/g, "$1") : v;
}

/** Does a level's value for a qualifier take in `wanted`? Unset and ALL take in everything. */
export function levelHasQualifierValue(level: ValueLevel, name: string, wanted: string): boolean {
  const key = Object.keys(level.qualifier.variables).find((k) => eq(k, name));
  const vals = key ? qualifierValues(level.qualifier.variables[key]) : [];
  return vals.length === 0 || vals.some((x) => eq(x, ALL_VALUE) || eq(x, wanted));
}

/** `Goal [2027-06-30, Release 3.0, User type = Senior 70+, Order.Place] 5 <- Ann estimate` → a level. Junk → null. */
export function parseLevelLine(text: string, variables: readonly ScaleVariable[] = []): ValueLevel | null {
  return parseLevelLineWarn(text, variables).level;
}

/** {@link parseLevelLine} plus plain-language warnings about what the parse changed (for the Paste UI). */
export function parseLevelLineWarn(
  text: string,
  variables: readonly ScaleVariable[] = [],
): { level: ValueLevel | null; warnings: string[] } {
  const warnings: string[] = [];
  const level = parseLevelLineInner(text, variables, warnings);
  return { level, warnings: level ? warnings : [] };
}

function parseLevelLineInner(text: string, variables: readonly ScaleVariable[], warnings: string[]): ValueLevel | null {
  try {
    let line = String(text ?? "").trim();
    if (!line) return null;
    let source: PlanSourceValue = {};
    let note = "";
    const arrow = /\s*<-\s*/.exec(line);
    if (arrow) {
      const rest = line.slice(arrow.index + arrow[0].length).trim();
      line = line.slice(0, arrow.index).trim();
      const m = /^(\S+)\s*([\s\S]*)$/.exec(rest);
      if (m) {
        source = { text: m[1]! };
        note = m[2]!.trim();
      }
    }
    const m = /^(\p{L}[^\s\[\]]*)\s*(?:\[([^\]]*)\])?\s*([\s\S]*)$/u.exec(line);
    if (!m) return null;
    const tail = m[3]!.trim();
    let value: number | null = null;
    if (tail) {
      // "2 000" (space-grouped thousands) reads as 2000; the author's text stays in valueText.
      const n = parseNumberText(/^-?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?$/.test(tail) ? tail.replace(/[ \u00a0\u202f]/g, "") : tail);
      if (n === null || !Number.isFinite(n)) return null;
      value = n;
    }
    const q = blankLevelQualifier();
    for (const raw of splitOutsideBraces(m[2] ?? "")) {
      const item = raw.trim();
      if (!item) continue;
      const date = parseLevelDate(item);
      if (date && !q.when) {
        q.when = date;
        continue;
      }
      if (eq(item, "low") || eq(item, "high")) {
        q.side = item.toLowerCase() as "low" | "high";
        continue;
      }
      const eqAt = item.indexOf("=");
      if (eqAt > 0) {
        const v = variables.find((x) => eq(x.name, item.slice(0, eqAt)));
        if (v) {
          let typed = item.slice(eqAt + 1).trim();
          if (typed.startsWith("{") && typed.endsWith("}")) typed = typed.slice(1, -1);
          const picks = splitOutsideBraces(typed).map((t) => {
            const w = unquoteValue(t.trim());
            if (eq(w, ALL_VALUE)) return ALL_VALUE;
            return v.options.find((o) => eq(o.name, w))?.name ?? w;
          });
          const hasAll = picks.some((x) => eq(x, ALL_VALUE));
          if (hasAll && picks.filter((x) => x.trim() && !eq(x, ALL_VALUE)).length) {
            warnings.push(`${v.name}: ALL replaces the other values`);
            picks.length = 0;
            picks.push(ALL_VALUE);
          }
          const packed = packQualifierValues(picks);
          if (packed.length) q.variables[v.name] = packed;
          continue;
        }
      }
      const owners = variables.filter((x) => x.options.some((o) => eq(o.name, item)));
      if (owners.length === 1) {
        const v = owners[0]!;
        q.variables[v.name] = v.options.find((o) => eq(o.name, item))!.name;
        continue;
      }
      q.conditions.push(item);
    }
    const parsed: ValueLevel = { kind: standardKind(m[1]!), value, qualifier: q, source, note };
    if (value !== null && /^-?\d+(\.\d+)?$/.test(tail) && tail !== plainNumberText(value)) parsed.valueText = tail;
    return parsed;
  } catch {
    return null;
  }
}

function bareOk(option: string, variables: readonly ScaleVariable[]): boolean {
  if (!option.trim() || eq(option, "low") || eq(option, "high") || /[,\]=}{"]/.test(option)) return false;
  if (parseLevelDate(option)) return false;
  return variables.filter((v) => v.options.some((o) => eq(o.name, option))).length === 1;
}

export interface ConditionMove {
  variable: string;
  option: string;
  /** Condition text as stored on the levels (first seen). */
  condition: string;
  count: number;
}

/** Bare-word conditions that now match an option of a defined variable the level has not set. */
export function movableConditions(data: ValueCardData): ConditionMove[] {
  const out: ConditionMove[] = [];
  for (const v of data.variables) {
    if (!v.name.trim()) continue;
    for (const o of v.options) {
      if (!o.name.trim()) continue;
      let count = 0;
      let condition = o.name;
      for (const l of data.levels) {
        const hit = l.qualifier.conditions.find((c) => eq(c, o.name));
        const set = Object.keys(l.qualifier.variables).some((k) => eq(k, v.name) && l.qualifier.variables[k]);
        if (hit && !set) {
          count++;
          condition = hit;
        }
      }
      if (count) out.push({ variable: v.name, option: o.name, condition, count });
    }
  }
  return out;
}

/** Move the bare condition into the variable on every level where it applies. */
export function moveConditionIntoVariable(data: ValueCardData, move: ConditionMove): ValueCardData {
  const levels = data.levels.map((l) => {
    const hit = l.qualifier.conditions.find((c) => eq(c, move.option));
    const set = Object.keys(l.qualifier.variables).some((k) => eq(k, move.variable) && l.qualifier.variables[k]);
    if (!hit || set) return l;
    return carryRaw(
      {
        ...l,
        qualifier: {
          ...l.qualifier,
          variables: { ...l.qualifier.variables, [move.variable]: move.option },
          conditions: l.qualifier.conditions.filter((c) => !eq(c, move.option)),
        },
      },
      l,
    );
  });
  return { ...data, levels: carryOthers(levels, data.levels) };
}

/** The piece of a level line a segment is. A click on that piece edits it. */
export type LevelPart =
  | { t: "kind" }
  | { t: "when" }
  | { t: "condition"; index: number }
  | { t: "variable"; name: string }
  | { t: "side" }
  | { t: "value" }
  | { t: "source" }
  | { t: "note" };

export interface LevelSeg {
  text: string;
  part?: LevelPart;
}

/**
 * The level line as segments. Joined, they are exactly {@link formatLevelLine}. A segment with a `part` is a piece the
 * person can click to edit; the rest is punctuation. The value segment is always present (empty text when there is no value).
 */
export function levelLineSegments(
  level: ValueLevel,
  variables: readonly ScaleVariable[] = [],
  /** The label of a linked source (statedBy / derivedFrom) that has no text. Without it, a linked source draws nothing. */
  sourceLabel?: string,
): LevelSeg[] {
  const q = level.qualifier;
  const items: LevelSeg[] = [];
  if (q.when) items.push({ text: q.when, part: { t: "when" } });
  q.conditions.forEach((c, index) => items.push({ text: c, part: { t: "condition", index } }));
  const done = new Set<string>();
  const variableItem = (name: string, value: string | string[]) => {
    const vals = qualifierValues(value);
    if (vals.length > 1) return `${name} = {${vals.map(quoteValue).join(", ")}}`;
    const option = vals[0] ?? "";
    const known = variables.find((v) => v.name === name);
    const listed = known?.options.some((o) => o.name === option) ?? false;
    return listed && bareOk(option, variables) ? option : `${name} = ${quoteValue(option)}`;
  };
  for (const v of variables) {
    const option = q.variables[v.name];
    if (qualifierValues(option).length === 0) continue;
    done.add(v.name);
    items.push({ text: variableItem(v.name, option), part: { t: "variable", name: v.name } });
  }
  for (const [name, option] of Object.entries(q.variables)) {
    if (done.has(name) || qualifierValues(option).length === 0) continue;
    items.push({ text: variableItem(name, option), part: { t: "variable", name } });
  }
  if (q.side) items.push({ text: q.side, part: { t: "side" } });
  const out: LevelSeg[] = [{ text: level.kind, part: { t: "kind" } }];
  if (items.length) {
    out.push({ text: " [" });
    items.forEach((it, i) => {
      if (i > 0) out.push({ text: ", " });
      out.push(it);
    });
    out.push({ text: "]" });
  }
  const shownNumber = levelNumberDisplay(level);
  out.push(shownNumber ? { text: ` ${shownNumber}`, part: { t: "value" } } : { text: "", part: { t: "value" } });
  const linked = !!(level.source.statedBy || level.source.derivedFrom);
  const src = level.source.text?.trim() || (linked ? sourceLabel?.trim() : "");
  if (src) {
    out.push({ text: " <- " });
    out.push({ text: src, part: { t: "source" } });
    const note = level.note.trim();
    if (note) {
      out.push({ text: " " });
      out.push({ text: note, part: { t: "note" } });
    }
  }
  return out;
}

/** The inverse of {@link parseLevelLine}: `Kind [when, conditions…, variables…] value <- source note`. */
export function formatLevelLine(level: ValueLevel, variables: readonly ScaleVariable[] = []): string {
  return levelLineSegments(level, variables)
    .map((s) => s.text)
    .join("");
}

function groupKey(q: LevelQualifier): string {
  const vars = Object.keys(q.variables)
    .sort()
    .map((k) => [k, Array.isArray(q.variables[k]) ? [...(q.variables[k] as string[])].sort() : q.variables[k]]);
  return JSON.stringify([q.when, vars, q.conditions, q.side]);
}

/** The qualifier a group of levels shares (same date, variables, conditions and side). */
export function levelGroupKey(level: ValueLevel): string {
  return groupKey(level.qualifier);
}

function kindRank(kind: string, resource?: boolean): number {
  const i = STANDARD_LEVEL_KINDS.findIndex((k) => k.toLowerCase() === kindClass(kind, resource));
  return i >= 0 ? i : STANDARD_LEVEL_KINDS.length;
}

/** Groups in first-seen order; inside a group the standard kinds in their order, custom words after Wish. */
export function sortLevels(levels: readonly ValueLevel[], _direction?: ScaleDirection, resource?: boolean): ValueLevel[] {
  const order: string[] = [];
  const groups = new Map<string, ValueLevel[]>();
  for (const l of levels) {
    const key = groupKey(l.qualifier);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(l);
  }
  const out: ValueLevel[] = [];
  for (const key of order) {
    const g = groups.get(key)!.map((l, i) => ({ l, i }));
    g.sort((a, b) => kindRank(a.l.kind, resource) - kindRank(b.l.kind, resource) || a.i - b.i);
    out.push(...g.map((x) => x.l));
  }
  return out;
}

/** When anything on a Value card last changed: the newest `updatedAt` (ms) of the record and its parts. Null if none is known. */
export function latestChange(
  record: { updatedAt?: unknown } | null | undefined,
  parts: readonly { updatedAt?: unknown }[] = [],
): Date | null {
  let best = 0;
  for (const r of [record, ...parts]) {
    const t = r && typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) ? r.updatedAt : 0;
    if (t > best) best = t;
  }
  return best > 0 ? new Date(best) : null;
}

/** YYYY-MM-DD in the local zone. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
