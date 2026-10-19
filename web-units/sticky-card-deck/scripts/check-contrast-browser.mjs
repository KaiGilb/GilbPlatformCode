#!/usr/bin/env node
/**
 * Real-browser colour-contrast check of the step rail (QA R1 D1): serves the unit through Vite, scrolls a page of
 * cards at 1280 px wide to several positions, waits out the 300 ms colour transition and runs axe colour-contrast,
 * on a white and on a dark page. Not part of `npm test` (the package holds no browser).
 * Run from a folder where `playwright`, `vite`, `@vitejs/plugin-vue`, `vue` and `axe-core` are installed:
 *   node <unit>/scripts/check-contrast-browser.mjs [chromium|firefox|webkit]
 * Set PLAYWRIGHT_BROWSERS_PATH to the shared browser folder. Exit 0 PASS, 1 FAIL.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const req = createRequire(join(process.cwd(), "x.js"));
const { createServer } = req("vite"); const vue = req("@vitejs/plugin-vue"); const pw = req("playwright");
const axeSrc = readFileSync(req.resolve("axe-core/axe.min.js"), "utf8");
const unit = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const root = join(process.cwd(), ".d1-harness"); mkdirSync(root, { recursive: true });
writeFileSync(join(root, "index.html"), `<!doctype html><html lang="en"><body style="margin:0"><div id="app"></div><script type="module" src="/main.ts"></script></body></html>`);
writeFileSync(join(root, "main.ts"), `import { createApp, h } from "vue"; import { StickyCardDeck } from "@u/index";
const steps = [1,2,3,4].map((n) => ({ title: "Step " + n, body: "Body text of step " + n, tag: "Tag " + n }));
const dark = location.search.includes("dark");
if (dark) document.body.style.cssText = "background:#000;color:#edeff5;--site-block-bg:#000;--site-block-fg:#edeff5;--site-block-muted:#98a2b8;--site-block-accent:#e8a34d";
else document.body.style.background = "#fff";
createApp({ render: () => h("main", { style: "padding:6rem 6rem 40rem" }, [h("div", { style: "height:40vh" }), h(StickyCardDeck, { steps })]) }).mount("#app");`);
const srv = await createServer({ root, configFile: false, logLevel: "error", plugins: [vue.default?.() ?? vue()], resolve: { alias: { "@u": unit } }, server: { port: 5392, fs: { strict: false } } });
await srv.listen();
const name = process.argv[2] ?? "chromium"; const b = await pw[name].launch(); let fail = 0;
for (const mode of ["light", "dark"]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(`http://localhost:5392/?${mode}`); await p.waitForSelector(".sd-tick");
  for (const y of [0, 700, 1500, 2500]) {
    await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(700);
    const r = await p.evaluate(async (src) => { (0, eval)(src); const x = await window.axe.run(document.body, { runOnly: ["color-contrast"], elementRef: false }); return x.violations.flatMap((v) => v.nodes.filter((n) => n.html.includes("sd-tick")).map((n) => n.any[0]?.message)); }, axeSrc);
    console.log(name, mode, "scrollY", y, r.length ? "FAIL " + r[0] : "ok"); if (r.length) fail = 1;
  }
  await p.close();
}
await b.close(); await srv.close(); process.exit(fail);
