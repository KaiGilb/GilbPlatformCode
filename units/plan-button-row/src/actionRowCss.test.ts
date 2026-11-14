// @vitest-environment node
// This unit carries a copy of style-runtime's action-row CSS (it has no dependencies). The copy must not drift.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ACTION_ROW_CSS } from "./actionRowCss";

const sibling = fileURLToPath(new URL("../../style-runtime/src/actionRowCss.ts", import.meta.url));

describe("actionRowCss copy", () => {
  it.skipIf(!existsSync(sibling))("is identical to style-runtime's ACTION_ROW_CSS", async () => {
    const text = readFileSync(sibling, "utf8");
    const mod = await import(/* @vite-ignore */ sibling);
    expect(ACTION_ROW_CSS).toBe(mod.ACTION_ROW_CSS);
    expect(text).toContain("ensureActionRowCss");
  });
  it("is the row CSS", () => {
    expect(ACTION_ROW_CSS).toContain(".gs-actionrow > .gs-actionrow__far{margin-right:auto}");
    expect(ACTION_ROW_CSS).toContain("@container (max-width:380px)");
  });
});
