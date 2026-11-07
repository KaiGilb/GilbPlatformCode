// Real-browser check for the Brave steps block (not part of npm test).
// Bundles the component + its CSS with esbuild, renders the Brave case in Playwright Chromium and WebKit,
// and asserts the five steps are real list items with decimal markers, and that .gcc-list li is still flex.
// Usage: PLAYWRIGHT_BROWSERS_PATH=~/Library/Caches/ms-playwright node scripts/check-brave-steps-browser.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const unit = path.resolve(here, "..");
const PW_DIR = process.env.PW_DIR ?? "/Users/kaigilb/Developer/.sonnet-runs/safari-relay-1107/node_modules";
const SHOTS = process.env.SHOTS_DIR ?? "/Users/kaigilb/Developer/.sonnet-runs/brave-steps-1107";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(os.homedir(), "Library/Caches/ms-playwright");
const { chromium, webkit } = createRequire(path.join(PW_DIR, "x.js"))("playwright");

const entry = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { bridgeCommands, createClaudeCodeClient } from "@kaigilb/gilbplatformcode-claude-code-client";
import { ClaudeCodeConnect } from "./src/index";
import "./src/claude-code.css";
const commands = bridgeCommands({ origin: "https://app.example.com", basePath: "/", allowOrigin: "https://app.example.com" });
const client = createClaudeCodeClient({ principal: "https://pelle.example/base", platformOrigin: "https://gilb.com", bridgeUrl: "http://127.0.0.1:47821", getAuthHeaders: async () => ({}) });
createRoot(document.getElementById("root")).render(createElement(ClaudeCodeConnect, { relayBrowser: false, braveBrowser: true, client, commands, onConnected: () => {} }));
`;
const out = await build({
  stdin: { contents: entry, resolveDir: unit, loader: "tsx" },
  bundle: true, write: false, outdir: "out", format: "iife", jsx: "automatic", platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error",
});
const js = out.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = out.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
if (!css) throw new Error("no CSS in bundle");
const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root" style="max-width:720px;padding:16px"></div><script>${js.replace(/<\/script>/g, "<\\/script>")}</script>`;

fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failed++; };

for (const [name, type] of [["chromium", chromium], ["webkit", webkit]]) {
  const br = await type.launch();
  const page = await br.newPage({ viewport: { width: 800, height: 1000 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.setContent(html);
  await page.waitForSelector('[data-testid="claude-code-brave-steps"]');
  const r = await page.evaluate(() => {
    const block = document.querySelector('[data-testid="claude-code-brave-steps"]');
    const ol = block.querySelector("ol");
    const lis = [...ol.querySelectorAll(":scope > li")];
    const others = [...document.querySelectorAll(".gcc-list li")].filter((li) => !block.contains(li));
    return {
      lis: lis.length,
      display: lis.map((li) => getComputedStyle(li).display),
      listStyleType: getComputedStyle(ol).listStyleType,
      otherCount: others.length,
      otherDisplay: [...new Set(others.map((li) => getComputedStyle(li).display))],
      text: document.body.innerText,
    };
  });
  console.log(`--- ${name} ${br.version()}`);
  check(r.lis === 5, `${name}: 5 li in the Brave ol (got ${r.lis})`);
  check(r.display.every((d) => d === "list-item") && r.display.length === 5, `${name}: each li display is list-item (${r.display.join(",")})`);
  check(r.listStyleType === "decimal", `${name}: ol list-style-type is decimal (${r.listStyleType})`);
  check(r.otherCount > 0 && r.otherDisplay.length === 1 && r.otherDisplay[0] === "flex", `${name}: ${r.otherCount} other .gcc-list li still display flex (${r.otherDisplay.join(",")})`);
  check(!r.text.includes("your browser may ask"), `${name}: no generic "may ask" sentence for Brave`);
  check(errs.length === 0, `${name}: no page errors ${errs.join("|")}`);
  const shot = path.join(SHOTS, `brave-steps-${name}.png`);
  await page.locator('[data-testid="claude-code-brave-steps"]').screenshot({ path: shot });
  console.log(`screenshot: ${shot}`);
  await br.close();
}
if (failed) { console.log(`\nFAILED: ${failed} check(s)`); process.exit(1); }
console.log("\nALL PASS");
