// @vitest-environment node
// The committed bridge/*.mjs files are what people run. They must be exactly what a fresh build of src/ gives.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAll } from "../scripts/build-bridge.mjs";

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
});
