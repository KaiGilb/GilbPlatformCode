// A card finds a field by its ontology term, and takes the fact's spelling and label from the master that serves the term. No fact
// spelling and no label is typed into the app; the term's NAME is the question every app asks. Each question is a public GET of a term
// document (no credential), made through the global `fetch`, at the origin the app set with `setTermOrigin` (the `term-origin` unit),
// read each time a URL is built.
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";

const attributeDocs = new Map<string, Promise<Record<string, unknown> | null>>();

/**
 * The master's own document for an attribute term (`/base/a/<name>`), or null when it did not answer.
 * One read per term per session, shared by every question asked of it (its spelling, its value set). A term that did not answer is asked again next time.
 */
function attributeDoc(name: string): Promise<Record<string, unknown> | null> {
  let p = attributeDocs.get(name);
  if (!p) {
    p = fetch(`${termOrigin()}/base/a/${encodeURIComponent(name)}`, { headers: { accept: "application/ld+json, application/json" } })
      .then(async (res) => (res.ok ? ((await res.json()) as Record<string, unknown>) : null))
      .catch(() => null);
    void p.then((d) => {
      if (d === null) attributeDocs.delete(name); // not known: ask again next time
    });
    attributeDocs.set(name, p);
  }
  return p;
}

/**
 * The bare fact key the master binds to a term (its `a:predicateAttribute`, without `a:`), or null
 * when the master did not answer. One read per term per session.
 */
export function attributeSpelling(name: string): Promise<string | null> {
  return attributeDoc(name).then((doc) => {
    if (!doc) return null;
    const raw = doc["a:predicateAttribute"] ?? doc.predicateAttribute;
    return typeof raw === "string" && raw.trim() ? raw.trim().replace(/^a:/, "") : null;
  });
}

/**
 * The master's own `a:label` for an attribute term (`addressLine1` → "Address 1"),
 * or null when the master did not answer or the term carries none. Read from the SAME cached document
 * as {@link attributeSpelling}, so the label shown and the spelling written come from one answer.
 * ⛔ A label is never typed into the app.
 */
export function attributeLabel(name: string): Promise<string | null> {
  return attributeDoc(name).then((doc) => (doc ? termDocLabel(doc) : null));
}

/**
 * 🔴 THE ONE RULE FOR READING A TERM'S LABEL OFF ITS DOCUMENT: its `a:label`
 * (or the framed wire key `label`, or a `schema:name`), trimmed; null when it carries none.
 * ⚠ Two callers fetch a term document, from two places, on purpose: {@link attributeLabel} reads the
 * MASTER's document — the same cached answer its spelling comes from, so the label shown and the key
 * written can never disagree — and the record views read the signed-in host's overlay. ⛔ Do not merge the two FETCHES; both read the label with THIS function.
 */
export function termDocLabel(doc: Record<string, unknown>): string | null {
  const v = doc["a:label"] ?? doc.label ?? doc["https://schema.org/name"];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** The strings of an `a:valueSet` value, or null when the document carries none. */
function valueSetOf(doc: Record<string, unknown> | null): string[] | null {
  const raw = doc ? (doc["a:valueSet"] ?? doc.valueSet) : undefined;
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return out.length > 0 ? out : null;
}

const valueSets = new Map<string, Promise<string[] | null>>();

/**
 * The closed set of values the master allows for a term, or null when it
 * declares none. Read from the attribute's own document (`a:valueSet`), else from the document of the
 * type the attribute defines (`a:typeUri`, where a scale's set is read: `t/CefrLevelScale`'s
 * `a:valueSet`). ⛔ Never a list typed into the app; "not read" is null, and a card
 * then offers free text.
 */
export function termValueSet(name: string): Promise<string[] | null> {
  let p = valueSets.get(name);
  if (!p) {
    p = readValueSet(name);
    valueSets.set(name, p);
    // A term whose document did not answer is asked again next time; a set read (or none declared) is held.
    void attributeDoc(name).then((d) => {
      if (d === null) valueSets.delete(name);
    });
  }
  return p;
}

async function readValueSet(name: string): Promise<string[] | null> {
  const doc = await attributeDoc(name);
  const own = valueSetOf(doc);
  if (own || !doc) return own;
  const t = doc["a:typeUri"] ?? doc.typeUri;
  const typeIri = typeof t === "string" ? t : t && typeof t === "object" ? (t as { "@id"?: unknown })["@id"] : null;
  const typeName = typeof typeIri === "string" ? /\/t\/([^/#?]+)$/.exec(typeIri)?.[1] : undefined;
  if (!typeName) return null;
  try {
    const res = await fetch(`${termOrigin()}/base/t/${encodeURIComponent(typeName)}`, {
      headers: { accept: "application/ld+json, application/json" },
    });
    return res.ok ? valueSetOf((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const typeSpellings = new Map<string, Promise<string | null>>();
const typeLabels = new Map<string, Promise<string | null>>();

/**
 * The master's own `a:label` of a catalogue TERM named by its IRI
 * (`<origin>/base/t/Photography` → "photography"), or null when the master did not answer
 * or the IRI is not a master term. A held interest stores only the term's address (`a:topicInterest`
 * is a reference, and a person card keeps no copy of it), so its name is asked of the term itself.
 * ⛔ Never typed into the app. One read per term per session; a term that did not answer is asked again.
 */
export function termLabelOfIri(iri: string): Promise<string | null> {
  const m = new RegExp(`^${escapeRegExp(termOrigin())}/base/t/([A-Za-z0-9]+)$`).exec(iri.trim());
  if (!m) return Promise.resolve(null);
  const name = m[1]!;
  let p = typeLabels.get(name);
  if (!p) {
    p = fetch(`${termOrigin()}/base/t/${encodeURIComponent(name)}`, { headers: { accept: "application/ld+json, application/json" } })
      .then(async (res) => (res.ok ? termDocLabel((await res.json()) as Record<string, unknown>) : null))
      .catch(() => null);
    void p.then((v) => {
      if (v === null) typeLabels.delete(name);
    });
    typeLabels.set(name, p);
  }
  return p;
}

/**
 * The CREATE spelling the master binds to a TYPE term (its `a:typeAttribute`,
 * e.g. `t:PlaceClaim`), or null when the master did not answer. The type twin of
 * {@link attributeSpelling}.
 * One read per term per session.
 */
export function typeSpelling(name: string): Promise<string | null> {
  let p = typeSpellings.get(name);
  if (!p) {
    p = fetch(`${termOrigin()}/base/t/${encodeURIComponent(name)}`, { headers: { accept: "application/ld+json, application/json" } })
      .then(async (res) => {
        if (!res.ok) return null;
        const doc = (await res.json()) as Record<string, unknown>;
        const raw = doc["a:typeAttribute"] ?? doc.typeAttribute;
        if (typeof raw !== "string" || !raw.trim()) return null;
        const t = raw.trim();
        return t.startsWith("t:") ? t : `t:${t}`;
      })
      .catch(() => null);
    void p.then((v) => {
      if (v === null) typeSpellings.delete(name); // not known: ask again next time
    });
    typeSpellings.set(name, p);
  }
  return p;
}

/** Escape a text for use inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Empty the four caches. A test seam: the app has no call that forgets them. */
export function __resetTermSlotsForTest(): void {
  attributeDocs.clear();
  valueSets.clear();
  typeSpellings.clear();
  typeLabels.clear();
}
