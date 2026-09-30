import { describe, expect, it } from "vitest";
import { pickNewerPrefs, type PrefsChoice, type ThemeMode } from "./prefsChoice";

function prefs(partial: Partial<PrefsChoice> & { themeMode: ThemeMode }): PrefsChoice {
  return { v: 1, themeCustom: null, ...partial };
}

describe("pickNewerPrefs", () => {
  it("device dark with no timestamp beats saved light with no timestamp", () => {
    const pick = pickNewerPrefs(prefs({ themeMode: "dark" }), prefs({ themeMode: "light" }));
    expect(pick.source).toBe("local");
    expect(pick.prefs.themeMode).toBe("dark");
    expect(pick.shouldWriteVault).toBe(true);
  });

  it("saved dark beats device light", () => {
    const pick = pickNewerPrefs(
      prefs({ themeMode: "light", updatedAt: 100 }),
      prefs({ themeMode: "dark", updatedAt: 200 }),
    );
    expect(pick.source).toBe("pod");
    expect(pick.prefs.themeMode).toBe("dark");
    expect(pick.shouldWriteVault).toBe(false);
  });

  it("device dark beats a newer saved light, and the language still follows the newer row", () => {
    const pick = pickNewerPrefs(
      prefs({ themeMode: "dark", updatedAt: 100, preferredLang: "en" }),
      prefs({ themeMode: "light", updatedAt: 999, preferredLang: "no" }),
    );
    expect(pick.prefs.themeMode).toBe("dark");
    expect(pick.source).toBe("local");
    expect(pick.shouldWriteVault).toBe(true);
    expect(pick.prefs.preferredLang).toBe("no");
  });

  it("uses the saved row alone when there is no device cache", () => {
    const pick = pickNewerPrefs(null, prefs({ themeMode: "cvd", updatedAt: 1 }));
    expect(pick.source).toBe("pod");
    expect(pick.prefs.themeMode).toBe("cvd");
    expect(pick.shouldWriteVault).toBe(false);
  });

  it("omits the language key when both sides are blank", () => {
    const pick = pickNewerPrefs(
      prefs({ themeMode: "light", preferredLang: "  ", updatedAt: 2 }),
      prefs({ themeMode: "light", preferredLang: "", updatedAt: 2 }),
    );
    expect(pick.prefs).not.toHaveProperty("preferredLang");
    expect(pick.prefs.updatedAt).toBeGreaterThan(0);
  });
});
