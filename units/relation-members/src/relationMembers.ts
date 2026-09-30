/**
 * Members named on a relation document you already hold.
 * This does not fetch the relation.
 *
 * A string is kept only when it contains `/`. A bare word is not a member.
 * An `{ "@id" }` object is kept whenever the id is non-empty, even with no `/`.
 * Keys that start with `@` are skipped. Other keys are read only when they end
 * in source, target, or member, or when they start with `role:`.
 * `a:label` is not a member.
 *
 * memberIds are uri tails: query and hash removed, trailing slashes removed,
 * then percent-decoded. That is the id-tail unit's uriTail, repeated here so
 * this folder can be copied on its own. It is not slashTail. A query is not
 * part of the id.
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

function pushMember(out: string[], raw: unknown): void {
  if (raw == null) return;
  if (typeof raw === "string" && raw.includes("/")) {
    out.push(raw);
    return;
  }
  if (typeof raw === "object" && raw !== null && "@id" in raw) {
    const id = String((raw as { "@id": unknown })["@id"] ?? "");
    if (id) out.push(id);
  }
}

function isMemberKey(key: string): boolean {
  if (key.startsWith("@")) return false;
  return /(^|:)(source|target|member)$/i.test(key) || /^role:/i.test(key);
}

/** Full values, in first-seen order, duplicates removed. */
export function memberUrisFromRelationDoc(doc: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(doc)) {
    if (!isMemberKey(key)) continue;
    if (Array.isArray(value)) {
      for (const item of value) pushMember(out, item);
    } else {
      pushMember(out, value);
    }
  }
  return [...new Set(out.filter(Boolean))];
}

/**
 * The same members, cut to ids with uriTail.
 * Use this for a set key. Use {@link memberUrisFromRelationDoc} when you are
 * about to open the member. An id alone can be asked for on the wrong vault.
 */
export function memberIdsFromRelationDoc(doc: Record<string, unknown>): string[] {
  return memberUrisFromRelationDoc(doc).map(uriTail);
}
