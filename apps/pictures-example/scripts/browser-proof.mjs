// Headless Chrome proof of dev:fake. Usage: node scripts/browser-proof.mjs <out-dir> [url-base]
// Starts its own Chrome (detached, remote-debugging on a free local port), takes the screenshots, stops that Chrome by its pid.
// Needs dev:fake running (default http://localhost:5301). Talks to localhost only.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
const base = process.argv[3] ?? "http://localhost:5301";
if (!out) throw new Error("usage: browser-proof.mjs <out-dir> [url-base]");
mkdirSync(out, { recursive: true });
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9333 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(process.env.TMPDIR ?? out, "chrome-"));
const chrome = spawn(CHROME, [`--headless=new`, `--disable-gpu`, `--hide-scrollbars`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetWs() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.ready = new Promise((r) => (this.ws.onopen = r));
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) {
        this.pending.get(d.id)(d);
        this.pending.delete(d.id);
      } else if (d.method === "Runtime.exceptionThrown") this.errors.push(`Uncaught ${d.params.exceptionDetails.text} ${d.params.exceptionDetails.exception?.description ?? ""}`);
      else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") this.errors.push(`console.error ${d.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((r) => this.pending.set(id, r));
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  }
}

async function shot(cdp, name, url, width, height, ready) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url });
  for (let i = 0; i < 60; i++) {
    if (await cdp.eval(ready)) break;
    await sleep(250);
  }
  await sleep(400);
  const png = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(out, `${name}.png`), Buffer.from(png.result.data, "base64"));
  const dom = await cdp.eval("document.documentElement.outerHTML");
  writeFileSync(join(out, `${name}.dom.html`), dom);
  return dom;
}

try {
  const cdp = new Cdp(await targetWs());
  await cdp.ready;
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  const loaded = `!!document.querySelector('.hint[data-testid="empty"]') || document.querySelectorAll('.thumb[data-state="shown"]').length >= 3`;
  await shot(cdp, "empty-1440", `${base}/`, 1440, 900, loaded);
  await shot(cdp, "grid3-1440", `${base}/?seed=3`, 1440, 900, loaded);
  const viewerDom = await shot(cdp, "viewer-1440", `${base}/?seed=3&view=2`, 1440, 900, `!!document.querySelector('[role="dialog"] img')`);
  writeFileSync(join(out, "viewer.dialog.txt"), (await cdp.eval(`document.querySelector('[role="dialog"]')?.outerHTML ?? "NO DIALOG"`)) ?? "");
  // A real picture added through the real shrinker: a 3000x2000 JPEG made in the page, handed to the "Choose photos" input.
  await cdp.send("Page.navigate", { url: `${base}/?seed=3` });
  for (let i = 0; i < 60 && !(await cdp.eval(loaded)); i++) await sleep(250);
  const added = await cdp.eval(`(async () => {
    const c = document.createElement("canvas"); c.width = 3000; c.height = 2000;
    const g = c.getContext("2d"); g.fillStyle = "#30638e"; g.fillRect(0, 0, 3000, 2000); g.fillStyle = "#fff"; g.font = "900px sans-serif"; g.fillText("4", 1200, 1300);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "new-photo.jpg", { type: "image/jpeg" }));
    const input = document.querySelector('input[type="file"]:not([capture])');
    input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 100)); if (window.__fakeVault.uploads.length >= 2 && document.querySelector('[data-status="wifi"],[data-status="stored"]')) break; }
    return JSON.stringify({ uploads: window.__fakeVault.uploads, statuses: [...document.querySelectorAll("[data-status]")].map((e) => e.dataset.status), badges: [...document.querySelectorAll(".badge")].map((e) => e.textContent), violations: window.__fakeVault.violations });
  })()`);
  await sleep(500);
  const png4 = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(out, "added-1440.png"), Buffer.from(png4.result.data, "base64"));
  writeFileSync(join(out, "added.txt"), added + "\n");
  console.log("added:", added);
  // 390 px: Chrome will not lay a window out narrower than ~500 px, so the app sits in a 390 px iframe.
  const frame = (name, q, ready) => `<!doctype html><body style="margin:0;background:#888"><iframe name="${name}" src="${base}/?${q}" width="390" height="844" style="border:0;background:#fff"></iframe></body>`;
  for (const [name, q] of [["grid3-390", "seed=3"], ["viewer-390", "seed=3&view=2"]]) {
    const html = frame(name, q);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 500, height: 844, deviceScaleFactor: 1, mobile: false });
    writeFileSync(join(out, `${name}.frame.html`), html);
    await cdp.send("Page.navigate", { url: "file://" + join(out, `${name}.frame.html`) });
    await sleep(5000);
    const png = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(out, `${name}.png`), Buffer.from(png.result.data, "base64"));
  }
  writeFileSync(join(out, "errors.txt"), cdp.errors.join("\n") + "\n");
  console.log(`screenshots in ${out}; uncaught/console.error lines: ${cdp.errors.length}`);
  console.log("dialog in DOM:", /role="dialog"/.test(viewerDom));
} finally {
  chrome.kill();
}
