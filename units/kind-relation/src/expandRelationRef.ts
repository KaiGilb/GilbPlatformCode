// A member reference read off a relation document, as an absolute address. Four functions of the app's relation-document reader
// (`src/lib/base/relationDoc.ts` lines 35-39, 68-80, 82-84 and 133-135), copied: `lws-relations` keeps them private and does not export
// `expandRelationRef`.

/**
 * The absolute prefix the served `@context` binds to `base:`, derived from the document's own `@id`:
 * `https://<vault>/base/r/<id>` gives `https://<vault>/base/`. Derived, ⛔ never guessed and ⛔ never the platform's setting. A root that
 * does not match this shape yields `null` and no expansion is attempted.
 */
function vaultBaseFromDocId(docId: unknown): string | null {
  if (typeof docId !== "string") return null;
  const m = /^(https?:\/\/[^/]+\/base)\/[er]\/[^/?#]+$/.exec(docId);
  return m ? `${m[1]}/` : null;
}

/**
 * The absolute address a reference names. A relation document returns its member references compacted against the vault's own `@context`
 * (`{"@id": "base:e/…"}`); this expands the `base:` prefix against `vaultBase`. A reference it cannot resolve is `null`.
 */
function idOf(v: unknown, vaultBase: string | null = null): string | null {
  const resolve = (s: string): string | null => {
    if (s.startsWith("http") || s.startsWith("urn:")) return s;
    if (vaultBase && s.startsWith("base:")) return `${vaultBase}${s.slice("base:".length)}`;
    return null;
  };
  if (typeof v === "string") return resolve(v);
  if (v && typeof v === "object" && "@id" in v) {
    const id = (v as { "@id": unknown })["@id"];
    return typeof id === "string" ? resolve(id) : null;
  }
  return null;
}

function firstValue(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * A member reference read off a relation document, as an absolute address: the same expansion the role reader uses ({@link idOf} against the
 * document's own `base:` prefix). null when it is not a reference this document can resolve.
 *
 * @param v the value as read (`{ "@id": … }`, a string, or a one-element array of either)
 * @param docUri the relation document's own `@id` (`RelationDoc.uri`)
 */
export function expandRelationRef(v: unknown, docUri: string): string | null {
  return idOf(firstValue(v), vaultBaseFromDocId(docUri));
}
