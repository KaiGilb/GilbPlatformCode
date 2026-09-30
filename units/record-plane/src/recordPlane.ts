/**
 * Which rows are not ordinary content.
 * The register hides a file. A relation graph keeps a file.
 * Those are different questions. Use the function that matches the screen.
 *
 * The local-name rules match units/type-curie and are copied here so this folder
 * stands alone. /vault/t/ is not recognised. A broken % throws instead of returning false.
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
  "AppUiPreferences",
  "VaultAccessGrant",
]);

const APP_UI_PREFS_TYPE = "AppUiPreferences";
const PREFS_LABEL = "App UI preferences";

function typeLocalName(typeUri: string): string {
  const text = typeUri.trim();
  if (text.startsWith("t:")) return text.slice(2);
  const curie = text.match(/^[a-z][a-z0-9]*:([A-Za-z0-9_-]+)$/i);
  const curieName = curie?.[1];
  if (curieName) return curieName;
  const address = text.match(/\/base\/t\/([^/#?]+)/i);
  const segment = address?.[1];
  if (segment) return decodeURIComponent(segment);
  return text;
}

/** True when the address contains /base/r/. /vault/r/ does not count. Null is false. */
export function isRelationEntityUri(entityUri: string | null | undefined): boolean {
  return !!entityUri && /\/base\/r\//i.test(entityUri);
}

/**
 * True for the preferences type in three spellings: t:AppUiPreferences,
 * an address that ends with /base/t/AppUiPreferences, or any text that ends with :AppUiPreferences.
 * The bare word AppUiPreferences is false here. It is still a non-record type by name.
 */
export function isAppUiPreferencesType(typeUri: string | null | undefined): boolean {
  if (!typeUri) return false;
  const text = typeUri.trim();
  if (text === `t:${APP_UI_PREFS_TYPE}`) return true;
  if (text.endsWith(`/base/t/${APP_UI_PREFS_TYPE}`)) return true;
  if (text.endsWith(`:${APP_UI_PREFS_TYPE}`)) return true;
  return false;
}

/**
 * True for a preferences row, including an old note that is not yet the preferences type.
 * The old mark is the fact baseappPref equal to ui-v1 after trim, or a title of
 * "BaseApp preferences" or "App UI preferences", from the title argument or from facts.title.
 * The match is exact after trim. ui-v2 is not a match.
 */
export function isUiPrefsRecord(
  facts: Record<string, string> | null | undefined,
  typeUri?: string | null,
  title?: string | null,
): boolean {
  if (isAppUiPreferencesType(typeUri)) return true;
  if (!facts && !title) return false;
  const stored = facts ?? {};
  if ((stored.baseappPref ?? "").trim() === "ui-v1") return true;
  const shown = (title ?? stored.title ?? "").trim();
  return shown === "BaseApp preferences" || shown === PREFS_LABEL;
}

/**
 * True for filectl: and cost: prefixes, and for the local names in the non-record set.
 * The prefixes are case-sensitive. filectl: is checked before the local name, so a broken
 * percent after that prefix does not throw. Any other broken % in /base/t/ throws.
 */
export function isInternalControlType(typeUri: string | null | undefined): boolean {
  if (!typeUri) return false;
  const text = typeUri.trim();
  if (text.startsWith("filectl:") || text.startsWith("cost:")) return true;
  if (NON_RECORD_TYPE_LOCALS.has(typeLocalName(text))) return true;
  return false;
}

/**
 * True when the register should hide the row.
 * A relation address, a control type, the preferences type, or preferences facts.
 * Pass facts whenever you have them. Without them, an old note titled as preferences
 * is visible, because this function does not take a separate title.
 * A file is hidden here. Reference is hidden. ReferenceDocument is not in the set.
 */
export function isNonRecordListEntry(
  entityUri: string | null | undefined,
  typeUri: string | null | undefined,
  facts?: Record<string, string> | null,
): boolean {
  if (isRelationEntityUri(entityUri)) return true;
  if (isInternalControlType(typeUri)) return true;
  if (isAppUiPreferencesType(typeUri)) return true;
  if (facts && isUiPrefsRecord(facts, typeUri)) return true;
  return false;
}

/**
 * True when no mixed screen should treat the row as content.
 * A file is false here, unless the address is a relation address, which is checked first.
 * Everything else follows the register test.
 */
export function isInfrastructureEntry(
  entityUri: string | null | undefined,
  typeUri: string | null | undefined,
  facts?: Record<string, string> | null,
): boolean {
  if (isRelationEntityUri(entityUri)) return true;
  if (typeUri && typeLocalName(typeUri.trim()) === "File") return false;
  return isNonRecordListEntry(entityUri, typeUri, facts);
}
