/**
 * Which already-read link makes an item a member of a folder.
 *
 * A member is the source end of a part-of link whose target is this folder.
 * Any other predicate, or a folder that is itself the source, is not a member.
 * Publishing from "every co-member the listing returned" publishes the parent.
 *
 * The listing arm and the document arm do not apply the same ended rule.
 * A typed listing has no lifecycle field in this decision. Ended is dropped
 * only when you have the document. Do not add the ended test to the listing
 * arm.
 *
 * uriTail and the type-curie reader below are private copies. They must stay
 * in agreement with units/id-tail `uriTail` and units/type-curie
 * `typeCurieFromJsonLd`.
 */

/** The predicate these functions compare against. Exact. `PartOf` is not it. */
export const FOLDER_PART_OF = "t:PartOf";

export interface FolderPart {
  memberId: string;
  relationId: string;
  /** The link address as it was passed. Not the tail. */
  relationUri: string;
}

export interface FolderListingRelation {
  relation: string;
  role: string;
  /** Present only when the listing typed the link. Absent means the document is required. */
  type?: unknown;
  /** Present only when the listing named the members. An empty array is present. */
  members?: readonly { member: string; role: string }[];
}

export type FolderListingDecision =
  | { needDocument: false; parts: FolderPart[] }
  | { needDocument: true };

export interface FolderPartDocument {
  /** The curie already resolved, such as `t:PartOf`. Not a fresh JSON-LD value. */
  typeCurie: string | null;
  sourceUri: string | null;
  targetUri: string | null;
  extras: Record<string, unknown>;
}

/**
 * Last segment after removing the query and the hash and trailing slashes,
 * then percent-decoded. A failed decode returns the encoded segment. An empty
 * segment returns `uri` unchanged.
 */
function uriTail(uri: string): string {
  const clean = uri.split(/[?#]/)[0]?.replace(/\/+$/, "") ?? "";
  const seg = clean.slice(clean.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(seg) || uri;
  } catch {
    return seg || uri;
  }
}

function typeLocalName(typeUri: string): string {
  const t = typeUri.trim();
  if (t.startsWith("t:")) return t.slice(2);
  const curie = t.match(/^[a-z][a-z0-9]*:([A-Za-z0-9_-]+)$/i);
  const curieName = curie?.[1];
  if (curieName) return curieName;
  const matched = t.match(/\/base\/t\/([^/#?]+)/i);
  const pathName = matched?.[1];
  if (pathName) return decodeURIComponent(pathName);
  return t;
}

function typeCurieFromJsonLd(raw: unknown): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  let s: string | null = null;
  if (typeof first === "string") s = first;
  else if (first && typeof first === "object" && "@id" in first) {
    const id = (first as { "@id": unknown })["@id"];
    if (typeof id === "string") s = id;
  }
  if (!s?.trim()) return null;
  const trimmed = s.trim();
  if (trimmed.startsWith("t:")) return trimmed;
  const local = typeLocalName(trimmed);
  if (local && local !== trimmed) return `t:${local}`;
  return trimmed;
}

function isEndedLink(extras: Record<string, unknown>): boolean {
  const value = extras["relationLifecycleState"] ?? extras["a:relationLifecycleState"];
  const first = Array.isArray(value) ? value[0] : value;
  return first === "ended";
}

/**
 * Members from a listing row, or a signal that the document is still required.
 *
 * `folderIdOrUri` may be an opaque id or an address. It is tailed once.
 *
 * Role must be exactly `role:target`. Anything else is decided and empty.
 * The folder is the whole. A folder that is part of a parent is the source
 * of that link, and the parent is not its member.
 *
 * When `type` and `members` are both present (an empty member list counts as
 * present), the row is decided here. The type is read with the type-curie
 * rules: `t:PartOf`, a `{ "@id" }` value, or an address that contains
 * `/base/t/PartOf`. A bare word `PartOf` does not match. A present type that
 * is not part-of is decided empty. It does not fall through to the document.
 *
 * When either `type` or `members` is absent, the result is `{ needDocument: true }`
 * and only if the role was `role:target`. There is no partial member list.
 *
 * Source members whose tail is empty or equal to the folder are skipped.
 * `relationId` is the tail. `relationUri` is the address you passed.
 * Ended is not read. This function has nowhere to read it.
 */
export function folderPartsFromListing(
  rel: FolderListingRelation,
  folderIdOrUri: string,
): FolderListingDecision {
  const folderId = uriTail(folderIdOrUri);
  if (rel.role !== "role:target") return { needDocument: false, parts: [] };
  if (rel.type !== undefined && rel.members !== undefined) {
    if (typeCurieFromJsonLd(rel.type) !== FOLDER_PART_OF) return { needDocument: false, parts: [] };
    const parts: FolderPart[] = [];
    for (const member of rel.members) {
      if (member.role !== "role:source") continue;
      const memberId = uriTail(member.member);
      if (memberId && memberId !== folderId) {
        parts.push({
          memberId,
          relationId: uriTail(rel.relation),
          relationUri: rel.relation,
        });
      }
    }
    return { needDocument: false, parts };
  }
  return { needDocument: true };
}

/**
 * One member from a relation document, or null.
 *
 * Call this only for a row whose listing decision was `needDocument: true`.
 * The role is checked again: it must be `role:target`. A source-role link
 * is null even when the document's target is the folder.
 *
 * `typeCurie` is compared to `t:PartOf` as already resolved. An address in
 * that field does not match. Resolve it with `type-curie` before you pass it.
 *
 * Ended: `extras.relationLifecycleState`, then `a:relationLifecycleState`
 * only when the first is null or missing. `""` does not fall through.
 * A list uses the first entry only. The word is exactly `ended`.
 *
 * The target tail must be the folder. The source tail is the member. The
 * folder as its own source is null.
 */
export function folderPartFromDocument(
  rel: { relation: string; role: string },
  doc: FolderPartDocument,
  folderIdOrUri: string,
): FolderPart | null {
  const folderId = uriTail(folderIdOrUri);
  if (rel.role !== "role:target") return null;
  if (doc.typeCurie !== FOLDER_PART_OF) return null;
  if (isEndedLink(doc.extras)) return null;
  if (!doc.sourceUri || !doc.targetUri || uriTail(doc.targetUri) !== folderId) return null;
  const memberId = uriTail(doc.sourceUri);
  if (!memberId || memberId === folderId) return null;
  return {
    memberId,
    relationId: uriTail(rel.relation),
    relationUri: rel.relation,
  };
}
