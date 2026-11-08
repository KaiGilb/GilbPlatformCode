// Known answer for run-screen: a local page whose pictures arrive on a clock we chose.
// Serves 127.0.0.1:5262, runs the runner, checks the times, and always stops the server.
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main as runScreen } from "./screen-runner.mjs";

const PORT = 5262;
const BASE = `http://127.0.0.1:${PORT}/`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>screen self</title>
<style>
  html, body { margin: 0; padding: 0; }
  #bar { position: fixed; top: 8px; left: 8px; z-index: 10; }
  #elsewhere { padding: 48px; font: 16px sans-serif; }
  #elsewhere[hidden] { display: none; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { box-sizing: border-box; margin: 0; padding: 0 16px; display: flex; align-items: center; gap: 12px; overflow: hidden; font: 16px sans-serif; border-bottom: 1px solid #eee; }
  img { width: 36px; height: 36px; }
</style>
</head>
<body>
<div id="bar">
  <button type="button" data-testid="go-away">Go away</button>
  <button type="button" data-testid="go-back">Go back</button>
</div>
<div id="elsewhere" hidden>elsewhere</div>
<ul id="list"></ul>
<script>
  const list = document.getElementById("list");
  const elsewhere = document.getElementById("elsewhere");
  let version = 0;
  function delayOf(n) { return 200 + 60 * n; }
  function srcOf(n) {
    const v = version === 0 ? "" : "&v=" + version;
    return "/img?id=" + n + "&delay=" + delayOf(n) + v;
  }
  function showList() {
    list.hidden = false;
    elsewhere.hidden = true;
    window.scrollTo(0, 0);
  }
  function showAway() {
    list.hidden = true;
    elsewhere.hidden = false;
  }
  function build() {
    const h = Math.ceil(window.innerHeight / 11.5);
    list.textContent = "";
    for (let n = 1; n <= 42; n++) {
      const li = document.createElement("li");
      li.setAttribute("data-record-id", "r" + n);
      li.style.height = (n <= 12 ? h : 120) + "px";
      const name = document.createElement("span");
      name.textContent = "Name " + n;
      li.appendChild(name);
      if (n <= 11) {
        const img = document.createElement("img");
        img.alt = "";
        img.loading = "eager";
        img.src = srcOf(n);
        li.appendChild(img);
      } else if (n === 12) {
        const ph = document.createElement("span");
        ph.className = "placeholder";
        li.appendChild(ph);
      }
      list.appendChild(li);
    }
    showList();
  }
  document.querySelector("[data-testid=go-away]").addEventListener("click", showAway);
  document.querySelector("[data-testid=go-back]").addEventListener("click", () => {
    setTimeout(() => {
      version += 1;
      const imgs = list.querySelectorAll("img");
      for (let i = 0; i < imgs.length; i++) {
        const n = i + 1;
        imgs[i].src = srcOf(n);
      }
      showList();
    }, 150);
  });
  setTimeout(build, 300);
</script>
</body>
</html>
`;

function handler(req, res) {
  try {
    const url = new URL(req.url ?? "/", BASE);
    if (url.pathname === "/" || url.pathname === "") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(PAGE);
      return;
    }
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === "/img") {
      const delay = Number(url.searchParams.get("delay"));
      const wait = Number.isFinite(delay) && delay > 0 ? delay : 0;
      setTimeout(() => {
        if (res.destroyed || res.writableEnded) return;
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Content-Length": String(PNG.length),
          "Cache-Control": "public, max-age=3600",
        });
        res.end(PNG);
      }, wait);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(String(e?.message ?? e));
  }
}

function listen() {
  const server = createServer(handler);
  return new Promise((resolve, reject) => {
    const onError = (e) => {
      if (e.code === "EADDRINUSE") reject(new Error(`port ${PORT} is already in use: stop what holds it first`));
      else reject(e);
    };
    server.once("error", onError);
    server.listen(PORT, "127.0.0.1", () => {
      server.removeListener("error", onError);
      server.on("error", (e) => console.error(`screen-self server: ${e.message}`));
      resolve(server);
    });
  });
}

async function stop(server) {
  if (!server) return;
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  await new Promise((resolve) => server.close(() => resolve()));
}

function nums(runs, key) {
  return runs.map((r) => r[key]).join(", ");
}

function judge(result) {
  const runs = result.runs ?? [];
  const checks = [];
  const of = (entry) => runs.filter((r) => r.entry === entry);
  const finished = runs.length > 0 && runs.every((r) => r.timedOut === false);
  checks.push({ ok: finished, text: `every run timedOut === false (${runs.length} runs)` });

  const countsOk = runs.length > 0 && runs.every((r) => {
    const c = r.counts ?? {};
    return typeof c.rows === "number" && c.rows >= 6 && c.rows <= 12 && typeof c.none === "number" && c.none >= 0 && c.broken === 0;
  });
  const countText = runs.map((r) => `${r.entry} ${r.i} rows ${r.counts?.rows} none ${r.counts?.none} broken ${r.counts?.broken}`).join("; ");
  checks.push({ ok: countsOk, text: `counts.rows is 6..12, none >= 0, broken === 0 (${countText || "no runs"})` });

  for (const entry of ["cold", "hard"]) {
    const list = of(entry);
    const ok = list.length > 0 && list.every((r) => typeof r.doneMs === "number" && r.doneMs >= 1000 && r.doneMs <= 4000);
    checks.push({ ok, text: `${entry} doneMs between 1000 and 4000 (${nums(list, "doneMs") || "none"})` });
  }

  const refresh = of("refresh");
  const refreshOk = refresh.length > 0 && refresh.every((r) => typeof r.doneMs === "number" && typeof r.allTextMs === "number" && r.doneMs >= r.allTextMs);
  const refreshText = refresh.map((r) => `done ${r.doneMs} allText ${r.allTextMs}`).join("; ");
  checks.push({ ok: refreshOk, text: `refresh doneMs >= allTextMs (${refreshText || "none"})` });

  const back = of("return");
  const backOk = back.length > 0 && back.every((r) => typeof r.doneMs === "number" && r.doneMs >= 900 && r.doneMs <= 3500);
  checks.push({ ok: backOk, text: `return doneMs between 900 and 3500 (${nums(back, "doneMs") || "none"})` });

  let orderOk = runs.length > 0;
  const orderBits = [];
  for (const r of runs) {
    const triple = [r.doneMs, r.lastFaceMs, r.firstRowMs];
    if (!triple.every((n) => typeof n === "number")) {
      orderOk = false;
      orderBits.push(`${r.entry} ${r.i} missing`);
      continue;
    }
    if (!(r.doneMs >= r.lastFaceMs && r.lastFaceMs >= r.firstRowMs)) orderOk = false;
    orderBits.push(`${r.entry} ${r.i} ${r.doneMs} >= ${r.lastFaceMs} >= ${r.firstRowMs}`);
  }
  checks.push({ ok: orderOk, text: `doneMs >= lastFaceMs >= firstRowMs (${orderBits.join("; ") || "no triple"})` });
  return checks;
}

async function main() {
  let server;
  let code = 1;
  try {
    if (PNG[0] !== 0x89 || PNG[1] !== 0x50) throw new Error("the 1x1 picture is not a png");
    server = await listen();
    const runsDir = process.env.SPEED_LAB_RUNS || mkdtempSync(join(tmpdir(), "speed-lab-screen-"));
    const result = await runScreen([
      "--url", BASE,
      "--app", "screen-self",
      "--rows", "li[data-record-id]",
      "--network", "local",
      "--entries", "cold,hard,refresh,return",
      "--repeat", "2",
      "--quiet", "1500",
      "--away-steps", "click:go-away",
      "--back-steps", "click:go-back",
      "--no-shots",
      "--runs", runsDir,
    ], process.env);
    let ok = result.code === 0;
    if (!ok) console.log(`FAIL runner exit code ${result.code}`);
    for (const c of judge(result)) {
      console.log(`${c.ok ? "PASS" : "FAIL"} ${c.text}`);
      if (!c.ok) ok = false;
    }
    code = ok ? 0 : 1;
  } catch (e) {
    console.error(String(e?.stack ?? e));
    code = 1;
  } finally {
    await stop(server);
  }
  process.exitCode = code;
}

main();
