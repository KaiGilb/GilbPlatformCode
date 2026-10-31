// The pure helpers of the record card: which facts an edit persists, which extra facts a record shows, the fallback field list. No state, no request.
import { readLink } from "@kaigilb/gilbplatformcode-online-card-link";
import { ALLOWED_EXTRA_ATTR_SLUGS, isAppAddressableSlug, type FieldSpec } from "@kaigilb/gilbplatformcode-record-types";
import type { RecordFacts } from "@kaigilb/gilbplatformcode-lws-records";
import { isOnlineCardLinkKey } from "@kaigilb/gilbplatformcode-one-card";


export function linkTargetOf(record: { served?: { facts?: Readonly<Record<string, unknown>> } } | null): string | null {
  const l = readLink(record?.served?.facts ?? null);
  return l.state === "linked" ? l.target : null;
}

/**
 * The selected record's typed detail — a DIRECT-EDIT surface (no Edit mode, no Save button).
 * Every field is always editable; a blur / navigate-away / tab-hide autosaves it through the


// ── fact helpers ───────────────────────────────────────────────────────────────────────
/**
 * Facts the editor persists: typed fields + any user-added / already-present extras.
 * Extras come from live BaseVeda attribute search (not only the old short allow-list).
 */
export function editorFacts(
  fields: readonly FieldSpec[],
  draft: RecordFacts,
  extraKeys: readonly string[],
): RecordFacts {
  const facts: RecordFacts = {};
  const typed = new Set(fields.map((f) => f.slug));
  for (const f of fields) facts[f.slug] = draft[f.slug] ?? "";
  for (const slug of extraKeys) {
    if (typed.has(slug)) continue;
    if (!isAppAddressableSlug(slug)) continue;
    facts[slug] = draft[slug] ?? "";
  }
  // Reload path: non-typed, non-authz facts already on the record stay editable.
  for (const [slug, value] of Object.entries(draft)) {
    if (typed.has(slug) || slug in facts) continue;
    if (slug.startsWith("@") || /^(directReader|directWriter|readerGroup|writerGroup)$/i.test(slug))
      continue;
    if (isOnlineCardLinkKey(slug)) continue;
    if (!isAppAddressableSlug(slug)) continue;
    if (value !== undefined) facts[slug] = value ?? "";
  }
  return facts;
}

/** True when two maps agree on every key in `keys` (no-op-save short-circuit). */
export function sameEditorFacts(a: RecordFacts, b: RecordFacts, keys: readonly string[]): boolean {
  return keys.every((k) => (a[k] ?? "") === (b[k] ?? ""));
}

export function extraKeysFromFacts(fields: readonly FieldSpec[], facts: RecordFacts): string[] {
  const typed = new Set(fields.map((f) => f.slug));
  const out: string[] = [];
  for (const [slug, value] of Object.entries(facts)) {
    if (typed.has(slug)) continue;
    if (slug.startsWith("@") || /^(directReader|directWriter|readerGroup|writerGroup)$/i.test(slug))
      continue;
    if (isOnlineCardLinkKey(slug)) continue; // s13: the online-card link is managed by the card (Link / Unlink), never an "extra" fact
    if (!isAppAddressableSlug(slug)) continue;
    // Empty values only re-surface if they were on the short seed list (legacy rows).
    if (String(value ?? "").trim() === "" && !ALLOWED_EXTRA_ATTR_SLUGS.includes(slug)) continue;
    out.push(slug);
  }
  return out;
}

/** Fallback field list when the live type is not in the short registry. The name slug is
 * RESOLVED by the caller (`openTypeNameSlug`) — it is not a constant, because a spec-less
 * record's name lives in `a:label` (canonical) or, for rows written before the write side was
 * corrected, in the legacy `a:title`. Hardcoding `"title"` here is what rendered an empty
 * `Untitled` box beside a record whose name the vault was holding. */
export const openNodeFields = (nameSlug: string): readonly FieldSpec[] => [
  { slug: nameSlug, label: "Name", kind: "text", placeholder: "Name this node…" },
];

/**
 * Fields the editor shows. Registry types keep their FieldSpec list; live/unknown types
 * still get a Name (title) field so the user can name a node before/after retyping.
 */
export function effectiveFields(
  fields: readonly FieldSpec[],
  nameSlug: string,
): readonly FieldSpec[] {
  if (fields.length > 0) {
    if (fields.some((f) => f.slug === nameSlug)) return fields;
    return [
      { slug: nameSlug, label: "Name", kind: "text", placeholder: "Name this node…" },
      ...fields,
    ];
  }
  return openNodeFields(nameSlug);
}
