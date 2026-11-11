import { describe, expect, it } from "vitest";
import { checkPalette, paletteFromSeed, type Harmony } from "./palette";
import { oklchHex } from "./util";

const seeds: string[] = [];
for (let h = 0; h < 360; h += 12) seeds.push(oklchHex(0.62, 0.17, h));
seeds.push("#fafafa", "#050505");
const harmonies: Harmony[] = ["complementary", "analogous", "triadic", "split", "mono"];

describe("paletteFromSeed", () => {
  it("covers 30 hues plus near-white and near-black", () => expect(seeds.length).toBe(32));
  for (const seed of seeds) {
    for (const mode of ["light", "dark"] as const) {
      it(`passes every contrast row: ${seed} ${mode}`, () => {
        const harmony = harmonies[(seed.charCodeAt(2) + seed.charCodeAt(3)) % harmonies.length]!;
        const p = paletteFromSeed(seed, { mode, harmony });
        const failing = checkPalette(p).filter((r) => !r.pass);
        expect(failing).toEqual([]);
        expect(p.secondary).toMatch(/^#[0-9a-f]{6}$/);
        expect(p.tertiary).toMatch(/^#[0-9a-f]{6}$/);
      });
    }
  }
  it("all harmonies work", () => {
    for (const harmony of harmonies) for (const mode of ["light", "dark"] as const) {
      expect(checkPalette(paletteFromSeed("#e11d48", { mode, harmony })).every((r) => r.pass)).toBe(true);
    }
  });
  it("checkPalette covers the seven pairs", () => {
    expect(checkPalette(paletteFromSeed("#e11d48", { mode: "light", harmony: "mono" })).map((r) => r.pair)).toEqual(["ink/paper", "ink/surface", "onAccent/accent", "accent/paper", "ok/paper", "warn/paper", "bad/paper"]);
  });
  it("throws on an unparseable seed", () => {
    expect(() => paletteFromSeed("nope", { mode: "light", harmony: "mono" })).toThrow();
  });
});
