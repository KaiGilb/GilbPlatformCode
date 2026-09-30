/**
 * Read fields off an ontology term document the host already fetched.
 *
 * Nothing here searches, fetches, or writes. The host passes the raw fact
 * map. Missing fields become empty strings or null. They are not invented.
 *
 * A reference id is accepted in two shapes only:
 * - a string that starts with the four letters "http" (so "httpfoo" counts,
 *   and "HTTP://" does not, and "urn:" does not)
 * - an object whose "@id" is a string, including a string that is not an address
 *
 * languageDisplayName in this unit takes a language code and returns an
 * English name, or the code in upper case. It is not the function of the
 * same name in units/language-name. That one takes a document and a screen
 * language. Do not swap the imports.
 */

export type OntologyKind = "type" | "function" | "value";

/**
 * The three fields the label helpers read. The host's full term document
 * has more fields. Pass any object that has these three.
 */
export interface TermLabelDoc {
  label: string;
  does: string;
  raw: Record<string, unknown>;
}

export interface SanskritView {
  romanized: string;
  devanagari: string;
  gloss: string;
}

export interface MultilangView {
  /** Sorted language codes with a preferred name. */
  languages: string[];
  names: Record<string, string>;
  descriptions: Record<string, string>;
  altLabels: Record<string, string[]>;
}

export interface ValueMeterView {
  label: string;
  method: string;
  meterId: string;
  agentKind: string;
}

export interface ValuePlanguageView {
  /** Human scale text (legacy string form or inline scale a:does). */
  scale: string;
  /** When a:scale is a @id ref to a Scale type (e.g. SkillYearsOfExperienceScale). */
  scaleRef: string | null;
  /**
   * True when a:scale is an INLINE object (unit/rate/Best/Worst on the Value itself),
   * not a @id ref to a first-class Scale node. AnchorDurability shape.
   */
  scaleInline: boolean;
  scaleAnchors: string;
  /** Flat meter summary (legacy a:meter string). */
  meter: string;
  /** Structured a:hasMeter[] (ProvideTrainingYearsOfExperience shape). */
  meters: ValueMeterView[];
  unit: string;
  rate: string;
  scaleBest: string;
  scaleWorst: string;
  /** Stakeholder IRIs (a:valuedBy list). */
  valuedByIris: string[];
  /** Free-text valuedBy when not a list of refs. */
  valuedByText: string;
  endpointSubject: string | null;
  endpointReference: string;
  /** Function this Value measures (a:measures or a:value-of). */
  measures: string | null;
  valueOf: string | null;
  qualifierAspect: string;
  qualifierReference: string | null;
  sameAs: string | null;
  confidence: string;
  premodVerdict: string;
  justifiedBy: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function pickLangMap(raw: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | null {
  for (const k of keys) {
    const r = asRecord(raw[k]);
    if (r && Object.keys(r).length > 0) return r;
  }
  return null;
}

function mapToStrings(map: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [lang, v] of Object.entries(map)) {
    if (typeof v === "string" && v.trim()) out[lang] = v.trim();
    else if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) out[lang] = v[0].trim();
  }
  return out;
}

function mapToAltLists(map: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [lang, v] of Object.entries(map)) {
    if (typeof v === "string" && v.trim()) out[lang] = [v.trim()];
    else if (Array.isArray(v)) {
      const list = v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
      if (list.length) out[lang] = list;
    }
  }
  return out;
}

function refId(v: unknown): string | null {
  if (typeof v === "string" && v.startsWith("http")) return v;
  const r = asRecord(v);
  if (r && typeof r["@id"] === "string") return r["@id"] as string;
  return null;
}

/** Normalize a:sanskritLabel (nested a: keys — BaseAppVeda RawSanskritLabel). */
export function sanskritFromRaw(raw: Record<string, unknown>): SanskritView | null {
  const s = asRecord(raw["a:sanskritLabel"] ?? raw.sanskritLabel);
  if (!s) return null;
  const romanized = str(s["a:romanized"] ?? s.romanized);
  const devanagari = str(s["a:devanagari"] ?? s.devanagari);
  const gloss = str(s["a:gloss"] ?? s.gloss);
  if (!romanized && !devanagari) return null;
  return { romanized, devanagari, gloss };
}

/** labelByLang-v1 maps (OperateForklift-class skill functions ~23–28 langs). */
export function multilangFromRaw(raw: Record<string, unknown>): MultilangView | null {
  const namesMap = pickLangMap(raw, "a:labelByLang", "labelByLang");
  const doesMap = pickLangMap(raw, "a:doesByLang", "doesByLang");
  const altMap = pickLangMap(raw, "a:altLabelByLang", "altLabelByLang");
  if (!namesMap && !doesMap) return null;

  const names = namesMap ? mapToStrings(namesMap) : {};
  const descriptions = doesMap ? mapToStrings(doesMap) : {};
  const altLabels = altMap ? mapToAltLists(altMap) : {};

  const langSet = new Set<string>([
    ...Object.keys(names),
    ...Object.keys(descriptions),
    ...Object.keys(altLabels),
  ]);
  if (langSet.size === 0) return null;

  // Prefer en first, then sorted.
  const languages = [...langSet].sort((a, b) => {
    if (a === "en") return -1;
    if (b === "en") return 1;
    return a.localeCompare(b);
  });

  return { languages, names, descriptions, altLabels };
}

/** Value-plane Planguage fields (scale / meter / unit / endpoints / valuedBy). */
export function valuePlanguageFromRaw(raw: Record<string, unknown>): ValuePlanguageView | null {
  const scaleRaw = raw["a:scale"] ?? raw.scale;
  let scaleStr = str(scaleRaw);
  const scaleRef = refId(scaleRaw);
  // Inline Scale object on the Value (not a @id ref) — e.g. AnchorDurability.
  const scaleObj =
    !scaleRef && scaleRaw && typeof scaleRaw === "object" && !Array.isArray(scaleRaw)
      ? (scaleRaw as Record<string, unknown>)
      : null;
  const scaleInline = Boolean(scaleObj);
  if (scaleObj) {
    // Prefer the scale's own does as the free-text scale line when present.
    const inlineDoes = str(scaleObj["a:does"] ?? scaleObj.does);
    if (inlineDoes) scaleStr = inlineDoes;
  }
  const scaleAnchors = str(raw["a:scaleAnchors"] ?? raw.scaleAnchors);
  const meter = str(raw["a:meter"] ?? raw.meter);
  let unit = str(raw["a:unit"] ?? raw.unit);
  let rate = str(raw["a:rate"] ?? raw.rate);
  let scaleBest = str(raw["a:scaleBest"] ?? raw.scaleBest);
  let scaleWorst = str(raw["a:scaleWorst"] ?? raw.scaleWorst);
  if (scaleObj) {
    unit = str(scaleObj["a:unit"] ?? scaleObj.unit) || unit;
    rate = str(scaleObj["a:rate"] ?? scaleObj.rate) || rate;
    scaleBest = str(scaleObj["a:scaleBest"] ?? scaleObj.scaleBest) || scaleBest;
    scaleWorst = str(scaleObj["a:scaleWorst"] ?? scaleObj.scaleWorst) || scaleWorst;
  }
  const endpointReference = str(raw["a:endpointReference"] ?? raw.endpointReference);
  const endpointSubject = refId(raw["a:endpointSubject"] ?? raw.endpointSubject);
  const measures = refId(raw["a:measures"] ?? raw.measures);
  const valueOf = refId(raw["a:value-of"] ?? raw["value-of"] ?? raw.valueOf);
  const sameAs = refId(
    raw["http://www.w3.org/2002/07/owl#sameAs"] ?? raw.sameAs ?? raw["owl:sameAs"],
  );

  // valuedBy: list of refs OR a string
  const valuedByRaw = raw["a:valuedBy"] ?? raw.valuedBy;
  const valuedByIris: string[] = [];
  let valuedByText = "";
  if (typeof valuedByRaw === "string" && valuedByRaw.trim()) {
    valuedByText = valuedByRaw.trim();
  } else if (Array.isArray(valuedByRaw)) {
    for (const item of valuedByRaw) {
      const id = refId(item);
      if (id) valuedByIris.push(id);
    }
  } else {
    const id = refId(valuedByRaw);
    if (id) valuedByIris.push(id);
  }

  // qualifier object
  const qual = asRecord(raw["a:qualifier"] ?? raw.qualifier);
  const qualifierAspect = qual ? str(qual["a:aspect"] ?? qual.aspect) : "";
  const qualifierReference = qual
    ? refId(qual["a:reference"] ?? qual.reference)
    : null;

  // hasMeter list (structured) — screenshot "METERS (2)"
  const hasMeter = raw["a:hasMeter"] ?? raw.hasMeter;
  const meters: ValueMeterView[] = [];
  if (Array.isArray(hasMeter)) {
    for (const m of hasMeter) {
      const r = asRecord(m);
      if (!r) continue;
      meters.push({
        label: str(r["a:label"] ?? r.label) || "Meter",
        method: str(r["a:method"] ?? r.method),
        meterId: str(r["a:meterId"] ?? r.meterId),
        agentKind: str(
          r["a:meterAgentKind"] ?? r.meterAgentKind ?? r["a:meterKind"] ?? r.meterKind,
        ),
      });
    }
  }

  const confidenceRaw = raw["a:confidence"] ?? raw.confidence;
  const confidence =
    typeof confidenceRaw === "number"
      ? String(confidenceRaw)
      : str(confidenceRaw);

  const hasAny =
    scaleStr ||
    scaleRef ||
    scaleInline ||
    scaleAnchors ||
    meter ||
    meters.length ||
    unit ||
    scaleBest ||
    scaleWorst ||
    measures ||
    valueOf ||
    endpointSubject ||
    valuedByIris.length ||
    valuedByText ||
    qualifierAspect;

  if (!hasAny) return null;

  return {
    scale: scaleStr || scaleAnchors,
    scaleRef,
    scaleInline,
    scaleAnchors,
    meter,
    meters,
    unit,
    rate,
    scaleBest,
    scaleWorst,
    valuedByIris,
    valuedByText,
    endpointSubject,
    endpointReference,
    measures,
    valueOf,
    qualifierAspect,
    qualifierReference,
    sameAs,
    confidence,
    premodVerdict: str(raw["a:premodVerdict"] ?? raw.premodVerdict),
    justifiedBy: str(raw["a:justifiedBy"] ?? raw.justifiedBy),
  };
}

export function examplesFromRaw(raw: Record<string, unknown>): string[] {
  const v = raw["a:example"] ?? raw.example;
  if (typeof v === "string" && v.trim()) return [v.trim()];
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  }
  return [];
}

export function verbFromRaw(raw: Record<string, unknown>): string {
  return str(raw["a:verb"] ?? raw.verb);
}

/**
 * Wire bind keys the ontology pane must show (Kai 2026-09-22):
 * `a:predicateAttribute` (a:samplingProtocol) and `a:typeAttribute` (t:Catch).
 * Labels are English; these are the strings apps write.
 */
export function bindKeysFromRaw(raw: Record<string, unknown>): {
  predicateAttribute: string;
  typeAttribute: string;
} {
  const one = (v: unknown): string => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) return v[0].trim();
    return "";
  };
  return {
    predicateAttribute: one(raw["a:predicateAttribute"] ?? raw.predicateAttribute),
    typeAttribute: one(raw["a:typeAttribute"] ?? raw.typeAttribute),
  };
}

function allRefIds(raw: Record<string, unknown>, ...keys: string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const v = raw[k];
    if (v == null) continue;
    const items = Array.isArray(v) ? v : [v];
    for (const item of items) {
      const id = refId(item);
      if (id) out.push(id);
    }
  }
  return [...new Set(out)];
}

/** Function: Values that quantify it (a:hasValue). */
export function hasValueIrisFromRaw(raw: Record<string, unknown>): string[] {
  return allRefIds(raw, "a:hasValue", "hasValue");
}

/** Type: Functions it affords (a:providesFunction). */
export function providesFunctionIrisFromRaw(raw: Record<string, unknown>): string[] {
  return allRefIds(raw, "a:providesFunction", "providesFunction");
}

export function exactMatchFromRaw(raw: Record<string, unknown>): string | null {
  return (
    refId(raw["http://www.w3.org/2004/02/skos/core#exactMatch"]) ||
    refId(raw["skos:exactMatch"]) ||
    refId(raw.exactMatch)
  );
}

export function isDefinedByFromRaw(raw: Record<string, unknown>): string | null {
  return (
    refId(raw["http://www.w3.org/2000/01/rdf-schema#isDefinedBy"]) ||
    refId(raw["rdfs:isDefinedBy"]) ||
    refId(raw.isDefinedBy)
  );
}

export function provenanceFromRaw(raw: Record<string, unknown>): {
  confidence: string;
  premodVerdict: string;
  justifiedBy: string;
  authoredBy: string | null;
  approvedBy: string | null;
  attribution: string;
  license: string;
  premodNote: string;
} {
  const conf = raw["a:confidence"] ?? raw.confidence;
  return {
    confidence: typeof conf === "number" ? String(conf) : str(conf),
    premodVerdict: str(raw["a:premodVerdict"] ?? raw.premodVerdict),
    justifiedBy: str(raw["a:justifiedBy"] ?? raw.justifiedBy),
    authoredBy: refId(raw["a:authoredBy"] ?? raw.authoredBy),
    approvedBy: refId(raw["a:approvedBy"] ?? raw.approvedBy),
    attribution: str(raw["a:attribution"] ?? raw.attribution),
    license: str(raw["a:license"] ?? raw.license),
    premodNote: str(raw["a:premodNote"] ?? raw.premodNote),
  };
}

/** Vedanta pole from an is-a chain (labels/names). */
export function poleFromChain(
  chain: { name: string; label: string }[],
): "Brahman" | "Maya" | "Kalpana" | null {
  for (const n of chain) {
    const k = `${n.name} ${n.label}`.toLowerCase();
    if (n.name === "Brahman" || k.includes("unchanging")) return "Brahman";
    if (n.name === "Maya" || k.includes("the actual")) return "Maya";
    if (n.name === "Kalpana" || k.includes("imagined")) return "Kalpana";
  }
  return null;
}

export function displayLabelForLang(doc: TermLabelDoc, lang: string | null): string {
  if (!lang) return doc.label;
  const ml = multilangFromRaw(doc.raw);
  if (ml?.names[lang]) return ml.names[lang]!;
  return doc.label;
}

export function displayDoesForLang(doc: TermLabelDoc, lang: string | null): string {
  if (!lang) return doc.does;
  const ml = multilangFromRaw(doc.raw);
  if (ml?.descriptions[lang]) return ml.descriptions[lang]!;
  return doc.does;
}

export function kindSpecificTitle(kind: OntologyKind): string {
  if (kind === "function") return "Function";
  if (kind === "value") return "Value";
  return "Type";
}

/** Human-readable language name; falls back to code. */
const LANG_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  nl: "Dutch",
  pt: "Portuguese",
  pl: "Polish",
  cs: "Czech",
  da: "Danish",
  sv: "Swedish",
  no: "Norwegian",
  fi: "Finnish",
  el: "Greek",
  ar: "Arabic",
  bg: "Bulgarian",
  hr: "Croatian",
  hu: "Hungarian",
  ro: "Romanian",
  sk: "Slovak",
  sl: "Slovenian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
  ga: "Irish",
  is: "Icelandic",
  mt: "Maltese",
  uk: "Ukrainian",
  sa: "Sanskrit",
};

export function languageDisplayName(code: string): string {
  return LANG_NAMES[code] ?? code.toUpperCase();
}
