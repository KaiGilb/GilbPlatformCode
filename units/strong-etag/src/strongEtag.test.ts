import { describe, expect, it } from "vitest";
import { normalizeStrongEtag } from "./strongEtag";

describe("normalizeStrongEtag", () => {
  it("strips one weak marker and keeps the quotes", () => {
    expect(normalizeStrongEtag('W/"sha256:ab"')).toBe('"sha256:ab"');
    expect(normalizeStrongEtag('w/"sha256:ab"')).toBe('"sha256:ab"');
    expect(normalizeStrongEtag('  W/"sha256:ab"  ')).toBe('"sha256:ab"');
    expect(normalizeStrongEtag('"sha256:ab"')).toBe('"sha256:ab"');
  });

  it("returns null for absence, and does not strip a marker that is not a prefix", () => {
    expect(normalizeStrongEtag(null)).toBeNull();
    expect(normalizeStrongEtag(undefined)).toBeNull();
    expect(normalizeStrongEtag("   ")).toBeNull();
    expect(normalizeStrongEtag("W/")).toBeNull();
    expect(normalizeStrongEtag("W/   ")).toBeNull();
    expect(normalizeStrongEtag('W/W/"sha256:ab"')).toBe('W/"sha256:ab"');
    expect(normalizeStrongEtag('WW/"sha256:ab"')).toBe('WW/"sha256:ab"');
    expect(normalizeStrongEtag('sha256:W/ab')).toBe("sha256:W/ab");
  });
});
