// A small headless-Chrome harness for an app's end-to-end proof: launch Chrome with a throwaway profile, talk to it over the DevTools
// Protocol, drive a page, take screenshots, collect console errors, and run named legs that print PASS or FAIL.
// Node 22 or later (it uses the built-in WebSocket and fetch). No packages. Not for app code that ships: it is a test helper.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export { assertButtonRows, classifyButton, collectButtonRows, judgeButtonRows } from "./buttonRows.mjs";
export { byTestId, makeTools } from "./pageTools.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Where Chrome is: `CHROME` when set, else the usual place for this system. Returns null when none of them exists. */
export function findChrome(env = process.env, exists = existsSync, platform = process.platform) {
  const named = env.CHROME;
  if (named) return exists(named) ? named : null;
  const candidates =
    platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
      : platform === "win32"
        ? [
            join(env.PROGRAMFILES ?? "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
            join(env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
            join(env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
          ]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"];
  return candidates.find((c) => exists(c)) ?? null;
}

/**
 * A DevTools Protocol connection. `send` answers with the command's result and rejects with the protocol's message on an error or
 * when the socket closes first. Page errors (an uncaught exception, `console.error`, a log entry at level error) are kept in `errors`.
 * `WebSocketImpl` is for a test; it defaults to the built-in WebSocket.
 */
export class CdpClient {
  constructor(url, { WebSocketImpl = globalThis.WebSocket } = {}) {
    if (typeof WebSocketImpl !== "function") throw new Error("This Node has no WebSocket. Use Node 22 or later.");
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.listeners = new Map();
    this.ws = new WebSocketImpl(url);
    this.ready = new Promise((resolveReady, rejectReady) => {
      this.ws.onopen = () => resolveReady();
      this.ws.onerror = () => rejectReady(new Error(`Could not connect to Chrome at ${url}.`));
    });
    this.ws.onclose = () => {
      for (const { reject } of this.pending.values()) reject(new Error("Chrome closed the connection."));
      this.pending.clear();
    };
    this.ws.onmessage = (m) => this.#message(JSON.parse(typeof m.data === "string" ? m.data : String(m.data)));
  }

  #message(d) {
    if (d.id !== undefined && this.pending.has(d.id)) {
      const { resolve: ok, reject } = this.pending.get(d.id);
      this.pending.delete(d.id);
      if (d.error) reject(new Error(`${d.error.message ?? "protocol error"}${d.error.data ? ` (${d.error.data})` : ""}`));
      else ok(d.result ?? {});
      return;
    }
    const p = d.params ?? {};
    if (d.method === "Runtime.exceptionThrown") {
      this.errors.push(`uncaught: ${p.exceptionDetails?.text ?? ""} ${p.exceptionDetails?.exception?.description ?? ""}`.trim().slice(0, 400));
    } else if (d.method === "Runtime.consoleAPICalled" && p.type === "error") {
      this.errors.push(`console.error: ${(p.args ?? []).map((a) => a.value ?? a.description).join(" ")}`.slice(0, 400));
    } else if (d.method === "Log.entryAdded" && p.entry?.level === "error") {
      this.errors.push(`log.error: ${p.entry.text} ${p.entry.url ?? ""}`.trim().slice(0, 400));
    }
    for (const fn of this.listeners.get(d.method) ?? []) fn(p);
  }

  /** Runs `fn(params)` for each event of this name; returns a function that stops it. */
  on(method, fn) {
    const set = this.listeners.get(method) ?? new Set();
    set.add(fn);
    this.listeners.set(method, set);
    return () => set.delete(fn);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolveSend, reject) => {
      this.pending.set(id, { resolve: resolveSend, reject });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (e) {
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}

/** The page: what a leg uses. Built on a connected `CdpClient`. `log` is where `waitForHuman` prints its message. */
export function makePage(cdp, { log = console.log } = {}) {
  const page = {
    /** Any protocol command, for what the page object does not cover. */
    send: (method, params) => cdp.send(method, params),
    /** Runs the expression in the page (a promise is awaited) and returns its value. Throws the page's error text when it throws. */
    async eval(expression) {
      const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`page eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result?.value;
    },
    /** Polls the expression every 80 ms until it is truthy and returns that value. Throws after `timeoutMs` (default 15000). An error in the page counts as "not yet". */
    async waitFor(fnText, timeoutMs = 15000) {
      const t0 = Date.now();
      for (;;) {
        const v = await page.eval(fnText).catch(() => false);
        if (v) return v;
        if (Date.now() - t0 >= timeoutMs) throw new Error(`Timed out after ${timeoutMs} ms waiting for: ${fnText}`);
        await sleep(80);
      }
    },
    /** Opens the address and waits until the document is complete and, when `ready` (an expression) is given, until that is truthy. */
    async goto(url, { ready, timeoutMs = 15000 } = {}) {
      const r = await cdp.send("Page.navigate", { url });
      if (r.errorText) throw new Error(`Could not open ${url}: ${r.errorText}`);
      await page.waitFor("document.readyState === 'complete'", timeoutMs);
      if (ready) await page.waitFor(ready, timeoutMs);
    },
    /** Writes a PNG of the page to `file` (the folder is made) and returns the path. */
    async screenshot(file) {
      const png = await cdp.send("Page.captureScreenshot", { format: "png" });
      mkdirSync(dirname(resolve(file)), { recursive: true });
      writeFileSync(file, Buffer.from(png.data, "base64"));
      return file;
    },
    /** The page's errors so far: uncaught exceptions, console.error calls and error log entries. A copy. */
    consoleErrors: () => [...cdp.errors],
    /** Sets the window size the page sees. */
    setViewport: ({ width, height, deviceScaleFactor = 1, mobile = false }) =>
      cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile }),
    /** Presses and releases a key (for example "Escape"). */
    async key(k) {
      const code = k === "Escape" ? 27 : 0;
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k, windowsVirtualKeyCode: code });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: code });
    },
    /** Prints the message, then waits (default five minutes) until the expression is truthy: for a step only a person can do, such as typing a sign-in code into a headed window. */
    async waitForHuman(message, readyExpr, timeoutMs = 300000) {
      log(message);
      return page.waitFor(readyExpr, timeoutMs);
    },
    sleep,
  };
  return page;
}

/** The command-line arguments for Chrome: headless by default; `headed` drops `--headless=new` and `--hide-scrollbars` so a person can use the window. */
export function buildChromeArgs({ headed = false, args = [] } = {}, profile) {
  return [
    ...(headed ? [] : ["--headless=new"]),
    "--disable-gpu",
    ...(headed ? [] : ["--hide-scrollbars"]),
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    ...args,
    "about:blank",
  ];
}

/**
 * Starts headless Chrome with a new profile inside `profileDir` (default `.browser-proof` under the current folder; never the system
 * temp folder unless you pass it), connects to its first page and turns on the protocol domains (`domains`, default Runtime, Page and Log;
 * without Log, a failed resource load such as a missing favicon is not counted as a page error).
 * `headed: true` opens a visible window (for a step a person must do; see `page.waitForHuman`). `keepProfile: true` uses `profileDir`
 * itself as the profile (default `.browser-proof/profile`) and leaves it when closed, so a sign-in survives to the next run; do not
 * run two browsers on one kept profile.
 * `close()` stops Chrome and removes the profile (unless kept); it is safe to call twice and it also runs when the process exits.
 * Throws a plain sentence when Chrome cannot be found or does not start.
 *
 * @param {{ chrome?: string, headed?: boolean, keepProfile?: boolean, profileDir?: string, domains?: string[], width?: number, height?: number, deviceScaleFactor?: number, mobile?: boolean, args?: string[], startupMs?: number }} [opts]
 */
export async function startBrowser(opts = {}) {
  const chrome = opts.chrome ?? findChrome();
  if (!chrome) throw new Error("Chrome was not found. Install it or set CHROME to its path.");
  const keep = opts.keepProfile === true;
  const base = resolve(opts.profileDir ?? join(process.cwd(), ".browser-proof", ...(keep ? ["profile"] : [])));
  mkdirSync(base, { recursive: true });
  const profile = keep ? base : mkdtempSync(join(base, "chrome-"));
  // A kept profile still holds the port of the last run; Chrome writes a new one.
  if (keep) rmSync(join(profile, "DevToolsActivePort"), { force: true });
  // Its own process group, so that stopping Chrome stops its helper processes too (a plain kill leaves them running).
  const child = spawn(chrome, buildChromeArgs(opts, profile), { stdio: "ignore", detached: process.platform !== "win32" });
  let exited = child.exitCode !== null;
  child.once("exit", () => (exited = true));
  child.once("error", () => (exited = true));
  let cdp = null;
  let closed = false;
  const stop = () => {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      /* gone already */
    }
  };
  const removeProfile = () => keep || rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  const onExit = () => {
    stop();
    try {
      removeProfile();
    } catch {
      /* best effort at exit */
    }
  };
  process.once("exit", onExit);
  const close = async () => {
    if (closed) return;
    closed = true;
    process.removeListener("exit", onExit);
    // Ask Chrome to quit first (it then stops its helpers itself); after two seconds, or when it cannot be asked, kill the group.
    if (cdp && !exited) await Promise.race([cdp.send("Browser.close").catch(() => undefined), sleep(2000)]);
    for (let i = 0; i < 40 && !exited; i++) await sleep(50);
    cdp?.close();
    stop();
    for (let i = 0; i < 50 && !exited; i++) await sleep(50);
    removeProfile();
  };

  try {
    // Chrome picks a free port and writes it, first line, to DevToolsActivePort in the profile.
    const limit = Date.now() + (opts.startupMs ?? 20000);
    let port = null;
    while (port === null) {
      if (exited) throw new Error("Chrome stopped while starting.");
      if (Date.now() > limit) throw new Error("Chrome did not start in time.");
      try {
        const n = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
        if (Number.isInteger(n) && n > 0) port = n;
      } catch {
        /* not written yet */
      }
      if (port === null) await sleep(100);
    }
    let wsUrl = null;
    while (wsUrl === null) {
      if (Date.now() > limit) throw new Error("Chrome did not offer a page in time.");
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null;
      } catch {
        /* not up yet */
      }
      if (wsUrl === null) await sleep(100);
    }
    cdp = new CdpClient(wsUrl);
    await cdp.ready;
    for (const domain of opts.domains ?? ["Runtime", "Page", "Log"]) await cdp.send(`${domain}.enable`);
    const page = makePage(cdp);
    if (opts.width && opts.height) await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: opts.deviceScaleFactor ?? 1, mobile: opts.mobile ?? false });
    return { page, close, chrome, profile };
  } catch (e) {
    await close();
    throw e;
  }
}

/**
 * Runs the legs one after another and prints `PASS  leg 1  name` or `FAIL  leg 1  name` with the reason beneath. A leg fails when it
 * throws or when the page logged an error while it ran. Each leg is numbered from 1; with `out`, a screenshot `<out>/<n>-<name>.png`
 * is taken after it, pass or fail. A failed leg does not stop the next. At the end it prints `p/t legs PASS`, and sets
 * `process.exitCode = 1` when any failed (unless `setExitCode` is false).
 *
 * @param {Array<[string, (page: any) => unknown] | { name: string, run: (page: any) => unknown }>} legs
 * @param {{ page: any, out?: string, log?: (line: string) => void, setExitCode?: boolean, describeFailure?: (page: any) => Promise<string | null> | string | null }} opts
 * `describeFailure` may add a line to a failed leg (for example the last refused platform calls).
 */
export async function runLegs(legs, { page, out, log = console.log, setExitCode = true, describeFailure } = {}) {
  const results = [];
  let n = 0;
  for (const leg of legs) {
    n++;
    const [name, run] = Array.isArray(leg) ? leg : [leg.name, leg.run];
    const before = page.consoleErrors().length;
    let status = "PASS";
    let detail = "";
    try {
      await run(page);
      const errs = page.consoleErrors().slice(before);
      if (errs.length) throw new Error(`console errors / uncaught exceptions: ${errs.join(" | ")}`);
    } catch (e) {
      status = "FAIL";
      detail = e instanceof Error ? e.message : String(e);
      const errs = page.consoleErrors().slice(before);
      if (errs.length && !detail.includes("console errors")) detail += `  [page errors: ${errs.join(" | ")}]`;
      try {
        const extra = describeFailure ? await describeFailure(page) : null;
        if (extra) detail += `  [${extra}]`;
      } catch {
        /* the extra line is a help, not a reason */
      }
    }
    if (out) await page.screenshot(join(out, `${n}-${name}.png`)).catch(() => undefined);
    results.push({ n, name, status, detail });
    log(`${status}  leg ${n}  ${name}${detail ? `\n      ${detail}` : ""}`);
  }
  const failed = results.filter((r) => r.status !== "PASS");
  log(`${results.length - failed.length}/${results.length} legs PASS${failed.length ? `, FAIL: ${failed.map((r) => r.n).join(", ")}` : ""}`);
  if (failed.length && setExitCode) process.exitCode = 1;
  return { results, failed };
}
