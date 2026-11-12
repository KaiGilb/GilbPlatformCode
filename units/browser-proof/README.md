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
- Also exported: `CdpClient` (the connection; takes a `WebSocketImpl` for a test), `makePage`, `findChrome`.

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

New code, written for EESpeed Round 8 (batch CB4) from the Chrome and DevTools code copied in `apps/pictures-example/scripts/browser-proof.mjs`, `apps/speed-lab/scripts/browser-proof.mjs` (the parts that are not Playwright) and the run-8 app's `scripts/e2e-fake.mjs`. Changes: the DevTools port is Chrome's own free port, read from its `DevToolsActivePort` file, not a random number; Chrome runs in its own process group and is asked to quit first, because a plain kill left its helper processes running; the profile is removed in every case; a command that the browser refuses rejects with the browser's message. Repository `KaiGilb/GilbPlatformCode`, commit `a5e8f8cd1ff677b5f1cb2645c4d49f44a6f1823c`.

## Tests

`npm test` (vitest): the DevTools client against a fake socket (answers, errors, a close with commands waiting, page errors kept and the rest ignored, event listeners, a refused connection, no WebSocket); the page calls; the leg runner (PASS, FAIL, a page error charged to its own leg only, screenshots, `describeFailure`, exit code); `findChrome`; and one test with a real Chrome on a `data:` page that skips with a message when Chrome is absent. The real test also checks that no Chrome process still uses the profile afterwards.
