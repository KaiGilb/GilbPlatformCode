import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as unit from "./index.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { bin: Record<string, string>; peerDependencies: Record<string, string>; dependencies?: unknown };

describe("exports", () => {
  it("exports exactly the documented API", () => {
    expect(Object.keys(unit).sort()).toEqual(["MARKER", "createStudioSaveMiddleware", "exportFonts", "fontsourceSlug", "rewriteFontCss", "writeStyleFiles"]);
  });
  it("names the bin and it exists", () => {
    expect(pkg.bin).toEqual({ "style-app-fonts": "./bin/style-app-fonts.mjs" });
    expect(existsSync(new URL("../bin/style-app-fonts.mjs", import.meta.url))).toBe(true);
  });
  it("has style-runtime as its only peer and no runtime dependencies", () => {
    expect(Object.keys(pkg.peerDependencies)).toEqual(["@kaigilb/gilbplatformcode-style-runtime"]);
    expect(pkg.dependencies).toBeUndefined();
  });
});
