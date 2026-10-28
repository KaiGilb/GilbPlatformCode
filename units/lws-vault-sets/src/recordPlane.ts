/**
 * Types / planes that must NEVER appear as register rows (defense-in-depth with Base
 * `isGridRecordType`).
 *
 * - filectl:* / cost:* — internal control / meter planes
 * - reified relation @types (PartOf, Reference, Authorship, DependsOn, Assignment, Relation)
 *   — graph edges minted at `/base/r/<id>`; type-agnostic list was dumping them as
 *   Untitled rows every time a link was created
 * - AppUiPreferences — BaseApp shell presentation state, not content
 * - VaultAccessGrant — vault→vault access grant edges (see the note below)
 * File/Vault are also non-records (own surfaces); Base filters those server-side.
 */
const NON_RECORD_TYPE_LOCALS = new Set([
  "File",
  "Vault",
  "FileContent",
  "Relation",
  "PartOf",
  "Reference",
  "Authorship",
  "DependsOn",
  "Assignment",
  // App shell presentation state (t:AppUiPreferences) — not content Nodes
  "AppUiPreferences",
  // Vault→vault access grant edges (t:PodAccessGrant). See the plane note below.
  "VaultAccessGrant",
]);

/** The bare CURIE-name of any type spelling (`t:X`, `pfx:X`, `…/base/t/X`, or `X`). */
export function typeLocalName(typeUri: string): string {
  const t = typeUri.trim();
  if (t.startsWith("t:")) return t.slice(2);
  const curie = t.match(/^[a-z][a-z0-9]*:([A-Za-z0-9_-]+)$/i);
  if (curie?.[1]) return curie[1];
  const m = t.match(/\/base\/t\/([^/#?]+)/i);
  if (m?.[1]) return decodeURIComponent(m[1]);
  return t;
}

/** True for reified relation entities (`…/base/r/<id>`). */
export function isRelationEntityUri(entityUri: string | null | undefined): boolean {
  return !!entityUri && /\/base\/r\//i.test(entityUri);
}

/** BaseVeda type CURIE-name (PascalCase BPONT_24). */
export const APP_UI_PREFS_TYPE = "AppUiPreferences";
/** Optional human label on the instance (a:title / title). */
export const PREFS_LABEL = "App UI preferences";

/** True when type URI is t:AppUiPreferences (any host spelling). */
export function isAppUiPreferencesType(typeUri: string | null | undefined): boolean {
  if (!typeUri) return false;
  const t = typeUri.trim();
  if (t === `t:${APP_UI_PREFS_TYPE}`) return true;
  if (t.endsWith(`/base/t/${APP_UI_PREFS_TYPE}`)) return true;
  if (t.endsWith(`:${APP_UI_PREFS_TYPE}`)) return true;
  return false;
}

/**
 * True when a list/detail row is UI prefs presentation state (not content).
 * Matches proper type OR legacy Note hack (migrate on next save).
 */
export function isUiPrefsRecord(
  facts: Record<string, string> | null | undefined,
  typeUri?: string | null,
  title?: string | null,
): boolean {
  if (isAppUiPreferencesType(typeUri)) return true;
  if (!facts && !title) return false;
  const f = facts ?? {};
  // Legacy Note-based prefs (pre-typed) — still hide; next save upgrades type.
  if ((f.baseappPref ?? "").trim() === "ui-v1") return true;
  const t = (title ?? f.title ?? "").trim();
  return t === "BaseApp preferences" || t === PREFS_LABEL;
}

/**
 * True when a list row is not user content for the register/grid/graph.
 * Prefer {@link isNonRecordListEntry} when both entity + type are known.
 */
export function isInternalControlType(typeUri: string | null | undefined): boolean {
  if (!typeUri) return false;
  const t = typeUri.trim();
  if (t.startsWith("filectl:") || t.startsWith("cost:")) return true;
  if (NON_RECORD_TYPE_LOCALS.has(typeLocalName(t))) return true;
  return false;
}

/**
 * Drop from register list: control plane, relation plane, known non-record types.
 *
 * ⚠ PASS `facts` WHENEVER YOU HAVE THEM. The legacy untyped UI-prefs rows (a `t:NoteDocument`
 * carrying `baseappPref: "ui-v1"` or the prefs title) are ONLY catchable through `facts` — a caller
 * that omits them silently loses that arm of the check. Omit it only when rows genuinely are not
 * hydrated yet AND a downstream surface re-checks with facts (the vault-set membership read does
 * exactly that; `recordHooks` re-checks after hydration).
 */
/**
 * Cycle214 step 1e it6 fix F20 (Agent.Scaling 6ccd72d) — the types whose records are PARTS of a person
 * card (MyNet's address composite and its field claims), not records of their own. Each address adds up
 * to five of them, and a grid delete of a composite orphans its fields. They are kept out of the
 * register's row list ({@link isNonRecordListEntry}), as the UI-preferences rows are; the card that owns
 * them lists them itself (by type, with the register filter off).
 *
 * ⛔ No type name is typed here: the owning module registers the term names it asks the master about,
 * and the spellings the master answers (`placeVocab.ts`), through {@link registerCardPartTypes}.
 */
const CARD_PART_TYPE_LOCALS = new Set<string>();

/** Register types whose records are parts of a person card (any spelling; kept by bare name). */
export function registerCardPartTypes(types: Iterable<string>): void {
  for (const t of types) if (t && t.trim()) CARD_PART_TYPE_LOCALS.add(typeLocalName(t));
}

/** True when the type was registered by {@link registerCardPartTypes}. */
export function isCardPartType(typeUri: string | null | undefined): boolean {
  return !!typeUri && CARD_PART_TYPE_LOCALS.has(typeLocalName(typeUri));
}

export function isNonRecordListEntry(
  entityUri: string | null | undefined,
  typeUri: string | null | undefined,
  facts?: Record<string, string> | null,
): boolean {
  if (isRelationEntityUri(entityUri)) return true;
  if (isInternalControlType(typeUri)) return true;
  if (isAppUiPreferencesType(typeUri)) return true;
  if (facts && isUiPrefsRecord(facts, typeUri)) return true;
  // F20: a person card's parts (address claims) are not register rows.
  if (isCardPartType(typeUri)) return true;
  return false;
}
