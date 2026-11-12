// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the stylesheet", () => {
  it("is imported by the component module itself, so an app never has to", () => {
    const src = readFileSync(new URL("./VaultSwitcher.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/^import "\.\/vaultSwitcher\.css";$/m);
  });

  it("is exported as ./vaultSwitcher.css, pulls nothing in, and uses var(--x, fallback) tokens", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { exports: Record<string, string> };
    expect(pkg.exports["./vaultSwitcher.css"]).toBe("./src/vaultSwitcher.css");
    const css = readFileSync(new URL("./vaultSwitcher.css", import.meta.url), "utf8");
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/@import|url\(/);
    expect(code).toMatch(/var\(--accent, #1a56db\)/);
    expect(code).toMatch(/var\(--lines, #1a1a1a\)/);
  });
});
