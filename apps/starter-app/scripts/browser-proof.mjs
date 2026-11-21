// Headless Chrome proof of the fake mode, at a wide window and at a phone's size.
// Usage: node scripts/browser-proof.mjs <out-dir> [url-base]
// Needs `npm run dev:fake` running (default http://localhost:5262). It talks to that address only: the platform is the
// fake inside the page. It starts its own Chrome (a throwaway profile inside <out-dir>, removed at the end), runs the
// legs, takes a screenshot after each, and writes the console errors of each size to <out-dir>/<size>/errors.txt.
//
// Each leg ends on one screen or state of the app. After each leg, once as the page is and once with the device set
// to dark, it
//   - runs axe-core in the page (WCAG 2.1 A and AA), and
//   - measures EVERY text on the page: each element that holds text of its own, what is typed in a field, and each
//     placeholder (which axe does not measure), with its colour worked out from the drawn colours over every
//     background under it. A text under 4.5:1 fails the leg.
// The legs walk every screen and state the fake mode can reach (the list is at `legsFor`). What this does not measure:
// colours under the pointer or on focus, things that are not text (borders, icons, focus rings), a control that is
// turned off, text another layer covers (the page behind an open sheet), text a style sheet draws itself (::before,
// ::after), other browsers than Chrome, and the screens the fake mode cannot reach (the set-up page shown before a
// vault type is set; anything live). A text on a picture or a gradient cannot be measured this way: it fails the leg.
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
const SUFFIX = setting("vaultNameSuffix");
const ANN = `ann${SUFFIX}`;
const BEN = `ben${SUFFIX}`;
const LONG_ACCOUNT = "abcdefghijklmnopqrstuvwxyzabcde";
const AA = 4.5;

const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const AXE_RUN = `axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }).then((r) => JSON.stringify(r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ") + ": " + [...n.any, ...n.all, ...n.none].map((c) => c.message).join(" ")) }))))`;

/** axe-core on the page as it is now. Returns one line per finding; an empty list means none. */
async function axeFindings(page) {
  if (!(await page.eval("typeof window.axe === 'object'"))) await page.eval(`${AXE_SOURCE}; void 0`);
  return JSON.parse(await page.eval(AXE_RUN)).flatMap((v) => v.nodes.map((n) => `axe ${v.id} at ${n}`));
}

/**
 * In the page: every text as it is drawn. For each element that holds text of its own, each field with something typed
 * in it and each placeholder: the text colour (with every opacity up the tree) laid over every background under it, and
 * the contrast of the two. `skip` says why a text is not judged: the control is turned off, or another layer covers it.
 */
const EVERY_TEXT = `window.__everyText = () => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
  const read = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (t, u) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
  const backgroundOf = (e) => { const stack = []; let picture = false; for (let n = e; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.backgroundImage !== "none") picture = true; const c = read(s.backgroundColor); if (c[3] > 0) stack.push(c); if (c[3] === 1) break; } let bg = [255, 255, 255, 1]; for (const c of stack.reverse()) bg = over(c, bg); return { bg, picture }; };
  const opacityOf = (e) => { let o = 1; for (let n = e; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  const lum = (c) => { const f = (v) => { v = Math.round(v) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const hex = (c) => "#" + [0, 1, 2].map((i) => Math.round(c[i]).toString(16).padStart(2, "0")).join("");
  const nameOf = (e) => (e.getAttribute("data-testid") || (typeof e.className === "string" && e.className.split(" ")[0]) || e.tagName.toLowerCase()).slice(0, 40);
  const seen = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none"; };
  const covered = (e) => { const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; const hit = document.elementFromPoint(x, y); return !!hit && !e.contains(hit) && !hit.contains(e); };
  const one = (e, what, text, colour, placeholder) => {
    const { bg, picture } = backgroundOf(e); const c = read(colour); c[3] *= opacityOf(e); const fg = over(c, bg);
    const a = lum(fg), b = lum(bg);
    const skip = e.closest(":disabled, [aria-disabled='true']") ? "turned off" : covered(e) ? "covered" : null;
    return { what, text: text.replace(/\\s+/g, " ").trim().slice(0, 48), fg: hex(fg), bg: hex(bg), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), placeholder, picture, skip };
  };
  const out = [];
  for (const e of document.body.querySelectorAll("*")) {
    if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(e.tagName) || !seen(e)) continue;
    if (e.tagName === "INPUT" || e.tagName === "TEXTAREA") {
      if (["radio", "checkbox", "range", "color", "file", "hidden", "image"].includes(e.type)) continue; // these show no text of their own
      if (e.value) out.push(one(e, "typed in " + nameOf(e), e.value, getComputedStyle(e).color, false));
      else if (e.placeholder) out.push(one(e, "placeholder of " + nameOf(e), e.placeholder, getComputedStyle(e, "::placeholder").color, true));
      continue;
    }
    const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent).join(" ");
    if (own) out.push(one(e, nameOf(e), own, getComputedStyle(e).color, false));
  }
  return JSON.stringify(out);
}; true`;

/** Every text on the page as it is now: all the readings, and one line for each judged text under 4.5:1 or on a picture. */
async function everyText(page) {
  await page.eval(EVERY_TEXT);
  const readings = JSON.parse(await page.eval("window.__everyText()"));
  const judged = readings.filter((r) => !r.skip);
  const low = [
    ...judged.filter((r) => r.ratio < AA).map((r) => `${r.placeholder ? "placeholder" : "text"} under 4.5:1: ${r.what} "${r.text}" ${r.fg} on ${r.bg} = ${r.ratio.toFixed(2)}`),
    // A picture or a gradient under a text has no one colour: this measure cannot judge it, so it says so and fails.
    ...judged.filter((r) => r.picture).map((r) => `text on a picture or a gradient, which this cannot measure: ${r.what} "${r.text}"`),
  ];
  return { readings, low };
}

/**
 * The light and the dark look of the same screen: axe and every text in each, and a dark screenshot. The readings go
 * into `record` under the screen's name. Throws one error that lists every finding.
 */
async function bothLooks(page, darkShot, screen, record) {
  const found = [];
  const look = async (name) => {
    const axe = await axeFindings(page);
    const texts = await everyText(page);
    record.push({ screen, look: name, readings: texts.readings });
    found.push(...[...axe, ...texts.low].map((f) => `${name}: ${f}`));
  };
  const set = async (value) => {
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value }] });
    await page.sleep(150);
    const dark = await page.eval(`matchMedia("(prefers-color-scheme: dark)").matches`);
    if (dark !== (value === "dark")) throw new Error(`the page did not take the ${value} look`);
  };
  await set("light"); // set, not assumed: Chrome starts in the look of the computer it runs on
  await look("light");
  try {
    await set("dark");
    await look("dark");
    await page.screenshot(darkShot);
  } finally {
    await set("light");
  }
  if (found.length) throw new Error(`found ${found.length}:\n      ${found.join("\n      ")}`);
}

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
const pageSays = (words) => `document.body.textContent.includes(${JSON.stringify(words)})`;
const READY = `!!document.querySelector('[data-stage="ready"]')`;
/** The vault chip in the header names the open vault. */
const openVaultIs = (name) => `${text(".vsw-name")} === ${JSON.stringify(name)}`;
const dialogNamed = (name) => `[...document.querySelectorAll('[role="dialog"]')].some((d) => (d.getAttribute("aria-label") ?? d.querySelector("h1,h2")?.textContent ?? "").includes(${JSON.stringify(name)}))`;
const noDialog = `!document.querySelector('[role="dialog"]')`;
const CREATE = "POST /base/vault/create-named";
const SIGN_OUT = "POST /base/auth/sign-out";
/** The fake holds every request of this kind until `release` is called in the page. */
const hold = (page, match) => page.eval(`void (window.__release = window.__fake.hold(${JSON.stringify(match)}))`);
const release = (page) => page.eval("void window.__release()");
const failNext = (page, match, message) => page.eval(`void window.__fake.failNext(${JSON.stringify(match)}, { status: 503, message: ${JSON.stringify(message)} })`);

/**
 * The legs: every screen and state the fake mode can reach, in the order a person meets them.
 * Sign-in card: empty, email typed, code step, wrong code, name step with a free name, with a refused name, the name taken
 * after it was checked, and what the card says then. Start: a failed start, the waiting sentence, signing out, the notice
 * of a sign-out the server was not told of. Frame: the person's own vault, the menu drawer (phone), a vault shared for
 * viewing, a long account name. Vault chooser: reading, the list, a list that could not be read. Share sheet: reading, the
 * empty list, a refused entry, two people, the Remove question, a removal that failed, and a vault the person does not control.
 */
function legsFor(size, t) {
  const phone = size.name === "phone";
  /** On a phone Share and Sign out are in the menu drawer; on a wide window they are in the header. */
  const account = async (page, word) => {
    if (phone) {
      await t.clickText("Menu", { within: 'nav[aria-label="Panels"]' });
      await page.waitFor(dialogNamed(APP_NAME));
    }
    await t.clickText(word, { within: phone ? '[role="dialog"]' : "header" });
  };
  const signIn = async (page, email) => {
    await t.set('[data-testid="sign-in-email"]', email);
    await t.click('[data-testid="sign-in-send-code"]');
    await t.wait('[data-testid="sign-in-code"]');
    await t.set('[data-testid="sign-in-code"]', "000000");
  };
  const closeSheet = async (page) => {
    await t.click(".ms-close");
    await page.waitFor(noDialog);
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
      "sign-in-email-typed",
      async () => {
        await t.set('[data-testid="sign-in-email"]', "ann@example.test");
      },
    ],
    [
      "sign-in-code-step",
      async () => {
        await t.click('[data-testid="sign-in-send-code"]');
        await t.wait('[data-testid="sign-in-code"]');
        await t.wait('[data-testid="sign-in-change-email"]');
      },
    ],
    [
      "sign-in-wrong-code",
      async () => {
        await t.set('[data-testid="sign-in-code"]', "111111");
        await t.wait('[data-testid="sign-in-error"]');
      },
    ],
    [
      "start-fails-and-says-why",
      async (page) => {
        await failNext(page, CREATE, "The vault service is busy. Try again soon.");
        await t.set('[data-testid="sign-in-code"]', "000000");
        await page.waitFor(`${text('[data-stage="error"] [role="alert"]')}.includes("The vault service is busy. Try again soon.")`);
        await checkButtonRows(page, 1); // Sign out | Try again
        await t.noHorizontalScroll();
      },
    ],
    [
      "start-says-what-it-waits-for",
      async (page) => {
        await hold(page, CREATE);
        await t.clickText("Try again", { within: '[data-stage="error"]' });
        await page.waitFor(pageSays("making your vault for this app"));
      },
    ],
    [
      "signed-in-own-vault",
      async (page) => {
        await release(page);
        await page.waitFor(READY);
        await page.waitFor(openVaultIs(ANN));
        await t.noHorizontalScroll();
        // The opening screen: its two headings, its text at a line length a person can read, and the open vault's address.
        const home = JSON.parse(
          await page.eval(`JSON.stringify((() => { const h = document.querySelector('[data-testid="records-home"]'); return { h1: h.querySelector("h1")?.textContent, h2: h.querySelector("h2")?.textContent, address: h.querySelector('[data-testid="vault-address"]')?.textContent, widest: Math.max(...[...h.querySelectorAll("p")].map((p) => p.getBoundingClientRect().width)), em: parseFloat(getComputedStyle(h).fontSize), wide: window.innerWidth }; })())`),
        );
        if (home.h1 !== "Your app, your users' data" || home.h2 !== "This is only the beginning") throw new Error(`the opening screen's headings read ${JSON.stringify([home.h1, home.h2])}`);
        if (!home.address?.startsWith("Your vault: http")) throw new Error(`the opening screen's last line reads ${JSON.stringify(home.address)}`);
        if (home.widest > 36 * home.em || home.widest > home.wide) throw new Error(`the opening screen's lines are too long to read: ${JSON.stringify(home)}`);
      },
    ],
    ...(phone
      ? [
          [
            "menu-drawer",
            async (page) => {
              // Opened from the keyboard, as a person without a pointer opens it: the drawer then holds the focus itself.
              await page.eval(`void [...document.querySelectorAll('nav[aria-label="Panels"] button')].find((b) => b.textContent.includes("Menu")).focus()`);
              await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
              await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
              await page.waitFor(`!!document.querySelector('[role="dialog"] nav[aria-label="Sections"]')`);
              await page.waitFor(`document.activeElement?.getAttribute("role") === "dialog"`);
              // The drawer is not a control: no focus ring is drawn around it (it showed as a bright line down its edge).
              const ring = JSON.parse(await page.eval(`JSON.stringify({ keyboard: document.activeElement.matches(":focus-visible"), outline: getComputedStyle(document.activeElement).outlineStyle })`));
              if (!ring.keyboard) throw new Error("the drawer was not opened as from the keyboard, so this step proves nothing about its focus ring");
              if (ring.outline !== "none") throw new Error(`the open drawer draws a focus ring around itself (outline ${ring.outline})`);
              await t.noHorizontalScroll();
            },
          ],
        ]
      : []),
    [
      "vault-chooser-reading",
      async (page) => {
        if (phone) {
          await page.key("Escape"); // the drawer
          await page.waitFor(noDialog);
        }
        await hold(page, "GET /lws/vaults");
        await t.click(".vsw-chip");
        await page.waitFor(dialogNamed("Choose a vault"));
        await page.waitFor(pageSays("Looking for your vaults"));
      },
    ],
    [
      "vault-chooser-list",
      async (page) => {
        await release(page);
        await t.wait(".vsw-row");
        await t.noHorizontalScroll();
      },
    ],
    [
      "vault-chooser-could-not-list",
      async (page) => {
        await closeSheet(page);
        await failNext(page, "GET /lws/vaults", "The list is not there just now.");
        await t.click(".vsw-chip");
        await t.wait(".vsw-error");
      },
    ],
    [
      "share-sheet-reading",
      async (page) => {
        await closeSheet(page);
        await hold(page, "GET /base/consent/vault-acl");
        await account(page, "Share");
        await page.waitFor(dialogNamed(`Share ${ANN}`));
        await page.waitFor(pageSays("Reading who has access"));
      },
    ],
    [
      "share-sheet-empty",
      async (page) => {
        await release(page);
        await page.waitFor(pageSays("Nobody else has access yet."));
        await t.noHorizontalScroll();
      },
    ],
    [
      "share-sheet-refused-entry",
      async () => {
        await t.set(".vss-input", "someone@example.test"); // an email is not a vault name
        await t.click(".vss-primary");
        await t.wait(".vss .vss-error");
      },
    ],
    [
      "share-sheet-two-people",
      async (page) => {
        await t.set(".vss-input", "ben"); // Can view, as the sheet starts
        await t.click(".vss-primary");
        await page.waitFor(`document.querySelectorAll(".vss .vss-row .vss-danger-text").length === 1`);
        await t.set(".vss-input", "cara");
        await t.clickText("Can edit", { within: ".vss" });
        await t.click(".vss-primary");
        await page.waitFor(`document.querySelectorAll(".vss .vss-row .vss-danger-text").length === 2`);
        // Two people in the list: the two rows, and the two Remove buttons, must not read alike.
        const list = JSON.parse(
          await page.eval(`JSON.stringify([...document.querySelectorAll(".vss .vss-row .vss-danger-text")].map((b) => ({ row: b.closest("li").textContent, remove: b.getAttribute("aria-label") })))`),
        );
        if (new Set(list.map((r) => r.row)).size !== 2 || new Set(list.map((r) => r.remove)).size !== 2) throw new Error(`the two people read alike: ${JSON.stringify(list)}`);
        await t.noHorizontalScroll();
      },
    ],
    [
      "share-sheet-remove-question",
      async (page) => {
        // The question before a removal: a verb for the act, and the way out left of it. (Where the share sheet puts the
        // two answers is its own layout; this does not judge it.)
        await t.click(".vss .vss-row .vss-danger-text"); // the first row: Ben
        await t.wait(".vss .vss-inline .vss-danger");
        const answers = await page.eval(`[...document.querySelectorAll(".vss .vss-inline button")].map((b) => b.textContent).join(" | ")`);
        if (answers !== "Cancel | Remove") throw new Error(`the answers to the Remove question read "${answers}"`);
      },
    ],
    [
      "share-sheet-removal-failed",
      async (page) => {
        await failNext(page, "POST /base/authz/revoke-vault", "The access could not be changed just now.");
        await t.click(".vss .vss-inline .vss-danger");
        await t.wait(".vss .vss-row .vss-error");
        await page.waitFor(`document.querySelectorAll(".vss .vss-row .vss-danger-text").length >= 1`);
      },
    ],
    [
      "signing-out-says-so",
      async (page) => {
        await closeSheet(page);
        await hold(page, SIGN_OUT);
        await account(page, "Sign out");
        await page.waitFor(pageSays("Signing out"));
      },
    ],
    [
      "shared-vault-view-only",
      async (page) => {
        await release(page);
        await t.wait('[data-testid="sign-in-email"]');
        await signIn(page, "ben@example.test");
        await page.waitFor(openVaultIs(BEN));
        await t.click(".vsw-chip");
        await t.clickText(ANN, { within: '[role="dialog"]' });
        await page.waitFor(openVaultIs(ANN));
        await t.wait(".sa-badge"); // Ben may view Ann's vault, not change it
        await t.noHorizontalScroll();
      },
    ],
    [
      "share-sheet-not-controlled",
      async (page) => {
        await account(page, "Share");
        await page.waitFor(dialogNamed(`Share ${ANN}`));
        await page.waitFor(pageSays("You don't hold Control on this vault"));
      },
    ],
    [
      "signed-out-server-not-told",
      async (page) => {
        await closeSheet(page);
        await failNext(page, SIGN_OUT, "Busy.");
        await account(page, "Sign out");
        await t.wait('[data-testid="sign-in-email"]');
        await t.wait(".sa-note"); // signed out here; the sign-in server could not be told
        const state = JSON.parse(
          await page.eval(`JSON.stringify({ violations: window.__fake.violations, vaults: [...window.__fake.state.vaults.values()].map((v) => v.name).sort(), signOuts: window.__fake.calls.count(${JSON.stringify(SIGN_OUT)}) })`),
        );
        if (state.violations.length) throw new Error(`the app asked the platform for something it does not have: ${state.violations.join("; ")}`);
        // The fake started with three people's accounts (ann, ben, cara). One vault for the app each for the two who signed in, and no more, was made.
        const want = ["ann", "ben", "cara", ANN, BEN].sort().join();
        if (state.vaults.join() !== want) throw new Error(`expected the vaults ${want}, saw ${state.vaults.join()}`);
        if (state.signOuts !== 2) throw new Error(`expected the sign-in server asked to sign out twice, saw ${state.signOuts}`);
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
        await page.waitFor(`${text('[data-testid="vault-name-address"]')}.includes(${JSON.stringify(LONG_ACCOUNT)})`);
        await t.noHorizontalScroll();
      },
    ],
    [
      "name-step-refused",
      async (page) => {
        await t.set('[data-testid="vault-name-input"]', "x");
        await t.wait('[data-testid="vault-name-reserved"]');
        await page.waitFor(`!document.querySelector('[data-testid="vault-name-address"]')`);
      },
    ],
    [
      "new-person-long-name",
      async (page) => {
        // A 31-letter account name must leave the app's name readable in the top bar.
        await t.set('[data-testid="vault-name-input"]', LONG_ACCOUNT);
        await page.waitFor(`!!document.querySelector('[data-testid="vault-name-available"]')`);
        await t.set('[data-testid="sign-in-code"]', "000000");
        await page.waitFor(READY);
        await page.waitFor(openVaultIs(`${LONG_ACCOUNT}${SUFFIX}`));
        await t.noHorizontalScroll();
        const bar = JSON.parse(
          await page.eval(`JSON.stringify((() => { const t = document.querySelector(".sa-title"), c = document.querySelector(".vsw-chip"); return { title: t.getBoundingClientRect().width, cut: t.scrollWidth > t.clientWidth, chipRight: c.getBoundingClientRect().right, wide: window.innerWidth }; })())`),
        );
        if (bar.cut || bar.title < 30) throw new Error(`the app's name is squeezed by the long vault name: ${JSON.stringify(bar)}`);
        if (bar.chipRight > bar.wide) throw new Error(`the vault chip runs off the window: ${JSON.stringify(bar)}`);
      },
    ],
    [
      "name-taken-after-the-check",
      async (page) => {
        // Another person takes the name between the check and the code. The card then asks for a name once more.
        await account(page, "Sign out");
        await t.wait('[data-testid="sign-in-email"]');
        await t.set('[data-testid="sign-in-email"]', "late@example.test");
        await t.click('[data-testid="sign-in-send-code"]');
        await t.wait('[data-testid="vault-name-input"]');
        await page.waitFor(`!!document.querySelector('[data-testid="vault-name-available"]')`);
        await page.eval(`void window.__fake.takeName(document.querySelector('[data-testid="vault-name-input"]').value)`);
        await t.set('[data-testid="sign-in-code"]', "000000");
        await t.wait('[data-testid="create-vault-button"]');
        await page.waitFor(`!!document.querySelector('[data-testid="vault-name-available"]')`);
      },
    ],
    [
      "name-step-says-why-it-cannot-go-on",
      async () => {
        await t.click('[data-testid="create-vault-button"]');
        await t.wait('[data-testid="vault-name-race"]');
      },
    ],
  ];
}

let failed = 0;
let errorTotal = 0;
let readingTotal = 0;
const lowest = [];
for (const size of SIZES) {
  const dir = join(out, size.name);
  mkdirSync(dir, { recursive: true });
  const profileDir = join(dir, ".chrome-profile");
  const { page, close } = await startBrowser({ profileDir, width: size.width, height: size.height, deviceScaleFactor: size.deviceScaleFactor, mobile: size.mobile });
  try {
    console.log(`\n${size.name} (${size.width} x ${size.height})`);
    const record = [];
    // Each leg ends with a short wait, so axe, the measuring and the screenshot see the page after the drawer or the sheet has slid in.
    const legs = legsFor(size, makeTools(page)).map(([name, leg], i) => [
      name,
      async (p) => {
        await leg(p);
        await p.sleep(400);
        await bothLooks(p, join(dir, `${i + 1}-${name}-dark.png`), name, record);
      },
    ]);
    const run = await runLegs(legs, { page, out: dir, setExitCode: false });
    failed += run.failed.length;
    const errors = page.consoleErrors();
    errorTotal += errors.length;
    writeFileSync(join(dir, "errors.txt"), errors.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join("\n") + (errors.length ? "\n" : ""));
    writeFileSync(join(dir, "readings.json"), JSON.stringify(record, null, 1));
    // contrast.txt: for each screen and look, how many texts were judged and the lowest of them; then everything under 4.5:1.
    const lines = [];
    const under = [];
    const notJudged = new Map();
    for (const { screen, look, readings } of record) {
      const judged = readings.filter((r) => !r.skip);
      readingTotal += judged.length;
      const low = judged.reduce((a, b) => (a && a.ratio <= b.ratio ? a : b), null);
      if (low) {
        lines.push(`${screen}, ${look}: ${judged.length} texts (${readings.length - judged.length} not judged), lowest ${low.ratio.toFixed(2)} ${low.what} "${low.text}" ${low.fg} on ${low.bg}`);
        lowest.push({ size: size.name, screen, look, ...low });
      }
      for (const r of readings.filter((x) => x.skip)) notJudged.set(`${r.skip}: ${r.what} "${r.text}"`, (notJudged.get(`${r.skip}: ${r.what} "${r.text}"`) ?? 0) + 1);
      for (const r of judged.filter((x) => x.ratio < AA)) under.push(`${screen}, ${look}: ${r.what} "${r.text}" ${r.fg} on ${r.bg} = ${r.ratio.toFixed(2)}`);
    }
    const skipped = [...notJudged].map(([what, times]) => `${times} x ${what}`);
    writeFileSync(join(dir, "contrast.txt"), `${lines.join("\n")}\n\nUnder 4.5:1: ${under.length}\n${under.join("\n")}${under.length ? "\n" : ""}\nNot judged (a control that is turned off, or text another layer covers), by how often it was met:\n${skipped.join("\n")}\n`);
    console.log(`${size.name}: ${record.length} screens and looks measured; under 4.5:1: ${under.length}; console errors ${errors.length}; screenshots, readings.json and contrast.txt in ${dir}`);
  } finally {
    await close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}
lowest.sort((a, b) => a.ratio - b.ratio);
console.log(`\ntexts judged in all: ${readingTotal}; the five lowest:`);
for (const l of lowest.slice(0, 5)) console.log(`  ${l.ratio.toFixed(2)}  ${l.size} ${l.screen}, ${l.look}: ${l.what} "${l.text}" ${l.fg} on ${l.bg}`);
console.log(`console errors in all: ${errorTotal}; failed legs: ${failed}`);
process.exitCode = failed > 0 || errorTotal > 0 ? 1 : 0;
