// Real-browser check for the Windows tab (not part of npm test).
// Bundles the component + its CSS with esbuild, clicks the Windows tab in Playwright Chromium, asserts the early notice is first,
// the PowerShell commands are shown, no "Terminal" appears, and takes screenshots.
// Usage: PLAYWRIGHT_BROWSERS_PATH=~/Library/Caches/ms-playwright node scripts/check-windows-tab-browser.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const unit = path.resolve(here, "..");
const PW_DIR = process.env.PW_DIR ?? "/Users/kaigilb/Developer/.sonnet-runs/safari-relay-1107/node_modules";
const SHOTS = process.env.SHOTS_DIR ?? "/Users/kaigilb/Developer/.sonnet-runs/windows-tab-1107";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(os.homedir(), "Library/Caches/ms-playwright");
const { chromium } = createRequire(path.join(PW_DIR, "x.js"))("playwright");

const entry = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { bridgeCommands, createClaudeCodeClient } from "@kaigilb/gilbplatformcode-claude-code-client";
import { ClaudeCodeConnect } from "./src/index";
import "./src/claude-code.css";
const commands = bridgeCommands({ origin: "https://app.example.com", basePath: "/", allowOrigin: "https://app.example.com" });
const client = createClaudeCodeClient({ principal: "https://pelle.example/base", platformOrigin: "https://gilb.com", bridgeUrl: "http://127.0.0.1:47821", getAuthHeaders: async () => ({}) });
createRoot(document.getElementById("root")).render(createElement(ClaudeCodeConnect, { relayBrowser: false, braveBrowser: false, supportEmail: "support@example.com", client, commands, onConnected: () => {} }));
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

const br = await chromium.launch();
const page = await br.newPage({ viewport: { width: 800, height: 1100 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.setContent(html);
await page.click('[data-testid="claude-code-tab-windows"]');
await page.waitForSelector('[data-testid="claude-code-windows-early"]');
const r = await page.evaluate(() => {
  const panel = document.querySelector('[role="tabpanel"]');
  const code = (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent;
  return {
    firstIsEarly: panel.firstElementChild?.getAttribute("data-testid") === "claude-code-windows-early",
    early: code("claude-code-windows-early"),
    install: code("claude-code-install-command"), start: code("claude-code-command"), codeCmd: code("claude-code-code-command"),
    text: panel.innerText,
    visible: ["claude-code-windows-early", "claude-code-install-command", "claude-code-command", "claude-code-code-command"].every((id) => { const b = document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect(); return b.width > 0 && b.height > 0; }),
  };
});
console.log(`--- chromium ${br.version()}`);
check(r.firstIsEarly, "the early notice is the first thing in the Windows panel");
check(r.early.startsWith("Windows is new.") && r.early.includes("support@example.com") && r.early.endsWith("and we will help."), "early notice text with the support address");
check(r.install.startsWith("curl.exe ") && r.install.includes("; if ($?) { node ") && r.install.includes("--install"), "install command is the PowerShell one");
check(r.start.startsWith("curl.exe ") && !r.start.includes("&&"), "start command is the PowerShell one");
check(r.codeCmd === 'node "$HOME\\.gilb-claude-code-bridge.mjs" --code', "code command is the PowerShell one");
check(!/Terminal/.test(r.text), "no Terminal wording on the Windows tab");
check(r.text.includes("press the Windows key, type PowerShell, and press Enter"), "how to open PowerShell is shown");
check(r.visible, "notice and the three commands are visible");
await page.screenshot({ path: path.join(SHOTS, "windows-tab-chromium.png"), fullPage: true });
await page.click('[data-testid="claude-code-tab-mac"]');
check(!(await page.evaluate(() => document.body.innerText.includes("PowerShell"))), "Mac tab shows no PowerShell");
check(errs.length === 0, `no page errors ${errs.join("|")}`);
console.log(`screenshot: ${path.join(SHOTS, "windows-tab-chromium.png")}`);
await br.close();
if (failed) { console.log(`\nFAILED: ${failed} check(s)`); process.exit(1); }
console.log("\nALL PASS");
