// Headless Chrome proof of the fake mode, at a wide window and at a phone's size.
// Usage: node scripts/browser-proof.mjs <out-dir> [url-base]
// Needs `npm run dev:fake` running (default http://localhost:5262). It talks to that address only: the platform is the
// fake inside the page. It starts its own Chrome (a throwaway profile inside <out-dir>, removed at the end), runs the
// legs, takes a screenshot after each, and writes the console errors of each size to <out-dir>/<size>/errors.txt.
// After each leg it also runs axe-core in the page (WCAG 2.1 A and AA, colour contrast included), once as the page is
// and once with the device set to dark, and takes a dark screenshot. A leg with an axe finding fails.
// axe sees only the screen a leg ends on, so legs rest on the sign-in card's code step and name step too, and there
// the contrast of three texts is also worked out from the drawn colours, in both looks: the Change email link, the new
// vault's address and the sentence that refuses a name. Each must read at 4.5:1 or better.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { collectButtonRows, judgeButtonRows, makeTools, runLegs, startBrowser } from "@kaigilb/gilbplatformcode-browser-proof";

// The app's own names, read from its settings, so the proof still holds after the app is renamed.
const settingsText = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "settings.ts"), "utf8");
const setting = (key) => {
  const m = new RegExp(`${key}:\\s*"([^"]*)"`).exec(settingsText);
  if (!m) throw new Error(`src/settings.ts has no ${key}: "..." line`);
  return m[1];
};
const APP_NAME = setting("appName");
const ANN = `ann${setting("vaultNameSuffix")}`;
const BEN = `ben${setting("vaultNameSuffix")}`;

const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const AXE_RUN = `axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }).then((r) => JSON.stringify(r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ") + ": " + [...n.any, ...n.all, ...n.none].map((c) => c.message).join(" ")) }))))`;

/** axe-core on the page as it is now. Returns one line per finding; an empty list means none. */
async function axeFindings(page) {
  if (!(await page.eval("typeof window.axe === 'object'"))) await page.eval(`${AXE_SOURCE}; void 0`);
  return JSON.parse(await page.eval(AXE_RUN)).flatMap((v) => v.nodes.map((n) => `${v.id} at ${n}`));
}

/** In the page: the contrast of one element's text on what is drawn under it (every background up the tree, laid over the one below). */
const CONTRAST_OF = `window.__contrastOf = (selector) => {
  const e = document.querySelector(selector);
  if (!e) return JSON.stringify({ missing: true });
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
  const read = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (t, u) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
  const stack = []; for (let n = e; n; n = n.parentElement) { const c = read(getComputedStyle(n).backgroundColor); if (c[3] > 0) stack.push(c); if (c[3] === 1) break; }
  let bg = [255, 255, 255, 1]; for (const c of stack.reverse()) bg = over(c, bg);
  const fg = over(read(getComputedStyle(e).color), bg);
  const lum = (c) => { const f = (v) => { v = Math.round(v) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const hex = (c) => "#" + [0, 1, 2].map((i) => Math.round(c[i]).toString(16).padStart(2, "0")).join("");
  const a = lum(fg), b = lum(bg);
  return JSON.stringify({ text: hex(fg), background: hex(bg), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
}; true`;

/** The texts of `pairs` ([what, selector]) that read under 4.5:1 right now, one line each; and every reading, for the record. */
async function lowContrast(page, pairs, look, readings) {
  await page.eval(CONTRAST_OF);
  const low = [];
  for (const [what, selector] of pairs) {
    const got = JSON.parse(await page.eval(`window.__contrastOf(${JSON.stringify(selector)})`));
    if (got.missing) low.push(`${what} is not on the page (${selector})`);
    else {
      readings.push(`${what}, ${look}: ${got.text} on ${got.background} = ${got.ratio.toFixed(2)}`);
      if (got.ratio < 4.5) low.push(`${what} reads at ${got.ratio.toFixed(2)}:1 (${got.text} on ${got.background})`);
    }
  }
  return low;
}

/**
 * The light and the dark look of the same page: axe in each, the contrast of the leg's own texts in each, and a dark
 * screenshot. Throws one error that lists every finding.
 */
async function bothLooks(page, darkShot, pairs, readings) {
  const light = [...(await axeFindings(page)), ...(await lowContrast(page, pairs, "light", readings))];
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  let dark;
  try {
    await page.sleep(150);
    dark = [...(await axeFindings(page)), ...(await lowContrast(page, pairs, "dark", readings))];
    await page.screenshot(darkShot);
  } finally {
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    await page.sleep(100);
  }
  const all = [...light.map((f) => `light: ${f}`), ...dark.map((f) => `dark: ${f}`)];
  if (all.length) throw new Error(`axe and contrast found ${all.length}:\n      ${all.join("\n      ")}`);
}

const LONG_ACCOUNT = "abcdefghijklmnopqrstuvwxyzabcde";

const out = process.argv[2] ? resolve(process.argv[2]) : "";
const base = process.argv[3] ?? "http://localhost:5262";
if (!out) throw new Error("usage: browser-proof.mjs <out-dir> [url-base]");

const SIZES = [
  { name: "wide", width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
  { name: "phone", width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
];

/**
 * The button-row rule (RuleUiActionRowMacOrder) on every row of the page but the frame's own top bar: that bar is a toolbar
 * whose two pane buttons sit at its two ends by design, not the action row of a form or a dialog.
 */
async function checkButtonRows(page, atLeast) {
  const rows = (await collectButtonRows(page)).filter((r) => !/(^| )header\./.test(r.path));
  const bad = judgeButtonRows(rows, { viewportWidth: await page.eval("window.innerWidth") });
  if (bad.length) throw new Error(`button rows: ${bad.map((v) => `[${v.rule}] ${v.message} (${v.path})`).join("; ")}`);
  if (rows.length < atLeast) throw new Error(`expected at least ${atLeast} button row(s) to judge, found ${rows.length}`);
}

const text = (sel) => `(document.querySelector(${JSON.stringify(sel)})?.textContent ?? "")`;
const READY = `!!document.querySelector('[data-stage="ready"]')`;
// The three texts of the sign-in card that a dark look once put under 4.5:1. A leg names the ones its screen shows.
const CHANGE_EMAIL = ["the Change email link", '[data-testid="sign-in-change-email"]'];
const NEW_ADDRESS = ["the new vault's address", '[data-testid="vault-name-address"]'];
const REFUSED_NAME = ["the sentence that refuses a name", '[data-testid="vault-name-reserved"]'];
/** The vault chip in the header names the open vault. */
const openVaultIs = (name) => `${text(".vsw-name")} === ${JSON.stringify(name)}`;
const dialogNamed = (name) => `[...document.querySelectorAll('[role="dialog"]')].some((d) => (d.getAttribute("aria-label") ?? d.querySelector("h1,h2")?.textContent ?? "").includes(${JSON.stringify(name)}))`;

function legsFor(size, t) {
  const phone = size.name === "phone";
  /** On a phone Share and Sign out are in the menu drawer; on a wide window they are in the header. */
  const openMenuIfPhone = async (page) => {
    if (!phone) return;
    await t.clickText("Menu", { within: 'nav[aria-label="Panels"]' });
    await page.waitFor(dialogNamed(APP_NAME));
  };
  return [
    [
      "sign-in-page",
      async (page) => {
        await page.goto(`${base}/`, { ready: `!!document.querySelector('[data-testid="sign-in-email"]')` });
        await page.waitFor(`${text('[data-testid="fake-note"]')}.includes("Fake platform")`);
        await page.waitFor(`(document.getElementById("gilb-style")?.textContent ?? "").includes("--accent")`); // the style file was applied
        await t.noHorizontalScroll();
      },
    ],
    [
      "code-step",
      async () => {
        await t.set('[data-testid="sign-in-email"]', "ann@example.test");
        await t.click('[data-testid="sign-in-send-code"]');
        await t.wait('[data-testid="sign-in-code"]');
        await t.wait(CHANGE_EMAIL[1]);
      },
      [CHANGE_EMAIL],
    ],
    [
      "start-fails-and-says-why",
      async (page) => {
        await page.eval(`void window.__fake.failNext("POST /base/vault/create-named", { status: 503, message: "The vault service is busy. Try again soon." })`);
        await t.set('[data-testid="sign-in-code"]', "000000");
        await page.waitFor(`${text('[data-stage="error"] [role="alert"]')}.includes("The vault service is busy. Try again soon.")`);
        await checkButtonRows(page, 1); // Sign out | Try again
        await t.noHorizontalScroll();
      },
    ],
    [
      "signed-in-own-vault",
      async (page) => {
        await t.clickText("Try again", { within: '[data-stage="error"]' });
        await page.waitFor(READY);
        await page.waitFor(openVaultIs(ANN));
        await t.noHorizontalScroll();
      },
    ],
    ...(phone
      ? [
          [
            "menu-drawer",
            async (page) => {
              await openMenuIfPhone(page);
              await page.waitFor(`!!document.querySelector('[role="dialog"] nav[aria-label="Sections"]')`);
              await t.noHorizontalScroll();
            },
          ],
        ]
      : []),
    [
      "share-sheet",
      async (page) => {
        await t.clickText("Share", { within: phone ? '[role="dialog"]' : "header" });
        await page.waitFor(dialogNamed(`Share ${ANN}`));
        await page.waitFor(`document.body.textContent.includes("Nobody else has access yet.")`);
        await t.set(".vss-input", "ben");
        await t.clickText("Can edit", { within: ".vss" });
        await t.click(".vss-primary");
        await page.waitFor(`document.querySelectorAll(".vss .vss-row .vss-danger-text").length === 1`); // Ben is in the list, with a Remove button
        await t.set(".vss-input", "cara");
        await t.click(".vss-primary");
        await page.waitFor(`document.querySelectorAll(".vss .vss-row .vss-danger-text").length === 2`);
        // Two people with the same access: the two rows, and the two Remove buttons, must not read alike.
        const list = JSON.parse(
          await page.eval(`JSON.stringify([...document.querySelectorAll(".vss .vss-row .vss-danger-text")].map((b) => ({ row: b.closest("li").textContent, remove: b.getAttribute("aria-label") })))`),
        );
        if (new Set(list.map((r) => r.row)).size !== 2 || new Set(list.map((r) => r.remove)).size !== 2) throw new Error(`the two people read alike: ${JSON.stringify(list)}`);
        // The question before a removal: a verb for the act, and the way out left of it. (Where the share sheet puts the
        // two answers is its own layout; this does not judge it.)
        await t.click(".vss .vss-row .vss-danger-text");
        await page.waitFor(`!!document.querySelector(".vss .vss-inline")`);
        const answers = await page.eval(`[...document.querySelectorAll(".vss .vss-inline button")].map((b) => b.textContent).join(" | ")`);
        if (answers !== "Cancel | Remove") throw new Error(`the answers to the Remove question read "${answers}"`);
        await t.clickText("Cancel", { within: ".vss .vss-inline" });
        await page.waitFor(`document.querySelectorAll(".vss .vss-row .vss-danger-text").length === 2`);
        await t.noHorizontalScroll();
      },
    ],
    [
      "shared-person-opens-the-vault",
      async (page) => {
        await t.click(".ms-close");
        await openMenuIfPhone(page);
        await t.clickText("Sign out", { within: phone ? '[role="dialog"]' : "header" });
        await t.wait('[data-testid="sign-in-email"]');
        await t.set('[data-testid="sign-in-email"]', "ben@example.test");
        await t.click('[data-testid="sign-in-send-code"]');
        await t.wait('[data-testid="sign-in-code"]');
        await t.set('[data-testid="sign-in-code"]', "000000");
        await page.waitFor(openVaultIs(BEN));
        await t.click(".vsw-chip");
        await t.clickText(ANN, { within: '[role="dialog"]' });
        await page.waitFor(openVaultIs(ANN));
        await t.noHorizontalScroll();
      },
    ],
    [
      "signed-out",
      async (page) => {
        await openMenuIfPhone(page);
        await t.clickText("Sign out", { within: phone ? '[role="dialog"]' : "header" });
        await t.wait('[data-testid="sign-in-email"]');
        const state = JSON.parse(
          await page.eval(
            `JSON.stringify({ violations: window.__fake.violations, vaults: [...window.__fake.state.vaults.values()].map((v) => v.name).sort(), signOuts: window.__fake.calls.count("POST /base/auth/sign-out") })`,
          ),
        );
        if (state.violations.length) throw new Error(`the app asked the platform for something it does not have: ${state.violations.join("; ")}`);
        // The fake started with three people's accounts (ann, ben, cara). One vault for the app each for the two who signed in, and no more, was made.
        const want = ["ann", "ben", "cara", ANN, BEN].sort().join();
        if (state.vaults.join() !== want) throw new Error(`expected the vaults ${want}, saw ${state.vaults.join()}`);
        if (state.signOuts !== 2) throw new Error(`expected the sign-in server told of 2 sign-outs, saw ${state.signOuts}`);
      },
    ],
    [
      "name-step-free",
      async (page) => {
        // A person with no account names it on the card. The name is free: the card shows the address the vault will have.
        await t.set('[data-testid="sign-in-email"]', "new@example.test");
        await t.click('[data-testid="sign-in-send-code"]');
        await t.wait('[data-testid="vault-name-input"]');
        await t.set('[data-testid="vault-name-input"]', LONG_ACCOUNT);
        await page.waitFor(`${text(NEW_ADDRESS[1])}.includes(${JSON.stringify(LONG_ACCOUNT)})`);
        await t.noHorizontalScroll();
      },
      [NEW_ADDRESS, CHANGE_EMAIL],
    ],
    [
      "name-step-refused",
      async (page) => {
        await t.set('[data-testid="vault-name-input"]', "x");
        await t.wait(REFUSED_NAME[1]);
        await page.waitFor(`!document.querySelector(${JSON.stringify(NEW_ADDRESS[1])})`);
      },
      [REFUSED_NAME, CHANGE_EMAIL],
    ],
    [
      "new-person-long-name",
      async (page) => {
        // A 31-letter account name must leave the app's name readable in the top bar.
        const account = LONG_ACCOUNT;
        await t.set('[data-testid="vault-name-input"]', account);
        await page.waitFor(`!!document.querySelector('[data-testid="vault-name-available"]')`);
        await t.set('[data-testid="sign-in-code"]', "000000");
        await page.waitFor(READY);
        await page.waitFor(openVaultIs(`${account}${BEN.slice(3)}`));
        await t.noHorizontalScroll();
        const bar = JSON.parse(
          await page.eval(`JSON.stringify((() => { const t = document.querySelector(".sa-title"), c = document.querySelector(".vsw-chip"); return { title: t.getBoundingClientRect().width, cut: t.scrollWidth > t.clientWidth, chipRight: c.getBoundingClientRect().right, wide: window.innerWidth }; })())`),
        );
        if (bar.cut || bar.title < 30) throw new Error(`the app's name is squeezed by the long vault name: ${JSON.stringify(bar)}`);
        if (bar.chipRight > bar.wide) throw new Error(`the vault chip runs off the window: ${JSON.stringify(bar)}`);
      },
    ],
  ];
}

let failed = 0;
let errorTotal = 0;
for (const size of SIZES) {
  const dir = join(out, size.name);
  mkdirSync(dir, { recursive: true });
  const profileDir = join(dir, ".chrome-profile");
  const { page, close } = await startBrowser({ profileDir, width: size.width, height: size.height, deviceScaleFactor: size.deviceScaleFactor, mobile: size.mobile });
  try {
    console.log(`\n${size.name} (${size.width} x ${size.height})`);
    // Each leg ends with a short wait, so axe and the screenshot see the page after the drawer or the sheet has slid in.
    const readings = [];
    const legs = legsFor(size, makeTools(page)).map(([name, leg, pairs = []], i) => [
      name,
      async (p) => {
        await leg(p);
        await p.sleep(400);
        await bothLooks(p, join(dir, `${i + 1}-${name}-dark.png`), pairs, readings);
      },
    ]);
    const run = await runLegs(legs, { page, out: dir, setExitCode: false });
    failed += run.failed.length;
    const errors = page.consoleErrors();
    errorTotal += errors.length;
    writeFileSync(join(dir, "errors.txt"), errors.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join("\n") + (errors.length ? "\n" : ""));
    writeFileSync(join(dir, "contrast.txt"), readings.join("\n") + "\n");
    for (const r of readings) console.log(`      ${r}`);
    console.log(`${size.name}: console errors ${errors.length}; screenshots in ${dir}`);
  } finally {
    await close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}
console.log(`\nconsole errors in all: ${errorTotal}; failed legs: ${failed}`);
process.exitCode = failed > 0 || errorTotal > 0 ? 1 : 0;
