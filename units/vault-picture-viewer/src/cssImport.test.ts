// @vitest-environment node
// vitest runs with css off, so a render cannot show that the stylesheet is loaded (run 7, F13: the app forgot it and the viewer drew
// off-screen). This test reads the module's text instead.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const text = readFileSync(new URL("./useVaultPictureViewer.tsx", import.meta.url), "utf8");

describe("the viewer's stylesheet", () => {
  it("is imported by the module itself, with the specifier picture-viewer exports", () => {
    expect(text).toMatch(/^import\s+"@kaigilb\/gilbplatformcode-picture-viewer\/pictureViewer\.css";$/m);
  });
  it("is a specifier the picture-viewer package really exports", () => {
    const pkg = JSON.parse(readFileSync(new URL("../node_modules/@kaigilb/gilbplatformcode-picture-viewer/package.json", import.meta.url), "utf8"));
    expect(Object.keys(pkg.exports)).toContain("./pictureViewer.css");
  });
});
