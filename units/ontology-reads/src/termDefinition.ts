import { defaultOntologyHost, defaultTermIri } from "./ontologyBrowse";

/**
 * What resolving one term's definition can honestly return.
 *
 * Three states, deliberately not two: `none` is a claim ABOUT THE TERM and may only be made
 * when the term was actually read; `unreachable` is a claim about THIS REQUEST and says
 * nothing about the term. Collapsing them is the defect this type exists to prevent.
 */
export type TermDefinition =
  /** The term was read and states what it does. */
  | { state: "defined"; does: string }
  /** The term was READ, and genuinely carries no `a:does`. A fact about the term. */
  | { state: "none" }
  /** The term could NOT be read. ⛔ Says nothing about whether it has a definition. */
  | { state: "unreachable"; reason: string };

/** Pull `a:does` (or the bare `does` alias) out of a term document, in either JSON-LD form. */
function doesOf(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object" && "@value" in v) {
    const inner = (v as { "@value": unknown })["@value"];
    if (typeof inner === "string" && inner.trim()) return inner.trim();
  }
  return null;
}

/**
 * Read one type term's definition from the host that actually holds it.
 *
 * @param typeName the type's name, with or without a `t:` prefix (`Person`, `t:Person`)
 * @param host the ontology host to ask; defaults to the canonical {@link defaultOntologyHost}
 * @returns a {@link TermDefinition} — ⛔ never a bare null, so "unreachable" cannot be
 *          silently rendered as "undefined"
 */
export async function readTermDefinition(
  typeName: string,
  host: string = defaultOntologyHost(),
): Promise<TermDefinition> {
  const bare = typeName.replace(/^t:/, "").trim();
  if (!bare) return { state: "unreachable", reason: `no term name to resolve at ${host}` };

  const url = defaultTermIri(bare, host);
  let res: Response;
  try {
    res = await fetch(url, {
      // ⛔ NO authorization header. The published corpus is public, veda answers
      // `access-control-allow-headers: accept, if-none-match`, and a Bearer on this
      // cross-origin request is a measured defect (termSearch.ts: Bearer → EMPTY catalog).
      headers: { accept: "application/ld+json, application/json" },
    });
  } catch {
    return { state: "unreachable", reason: `could not reach ${host}` };
  }

  if (!res.ok) {
    // ⚠ A 404 here means THIS ADDRESS does not serve the term. It does NOT mean the term
    // has no definition, and it must never be reported as though it did.
    return { state: "unreachable", reason: `${host} answered ${res.status} for ${bare}` };
  }

  let doc: Record<string, unknown>;
  try {
    doc = (await res.json()) as Record<string, unknown>;
  } catch {
    // A 200 whose body will not parse is a failed read, not an undefined term.
    return { state: "unreachable", reason: `${host} returned an unreadable document for ${bare}` };
  }

  const does = doesOf(doc["a:does"] ?? doc.does);
  // Only HERE, having actually read the term, may we say it has no definition.
  return does ? { state: "defined", does } : { state: "none" };
}

