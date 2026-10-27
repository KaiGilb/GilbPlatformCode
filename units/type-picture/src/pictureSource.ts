// A GilbVeda type's picture address: where a type's document is, which file it points at, and where that file's bytes are served.
// Everything the source did with a host (the type documents' origin, the origin a file is served from, the global fetch) is
// handed in once, by `createTypePictureSource`; the module holds no host, no store and no module state.
//
// Stored pointer: `a:typePicture` holds a file entity IRI. The bytes are public (`GET <origin>/files/<id>`, no credentials).
// The `/base/t/<Type>.png` sibling is a serve route only and is not stored.
// Absence is a normal state: the result is null, there is no 404 hunt.
import { normalizeTypeName } from "@kaigilb/gilbplatformcode-type-name";

export const TYPE_PICTURE_ATTR = "a:typePicture";

export interface TypePictureSourceOptions {
  /** The origin that serves type documents, e.g. "https://ontology.example.test". Replaces the source's TYPE_TERM_ORIGIN. */
  termOrigin: string;
  /** The origin a file entity IRI's bytes are served from. Replaces the source's vaultOriginOf(id). */
  originOf: (entityIri: string) => string;
  /** Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

export interface TypePictureSource {
  typeTermUrl(typeName: string): string | null;
  fetchTypePictureSrc(typeName: string): Promise<string | null>;
  clearTypePictureCache(): void;
  fileBytesUrl(id: unknown): string | null;
  typePictureSrc(raw: Record<string, unknown> | null | undefined): string | null;
  recordTypePictureSrc(facts: Record<string, string | undefined> | null | undefined): string | null;
}

/**
 * One source per app, made once at start-up: it holds the picture cache (one GET per type name), so a source made per
 * render asks again every time.
 */
export function createTypePictureSource(opts: TypePictureSourceOptions): TypePictureSource {
  const pictureCache = new Map<string, Promise<string | null>>();

  /** The address of a type's document on the type origin, or null for a name that is not one. */
  function typeTermUrl(typeName: string): string | null {
    const name = normalizeTypeName(typeName);
    if (!name) return null;
    return `${opts.termOrigin}/base/t/${encodeURIComponent(name)}`;
  }

  /** One GET /base/t/<Type> per name. Absence is null — no 404 hunt in the UI. */
  function fetchTypePictureSrc(typeName: string): Promise<string | null> {
    const name = normalizeTypeName(typeName);
    if (!name) return Promise.resolve(null);
    const hit = pictureCache.get(name);
    if (hit) return hit;
    const url = typeTermUrl(name);
    if (!url) return Promise.resolve(null);
    const p = Promise.resolve()
      .then(() => (opts.fetch ?? globalThis.fetch)(url, { headers: { accept: "application/json" } }))
      .then(async (res) => {
        if (!res.ok) {
          // Only a real "this type has no page" (404) is remembered as no picture; a server error is not an answer.
          if (res.status !== 404) pictureCache.delete(name);
          return null;
        }
        const raw = (await res.json()) as Record<string, unknown>;
        return typePictureSrc(raw);
      })
      // A network error says nothing about the type: forget it, so the next mount asks again.
      .catch(() => {
        pictureCache.delete(name);
        return null;
      });
    pictureCache.set(name, p);
    return p;
  }

  /** Forget every answer, including a remembered 404. */
  function clearTypePictureCache(): void {
    pictureCache.clear();
  }

  /**
   * Public bytes URL (`<the entity's own origin>/files/<id>`) for a stored FILE entity IRI, or null.
   * The one derivation of a file's bytes address from its entity IRI, so no two readers can disagree about where a picture's
   * bytes live. Rejects anything that is not a `/base/e/<id>` entity IRI.
   */
  function fileBytesUrl(id: unknown): string | null {
    if (typeof id !== "string" || !id.includes("/base/e/")) return null;
    const tail = id.slice(id.lastIndexOf("/") + 1);
    // The extension test is anchored on purpose: a substring test (`tail.includes("png")`) would reject an entity id that
    // merely contains those letters. The `/base/e/` test above already rejects the `/base/t/<Type>.png` serve route; what is
    // left here is the id that literally ENDS in an extension.
    if (!tail || /\.[a-z0-9]+$/i.test(tail)) return null;
    try {
      new URL(id);
    } catch {
      return null;
    }
    return `${opts.originOf(id)}/files/${tail}`;
  }

  /** Public PNG URL for this term's type picture, or null. Reads the JSON-LD document shape (`{"@id": …}` edge object). */
  function typePictureSrc(raw: Record<string, unknown> | null | undefined): string | null {
    if (!raw) return null;
    const v = raw[TYPE_PICTURE_ATTR] ?? raw["typePicture"];
    if (!v || typeof v !== "object") return null;
    return fileBytesUrl((v as { "@id"?: unknown })["@id"]);
  }

  /**
   * Public PNG URL for a RECORD's OWN type picture, read off the FLAT fact map the record planes carry (where a framed
   * `{"@id": <iri>}` edge has become the bare IRI string, which `typePictureSrc` rejects) — or null when the record holds
   * no such pointer. Both readers funnel into `fileBytesUrl`, so the URL they derive is one derivation.
   */
  function recordTypePictureSrc(
    facts: Record<string, string | undefined> | null | undefined,
  ): string | null {
    if (!facts) return null;
    return fileBytesUrl(facts[TYPE_PICTURE_ATTR] ?? facts["typePicture"]);
  }

  return { typeTermUrl, fetchTypePictureSrc, clearTypePictureCache, fileBytesUrl, typePictureSrc, recordTypePictureSrc };
}
