/**
 * The bytes one preference payload would write, as one comparable string.
 *
 * Two payloads with the same signature write the same facts. The second write
 * changes nothing and must not be sent.
 *
 * What is included, in this order: mode, base, vars, lang, ts.
 *
 * - `themeMode` is written as given. It is not checked against light, dark,
 *   cvd, or custom.
 * - `themeCustom` null → base null and vars null.
 * - `themeCustom` present → base is that base, or null when base is missing.
 *   vars is an object. Keys are sorted with the default string sort, not a
 *   locale sort. Values that are not strings are dropped. An empty vars
 *   object stays `{}`. It does not become null.
 * - `preferredLang` is trimmed. Blank and missing become `""`. `"  no  "`
 *   becomes `no`.
 * - `updatedAt` missing becomes `0`. `0` stays `0`. A negative number stays.
 *   This timestamp is part of the signature on purpose. A real change stamps
 *   a new time, so the signature changes even when the colours do not. Do
 *   not remove it to dedupe a repeat click.
 *
 * A version field on the caller's payload is ignored. It is not read.
 *
 * This is not `prefs-choice`. That unit picks which of two payloads is newer.
 * This unit only says whether two payloads are the same write.
 */
export interface PrefsSignatureInput {
  themeMode: string;
  themeCustom: {
    base?: string;
    vars?: Partial<Record<string, unknown>>;
  } | null;
  preferredLang?: string;
  updatedAt?: number;
}

export function prefsWireSignature(p: PrefsSignatureInput): string {
  const vars = p.themeCustom?.vars ?? {};
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(vars).sort()) {
    const value = vars[key];
    if (typeof value === "string") sorted[key] = value;
  }
  return JSON.stringify({
    mode: p.themeMode,
    base: p.themeCustom?.base ?? null,
    vars: p.themeCustom ? sorted : null,
    lang: p.preferredLang?.trim() || "",
    ts: p.updatedAt ?? 0,
  });
}
