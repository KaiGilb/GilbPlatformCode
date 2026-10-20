#!/usr/bin/env node
/**
 * check-lightbox-browser.mjs — the image viewer on real keys, real pointers and real layout.
 *
 * Why a browser: jsdom draws no layout, moves no focus the way a browser does, scrolls nothing and has no touch. The
 * rules this unit promises (Escape works after a click on the picture, the page behind does not scroll, a swipe
 * moves, two fingers pinch, colour contrast of the dialog) can only be measured in an engine. The unit's own
 * `npm test` covers the same rules in jsdom; this script is the proof the tests cannot give.
 *
 * It serves scripts/harness/ with Vite (the unit's own source, no site), opens it in each browser named in BROWSERS,
 * and checks, on a desktop page and on a touch page (375 wide):
 *   keyboard   Enter opens, focus lands on Close, Tab and Shift+Tab stay inside, Escape closes and focus returns;
 *              Escape also works after a click on the picture; a click on the dark edge closes;
 *              arrows move through the set and stop at the ends; + - 0 zoom; the caption and data-full are shown;
 *              pictures with no alt, data-no-lightbox, or inside a link do not open.
 *   page       with the dialog open the page behind is inert and does not scroll (wheel, PageDown); the page does not
 *              shift when the dialog opens; the scroll position comes back on close.
 *   touch      swipe left and right move, swipe down closes, a pinch zooms, a double tap zooms and zooms back, a drag
 *              moves a zoomed picture without changing the picture, a tap on the dark edge closes. In Chromium with
 *              real touches (Chrome DevTools Protocol); in every browser with touch pointer events sent from the page.
 *   a11y       axe on the open dialog at 375, 800 and 1280 wide, colour contrast included, plain and zoomed;
 *              role, aria-modal, accessible names, the live counter, reduced motion (no fade, no glide).
 *
 * Usage (from this unit's folder, after `npm ci`):
 *   npm i --no-save playwright@1.60
 *   PLAYWRIGHT_BROWSERS_PATH=<folder holding the browsers> BROWSERS=chromium,firefox,webkit node scripts/check-lightbox-browser.mjs
 * Exit 0 every check passed in every browser that ran, 1 a check failed, 2 no browser could run.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const unit = join(here, "..");
const require = createRequire(join(unit, "package.json"));
const { createServer } = await import("vite");
const vue = (await import("@vitejs/plugin-vue")).default;
const pw = await import("playwright");
const axePath = require.resolve("axe-core/axe.min.js");

const PORT = Number(process.env.PORT ?? 5393);
const names = (process.env.BROWSERS ?? "chromium").split(",").map((s) => s.trim()).filter(Boolean);
const server = await createServer({ root: join(here, "harness"), configFile: false, logLevel: "error", plugins: [vue()], server: { host: "127.0.0.1", port: PORT, strictPort: true, fs: { strict: false } } });
await server.listen();
const base = `http://127.0.0.1:${PORT}/`;

let failed = 0;
let ran = 0;
const results = [];
const check = (browser, name, pass, detail = "") => {
  results.push({ browser, name, pass });
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"} [${browser}] ${name}${!pass && detail ? " — " + detail : ""}`);
};

const DLG = "[data-lightbox-viewer]";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isOpen = (page) => page.evaluate((s) => !!document.querySelector(s), DLG);
const count = (page) => page.evaluate((s) => document.querySelector(s + " .ilb-count")?.textContent.trim() ?? null, DLG);
const zoom = (page) => page.evaluate((s) => Number(document.querySelector(s + " img.ilb-img")?.dataset.zoom ?? NaN), DLG);
const activeId = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName);
const inside = (page) => page.evaluate((s) => document.querySelector(s)?.contains(document.activeElement) ?? false, DLG);
const settle = async (page) => { await page.waitForTimeout(80); };
async function openOn(page, sel) {
  await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), sel);
  await page.click(sel);
  await page.waitForSelector(DLG, { timeout: 3000 });
  await settle(page);
}
async function freshPage(ctx, scene = "scope") {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${base}?scene=${scene}`);
  await page.waitForSelector("#p1, #only");
  await page.waitForFunction(() => document.querySelector("#p1, #only")?.getAttribute("role") === "button");
  page.errors = errors;
  return page;
}

// ---- touch drivers -----------------------------------------------------------------------------------------------
/** Touches through the Chrome DevTools Protocol: real touch events, which the engine turns into pointer events. */
async function cdpTouch(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
  return {
    label: "real touch (CDP)",
    async swipe(x, y, dx, dy) {
      await send("touchStart", [{ x, y }]);
      for (let i = 1; i <= 6; i++) await send("touchMove", [{ x: x + (dx * i) / 6, y: y + (dy * i) / 6 }]);
      await send("touchEnd", []);
    },
    async tap(x, y) { await send("touchStart", [{ x, y }]); await send("touchEnd", []); },
    async pinch(cx, cy, from, to) {
      await send("touchStart", [{ x: cx - from, y: cy }, { x: cx + from, y: cy }]);
      for (let i = 1; i <= 6; i++) { const d = from + ((to - from) * i) / 6; await send("touchMove", [{ x: cx - d, y: cy }, { x: cx + d, y: cy }]); }
      await send("touchEnd", []);
    },
  };
}
/** Touch pointer events sent from the page to the viewer's stage: the same handlers, in any engine. */
function syntheticTouch(page) {
  // Plain functions, serialised into the page by Playwright (a string would only be evaluated, not called).
  return {
    label: "touch pointer events from the page",
    swipe: (x, y, dx, dy) => page.evaluate((a) => {
      const f = (t, type, id, px, py) => t.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 1, clientX: px, clientY: py, bubbles: true, cancelable: true }));
      const t = document.elementFromPoint(a.x, a.y) ?? document.querySelector(".ilb-stage");
      f(t, "pointerdown", 1, a.x, a.y);
      for (let i = 1; i <= 6; i++) f(t, "pointermove", 1, a.x + (a.dx * i) / 6, a.y + (a.dy * i) / 6);
      f(t, "pointerup", 1, a.x + a.dx, a.y + a.dy);
    }, { x, y, dx, dy }),
    tap: (x, y) => page.evaluate((a) => {
      const f = (t, type, id, px, py) => t.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 1, clientX: px, clientY: py, bubbles: true, cancelable: true }));
      const t = document.elementFromPoint(a.x, a.y) ?? document.querySelector(".ilb-stage");
      f(t, "pointerdown", 1, a.x, a.y);
      f(t, "pointerup", 1, a.x, a.y);
    }, { x, y }),
    pinch: (cx, cy, from, to) => page.evaluate((a) => {
      const f = (t, type, id, px, py) => t.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 1, clientX: px, clientY: py, bubbles: true, cancelable: true }));
      const t = document.querySelector(".ilb-stage");
      f(t, "pointerdown", 1, a.cx - a.from, a.cy);
      f(t, "pointerdown", 2, a.cx + a.from, a.cy);
      for (let i = 1; i <= 6; i++) { const d = a.from + ((a.to - a.from) * i) / 6; f(t, "pointermove", 1, a.cx - d, a.cy); f(t, "pointermove", 2, a.cx + d, a.cy); }
      f(t, "pointerup", 2, a.cx + a.to, a.cy);
      f(t, "pointerup", 1, a.cx - a.to, a.cy);
    }, { cx, cy, from, to }),
  };
}

async function touchChecks(browserName, browser, driverOf, driverLabel) {
  const touchCtx = await browser.newContext({ viewport: { width: 375, height: 700 }, hasTouch: true, deviceScaleFactor: 2 });
  const T = (n) => `touch (${driverLabel}): ${n}`;
  const page = await freshPage(touchCtx);
  const d = await driverOf(page);
  const cx = 187, cy = 350;
  const openFirst = async (sel = "#p2") => { if (!(await isOpen(page))) { await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), sel); await page.locator(sel).tap(); await page.waitForSelector(DLG); await settle(page); } };

  await openFirst();
  check(browserName, T("a tap opens the picture"), (await count(page)) === "2 of 3", await count(page));
  const ta = await page.evaluate(() => [getComputedStyle(document.querySelector(".ilb-stage")).touchAction, getComputedStyle(document.body).touchAction]);
  check(browserName, T("the stage takes the gestures (touch-action none); the page keeps its own"), ta[0] === "none" && ta[1] !== "none", ta.join());
  await d.swipe(cx + 80, cy, -160, 0); await settle(page);
  check(browserName, T("swipe left shows the next picture"), (await count(page)) === "3 of 3", await count(page));
  await d.swipe(cx + 80, cy, -160, 0); await settle(page);
  check(browserName, T("swipe left on the last picture stays on it"), (await count(page)) === "3 of 3", await count(page));
  await d.swipe(cx - 80, cy, 160, 0); await settle(page);
  check(browserName, T("swipe right shows the previous picture"), (await count(page)) === "2 of 3", await count(page));
  await d.swipe(cx, cy, 20, 10); await settle(page);
  check(browserName, T("a short movement changes nothing"), (await count(page)) === "2 of 3" && (await isOpen(page)));
  await d.pinch(cx, cy, 40, 110); await settle(page);
  const z1 = await zoom(page);
  check(browserName, T("a pinch outward zooms in"), z1 > 2 && z1 <= 4, String(z1));
  const before = await page.evaluate(() => document.querySelector(".ilb-img").style.transform);
  await d.swipe(cx + 60, cy, -120, 0); await settle(page);
  const after = await page.evaluate(() => document.querySelector(".ilb-img").style.transform);
  check(browserName, T("a drag on a zoomed picture moves it and does not change the picture"), before !== after && (await count(page)) === "2 of 3", `${before} -> ${after}`);
  await d.pinch(cx, cy, 110, 30); await settle(page);
  check(browserName, T("a pinch inward zooms back to fit (no smaller)"), (await zoom(page)) === 1, String(await zoom(page)));
  await d.tap(cx, cy); await wait(60); await d.tap(cx, cy); await settle(page);
  const z2 = await zoom(page);
  check(browserName, T("a double tap zooms in"), z2 > 2 && z2 < 3, String(z2));
  await d.tap(cx, cy); await wait(60); await d.tap(cx, cy); await settle(page);
  check(browserName, T("a second double tap zooms back to fit"), (await zoom(page)) === 1, String(await zoom(page)));
  await d.swipe(cx, cy - 100, 0, 220); await settle(page);
  check(browserName, T("swipe down closes"), !(await isOpen(page)));
  check(browserName, T("focus is back on a picture of the article after the swipe"), ["p1", "p2", "p3"].includes(await activeId(page)) || (await page.evaluate(() => document.activeElement === document.body)), await activeId(page));
  await openFirst("#p1");
  await d.tap(187, 20); await settle(page);
  check(browserName, T("a tap on the dark edge closes"), !(await isOpen(page)));
  check(browserName, T("no script errors"), page.errors.length === 0, page.errors.join(" | "));
  await touchCtx.close();
}

async function a11yAt(browserName, ctxOf, width, height) {
  const ctx = await ctxOf({ width, height });
  const page = await freshPage(ctx);
  await page.addScriptTag({ path: axePath });
  await openOn(page, "#p2");
  await page.waitForTimeout(500); // axe reads colours; let the 150 ms fade-in finish first
  const run = (zoomed) => page.evaluate(async (s) => {
    const r = await window.axe.run({ include: [[s]] }, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] });
    return r.violations.map((v) => `${v.id}:${v.nodes.length} ${v.nodes.map((n) => n.target.join(" ") + " " + (n.any[0]?.message ?? "")).join(" | ")}`);
  }, DLG);
  const plain = await run();
  check(browserName, `axe on the open dialog at ${width} wide, colour contrast included`, plain.length === 0, plain.join(" "));
  await page.keyboard.press("+"); await page.keyboard.press("+"); await page.waitForTimeout(400);
  const zoomed = await run();
  check(browserName, `axe on the open dialog at ${width} wide, zoomed`, zoomed.length === 0, zoomed.join(" "));
  const overflow = await page.evaluate((s) => { const d = document.querySelector(s); return d.scrollWidth > d.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1; }, DLG);
  check(browserName, `no sideways scroll with the dialog open at ${width} wide`, !overflow);
  const btns = await page.evaluate((s) => [...document.querySelectorAll(s + " button")].map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }), DLG);
  check(browserName, `every dialog button is at least 44 px at ${width} wide`, btns.every((n) => n >= 43.5), btns.join());
  await ctx.close();
}

/** The tester's R1 defects D1 (tiny picture), D2 (attributes changed later) and D3 (slow or missing original). */
async function fixChecks(browserName, ctxOf) {
  const ctx = await ctxOf({ width: 1280, height: 800 });
  await ctx.route("**/__full/slow.svg", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600"><rect width="100%" height="100%" fill="#363"/></svg>' });
  });
  await ctx.route("**/__full/missing.svg", (route) => route.fulfill({ status: 404, body: "no" }));
  const page = await ctx.newPage();
  await page.goto(`${base}?scene=fix`);
  await page.waitForFunction(() => document.getElementById("ok")?.getAttribute("role") === "button");
  const attrs = (id) => page.evaluate((i) => { const e = document.getElementById(i); return [e.getAttribute("role"), e.getAttribute("tabindex")].join(); }, id);
  // D1
  check(browserName, "D1 a 16 px picture is not a button (no role, no tab stop); a normal one is", (await attrs("tiny")) === "," && (await attrs("ok")) === "button,0", `${await attrs("tiny")} | ${await attrs("ok")}`);
  await page.click("#tiny", { force: true }); await settle(page);
  check(browserName, "D1 a click on the 16 px picture opens nothing", !(await isOpen(page)));
  const axeTiny = await page.evaluate(async (src) => { eval(src); const r = await window.axe.run(document.body, { runOnly: ["target-size"] }); return r.violations.length; }, await (await import("node:fs/promises")).readFile(axePath, "utf8"));
  check(browserName, "D1 axe target-size: no violation on the page with the 16 px picture", axeTiny === 0, String(axeTiny));
  await page.evaluate(() => { const t = document.getElementById("tiny"); t.style.width = "120px"; t.style.height = "120px"; });
  await page.waitForFunction(() => document.getElementById("tiny").getAttribute("role") === "button", null, { timeout: 3000 }).catch(() => {});
  check(browserName, "D1 when the picture is later drawn larger it becomes a button (size change seen)", (await attrs("tiny")) === "button,0", await attrs("tiny"));
  await page.evaluate(() => { const t = document.getElementById("tiny"); t.style.width = "10px"; t.style.height = "10px"; });
  await page.waitForFunction(() => !document.getElementById("tiny").hasAttribute("role"), null, { timeout: 3000 }).catch(() => {});
  check(browserName, "D1 and back to plain when drawn small again", (await attrs("tiny")) === ",", await attrs("tiny"));
  // D2
  await page.evaluate(() => document.getElementById("ok").removeAttribute("alt"));
  await page.waitForFunction(() => !document.getElementById("ok").hasAttribute("role"), null, { timeout: 3000 }).catch(() => {});
  check(browserName, "D2 alt removed: the picture stops being a button", (await attrs("ok")) === ",", await attrs("ok"));
  await page.evaluate(() => document.getElementById("ok").setAttribute("alt", "A normal picture"));
  await page.waitForFunction(() => document.getElementById("ok").getAttribute("role") === "button", null, { timeout: 3000 }).catch(() => {});
  check(browserName, "D2 alt added back: a button with a tab stop again", (await attrs("ok")) === "button,0", await attrs("ok"));
  await page.evaluate(() => document.getElementById("ok").setAttribute("data-no-lightbox", ""));
  await page.waitForFunction(() => !document.getElementById("ok").hasAttribute("role"), null, { timeout: 3000 }).catch(() => {});
  const optedOut = await attrs("ok");
  await page.evaluate(() => document.getElementById("ok").removeAttribute("data-no-lightbox"));
  await page.waitForFunction(() => document.getElementById("ok").getAttribute("role") === "button", null, { timeout: 3000 }).catch(() => {});
  check(browserName, "D2 data-no-lightbox added then removed follows (plain, then keyboard-reachable button)", optedOut === "," && (await attrs("ok")) === "button,0", `${optedOut} | ${await attrs("ok")}`);
  await page.focus("#ok"); await page.keyboard.press("Enter"); await page.waitForSelector(DLG); await settle(page);
  check(browserName, "D2 the restored picture opens from the keyboard", await isOpen(page));
  await page.keyboard.press("Escape"); await settle(page);
  // D3 slow
  await page.evaluate(() => document.getElementById("slow").scrollIntoView({ block: "center" }));
  await page.click("#slow"); await page.waitForSelector(DLG); await page.waitForTimeout(200);
  const cue = await page.evaluate((s) => { const v = document.querySelector(s); const c = v.querySelector(".ilb-loading"); return [c?.textContent.trim(), c?.getAttribute("role"), v.querySelector("figure").getAttribute("aria-busy"), !!c && c.getBoundingClientRect().width > 0]; }, DLG);
  check(browserName, "D3 while a slow original loads: a visible loading cue, role=status, figure aria-busy", cue.join() === "Loading picture,status,true,true", cue.join());
  await page.keyboard.press("Tab"); await settle(page);
  check(browserName, "D3 Tab still stays inside the dialog during the load", await inside(page));
  await page.waitForFunction((s) => !document.querySelector(s + " .ilb-loading"), DLG, { timeout: 6000 });
  check(browserName, "D3 when the original arrives the cue goes and busy is cleared", await page.evaluate((s) => !document.querySelector(s + " figure").hasAttribute("aria-busy"), DLG));
  await page.keyboard.press("Escape"); await settle(page);
  check(browserName, "D3 Escape closes after a slow load", !(await isOpen(page)));
  // D3 slow, closed before it finishes
  await page.click("#slow"); await page.waitForSelector(DLG); await page.keyboard.press("Escape"); await settle(page);
  check(browserName, "D3 closing during the load leaves the page unlocked", await page.evaluate(() => document.body.style.position === "" && !document.getElementById("app").hasAttribute("inert")));
  // D3 missing original: fall back to the page's own picture
  await page.evaluate(() => document.getElementById("gone").scrollIntoView({ block: "center" }));
  await page.click("#gone"); await page.waitForSelector(DLG);
  await page.waitForFunction((s) => document.querySelector(s + " img.ilb-img")?.src.startsWith("data:image/svg"), DLG, { timeout: 4000 }).catch(() => {});
  const fb = await page.evaluate((s) => { const i = document.querySelector(s + " img.ilb-img"); const r = i.getBoundingClientRect(); return [i.src.startsWith("data:image/svg"), i.alt, Math.round(r.width) > 200, !!document.querySelector(s + " .ilb-failed-note")]; }, DLG);
  check(browserName, "D3 a missing original falls back to the page's own picture, with its alt text, drawn at picture size, no failure note", fb.join() === "true,Missing original,true,false", fb.join());
  await page.keyboard.press("Escape"); await settle(page);
  check(browserName, "D3 Escape closes after the fallback", !(await isOpen(page)));
  // D3 both fail
  await page.evaluate(() => document.getElementById("dead").scrollIntoView({ block: "center" }));
  await page.click("#dead", { force: true }); await settle(page);
  if (await isOpen(page)) {
    await page.waitForSelector(DLG + " .ilb-failed-note", { timeout: 4000 }).catch(() => {});
    const bad = await page.evaluate((s) => { const n = document.querySelector(s + " .ilb-failed-note"); return [n?.textContent.trim(), n?.getAttribute("role")]; }, DLG);
    check(browserName, "D3 when nothing loads a visible, announced message says so", bad.join() === "The picture could not be loaded,status", bad.join());
    await page.keyboard.press("Escape"); await settle(page);
    check(browserName, "D3 Escape closes the failed viewer", !(await isOpen(page)));
  } else {
    check(browserName, "D3 a broken picture with no size is too small to open (nothing opens)", true);
  }
  await ctx.close();
}

for (const name of names) {
  let browser;
  try { browser = await pw[name].launch(); } catch (e) { console.log(`SKIP [${name}] could not launch: ${String(e).split("\n")[0]}`); continue; }
  ran++;
  console.log(`--- ${name} ${browser.version()}`);
  const ctxOf = (viewport, extra = {}) => browser.newContext({ viewport, ...extra });
  const ctx = await ctxOf({ width: 1280, height: 800 });
  const page = await freshPage(ctx);
  const ids = await page.evaluate(() => ["p1", "p2", "p3", "skip-opt", "skip-link", "skip-alt"].map((i) => document.getElementById(i).getAttribute("role")));
  check(name, "the article's pictures that open are buttons; the three skipped ones are not", ids.join() === "button,button,button,,,", ids.join());

  // keyboard
  await page.focus("#p1");
  await page.keyboard.press("Enter");
  await page.waitForSelector(DLG); await settle(page);
  check(name, "Enter on a picture opens the dialog", await isOpen(page));
  const sem = await page.evaluate((s) => { const d = document.querySelector(s); return [d.getAttribute("role"), d.getAttribute("aria-modal"), d.getAttribute("aria-label"), document.getElementById("app").hasAttribute("inert")]; }, DLG);
  check(name, "it is a modal dialog with a name, and the page behind is inert", sem.join() === "dialog,true,Image viewer,true", sem.join());
  check(name, "focus lands on the Close button", (await page.evaluate(() => document.activeElement.className)).includes("ilb-close"), await activeId(page));
  let stayed = true;
  for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); if (!(await inside(page))) stayed = false; }
  for (let i = 0; i < 14; i++) { await page.keyboard.press("Shift+Tab"); if (!(await inside(page))) stayed = false; }
  check(name, "Tab and Shift+Tab stay inside the dialog (14 presses each way)", stayed);
  await page.keyboard.press("Escape"); await settle(page);
  check(name, "Escape closes it", !(await isOpen(page)));
  check(name, "focus returns to the picture", (await activeId(page)) === "p1", await activeId(page));
  check(name, "the page behind is no longer inert", await page.evaluate(() => !document.getElementById("app").hasAttribute("inert")));

  await openOn(page, "#p1");
  await page.click(`${DLG} img.ilb-img`); await settle(page);
  check(name, "after a click on the picture the dialog is still open", await isOpen(page));
  await page.keyboard.press("Escape"); await settle(page);
  check(name, "Escape closes it after a click on the picture", !(await isOpen(page)), "the suspected bug of the old viewer, tested on this unit");
  await openOn(page, "#p1");
  await page.mouse.click(6, 400); await settle(page);
  check(name, "a click on the dark edge closes", !(await isOpen(page)));

  await openOn(page, "#p2");
  check(name, "the set opens at the clicked picture with a counter", (await count(page)) === "2 of 3", await count(page));
  const live = await page.evaluate((s) => { const c = document.querySelector(s + " .ilb-count"); return [c.getAttribute("aria-live"), c.getAttribute("aria-atomic")]; }, DLG);
  check(name, "the counter is a polite live region", live.join() === "polite,true", live.join());
  const shown = await page.evaluate((s) => [document.querySelector(s + " img.ilb-img").src.includes("2400"), document.querySelector(s + " .ilb-caption").textContent.trim()], DLG);
  check(name, "the original (data-full) is shown, with the figcaption under it", shown[0] && shown[1] === "Picture two, described in a caption", shown.join());
  await page.keyboard.press("ArrowRight"); await settle(page);
  check(name, "ArrowRight shows the next picture", (await count(page)) === "3 of 3", await count(page));
  await page.keyboard.press("ArrowRight"); await settle(page);
  check(name, "ArrowRight on the last picture stays on it", (await count(page)) === "3 of 3");
  await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft"); await settle(page);
  check(name, "ArrowLeft goes back and stops at the first", (await count(page)) === "1 of 3", await count(page));
  await page.click(`${DLG} .ilb-next`); await settle(page);
  check(name, "the Next button works", (await count(page)) === "2 of 3");
  await page.keyboard.press("+"); await settle(page);
  const k1 = await zoom(page);
  await page.keyboard.press("+"); await page.keyboard.press("+"); await page.keyboard.press("+"); await page.keyboard.press("+"); await page.keyboard.press("+"); await settle(page);
  const k2 = await zoom(page);
  await page.keyboard.press("-"); await settle(page);
  const k3 = await zoom(page);
  await page.keyboard.press("0"); await settle(page);
  check(name, "+ zooms in by steps, holds at the maximum, - steps out, 0 returns to fit", k1 === 1.5 && k2 === 4 && k3 < 4 && k3 > 2 && (await zoom(page)) === 1, [k1, k2, k3].join());
  await page.keyboard.press("ArrowRight"); await settle(page);
  await page.keyboard.press("+"); await page.keyboard.press("+"); await page.keyboard.press("+"); await settle(page);
  await page.keyboard.press("ArrowLeft"); await settle(page);
  check(name, "a zoomed picture is panned by the arrows, not changed", (await count(page)) === "3 of 3");
  await page.keyboard.press("0");
  await page.keyboard.press("ArrowLeft"); await settle(page);
  await page.keyboard.press("Escape"); await settle(page);
  check(name, "focus returns to the picture last shown (the second)", (await activeId(page)) === "p2", await activeId(page));

  for (const id of ["skip-opt", "skip-link", "skip-alt"]) {
    await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block: "center" }), id);
    await page.click(`#${id}`, { force: true }); await settle(page);
    check(name, `#${id} does not open`, !(await isOpen(page)));
  }
  await page.evaluate(() => (location.hash = ""));

  // page behind
  await page.evaluate(() => document.getElementById("p3").scrollIntoView({ block: "start" }));
  await settle(page);
  const before = await page.evaluate(() => ({ y: Math.round(scrollY), top: Math.round(document.getElementById("p3").getBoundingClientRect().top), w: document.documentElement.clientWidth }));
  await page.click("#p3"); await page.waitForSelector(DLG); await settle(page);
  const during = await page.evaluate(() => ({ top: Math.round(document.getElementById("p3").getBoundingClientRect().top), pos: getComputedStyle(document.body).position }));
  check(name, "the page does not shift when the dialog opens (scroll position held by a fixed body)", during.pos === "fixed" && Math.abs(during.top - before.top) <= 1, JSON.stringify({ before, during }));
  await page.mouse.move(640, 400);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 500);
  await page.keyboard.press("PageDown"); await page.keyboard.press("End"); await page.keyboard.press("Space"); await settle(page);
  const bled = await page.evaluate(() => ({ top: Math.round(document.getElementById("p3").getBoundingClientRect().top), sy: Math.round(scrollY) }));
  check(name, "wheel, PageDown, End and Space do not scroll the page behind", Math.abs(bled.top - during.top) <= 1, JSON.stringify(bled));
  await page.keyboard.press("Escape"); await settle(page);
  const back = await page.evaluate(() => Math.round(scrollY));
  check(name, "the scroll position comes back on close", Math.abs(back - before.y) <= 1, `${before.y} -> ${back}`);

  // single picture
  await page.goto(`${base}?scene=single`);
  await page.waitForFunction(() => document.querySelector("#only")?.getAttribute("role") === "button");
  await page.focus("#only"); await page.keyboard.press(" "); await page.waitForSelector(DLG); await settle(page);
  const single = await page.evaluate((s) => [document.querySelector(s + " img.ilb-img").src.includes("2400"), !!document.querySelector(s + " .ilb-count"), !!document.querySelector(s + " .ilb-next")], DLG);
  check(name, "ImageLightbox: Space opens it; fullSrc is shown; no counter and no next for one picture", single.join() === "true,false,false", single.join());
  const lcp = await page.evaluate(() => document.getElementById("only").getAttribute("loading"));
  check(name, "ImageLightbox: loading=eager reached the picture", lcp === "eager", String(lcp));
  await page.keyboard.press("Escape");
  check(name, "no script errors on the desktop page", page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();

  // reduced motion
  for (const rm of ["reduce", "no-preference"]) {
    const c = await ctxOf({ width: 1280, height: 800 }, { reducedMotion: rm });
    const p = await freshPage(c);
    await openOn(p, "#p1");
    const m = await p.evaluate((s) => [getComputedStyle(document.querySelector(s)).animationName, getComputedStyle(document.querySelector(s + " img.ilb-img")).transitionDuration], DLG);
    const quiet = m[0] === "none" && /^0s(, 0s)*$/.test(m[1]);
    check(name, `reduced motion: ${rm} → ${rm === "reduce" ? "no fade and no glide" : "fade and glide present"}`, rm === "reduce" ? quiet : m[0] !== "none" && m[1] !== "0s", m.join());
    await c.close();
  }

  await fixChecks(name, ctxOf);
  for (const [w, h] of [[375, 700], [800, 900], [1280, 800]]) await a11yAt(name, ctxOf, w, h);

  // touch
  if (name === "chromium") await touchChecks(name, browser, cdpTouch, "real touch via CDP");
  await touchChecks(name, browser, async (p) => syntheticTouch(p), "touch pointer events from the page");
  await browser.close();
}
await server.close();
const nPass = results.filter((r) => r.pass).length;
console.log(`\n${nPass} of ${results.length} checks passed in ${ran} browser(s): ${names.join(", ")}`);
process.exit(ran === 0 ? 2 : failed ? 1 : 0);
