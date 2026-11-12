// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the stylesheet", () => {
  it("is imported by the component module itself, so an app never has to", () => {
    const src = readFileSync(new URL("./ModalSheet.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/^import "\.\/modalSheet\.css";$/m);
  });

  it("is exported as ./modalSheet.css, pulls nothing in, and has a bottom sheet under 600px and a card above", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { exports: Record<string, string> };
    expect(pkg.exports["./modalSheet.css"]).toBe("./src/modalSheet.css");
    const css = readFileSync(new URL("./modalSheet.css", import.meta.url), "utf8");
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/@import|url\(/);
    expect(code).toMatch(/@media \(min-width: 600px\)/);
    expect(code).toMatch(/align-items: flex-end/);
    expect(code).toMatch(/var\(--paper, #ffffff\)/);
  });
});
