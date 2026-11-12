// Headless Chrome proof of dev:fake. Usage: node scripts/browser-proof.mjs <out-dir> [url-base]
// Starts its own Chrome (throwaway profile inside <out-dir>, removed at the end), takes the screenshots, stops that Chrome.
// Needs dev:fake running (default http://localhost:5301). Talks to localhost only. Chrome and the protocol client are the browser-proof unit.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startBrowser } from "@kaigilb/gilbplatformcode-browser-proof";

const out = process.argv[2] ? resolve(process.argv[2]) : "";
const base = process.argv[3] ?? "http://localhost:5301";
if (!out) throw new Error("usage: browser-proof.mjs <out-dir> [url-base]");
mkdirSync(out, { recursive: true });

const profileDir = join(out, ".chrome-profile");
const { page, close } = await startBrowser({ profileDir, domains: ["Runtime", "Page"] });

async function shot(name, url, width, height, ready) {
  await page.setViewport({ width, height });
  await page.goto(url);
  await page.waitFor(ready, 15000).catch(() => undefined); // the old loop gave up quietly after 15 s and shot what was there
  await page.sleep(400);
  await page.screenshot(join(out, `${name}.png`));
  const dom = await page.eval("document.documentElement.outerHTML");
  writeFileSync(join(out, `${name}.dom.html`), dom);
  return dom;
}

try {
  const loaded = `!!document.querySelector('.hint[data-testid="empty"]') || document.querySelectorAll('.thumb[data-state="shown"]').length >= 3`;
  await shot("empty-1440", `${base}/`, 1440, 900, loaded);
  await shot("grid3-1440", `${base}/?seed=3`, 1440, 900, loaded);
  const viewerDom = await shot("viewer-1440", `${base}/?seed=3&view=2`, 1440, 900, `!!document.querySelector('[role="dialog"] img')`);
  writeFileSync(join(out, "viewer.dialog.txt"), (await page.eval(`document.querySelector('[role="dialog"]')?.outerHTML ?? "NO DIALOG"`)) ?? "");
  // A real picture added through the real shrinker: a 3000x2000 JPEG made in the page, handed to the "Choose photos" input.
  await page.goto(`${base}/?seed=3`);
  await page.waitFor(loaded, 15000).catch(() => undefined);
  const added = await page.eval(`(async () => {
    const c = document.createElement("canvas"); c.width = 3000; c.height = 2000;
    const g = c.getContext("2d"); g.fillStyle = "#30638e"; g.fillRect(0, 0, 3000, 2000); g.fillStyle = "#fff"; g.font = "900px sans-serif"; g.fillText("4", 1200, 1300);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "new-photo.jpg", { type: "image/jpeg" }));
    const input = document.querySelector('input[type="file"]:not([capture])');
    input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 100)); if (window.__fake.calls.of("PUT /lws/vault/:vault/files").length >= 2 && document.querySelector('[data-status="wifi"],[data-status="stored"]')) break; }
    return JSON.stringify({ uploads: window.__fake.calls.of("PUT /lws/vault/:vault/files").map((c) => c.query.name[0]), statuses: [...document.querySelectorAll("[data-status]")].map((e) => e.dataset.status), badges: [...document.querySelectorAll(".badge")].map((e) => e.textContent), violations: window.__fake.violations });
  })()`);
  await page.sleep(500);
  await page.screenshot(join(out, "added-1440.png"));
  writeFileSync(join(out, "added.txt"), added + "\n");
  console.log("added:", added);
  // 390 px: Chrome will not lay a window out narrower than ~500 px, so the app sits in a 390 px iframe.
  const frame = (name, q) => `<!doctype html><body style="margin:0;background:#888"><iframe name="${name}" src="${base}/?${q}" width="390" height="844" style="border:0;background:#fff"></iframe></body>`;
  for (const [name, q] of [["grid3-390", "seed=3"], ["viewer-390", "seed=3&view=2"]]) {
    await page.setViewport({ width: 500, height: 844 });
    writeFileSync(join(out, `${name}.frame.html`), frame(name, q));
    await page.goto("file://" + join(out, `${name}.frame.html`));
    await page.sleep(5000);
    await page.screenshot(join(out, `${name}.png`));
  }
  const errors = page.consoleErrors();
  writeFileSync(join(out, "errors.txt"), errors.join("\n") + "\n");
  console.log(`screenshots in ${out}; uncaught/console.error lines: ${errors.length}`);
  console.log("dialog in DOM:", /role="dialog"/.test(viewerDom));
} finally {
  await close();
  rmSync(profileDir, { recursive: true, force: true });
}
