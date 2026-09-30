import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "tokens.css"), "utf8");

test("the sheet names light anchors, dark, and the colour-blind theme", () => {
  expect(css).toContain("--accent:");
  expect(css).toContain("--paper:");
  expect(css).toContain("--ink:");
  expect(css).toContain('[data-theme="dark"]');
  expect(css).toContain('[data-theme="cvd"]');
});
