/**
 * First-pass reading of one history value.
 * `labels` replaces the app's session cache. Omit it, and an entity address stays `entity:<id>`.
 * This function does not fetch. Keys are the opaque id, then the full trimmed address.
 * A compact `base:e/` form does not consult `labels`.
 */

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

export function valueSummarySync(v: unknown, labels?: ReadonlyMap<string, string>): string {
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
    return valueSummarySync((v as { "@id": unknown })["@id"], labels);
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    if (v.length === 1) {
      const only = v[0];
      return valueSummarySync(only, labels);
    }
    return `[${v.length} items]`;
  }
  try {
    const s = JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "…";
  }
}
