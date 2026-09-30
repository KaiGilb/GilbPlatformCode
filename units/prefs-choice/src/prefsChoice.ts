/**
 * Which theme and language to show when the device and the saved row disagree.
 *
 * A language-only save often stores theme "light" with a fresh timestamp.
 * That must not wipe a dark (or colour-blind, or custom) theme on the device.
 * The reverse is also true: a dark theme on the saved row beats a light
 * theme on the device.
 *
 * This function does not read or write storage. It does not know the key.
 */

export type ThemeMode = "light" | "dark" | "cvd" | "custom";

export type ThemeCustom = {
  base: "light" | "dark" | "cvd";
  vars: Partial<Record<string, string>>;
};

export type PrefsChoice = {
  v: 1;
  themeMode: ThemeMode;
  themeCustom: ThemeCustom | null;
  /** Absent when neither side had a language. Never "". */
  preferredLang?: string;
  updatedAt?: number;
};

export type PrefsPick = {
  prefs: PrefsChoice;
  /** Which side the theme came from. The language may have come from the other side. */
  source: "local" | "pod";
  /** True when the device's theme or language should be written back. */
  shouldWriteVault: boolean;
};

function isNonDefaultTheme(mode: ThemeMode | string | undefined): boolean {
  return mode === "dark" || mode === "cvd" || mode === "custom";
}

/**
 * Merge a device cache (`local`, or null when there is none) with the saved
 * row (`vault`).
 *
 * Theme, when the two modes differ:
 * - device dark/cvd/custom beats saved light, even when the saved row is newer
 * - saved dark/cvd/custom beats device light
 * - otherwise the newer `updatedAt` wins, and a tie goes to the device
 *   (`>=`, not `>`)
 *
 * When the modes are the same, a newer device timestamp also takes the
 * device's custom palette. A missing palette falls back to the other side.
 *
 * Language: a blank or whitespace-only language is absent. If both sides
 * have one, the newer timestamp wins, tie to the device. The stored value
 * is the trimmed string. One side only: that side, and if it is the device
 * the result asks to be written back.
 *
 * `updatedAt` on the result is a positive number. When the device contributed
 * the theme or the language, that number is "now" (or the later of the two
 * stamps and now). This function calls `Date.now()` itself. Do not pass a
 * clock.
 *
 * `source` follows the theme only. A language taken from the saved row while
 * the theme stayed dark still reports `source: "local"`.
 */
export function pickNewerPrefs(local: PrefsChoice | null, vault: PrefsChoice): PrefsPick {
  if (!local) return { prefs: vault, source: "pod", shouldWriteVault: false };

  const lTs = local.updatedAt ?? 0;
  const pTs = vault.updatedAt ?? 0;

  let themeMode: ThemeMode = vault.themeMode;
  let themeCustom = vault.themeCustom;
  let themeFromLocal = false;

  if (local.themeMode !== vault.themeMode) {
    if (isNonDefaultTheme(local.themeMode) && vault.themeMode === "light") {
      themeMode = local.themeMode;
      themeCustom = local.themeCustom;
      themeFromLocal = true;
    } else if (isNonDefaultTheme(vault.themeMode) && local.themeMode === "light") {
      themeMode = vault.themeMode;
      themeCustom = vault.themeCustom;
      themeFromLocal = false;
    } else if (lTs >= pTs) {
      themeMode = local.themeMode;
      themeCustom = local.themeCustom;
      themeFromLocal = true;
    } else {
      themeMode = vault.themeMode;
      themeCustom = vault.themeCustom;
      themeFromLocal = false;
    }
  } else if (lTs > pTs) {
    themeMode = local.themeMode;
    themeCustom = local.themeCustom ?? vault.themeCustom;
    themeFromLocal = true;
  } else {
    themeMode = vault.themeMode;
    themeCustom = vault.themeCustom ?? local.themeCustom;
    themeFromLocal = false;
  }

  const localLang = local.preferredLang?.trim() || "";
  const vaultLang = vault.preferredLang?.trim() || "";
  let preferredLang: string | undefined;
  let langFromLocal = false;
  if (localLang && vaultLang) {
    if (lTs >= pTs) {
      preferredLang = localLang;
      langFromLocal = true;
    } else {
      preferredLang = vaultLang;
    }
  } else if (localLang) {
    preferredLang = localLang;
    langFromLocal = true;
  } else if (vaultLang) {
    preferredLang = vaultLang;
  }

  const shouldWriteVault =
    themeFromLocal ||
    langFromLocal ||
    (themeMode !== vault.themeMode && themeFromLocal) ||
    (!vault.updatedAt && (isNonDefaultTheme(themeMode) || Boolean(preferredLang)));

  const updatedAtRaw = Math.max(lTs, pTs, themeFromLocal || langFromLocal ? Date.now() : 0) || undefined;
  const updatedAt = updatedAtRaw && updatedAtRaw > 0 ? updatedAtRaw : Date.now();

  const prefs: PrefsChoice = {
    v: 1,
    themeMode,
    themeCustom: themeCustom ?? null,
    updatedAt,
  };
  if (preferredLang !== undefined) prefs.preferredLang = preferredLang;

  const source: "local" | "pod" = themeFromLocal ? "local" : "pod";
  return { prefs, source, shouldWriteVault };
}
