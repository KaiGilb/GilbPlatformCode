import { describe, expect, it } from "vitest";
import { prefsWireSignature, type PrefsSignatureInput } from "./prefsSignature";

describe("prefsWireSignature", () => {
  it("is the same string for the same facts, including key order", () => {
    const one: PrefsSignatureInput = {
      themeMode: "custom",
      themeCustom: { base: "dark", vars: { "--accent": "#111", "--ink": "#222" } },
      updatedAt: 1786625255758,
    };
    const two: PrefsSignatureInput = {
      themeMode: "custom",
      themeCustom: { base: "dark", vars: { "--ink": "#222", "--accent": "#111" } },
      updatedAt: 1786625255758,
    };
    expect(prefsWireSignature(one)).toBe(prefsWireSignature(two));
    expect(prefsWireSignature(one)).toBe(
      JSON.stringify({
        mode: "custom",
        base: "dark",
        vars: { "--accent": "#111", "--ink": "#222" },
        lang: "",
        ts: 1786625255758,
      }),
    );
  });

  it("writes nulls for a missing theme, and keeps a present empty palette", () => {
    expect(prefsWireSignature({ themeMode: "light", themeCustom: null, updatedAt: 5 })).toBe(
      JSON.stringify({ mode: "light", base: null, vars: null, lang: "", ts: 5 }),
    );
    expect(
      prefsWireSignature({ themeMode: "dark", themeCustom: { base: "dark", vars: {} }, updatedAt: 0 }),
    ).toBe(JSON.stringify({ mode: "dark", base: "dark", vars: {}, lang: "", ts: 0 }));
  });

  it("drops non-strings, trims language, and keeps the timestamp", () => {
    const signed = prefsWireSignature({
      themeMode: "custom",
      themeCustom: { base: "light", vars: { a: "1", b: 2, c: "3" } },
      preferredLang: "  no  ",
      updatedAt: 0,
    });
    expect(signed).toBe(
      JSON.stringify({ mode: "custom", base: "light", vars: { a: "1", c: "3" }, lang: "no", ts: 0 }),
    );
    const later = prefsWireSignature({
      themeMode: "light",
      themeCustom: null,
      updatedAt: 1,
    });
    const earlier = prefsWireSignature({
      themeMode: "light",
      themeCustom: null,
    });
    expect(later).not.toBe(earlier);
  });
});
