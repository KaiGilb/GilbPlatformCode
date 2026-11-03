// @vitest-environment node
// The committed connector/gilb-connector.mjs is what a person runs. It must be exactly a fresh build of src/connector.ts.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAll } from "../scripts/build-connector.mjs";
import { CONNECTOR_VERSION } from "../connector/gilb-connector.mjs";

const unit = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("built == committed", () => {
  it("connector/gilb-connector.mjs equals a fresh build (run npm run build:connector)", () => {
    const fresh = buildAll();
    expect(Object.keys(fresh)).toEqual(["connector/gilb-connector.mjs"]);
    for (const [file, text] of Object.entries(fresh)) {
      expect(fs.readFileSync(path.join(unit, file), "utf8") === text, `${file} differs from a fresh build`).toBe(true);
    }
  });

  it("CONNECTOR_VERSION is the package version", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(unit, "package.json"), "utf8"));
    expect(CONNECTOR_VERSION).toBe(pkg.version);
  });
});
