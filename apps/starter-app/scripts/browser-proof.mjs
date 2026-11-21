// Headless Chrome proof of the fake mode, at a wide window and at a phone's size.
// Usage: node scripts/browser-proof.mjs <out-dir> [url-base]
// Needs `npm run dev:fake` running (default http://localhost:5262). It talks to that address only: the platform is the
// fake inside the page. It starts its own Chrome (a throwaway profile inside <out-dir>, removed at the end), runs the
// legs, takes a screenshot after each, and writes the console errors of each size to <out-dir>/<size>/errors.txt.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
      "start-fails-and-says-why",
      async (page) => {
        await page.eval(`void window.__fake.failNext("POST /base/vault/create-named", { status: 503, message: "The vault service is busy. Try again soon." })`);
        await t.set('[data-testid="sign-in-email"]', "ann@example.test");
        await t.click('[data-testid="sign-in-send-code"]');
        await t.wait('[data-testid="sign-in-code"]');
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
        await page.waitFor(`!!document.querySelector('.vss [aria-label="Remove ben"]')`);
        await checkButtonRows(page, 0);
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
        // The fake started with the two people's accounts (ann, ben). One vault for the app each, and no more, was made.
        const want = ["ann", "ben", ANN, BEN].sort().join();
        if (state.vaults.join() !== want) throw new Error(`expected the vaults ${want}, saw ${state.vaults.join()}`);
        if (state.signOuts !== 2) throw new Error(`expected the sign-in server told of 2 sign-outs, saw ${state.signOuts}`);
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
    // Each leg ends with a short wait, so its screenshot is taken after the drawer or the sheet has slid in.
    const legs = legsFor(size, makeTools(page)).map(([name, leg]) => [name, async (p) => (await leg(p), p.sleep(400))]);
    const run = await runLegs(legs, { page, out: dir, setExitCode: false });
    failed += run.failed.length;
    const errors = page.consoleErrors();
    errorTotal += errors.length;
    writeFileSync(join(dir, "errors.txt"), errors.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join("\n") + (errors.length ? "\n" : ""));
    console.log(`${size.name}: console errors ${errors.length}; screenshots in ${dir}`);
  } finally {
    await close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}
console.log(`\nconsole errors in all: ${errorTotal}; failed legs: ${failed}`);
process.exitCode = failed > 0 || errorTotal > 0 ? 1 : 0;
