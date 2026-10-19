// Adopted from Agent.Tester's R1 gap tests (report AgentTester-R1-WebUnits-1afcb32-EngineA-b49b8de.md, 2026-10-19), unchanged but this line.
// Spec: handoff 00.Handoff-2026-10-19-ToAgentCoder-StarterModulesIntoWebsiteLibrary-GilbPlatformCode
// ("tokens through CSS variables"; sites built today look and behave the same) and Rule_Code_accessibility.
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import Comp from "./ContactForm.vue";

const SFC = readFileSync(join(process.cwd(), "src", "ContactForm.vue"), "utf8");
const props = { turnstileSiteKey: "k" };
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

describe("QA R1 ContactForm", () => {
  // Spec: sites behave the same: a prerendered page must hydrate without a mismatch (a mismatch re-renders the block).
  test("the server's HTML hydrates in the browser with no mismatch warning", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(Comp, props) }));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(Comp, props) }).mount(el);
    const said = [...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" "));
    expect(said.filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
  // Spec: tokens through CSS variables: every colour in the unit's style is a --site-block-* variable (a fallback inside var() is allowed).
  test("every colour literal in the style sits inside a var(--site-block-*, ...) fallback", () => {
    const style = (SFC.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*(var\(--site-block-[a-z-]+,\s*)?$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });
  // Spec: Rule_Code_accessibility RuleA11yUnitTest, on the hydrated server HTML (jsdom; contrast is measured in the browser run).
  test("axe on the server HTML: no violations", async () => {
    document.body.innerHTML = "<main>" + (await renderToString(createSSRApp({ render: () => h(Comp, props) }))) + "</main>";
    const r = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(r.violations.map((v: { id: string }) => v.id)).toEqual([]);
  });
});
