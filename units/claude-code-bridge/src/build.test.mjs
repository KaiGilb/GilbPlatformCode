// @vitest-environment node
// The committed bridge/*.mjs files are what people run. They must be exactly what a fresh build of src/ gives.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAll, TIME_LINE_MARKER, TIME_LINE_OPEN, TIME_LINE_CLOSE } from "../scripts/build-bridge.mjs";
import { BRIDGE_BUILD } from "../bridge/bridge.mjs";

const unit = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("built == committed", () => {
  it("bridge/bridge.mjs and bridge/vite-plugin.mjs equal a fresh build (run npm run build:bridge)", () => {
    const fresh = buildAll();
    expect(Object.keys(fresh).sort()).toEqual(["bridge/bridge.mjs", "bridge/vite-plugin.mjs"]);
    for (const [file, text] of Object.entries(fresh)) {
      expect(fs.readFileSync(path.join(unit, file), "utf8") === text, `${file} differs from a fresh build`).toBe(true);
    }
  });

  it("the built plugin imports the built bridge", () => {
    expect(fs.readFileSync(path.join(unit, "bridge/vite-plugin.mjs"), "utf8")).toContain('from "./bridge.mjs"');
  });

  it("BRIDGE_BUILD is the package version", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(unit, "package.json"), "utf8"));
    expect(BRIDGE_BUILD).toBe(pkg.version);
  });
});

// 0.4.0: the Time line reader lives once, as source, in units/time-line. The build inlines it into the one built file.
describe("the inlined Time line reader", () => {
  const built = fs.readFileSync(path.join(unit, "bridge/bridge.mjs"), "utf8");
  const count = (text, part) => text.split(part).length - 1;

  it("the built bridge.mjs has no bare import of any @kaigilb/ package", () => {
    expect(built).not.toMatch(/^\s*import\s[^;]*from\s+["']@kaigilb\//m);
    expect(built).not.toMatch(/^\s*import\s+["']@kaigilb\//m);
    expect(built).not.toMatch(/\bimport\(\s*["']@kaigilb\//);
  });

  it("holds the inline marker comment exactly once, and the block opens and closes once", () => {
    expect(count(built, TIME_LINE_MARKER)).toBe(1);
    expect(count(built, TIME_LINE_OPEN)).toBe(1);
    expect(count(built, TIME_LINE_CLOSE)).toBe(1);
  });

  it("the inlined block, run as it stands in the built file, reads every case of the unit's fixtures exactly as the unit does", () => {
    const from = built.indexOf(TIME_LINE_OPEN) + "const { extractTimeLines } = (() => {".length;
    const to = built.indexOf(TIME_LINE_CLOSE);
    expect(from).toBeGreaterThan("const { extractTimeLines } = (() => {".length);
    expect(to).toBeGreaterThan(from);
    const { extractTimeLines } = new Function(built.slice(from, to) + "\nreturn { extractTimeLines };")();
    expect(typeof extractTimeLines).toBe("function");
    const fixture = JSON.parse(fs.readFileSync(path.join(unit, "..", "time-line", "fixtures", "time-lines.json"), "utf8"));
    expect(fixture.cases.length).toBeGreaterThanOrEqual(40);
    for (const c of fixture.cases) {
      const r = extractTimeLines(c.text);
      expect(r.values, c.name).toEqual(c.values);
      expect(r.text, c.name).toBe(c.outText);
    }
  });

  it("the block has no leftover import or export, and bridge.ts has the one import line", () => {
    const block = built.slice(built.indexOf(TIME_LINE_OPEN), built.indexOf(TIME_LINE_CLOSE));
    expect(block).not.toMatch(/^(import|export) /m);
    expect(fs.readFileSync(path.join(unit, "src/bridge.ts"), "utf8").split('import { extractTimeLines } from "@kaigilb/gilbplatformcode-time-line";\n').length).toBe(2);
  });
});
