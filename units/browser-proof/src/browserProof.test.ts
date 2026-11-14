import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildChromeArgs, byTestId, CdpClient, findChrome, makePage, makeTools, runLegs, startBrowser, type WebSocketLike } from "./index.mjs";

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

describe("waitForHuman", () => {
  it("prints the message first, then waits for the expression and returns its value", async () => {
    const { cdp, sock } = await connect();
    const lines: string[] = [];
    const page = makePage(cdp, { log: (l) => lines.push(l) });
    let n = 0;
    sock.answers["Runtime.evaluate"] = () => ({ result: { value: ++n < 3 ? false : "signed-in" } });
    expect(await page.waitForHuman("Type the code you were sent.", "!!window.__user")).toBe("signed-in");
    expect(lines).toEqual(["Type the code you were sent."]);
    expect(n).toBe(3);
  });
  it("gives up after its own time limit with the expression in the error, and defaults to five minutes", async () => {
    const { cdp, sock } = await connect();
    const page = makePage(cdp, { log: () => undefined });
    sock.answers["Runtime.evaluate"] = () => ({ result: { value: false } });
    await expect(page.waitForHuman("m", "window.never", 150)).rejects.toThrow("Timed out after 150 ms waiting for: window.never");
    expect(String(page.waitForHuman)).toContain("timeoutMs = 300000");
  });
});

describe("Chrome launch arguments", () => {
  it("headless by default: --headless=new and --hide-scrollbars, a free debugging port, the profile, then the extras and the blank page", () => {
    expect(buildChromeArgs({ args: ["--lang=en"] }, "/p")).toEqual(["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--remote-debugging-port=0", "--user-data-dir=/p", "--lang=en", "about:blank"]);
    expect(buildChromeArgs(undefined, "/p")).toContain("--headless=new");
  });
  it("headed drops --headless=new and --hide-scrollbars and keeps the rest", () => {
    const a = buildChromeArgs({ headed: true, args: ["--lang=en"] }, "/p");
    expect(a).toEqual(["--disable-gpu", "--no-first-run", "--remote-debugging-port=0", "--user-data-dir=/p", "--lang=en", "about:blank"]);
    expect(a.some((x) => x.startsWith("--headless"))).toBe(false);
    expect(a).not.toContain("--hide-scrollbars");
  });
});

describe("makeTools (a fake page)", () => {
  const fake = () => {
    const evals: string[] = [];
    const waits: Array<[string, number | undefined]> = [];
    const sent: Array<[string, any]> = [];
    let evalAnswer: unknown = true;
    const tools = makeTools({
      eval: async (e: string) => (evals.push(e), evalAnswer),
      waitFor: async (e: string, ms?: number) => (waits.push([e, ms]), true),
      send: async (m: string, p?: any) => (sent.push([m, p]), m === "DOM.getDocument" ? { root: { nodeId: 1 } } : m === "DOM.querySelector" ? { nodeId: p.selector === "#none" ? 0 : 7 } : {}),
    });
    return { tools, evals, waits, sent, answer: (v: unknown) => (evalAnswer = v) };
  };
  it("exists, wait and gone ask for the selector, quoted, with a 15 s default", async () => {
    const { tools, evals, waits } = fake();
    await tools.exists('a[title="x"]');
    await tools.wait("#a");
    await tools.gone("#a", 500);
    expect(evals).toEqual([`!!document.querySelector(${JSON.stringify('a[title="x"]')})`]);
    expect(waits).toEqual([['!!document.querySelector("#a")', 15000], ['!document.querySelector("#a")', 500]]);
  });
  it("click waits for the element and then clicks it", async () => {
    const { tools, evals, waits } = fake();
    await tools.click("#go");
    expect(waits[0]![0]).toContain('querySelector("#go")');
    expect(evals).toEqual(['document.querySelector("#go").click()']);
  });
  it("clickText looks for text in clickable things, optionally within a part of the page, and clicks the first", async () => {
    const { tools, evals, waits } = fake();
    await tools.clickText("Save", { within: "#dialog", timeoutMs: 900 });
    expect(waits[0]![1]).toBe(900);
    expect(waits[0]![0]).toContain('document.querySelector("#dialog")');
    expect(waits[0]![0]).toContain('.includes("Save")');
    expect(evals[0]).toMatch(/\.click\(\)$/);
    await tools.clickText("Save");
    expect(waits[1]![0]).toContain("const root = document;");
  });
  it("set uses the native setter and sends input and change events", async () => {
    const { tools, evals, waits } = fake();
    await tools.set("#name", 'Ann "A"');
    expect(waits[0]![0]).toContain('"#name"');
    expect(evals[0]).toContain("HTMLInputElement.prototype");
    expect(evals[0]).toContain("HTMLSelectElement.prototype");
    expect(evals[0]).toContain("HTMLTextAreaElement.prototype");
    expect(evals[0]).toContain('getOwnPropertyDescriptor(proto, "value").set.call');
    expect(evals[0]).toContain(JSON.stringify('Ann "A"'));
    expect(evals[0]).toContain('new Event("input", { bubbles: true })');
    expect(evals[0]).toContain('new Event("change", { bubbles: true })');
  });
  it("waitImage waits for complete and a real width, with 20 s by default", async () => {
    const { tools, waits } = fake();
    await tools.waitImage("#pic");
    expect(waits[0]![1]).toBe(20000);
    expect(waits[0]![0]).toContain("i.complete && i.naturalWidth > 0");
  });
  it("setFiles puts the paths on the input through the protocol, one path or a list, and says when there is no input", async () => {
    const { tools, sent } = fake();
    await tools.setFiles("input[type=file]", "/tmp/a.jpg");
    await tools.setFiles("input[type=file]", ["/tmp/a.jpg", "/tmp/b.jpg"]);
    expect(sent.map(([m]) => m)).toEqual(["DOM.getDocument", "DOM.querySelector", "DOM.setFileInputFiles", "DOM.getDocument", "DOM.querySelector", "DOM.setFileInputFiles"]);
    expect(sent[2]![1]).toEqual({ nodeId: 7, files: ["/tmp/a.jpg"] });
    expect(sent[5]![1]).toEqual({ nodeId: 7, files: ["/tmp/a.jpg", "/tmp/b.jpg"] });
    await expect(tools.setFiles("#none", "/x")).rejects.toThrow("no file input for #none");
  });
  it("noHorizontalScroll throws with the numbers when the page is wider than the width, and uses the window's width when none is given", async () => {
    const { tools, answer } = fake();
    answer({ doc: 400, body: 390, inner: 390 });
    await expect(tools.noHorizontalScroll(390)).rejects.toThrow('horizontal scroll: {"doc":400,"body":390,"inner":390} (wanted <= 390)');
    await expect(tools.noHorizontalScroll()).rejects.toThrow("wanted <= 390");
    await expect(tools.noHorizontalScroll(400)).resolves.toBeUndefined();
    answer({ doc: 390, body: 395, inner: 390 });
    await expect(tools.noHorizontalScroll(390)).rejects.toThrow("horizontal scroll");
  });
  it("byTestId builds the attribute selector", () => {
    expect(byTestId("add")).toBe('[data-testid="add"]');
    expect(fake().tools.byTestId("x")).toBe('[data-testid="x"]');
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

  it.skipIf(!chromePath)("makeTools drives a real page: wait, click, clickText, set, waitImage, setFiles, gone, noHorizontalScroll", async () => {
    const work = mkdtempSync(join(tmpdir(), "bp-tools-"));
    try {
      const { page, close } = await startBrowser({ profileDir: join(work, "profiles"), width: 390, height: 600 });
      try {
        const t = makeTools(page);
        const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        const html = `<!doctype html><body><input id=n><select id=s><option value=a>A</option><option value=b>B</option></select><textarea id=ta></textarea>
          <input type=file id=f multiple><div id=out></div><div data-testid="box"><img id=pic src="data:image/png;base64,${png}"></div>
          <div id=dlg><button onclick="document.getElementById('out').textContent+='dlg;'">Save</button></div><button onclick="document.getElementById('out').textContent+='top;'">Save</button>
          <button id=rm onclick="this.remove()">Remove me</button>
          <script>window.seen=[];for (const id of ['n','s','ta']) for (const ev of ['input','change']) document.getElementById(id).addEventListener(ev, e => seen.push(id+':'+ev+':'+e.target.value));
          setTimeout(()=>{const d=document.createElement('p');d.id='late';document.body.append(d)},200)</script>`;
        await page.goto(`data:text/html,${encodeURIComponent(html)}`);
        expect(await t.exists("#n")).toBe(true);
        expect(await t.exists("#nope")).toBe(false);
        await t.wait("#late", 5000);
        await t.set("#n", "Ann");
        await t.set("#s", "b");
        await t.set("#ta", "long text");
        expect(await page.eval("document.getElementById('n').value + document.getElementById('s').value + document.getElementById('ta').value")).toBe("Annblong text");
        expect(await page.eval("seen")).toEqual(["n:input:Ann", "n:change:Ann", "s:input:b", "s:change:b", "ta:input:long text", "ta:change:long text"]);
        await t.clickText("Save", { within: "#dlg" });
        expect(await page.eval("document.getElementById('out').textContent")).toBe("dlg;");
        await t.clickText("Save");
        expect(await page.eval("document.getElementById('out').textContent")).toBe("dlg;dlg;");
        await t.click("#rm");
        await t.gone("#rm", 2000);
        await t.waitImage(byTestId("box"), 5000);
        await t.waitImage("#pic", 5000);
        const a = join(work, "a.txt");
        const b = join(work, "b.txt");
        writeFileSync(a, "a");
        writeFileSync(b, "bb");
        await t.setFiles("#f", [a, b]);
        expect(await page.eval("[...document.getElementById('f').files].map(f => f.name + ':' + f.size).join()")).toBe("a.txt:1,b.txt:2");
        await t.noHorizontalScroll(390);
        await page.eval("document.body.insertAdjacentHTML('beforeend','<div style=\"width:900px;height:5px\"></div>')");
        await expect(t.noHorizontalScroll(390)).rejects.toThrow("horizontal scroll");
      } finally {
        await close();
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }, 60000);

  it.skipIf(!chromePath)("keepProfile keeps the profile folder after close and uses it again on the next start", async () => {
    const work = mkdtempSync(join(tmpdir(), "bp-keep-"));
    const dir = join(work, "kept");
    try {
      const first = await startBrowser({ profileDir: dir, keepProfile: true });
      expect(first.profile).toBe(dir);
      await first.page.goto("data:text/html,<title>one</title>");
      await first.close();
      expect(existsSync(dir)).toBe(true);
      expect(existsSync(join(dir, "Default"))).toBe(true);
      const second = await startBrowser({ profileDir: dir, keepProfile: true });
      try {
        expect(second.profile).toBe(dir);
        expect(await second.page.eval("1+1")).toBe(2);
      } finally {
        await second.close();
      }
      expect(existsSync(dir)).toBe(true);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }, 60000);

});
