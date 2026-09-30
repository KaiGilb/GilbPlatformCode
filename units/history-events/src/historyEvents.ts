/**
 * Group history rows into one event per save.
 *
 * The actor words and the value reading are private copies of units/history-actor and
 * units/history-value. Keep them in agreement. Pass those functions in `options` if you
 * want one copy instead of two.
 *
 * This function does not load history and does not look up a person.
 */

export interface HistoryDatom {
  fact_id?: string;
  attribute: string;
  value: unknown;
  valid_from?: string | null;
  valid_to?: string | null;
  tx_from?: string | null;
  tx_to?: string | null;
  op?: number;
  op_label?: string;
  txn_id?: string;
  agent?: string | null;
}

export type HistoryActorKind = "person" | "agent" | "system" | "unknown";

export interface HistoryActor {
  who: string;
  whoKind: HistoryActorKind;
  agentLabel: string;
}

export interface HistoryChange {
  op: string;
  attribute: string;
  attributeLabel: string;
  summary: string;
}

export interface HistoryEvent {
  txnId: string;
  at: string;
  agent: string;
  agentLabel: string;
  who: string;
  whoKind: HistoryActorKind;
  changes: HistoryChange[];
}

export interface HistoryEventOptions {
  describeAgent?: (agent: string | null | undefined) => HistoryActor;
  valueSummary?: (value: unknown, labels?: ReadonlyMap<string, string>) => string;
  /** Passed to the value reading. The opaque id is tried before the full address. */
  labels?: ReadonlyMap<string, string>;
}

const PRIORITY_ATTRS = new Set([
  "a:label",
  "a:does",
  "a:ontologyStatus",
  "a:nodeKind",
  "a:subTypeOf",
  "a:measures",
  "a:value-of",
  "a:hasValue",
  "a:providesFunction",
  "a:capableOf",
  "a:verb",
  "a:example",
  "a:module",
  "a:confidence",
  "a:premodVerdict",
  "a:premodNote",
  "a:replacedBy",
  "a:justifiedBy",
  "a:scale",
  "a:hasMeter",
  "a:unit",
  "http://www.w3.org/2004/02/skos/core#exactMatch",
  "http://www.w3.org/2002/07/owl#sameAs",
]);

const LANG_MAP_ATTRS = new Set([
  "a:doesByLang",
  "a:labelByLang",
  "a:altLabelByLang",
  "doesByLang",
  "labelByLang",
  "altLabelByLang",
]);

function describeAgentDefault(agent: string | null | undefined): HistoryActor {
  if (!agent?.trim()) {
    return { who: "Unknown actor", whoKind: "unknown", agentLabel: "unknown" };
  }
  const a = agent.trim();
  const agentM = a.match(/\/base\/e\/agent-([^/?#]+)/i) || a.match(/(?:^|\/)agent-([^/?#]+)/i);
  if (agentM?.[1]) {
    const slug = agentM[1];
    const pretty = slug
      .replace(/[-_]+/g, " ")
      .replace(/\bvabasevedanta\b/gi, "VA BVedanta")
      .replace(/\bvedanta\b/gi, "BVedanta")
      .replace(/\besco\b/gi, "ESCO");
    return { who: `AI agent · ${pretty}`, whoKind: "agent", agentLabel: slug };
  }
  const pM = a.match(/\/base\/p\/([^/?#]+)/i);
  if (pM?.[1]) {
    return { who: "Person", whoKind: "person", agentLabel: "Person" };
  }
  const eM = a.match(/\/base\/e\/([^/?#]+)/);
  if (eM?.[1]) {
    const id = eM[1];
    if (/^agent[-_]/i.test(id)) {
      const slug = id.replace(/^agent[-_]/i, "");
      return {
        who: `AI agent · ${slug.replace(/[-_]+/g, " ")}`,
        whoKind: "agent",
        agentLabel: slug,
      };
    }
    return {
      who: `System · ${id.length > 20 ? `${id.slice(0, 16)}…` : id}`,
      whoKind: "system",
      agentLabel: id,
    };
  }
  const tail = a.split("/").pop() || a;
  return { who: `Actor · ${tail}`, whoKind: "unknown", agentLabel: tail };
}

function opaqueIdFromIri(iri: string): string | null {
  const m = iri.match(/\/base\/e\/([^/?#]+)/);
  return m?.[1] ?? null;
}

function typeNameFromIri(iri: string): string {
  const m = iri.match(/\/base\/t\/([^/?#]+)/);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return iri.split("/").pop() || iri;
}

function labelFor(labels: ReadonlyMap<string, string> | undefined, key: string): string | undefined {
  if (!labels || !labels.has(key)) return undefined;
  return labels.get(key);
}

function valueSummaryDefault(v: unknown, labels?: ReadonlyMap<string, string>): string {
  if (v == null) return "∅";
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("http") && t.includes("/base/t/")) return typeNameFromIri(t);
    if (t.startsWith("http") && t.includes("/base/e/")) {
      const id = opaqueIdFromIri(t);
      if (id) {
        const byId = labelFor(labels, id);
        if (byId !== undefined) return byId;
      }
      const byAddress = labelFor(labels, t);
      if (byAddress !== undefined) return byAddress;
      return id ? `entity:${id}` : t;
    }
    if (t.startsWith("base:e/")) return `entity:${t.slice("base:e/".length)}`;
    if (t.startsWith("base:t/")) return t.slice("base:t/".length);
    return t.length > 160 ? `${t.slice(0, 157)}…` : t;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && v !== null && "@id" in v) {
    return valueSummaryDefault((v as { "@id": unknown })["@id"], labels);
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    if (v.length === 1) return valueSummaryDefault(v[0], labels);
    return `[${v.length} items]`;
  }
  try {
    const s = JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "…";
  }
}

function attrLabel(a: string): string {
  if (a.startsWith("a:")) return a.slice(2);
  if (a.includes("#")) {
    const tail = a.split("#").pop();
    return tail || a;
  }
  if (a.includes("/")) {
    const tail = a.split("/").pop();
    return tail || a;
  }
  return a;
}

function langFieldBase(attr: string): string {
  const a = attr.replace(/^a:/, "");
  if (a === "doesByLang") return "description";
  if (a === "labelByLang") return "name";
  if (a === "altLabelByLang") return "alts";
  return a;
}

function asPlainStringMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
    else if (Array.isArray(val)) out[k] = val.filter((x) => typeof x === "string").join("; ");
  }
  return out;
}

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function expandLangMapDiffs(attr: string, retractVal: unknown, assertVal: unknown): HistoryChange[] {
  const oldM = asPlainStringMap(retractVal);
  const newM = asPlainStringMap(assertVal);
  const keys = new Set([...Object.keys(oldM), ...Object.keys(newM)]);
  const base = langFieldBase(attr);
  const out: HistoryChange[] = [];
  for (const code of [...keys].sort()) {
    const o = oldM[code];
    const n = newM[code];
    if (o === n) continue;
    const label = `${base} (${code})`;
    if (o != null && n != null) {
      out.push({
        op: "change",
        attribute: attr,
        attributeLabel: label,
        summary: `${clip(o, 100)}  →  ${clip(n, 100)}`,
      });
    } else if (n != null) {
      out.push({ op: "assert", attribute: attr, attributeLabel: label, summary: clip(n, 160) });
    } else if (o != null) {
      out.push({ op: "retract", attribute: attr, attributeLabel: label, summary: clip(o, 160) });
    }
  }
  return out;
}

function presentStrings(values: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (v) out.push(v);
  }
  return out;
}

function lastSorted(values: readonly (string | null | undefined)[]): string {
  const sorted = presentStrings(values).sort();
  const last = sorted[sorted.length - 1];
  return last ?? "";
}

/**
 * One event per transaction.
 *
 * - Rows with no `txn_id` share an id of `orphan-` plus `fact_id`.
 *   An empty `txn_id` counts as missing. An empty `fact_id` does too, and each such row
 *   gets its own random orphan id, so those rows do not group.
 * - `at` is the last `tx_from` in ordinary string order, else the last `valid_from` the same way.
 *   This is not a date parse. "2020-2" sorts after "2020-12".
 * - Events are then ordered by `at` with `localeCompare`, latest string first. An empty `at` sorts last.
 *   Equal strings keep the order the transactions were first seen.
 * - The actor is the first row whose `agent` is truthy. A whitespace agent is truthy, and it
 *   wins over a later real address. It then reads as an unknown actor.
 * - If any row uses a priority attribute, only those rows are shown. A language map is not a
 *   priority attribute, so it is dropped whenever a priority attribute is in the same save.
 * - If none are priority, only the first 8 rows of that save are shown.
 * - A language map expands to one line per language code, codes in ordinary sort order.
 *   A code whose text did not change is omitted. An empty string is a real value, not absence.
 * - `a:does` and `does` are labelled `description (en master)`. `a:label` and `label` are
 *   labelled `name (en master)`. That rename does not apply inside a language-map line.
 * - `op` 0 with no label is retract. Any other missing label is assert.
 */
export function groupHistoryDatoms(
  datoms: readonly HistoryDatom[],
  options?: HistoryEventOptions,
): HistoryEvent[] {
  const describe = options?.describeAgent ?? describeAgentDefault;
  const summarise = options?.valueSummary ?? valueSummaryDefault;
  const labels = options?.labels;

  const byTxn = new Map<string, HistoryDatom[]>();
  for (const d of datoms) {
    const tid = d.txn_id || `orphan-${d.fact_id || Math.random()}`;
    const list = byTxn.get(tid) ?? [];
    list.push(d);
    byTxn.set(tid, list);
  }

  const events: HistoryEvent[] = [];
  for (const [txnId, rows] of byTxn) {
    const at = lastSorted(rows.map((r) => r.tx_from)) || lastSorted(rows.map((r) => r.valid_from)) || "";
    const agent = rows.find((r) => r.agent)?.agent || "";
    const whoInfo = describe(agent);
    const priority = rows.filter((r) => PRIORITY_ATTRS.has(r.attribute));
    const use = priority.length > 0 ? priority : rows.slice(0, 8);

    type Slot = { retract?: HistoryDatom; assert?: HistoryDatom };
    const langSlots = new Map<string, Slot>();
    for (const r of use) {
      if (!LANG_MAP_ATTRS.has(r.attribute)) continue;
      const op = (r.op_label || (r.op === 0 ? "retract" : "assert")).toLowerCase();
      const slot = langSlots.get(r.attribute) ?? {};
      if (op === "retract") slot.retract = r;
      else if (op === "assert") slot.assert = r;
      langSlots.set(r.attribute, slot);
    }

    const changes: HistoryChange[] = [];
    const consumedLang = new Set<string>();
    for (const r of use) {
      if (LANG_MAP_ATTRS.has(r.attribute)) {
        if (consumedLang.has(r.attribute)) continue;
        const slot = langSlots.get(r.attribute);
        if (slot) {
          const diffs = expandLangMapDiffs(r.attribute, slot.retract?.value, slot.assert?.value);
          if (diffs.length > 0) {
            changes.push(...diffs);
            consumedLang.add(r.attribute);
            continue;
          }
        }
      }
      const op = (r.op_label || (r.op === 0 ? "retract" : "assert")).toLowerCase();
      let attributeLabel = attrLabel(r.attribute);
      if (r.attribute === "a:does" || r.attribute === "does") {
        attributeLabel = "description (en master)";
      } else if (r.attribute === "a:label" || r.attribute === "label") {
        attributeLabel = "name (en master)";
      }
      changes.push({
        op,
        attribute: r.attribute,
        attributeLabel,
        summary: summarise(r.value, labels),
      });
    }

    events.push({
      txnId,
      at,
      agent,
      agentLabel: whoInfo.agentLabel,
      who: whoInfo.who,
      whoKind: whoInfo.whoKind,
      changes:
        changes.length > 0
          ? changes
          : [{ op: "assert", attribute: "?", attributeLabel: "?", summary: "…" }],
    });
  }

  events.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  return events;
}
