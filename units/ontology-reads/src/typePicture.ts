import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

export const TYPE_PICTURE_ATTR = "a:typePicture";

/** Bare BaseVeda type name (`Chair`, `TypePicture`) from a CURIE, URI, or chooser id. */
export function normalizeTypeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (s.startsWith("veda:")) s = s.slice(5);
  const slashT = s.lastIndexOf("/t/");
  if (slashT >= 0) s = s.slice(slashT + 3);
  if (s.startsWith("t:")) s = s.slice(2);
  s = s.replace(/\.png$/i, "");
  if (!s || s.includes("/")) return null;
  return s;
}

export function typeTermUrl(typeName: string): string | null {
  const name = normalizeTypeName(typeName);
  if (!name) return null;
  return `${termOrigin()}/base/t/${encodeURIComponent(name)}`;
}

const pictureCache = new Map<string, Promise<string | null>>();

/** One GET /base/t/<Type> per name. Absence is null — no 404 hunt in the UI. */
export function fetchTypePictureSrc(typeName: string): Promise<string | null> {
  const name = normalizeTypeName(typeName);
  if (!name) return Promise.resolve(null);
  const hit = pictureCache.get(name);
  if (hit) return hit;
  const url = typeTermUrl(name);
  if (!url) return Promise.resolve(null);
  const p = Promise.resolve()
    .then(() => fetch(url, { headers: { accept: "application/json" } }))
    .then(async (res) => {
      if (!res.ok) {
        // Only a real "this type has no page" (404) is remembered as no picture; a server error is not an answer (V30 S-F8).
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

/**
 * Public bytes URL (`<the entity's own vault origin>/files/<id>`) for a stored FILE entity IRI, or null.
 *
 * The ONE derivation of a file's bytes address from its entity IRI — used by both type-picture
 * readers below AND (Cycle213, VAScaling GAPP213.3-4 V5) by the concept picture spot and the tree
 * record's picture, so no two places can disagree about where a picture's bytes live. Rejects
 * anything that is not a `/base/e/<id>` entity IRI — in particular the `/base/t/<Type>.png` SERVE
 * route, which is not a stored object (see the module header). The origin comes from
 * {@link vaultOriginOf}, so a dev rig's entity host maps to the configured origin (scheme included).
 */
export function fileBytesUrl(id: unknown): string | null {
  if (typeof id !== "string" || !id.includes("/base/e/")) return null;
  const tail = id.slice(id.lastIndexOf("/") + 1);
  // 🔴 ANCHORED, and the anchor is not cosmetic. This guard used to read
  // `tail.includes("png")` — a SUBSTRING test — which rejects any entity id that merely
  // CONTAINS those three letters. Independent QA found the live casualty and I re-derived it:
  // of the 1460 distinct `a:typePicture` targets on the ontology host, exactly one trips it —
  // `fpngn43e70b4`, held by `t/AdaptToActingRoles`, whose bytes serve 200 image/png, 15 596 B.
  // ⚠ The bug predates this increment on the ontology plane, but leaving it here would have
  // EXTENDED it to the grid and the card, so it is fixed rather than preserved.
  // The `/base/e/` test above already rejects the `/base/t/<Type>.png` serve route this arm was
  // written for; what survives here is the id that literally ENDS in an extension.
  if (!tail || /\.[a-z0-9]+$/i.test(tail)) return null;
  try {
    new URL(id);
  } catch {
    return null;
  }
  return `${vaultOriginOf(id)}/files/${tail}`;
}

/** Public PNG URL for this term's type picture, or null. Reads the JSON-LD document shape
 * (`{"@id": …}` edge object) — the ontology pane's plane. */
export function typePictureSrc(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;
  const v = raw[TYPE_PICTURE_ATTR] ?? raw["typePicture"];
  if (!v || typeof v !== "object") return null;
  return fileBytesUrl((v as { "@id"?: unknown })["@id"]);
}

