# browser-proof

## What this is

Runs an app in headless Chrome for an end-to-end proof: starts Chrome with a throwaway profile, drives the page over the DevTools Protocol, takes screenshots, collects console errors, and runs named legs that print PASS or FAIL. It is a Node test helper: no packages, no React, and no DOM types in its API. It needs Node 22 or later (the built-in `WebSocket`) and Chrome on the machine.

**Replaces in run 8:** the Chrome and DevTools parts of `app/scripts/e2e-fake.mjs` (about 80 of its 321 lines: the launch, the `Cdp` class, `key`, `shot`, `leg`, the results and the exit code). It is already taken by `apps/pictures-example/scripts/browser-proof.mjs` (116 lines before, 66 now).

## What this is not

Not a test framework and not a server starter: you start your dev server yourself. Not Playwright: no Firefox or WebKit. `apps/speed-lab/scripts/browser-proof.mjs` (324 lines) uses `playwright-core` for Chromium and WebKit, so it does not move onto this unit as it is; it could only share the leg printing, if `runLegs` were given a Playwright page (it needs only `consoleErrors()` and `screenshot()`).

## API

```js
import { startBrowser, runLegs } from "@kaigilb/gilbplatformcode-browser-proof";

const { page, close } = await startBrowser({ profileDir: "e2e-out/.profile", width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
```

- `startBrowser(opts?)` returns `{ page, close, chrome, profile }`. The profile is a new folder inside `profileDir` (default `.browser-proof` under the current folder, never the system temp folder unless you pass it). Chrome is found from `CHROME`, else the usual place for the system; none is a plain error. `close()` asks Chrome to quit, then ends its process group, then removes the profile; it is safe to call twice and it also runs on process exit. Other options: `width`, `height`, `deviceScaleFactor`, `mobile`, `args`, `domains` (default `Runtime`, `Page`, `Log`), `startupMs`.
- `page.goto(url, { ready?, timeoutMs? })`: opens the address and waits for a complete document, then for the `ready` expression to be truthy. `page.eval(expression)`: runs it in the page (a promise is awaited) and throws the page's error text. `page.waitFor(fnText, timeoutMs = 15000)`: polls every 80 ms; an error in the page counts as "not yet"; the timeout error holds the expression. `page.screenshot(file)`: a PNG, the folder is made. `page.consoleErrors()`: uncaught exceptions, `console.error` calls and error log entries so far. `page.setViewport({ width, height, deviceScaleFactor?, mobile? })`, `page.key("Escape")`, `page.sleep(ms)`, and `page.send(method, params)` for any other protocol command.
- `runLegs(legs, { page, out?, log?, setExitCode?, describeFailure? })`: each leg is `[name, async (page) => {...}]`. It prints `PASS  leg 1  name` or `FAIL  leg 1  name` and the reason. A leg fails when it throws or when the page logged an error while it ran. With `out` it takes `<out>/<n>-<name>.png` after each leg. A failed leg does not stop the next. It ends with `p/t legs PASS`, sets `process.exitCode = 1` on any FAIL, and returns `{ results, failed }`.
- `startBrowser({ headed: true })` opens a visible window (no `--headless=new`, no `--hide-scrollbars`); `keepProfile: true` uses `profileDir` itself (default `.browser-proof/profile`) as the profile and leaves it when closed. `page.waitForHuman(message, readyExpr, timeoutMs = 300000)` prints the message and waits for the expression. See "Headed run" below.
- Also exported: `CdpClient` (the connection; takes a `WebSocketImpl` for a test), `makePage`, `findChrome`, `buildChromeArgs`, `makeTools`, `byTestId`, `collectButtonRows`, `judgeButtonRows`, `classifyButton`, `assertButtonRows`.

## Check button rows

```js
import { assertButtonRows } from "@kaigilb/gilbplatformcode-browser-proof";
for (const [width, height] of [[1280, 800], [390, 844]]) {
  await page.setViewport({ width, height });
  await page.goto("http://localhost:5301/records/1", { ready: "!!document.querySelector('h1')" });
  console.log(`${await assertButtonRows(page)} rows checked at ${width}px`); // throws one Error that lists every broken row
}
```

The rule (RuleUiActionRowMacOrder), for every row of two or more buttons: the row is right-aligned; the positive button is rightmost; Cancel or Close is immediately left of it; a destructive or third action such as Delete sits alone at the far left; when destruction is the row's whole purpose (a "Delete X?" confirm: one negative and one red button, no positive) the red button is rightmost and Cancel is the default; on a phone (480px or narrower) the order stays and the buttons may share the width equally, but on a wider screen buttons stretched across a 2-button or 3-button row (each over 45% or 30% of the row) fail.

A row is any `[data-plan-button-row]` or `.gs-actionrow`, or any element with two or more visible buttons (`button`, `[role=button]`, `a.btn`, `input[type=submit]`) as children or grandchildren on one line. A button is negative when its label is Cancel, Close, No, Back, Not now or Dismiss; destructive when it starts with Delete, Remove, Discard, Erase or Clear, or is red (a red computed colour or background, a class with `danger` or `bad` in it, or `data-danger`); otherwise positive. The violations are `not-right-aligned`, `negative-right-of-positive`, `positive-not-rightmost`, `danger-not-far-left`, `confirm-order` and `stretched`. `assertButtonRows` returns the number of rows it checked, and 0 when it found none, so assert on the count where the page must have rows. It judges at the page's current size, so run it once per size. `collectButtonRows(page)` and `judgeButtonRows(rows, { viewportWidth })` are the two halves, for a test of your own.

Put `data-button-row-ignore` on an element to leave it and everything inside it out of the check (for example a toolbar of tabs that are not actions).

## Headed run (type a sign-in code)

For a step only a person can do, such as typing a one-time code from an email, open a visible window and keep the profile so the sign-in is still there next run:

```js
const { page, close } = await startBrowser({ headed: true, keepProfile: true, profileDir: ".e2e-profile", width: 1280, height: 800 });
await page.goto("https://app.example.test/");
await page.waitForHuman("Type the code from your email in the Chrome window.", "!!document.querySelector('[data-testid=signed-in]')"); // waits up to 5 minutes
```

Keep the profile folder out of git, and do not run two browsers on one kept profile.

## makeTools(page)

Small helpers bound to one page; the waiting ones take a limit in ms (default 15000, 20000 for `waitImage`).

- `exists(sel)`, `wait(sel)`, `gone(sel)`, `click(sel)`.
- `clickText(text, { within?, timeoutMs?, selector? })`: waits for a button, link, tab, menu item, option or label whose text includes `text` (inside the first element matching `within`, if given), then clicks the first.
- `set(sel, value)`: sets an input, textarea or select the way a person would (the native setter, then `input` and `change` events), so React sees it.
- `waitImage(sel)`: the image (or the first `img` inside the element) is complete and has a width: it decoded.
- `setFiles(sel, paths)`: puts files on a file input through the DevTools Protocol.
- `noHorizontalScroll(width?)`: throws with the numbers when the page scrolls sideways (default width: the window's).
- `byTestId(id)`: the selector `[data-testid="id"]`. Also exported on its own.

App-specific steps (a country picker, a menu, the app's rows) stay in the app.

## Example

```js
const { page, close } = await startBrowser({ profileDir: "e2e-out/.profile", width: 390, height: 844, mobile: true });
try {
  await runLegs([
    ["sign-in", async (p) => { await p.goto("http://localhost:5301/", { ready: "!!window.__fake" }); await p.eval("document.querySelector('button').click()"); }],
    ["list", async (p) => { await p.waitFor("document.querySelectorAll('.row-item').length === 3", 10000); }],
  ], { page, out: "e2e-out" });
} finally {
  await close();
}
```

## How to take it

Package `@kaigilb/gilbplatformcode-browser-proof`, as a dev dependency. No peers. Put `install-links=true` in your `.npmrc` so the unit is installed as a copy. It is plain `.mjs`, so a Node script can import it from `node_modules`.

## Where it came from

Round 9 (batch CB2) adds the button-row check (`src/buttonRows.mjs`), headed runs and `waitForHuman`, and `makeTools` (`src/pageTools.mjs`), which absorbs the generic helpers of the run-9 app's `scripts/e2e-lib.mjs` (`exists`, `wait`, `gone`, `click`, `clickText`, `set`, the picture wait, the file-input step, `noHorizontalScroll`, the test-id selector); its app-specific ones (rows, the country picker, the menu, the fixture picture) stay with the app.

New code, written for EESpeed Round 8 (batch CB4) from the Chrome and DevTools code copied in `apps/pictures-example/scripts/browser-proof.mjs`, `apps/speed-lab/scripts/browser-proof.mjs` (the parts that are not Playwright) and the run-8 app's `scripts/e2e-fake.mjs`. Changes: the DevTools port is Chrome's own free port, read from its `DevToolsActivePort` file, not a random number; Chrome runs in its own process group and is asked to quit first, because a plain kill left its helper processes running; the profile is removed in every case; a command that the browser refuses rejects with the browser's message. Repository `KaiGilb/GilbPlatformCode`, commit `a5e8f8cd1ff677b5f1cb2645c4d49f44a6f1823c`.

## Tests

`npm test` (vitest): the row judge from a table of fixtures (record view Edit | Delete, Delete ...... Edit, Save | Cancel, Cancel | Save left and right, both confirm orders, phone equal share, desktop two-up, Delete | Cancel | Save) and one real-Chrome page with a clean and a bad row at 1280 and 390; the headed and headless launch arguments; `waitForHuman`; `makeTools` against a fake page and on a real one; a kept profile; the DevTools client against a fake socket (answers, errors, a close with commands waiting, page errors kept and the rest ignored, event listeners, a refused connection, no WebSocket); the page calls; the leg runner (PASS, FAIL, a page error charged to its own leg only, screenshots, `describeFailure`, exit code); `findChrome`; and one test with a real Chrome on a `data:` page that skips with a message when Chrome is absent. The real test also checks that no Chrome process still uses the profile afterwards.
