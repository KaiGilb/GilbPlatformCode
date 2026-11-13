import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CdpClient, findChrome, makePage, runLegs, startBrowser, type WebSocketLike } from "./index.mjs";

/** A socket that answers commands from a table and lets a test push events. */
class FakeSocket implements WebSocketLike {
  static last: FakeSocket;
  onopen: (() => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((m: { data: unknown }) => void) | null = null;
  sent: { id: number; method: string; params: Record<string, unknown> }[] = [];
  answers: Record<string, (params: Record<string, unknown>) => unknown> = {};
  closed = false;
  constructor(public url: string) {
    FakeSocket.last = this;
    queueMicrotask(() => this.onopen?.());
  }
  send(data: string): void {
    const msg = JSON.parse(data);
    this.sent.push(msg);
    const answer = this.answers[msg.method];
    queueMicrotask(() => {
      const r = answer ? answer(msg.params) : {};
      if (r instanceof Error) this.reply({ id: msg.id, error: { message: r.message } });
      else this.reply({ id: msg.id, result: r });
    });
  }
  reply(m: unknown): void {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  close(): void {
    this.closed = true;
    this.onclose?.();
  }
}
const connect = async () => {
  const cdp = new CdpClient("ws://fake", { WebSocketImpl: FakeSocket });
  await cdp.ready;
  return { cdp, sock: FakeSocket.last };
};

describe("CdpClient", () => {
  it("answers a command with its result, numbering the ids", async () => {
    const { cdp, sock } = await connect();
    sock.answers["Runtime.evaluate"] = () => ({ result: { value: 3 } });
    expect(await cdp.send("Runtime.evaluate", { expression: "1+2" })).toEqual({ result: { value: 3 } });
    await cdp.send("Page.enable");
    expect(sock.sent.map((m) => m.id)).toEqual([1, 2]);
    expect(sock.sent[0]).toMatchObject({ method: "Runtime.evaluate", params: { expression: "1+2" } });
  });
  it("rejects with the protocol's message on an error answer", async () => {
    const { cdp, sock } = await connect();
    sock.answers["Page.navigate"] = () => new Error("Cannot navigate");
    await expect(cdp.send("Page.navigate", { url: "x" })).rejects.toThrow("Cannot navigate");
  });
  it("rejects every waiting command when the socket closes", async () => {
    const { cdp, sock } = await connect();
    sock.send = () => undefined; // never answered
    const waiting = cdp.send("Slow.call");
    sock.close();
    await expect(waiting).rejects.toThrow("closed the connection");
  });
  it("keeps uncaught exceptions, console.error and log errors, and ignores console.log and warnings", async () => {
    const { cdp, sock } = await connect();
    sock.reply({ method: "Runtime.exceptionThrown", params: { exceptionDetails: { text: "Uncaught", exception: { description: "TypeError: x is not a function" } } } });
    sock.reply({ method: "Runtime.consoleAPICalled", params: { type: "error", args: [{ value: "boom" }, { description: "Error: b" }] } });
    sock.reply({ method: "Runtime.consoleAPICalled", params: { type: "log", args: [{ value: "fine" }] } });
    sock.reply({ method: "Log.entryAdded", params: { entry: { level: "error", text: "Failed to load", url: "https://x.example.test/a.js" } } });
    sock.reply({ method: "Log.entryAdded", params: { entry: { level: "warning", text: "slow" } } });
    expect(cdp.errors).toEqual([
      "uncaught: Uncaught TypeError: x is not a function",
      "console.error: boom Error: b",
      "log.error: Failed to load https://x.example.test/a.js",
    ]);
  });
  it("calls an event listener and stops after it is removed", async () => {
    const { cdp, sock } = await connect();
    const seen: unknown[] = [];
    const off = cdp.on("Page.loadEventFired", (p) => seen.push(p));
    sock.reply({ method: "Page.loadEventFired", params: { timestamp: 1 } });
    off();
    sock.reply({ method: "Page.loadEventFired", params: { timestamp: 2 } });
    expect(seen).toEqual([{ timestamp: 1 }]);
  });
  it("says so when the connection fails, and when there is no WebSocket", async () => {
    class NeverOpens {
      onopen = null;
      onerror: (() => void) | null = null;
      onclose = null;
      onmessage = null;
      constructor() {
        queueMicrotask(() => this.onerror?.());
      }
      send() {}
      close() {}
    }
    await expect(new CdpClient("ws://nowhere", { WebSocketImpl: NeverOpens as unknown as typeof FakeSocket }).ready).rejects.toThrow("Could not connect");
    expect(() => new CdpClient("ws://x", { WebSocketImpl: null as never })).toThrow("no WebSocket");
  });
});

describe("page", () => {
  const make = async () => {
    const { cdp, sock } = await connect();
    return { page: makePage(cdp), sock, cdp };
  };
  it("eval returns the value and throws the page's error text", async () => {
    const { page, sock } = await make();
    sock.answers["Runtime.evaluate"] = (p) =>
      p.expression === "bad" ? { exceptionDetails: { text: "Uncaught", exception: { description: "ReferenceError: nope" } } } : { result: { value: 42 } };
    expect(await page.eval("6*7")).toBe(42);
    await expect(page.eval("bad")).rejects.toThrow("page eval: ReferenceError: nope");
    expect(sock.sent[0]!.params).toMatchObject({ returnByValue: true, awaitPromise: true });
  });
  it("waitFor returns the first truthy value, treats a page error as not yet, and times out with the expression", async () => {
    const { page, sock } = await make();
    let n = 0;
    sock.answers["Runtime.evaluate"] = () => (++n === 1 ? { exceptionDetails: { text: "x" } } : n === 2 ? { result: { value: false } } : { result: { value: "ready" } });
    expect(await page.waitFor("window.ok", 2000)).toBe("ready");
    sock.answers["Runtime.evaluate"] = () => ({ result: { value: null } });
    await expect(page.waitFor("window.never", 200)).rejects.toThrow("Timed out after 200 ms waiting for: window.never");
  });
  it("goto navigates, waits for a complete document and then the ready expression", async () => {
    const { page, sock } = await make();
    const asked: string[] = [];
    sock.answers["Runtime.evaluate"] = (p) => (asked.push(String(p.expression)), { result: { value: true } });
    await page.goto("https://app.example.test/", { ready: "!!window.__app" });
    expect(sock.sent[0]).toMatchObject({ method: "Page.navigate", params: { url: "https://app.example.test/" } });
    expect(asked).toEqual(["document.readyState === 'complete'", "!!window.__app"]);
  });
  it("goto fails with the browser's reason when the address cannot be opened", async () => {
    const { page, sock } = await make();
    sock.answers["Page.navigate"] = () => ({ errorText: "net::ERR_CONNECTION_REFUSED" });
    await expect(page.goto("https://down.example.test/")).rejects.toThrow("net::ERR_CONNECTION_REFUSED");
  });
  it("screenshot writes the decoded PNG, making the folder", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bp-shot-"));
    try {
      const { page, sock } = await make();
      sock.answers["Page.captureScreenshot"] = () => ({ data: Buffer.from("PNGBYTES").toString("base64") });
      const file = join(dir, "deep", "a.png");
      expect(await page.screenshot(file)).toBe(file);
      expect(readFileSync(file, "utf8")).toBe("PNGBYTES");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("consoleErrors is a copy; setViewport and key send the protocol commands", async () => {
    const { page, sock, cdp } = await make();
    cdp.errors.push("e1");
    const copy = page.consoleErrors();
    copy.push("x");
    expect(page.consoleErrors()).toEqual(["e1"]);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await page.key("Escape");
    expect(sock.sent.map((m) => m.method)).toEqual(["Emulation.setDeviceMetricsOverride", "Input.dispatchKeyEvent", "Input.dispatchKeyEvent"]);
    expect(sock.sent[0]!.params).toEqual({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    expect(sock.sent[1]!.params).toMatchObject({ type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 });
  });
});

describe("runLegs", () => {
  const fakePage = () => {
    const errors: string[] = [];
    const shots: string[] = [];
    return { errors, shots, page: { consoleErrors: () => [...errors], screenshot: async (f: string) => (shots.push(f), f) } };
  };
  afterEach(() => {
    process.exitCode = undefined;
  });

  it("prints PASS for each leg and a summary, and leaves the exit code alone", async () => {
    const { page } = fakePage();
    const lines: string[] = [];
    const r = await runLegs([["one", () => undefined], ["two", async () => undefined]], { page, log: (l) => lines.push(l) });
    expect(lines).toEqual(["PASS  leg 1  one", "PASS  leg 2  two", "2/2 legs PASS"]);
    expect(r.failed).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });
  it("a throwing leg is FAIL with its message, the next leg still runs, and the exit code is 1", async () => {
    const { page } = fakePage();
    const lines: string[] = [];
    const ran: string[] = [];
    const r = await runLegs(
      [
        ["a", () => ran.push("a")],
        ["b", () => { throw new Error("the list was empty"); }],
        ["c", () => ran.push("c")],
      ],
      { page, log: (l) => lines.push(l) },
    );
    expect(ran).toEqual(["a", "c"]);
    expect(lines).toContain("FAIL  leg 2  b\n      the list was empty");
    expect(lines.at(-1)).toBe("2/3 legs PASS, FAIL: 2");
    expect(r.failed.map((x) => x.name)).toEqual(["b"]);
    expect(process.exitCode).toBe(1);
  });
  it("a leg that passes but made the page log an error fails, naming the errors; an earlier leg's errors are not charged to it", async () => {
    const { page, errors } = fakePage();
    errors.push("old: before the legs");
    const lines: string[] = [];
    await runLegs([["quiet", () => undefined], ["noisy", () => void errors.push("console.error: boom")]], { page, log: (l) => lines.push(l), setExitCode: false });
    expect(lines[0]).toBe("PASS  leg 1  quiet");
    expect(lines[1]).toBe("FAIL  leg 2  noisy\n      console errors / uncaught exceptions: console.error: boom");
    expect(process.exitCode).toBeUndefined();
  });
  it("a thrown leg also lists the page errors it caused", async () => {
    const { page, errors } = fakePage();
    const lines: string[] = [];
    await runLegs([["x", () => { errors.push("uncaught: bad"); throw new Error("no row"); }]], { page, log: (l) => lines.push(l), setExitCode: false });
    expect(lines[0]).toBe("FAIL  leg 1  x\n      no row  [page errors: uncaught: bad]");
  });
  it("takes a numbered screenshot after each leg when out is given, pass or fail", async () => {
    const { page, shots } = fakePage();
    await runLegs([["first", () => undefined], ["second", () => { throw new Error("x"); }]], { page, out: "shots", log: () => undefined, setExitCode: false });
    expect(shots).toEqual([join("shots", "1-first.png"), join("shots", "2-second.png")]);
  });
  it("describeFailure adds a line to a failed leg only, and its own error is ignored", async () => {
    const { page } = fakePage();
    const lines: string[] = [];
    await runLegs([["ok", () => undefined], ["bad", () => { throw new Error("r"); }]], { page, log: (l) => lines.push(l), setExitCode: false, describeFailure: () => "last call: GET /x -> 500" });
    expect(lines[0]).toBe("PASS  leg 1  ok");
    expect(lines[1]).toBe("FAIL  leg 2  bad\n      r  [last call: GET /x -> 500]");
    const again: string[] = [];
    await runLegs([["bad", () => { throw new Error("r"); }]], { page, log: (l) => again.push(l), setExitCode: false, describeFailure: () => { throw new Error("help broke"); } });
    expect(again[0]).toBe("FAIL  leg 1  bad\n      r");
  });
  it("accepts { name, run } legs", async () => {
    const { page } = fakePage();
    const lines: string[] = [];
    await runLegs([{ name: "obj", run: () => undefined }], { page, log: (l) => lines.push(l) });
    expect(lines[0]).toBe("PASS  leg 1  obj");
  });
});

describe("findChrome", () => {
  it("uses CHROME when it exists and says null when it does not", () => {
    expect(findChrome({ CHROME: "/opt/c" }, () => true, "linux")).toBe("/opt/c");
    expect(findChrome({ CHROME: "/opt/c" }, () => false, "linux")).toBeNull();
  });
  it("looks in the usual places for the system and returns null when there is none", () => {
    expect(findChrome({}, (p) => p.includes("Google Chrome.app"), "darwin")).toContain("Google Chrome");
    expect(findChrome({}, (p) => p === "/usr/bin/chromium", "linux")).toBe("/usr/bin/chromium");
    expect(findChrome({}, () => false, "linux")).toBeNull();
  });
});

describe("startBrowser without Chrome", () => {
  it("says so in a plain sentence", async () => {
    const saved = process.env.CHROME;
    process.env.CHROME = join(tmpdir(), "no-such-chrome-binary");
    try {
      await expect(startBrowser({ profileDir: join(tmpdir(), "bp-none") })).rejects.toThrow("Chrome was not found");
    } finally {
      if (saved === undefined) delete process.env.CHROME;
      else process.env.CHROME = saved;
    }
  });
});

const chromePath = findChrome();
describe("real Chrome smoke test", () => {
  it.skipIf(!chromePath)("opens a data: page, evaluates, waits, screenshots, catches a console error, and removes its profile", async () => {
    const work = mkdtempSync(join(tmpdir(), "bp-smoke-"));
    try {
      const { page, close, profile } = await startBrowser({ profileDir: join(work, "profiles"), width: 600, height: 400 });
      try {
        const html = "<!doctype html><title>t</title><h1 id=h>hello</h1><script>setTimeout(()=>{document.title='late';console.error('smoke error')},150)</script>";
        await page.goto(`data:text/html,${encodeURIComponent(html)}`, { ready: "!!document.getElementById('h')" });
        expect(await page.eval("document.getElementById('h').textContent")).toBe("hello");
        await page.waitFor("document.title === 'late'", 5000);
        expect(page.consoleErrors().some((e) => e.includes("smoke error"))).toBe(true);
        const png = await page.screenshot(join(work, "shot.png"));
        expect(readFileSync(png).subarray(1, 4).toString()).toBe("PNG");
        expect(existsSync(profile)).toBe(true);
      } finally {
        await close();
        await close(); // twice is fine
      }
      expect(existsSync(profile)).toBe(false);
      if (process.platform !== "win32") expect(spawnSync("pgrep", ["-f", profile]).status, "no Chrome process still uses the profile").toBe(1);
      expect(readdirSync(join(work, "profiles"))).toEqual([]);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }, 60000);
  if (!chromePath) it("(skipped: Chrome was not found on this machine)", () => undefined);
});
