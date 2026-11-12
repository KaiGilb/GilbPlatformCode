import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync, copyFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEST = dirname(fileURLToPath(import.meta.url));
const HERE = join(TEST, "..");
const ROOT = join(HERE, "..", "..");
const OUT = join(HERE, "out");
const W = join(HERE, "write-refdocs.mjs");
const CHECK = join(HERE, "check-dry-run.mjs");
const BUILD = join(HERE, "build-input.mjs");
const MOCK = pathToFileURL(join(TEST, "mock-fetch.mjs")).href;
const FIXTURE_SRC = join(TEST, "fixture-refdocs-input.json");
const TOKEN = "T".repeat(60);

const run = (args, env = {}) =>
  spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });

function sandbox(name) {
  const dir = join(OUT, "test-" + name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const fixture = join(dir, "refdocs-input.json");
  copyFileSync(FIXTURE_SRC, fixture);
  const tok = join(dir, "token");
  return { dir, fixture, tok, clean: () => rmSync(dir, { recursive: true, force: true }) };
}
const receiptOf = (stdout) => {
  const a = stdout.indexOf('{\n "stance"');
  const end = stdout.indexOf("\n}\n", a);
  return JSON.parse(stdout.slice(a, end + 2));
};
const fixtureUnits = JSON.parse(readFileSync(FIXTURE_SRC, "utf8")).units;
const mockRun = (s, env) => run(["--import", MOCK, W, "--token-file", s.tok, "--input", s.fixture], env);

test("T1 dry-run shape checks pass", () => {
  const s = sandbox("t1");
  try {
    const r = run([W, "--dry-run", "--input", s.fixture]);
    assert.equal(r.status, 0);
    const dryOut = join(s.dir, "dry-run.out");
    writeFileSync(dryOut, r.stdout);
    const c = run([CHECK, "--input", s.fixture, "--dry-out", dryOut]);
    assert.equal(c.status, 0, c.stdout);
    assert.match(c.stdout, /ALL PASS/);
  } finally { s.clean(); }
});

test("T2 dry-run reads no key", () => {
  const s = sandbox("t2");
  try {
    writeFileSync(s.tok, TOKEN);
    const r = run([W, "--dry-run", "--token-file", s.tok, "--input", s.fixture]);
    assert.equal(r.status, 0);
    // Unchanged b16 behaviour (differs from the brief): the exit handler deletes the key file even on a dry run,
    // and prints "key file deleted" after the footer. The footer is the line before it; nothing was sent.
    const lines = r.stdout.trimEnd().split("\n");
    assert.equal(lines.at(-1), "key file deleted");
    assert.equal(lines.at(-2), "dry-run: nothing sent, no key read");
    assert.ok(!existsSync(s.tok));
    assert.ok(!/"state"|Bearer/.test(r.stdout));
  } finally { s.clean(); }
});

test("T3 mock run ok", () => {
  const s = sandbox("t3");
  try {
    writeFileSync(s.tok, TOKEN);
    const r = mockRun(s);
    // Exit is 1, not 0: the writer sets failed=true when it skips an already-present tag (unchanged b16 behaviour).
    assert.equal(r.status, 1, r.stdout.slice(-500));
    // 46 units x 2 items = 92; t:Value.graph is the one seeded exact tag -> 2 not-created; 45 x 2 = 90 created.
    const expectSkipped = fixtureUnits.filter((u) => u.tag === "t:Value.graph").length;
    assert.equal(expectSkipped, 1);
    const n = fixtureUnits.length;
    const rc = receiptOf(r.stdout);
    assert.deepEqual(rc.counts, { created: (n - expectSkipped) * 2, "not-created": expectSkipped * 2, unknown: 0, "never-sent": 0 });
    assert.deepEqual(rc.counts, { created: 90, "not-created": 2, unknown: 0, "never-sent": 0 });
    assert.ok(!existsSync(s.tok));
    assert.match(r.stdout, /key file deleted/);
  } finally { s.clean(); }
});

test("T4 key deleted on refusal", () => {
  const s = sandbox("t4");
  try {
    writeFileSync(s.tok, "short");
    const r = run([W, "--token-file", s.tok, "--input", s.fixture]);
    assert.equal(r.status, 2);
    assert.match(r.stdout, /REFUSED before any request/);
    assert.ok(!existsSync(s.tok));
  } finally { s.clean(); }
});

test("T5 key deleted on crash before input", () => {
  const s = sandbox("t5");
  try {
    writeFileSync(s.tok, TOKEN);
    const r = run([W, "--token-file", s.tok, "--input", join(s.dir, "does-not-exist.json")]);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /crash:/);
    assert.match(r.stdout, /key file deleted/);
    assert.ok(!existsSync(s.tok));
  } finally { s.clean(); }
});

test("T6 badpartof -> every made unit unknown", () => {
  const s = sandbox("t6");
  try {
    writeFileSync(s.tok, TOKEN);
    const r = mockRun(s, { MOCK_MODE: "badpartof" });
    assert.equal(r.status, 1);
    const rc = receiptOf(r.stdout);
    const docs = Object.entries(rc.items).filter(([k]) => k.endsWith(" doc") && !rc.items[k].reason?.includes("already present"));
    const made = docs.filter(([, v]) => v.state !== "not-created");
    assert.equal(made.length, 45);
    assert.ok(made.every(([, v]) => v.state === "unknown"));
    assert.ok(!existsSync(s.tok));
  } finally { s.clean(); }
});

test("T7 noexhibit -> no created docs", () => {
  const s = sandbox("t7");
  try {
    writeFileSync(s.tok, TOKEN);
    const r = mockRun(s, { MOCK_MODE: "noexhibit" });
    assert.equal(r.status, 1);
    const rc = receiptOf(r.stdout);
    assert.ok(!Object.entries(rc.items).some(([k, v]) => k.endsWith(" doc") && v.state === "created"));
  } finally { s.clean(); }
});

test("T8 exact-tag match: t:Level.date is created despite t:Level.dat and t:Level.dateX", () => {
  const s = sandbox("t8");
  try {
    writeFileSync(s.tok, TOKEN);
    const r = mockRun(s);
    const rc = receiptOf(r.stdout);
    assert.equal(rc.items["t:Level.date doc"].state, "created");
    assert.equal(rc.items["t:Value.graph doc"].state, "not-created");
  } finally { s.clean(); }
});

// The fixture was built when main was at 0ff75e2 (342f585 gives the same bytes: no unit folder changed between them).
// Pinned there, a later main cannot break the test. PR #52 added units/<x>/unit.json to 53 folders, which moved each
// folder's latest commit (the pin); the 44 written exhibits keep the older pins, which stay valid ancestors.
const FIXTURE_MAIN = "0ff75e204aff064b7e0ea788136a0480f5fabffc";
test("T9 build-input offline is byte-identical to the b16 input", () => {
  const r = run([BUILD, "--no-fetch", "--main", FIXTURE_MAIN]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout.split("\n")[0], new RegExp("^" + FIXTURE_MAIN + " at [0-9a-f]{40}$"));
  const got = readFileSync(join(OUT, "refdocs-input.json"));
  // Units added to the fixture after the pin are not on main at the pin, so the build leaves them out; compare without them.
  const ADDED_AFTER_PIN = new Set(["style-runtime", "style-studio"]);
  const fx = JSON.parse(readFileSync(FIXTURE_SRC, "utf8"));
  const atPin = Buffer.from(JSON.stringify({ ...fx, units: fx.units.filter((u) => !ADDED_AFTER_PIN.has(u.folder)) }, null, 1) + "\n");
  // Units admitted to library.json after the fixture was made, whose folders already exist at the pin: the build includes them, the fixture does not.
  const ADMITTED_AFTER_FIXTURE = new Set(["vault-list", "vault-address", "photo-ref", "lws-session-bridge"]);
  const built = JSON.parse(got.toString("utf8"));
  const gotAtFixture = Buffer.from(JSON.stringify({ ...built, units: built.units.filter((u) => !ADMITTED_AFTER_FIXTURE.has(u.folder)) }, null, 1) + "\n");
  assert.ok(gotAtFixture.equals(atPin), "built input differs from the fixture");
});

test("T9b a run on 900e918 (after unit.json moved the pins) differs from the fixture", () => {
  const r = run([BUILD, "--no-fetch", "--main", "900e918"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const got = readFileSync(join(OUT, "refdocs-input.json"));
  assert.ok(!got.equals(readFileSync(FIXTURE_SRC)), "expected moved pins to differ from the fixture");
});

test("T10 piped dry run keeps its last line, 5 times", () => {
  const s = sandbox("t10");
  try {
    for (let i = 0; i < 5; i++) {
      const r = run([W, "--dry-run", "--input", s.fixture]);
      assert.equal(r.status, 0);
      assert.ok(r.stdout.length > 50000, "output should be large enough to need several pipe writes");
      assert.equal(r.stdout.trimEnd().split("\n").at(-1), "dry-run: nothing sent, no key read", `run ${i}`);
    }
  } finally { s.clean(); }
});

test("T11 piped mock run prints a whole receipt and deletes the key, 5 times", () => {
  const s = sandbox("t11");
  try {
    for (let i = 0; i < 5; i++) {
      writeFileSync(s.tok, TOKEN);
      const r = mockRun(s);
      const rc = receiptOf(r.stdout);
      const total = Object.values(rc.counts).reduce((a, b) => a + b, 0);
      assert.equal(total, Object.keys(rc.items).length, `run ${i}`);
      assert.equal(total, fixtureUnits.length * 2, `run ${i}`);
      assert.ok(!existsSync(s.tok), `run ${i}: token file still there`);
      assert.equal(r.stdout.trimEnd().split("\n").at(-1), "key file deleted", `run ${i}`);
    }
  } finally { s.clean(); }
});

// ---- website units (web-units/ -> GilbWebsiteCode Library) --------------------------------------------------------
const WEB_LIB = "https://appbuilder.gilb.com/base/e/gilbwebsitecode-library-06gn66j0enwkqfhm364trebtkm";
const PLAT_LIB = "https://appbuilder.gilb.com/base/e/gilbplatformcode-library-06gjdp49a9sm10t4hgdme4agwm";
// A throwaway repo with one unit in each tree (and, on request, one folder name in both), pinned with --main HEAD.
function tinyRepo(name, { both = false } = {}) {
  const s = sandbox(name);
  const repo = join(s.dir, "repo");
  const git = (...a) => { const r = spawnSync("git", ["-C", repo, ...a], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  mkdirSync(repo, { recursive: true });
  git("init", "-q");
  const unit = (tree, folder, pkg) => {
    mkdirSync(join(repo, tree, folder), { recursive: true });
    writeFileSync(join(repo, tree, folder, "package.json"), JSON.stringify({ name: pkg }));
    writeFileSync(join(repo, tree, folder, "README.md"), `# ${folder}\n\n## What this is\n\nDoes the ${folder} thing. More words.\n`);
  };
  unit("units", "alpha", "@kaigilb/gilbplatformcode-alpha");
  unit("web-units", "beta", "@kaigilb/gilbwebsitecode-beta");
  if (both) { unit("units", "beta", "@kaigilb/gilbplatformcode-beta"); }
  git("add", "-A"); git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "t");
  const lib = join(s.dir, "library.json");
  writeFileSync(lib, JSON.stringify({
    alpha: { tag: "t:Alpha.view", title: "Alpha", note: "Not beta." },
    beta: { tree: "web-units", tag: "t:Beta.web", title: "Beta (website)", note: "Not alpha." },
  }));
  const build = () => run([BUILD, "--no-fetch", "--repo", repo, "--main", "HEAD", "--library", lib, "--out", join(s.dir, "built")]);
  return { ...s, repo, lib, build };
}

test("T12 a web-units entry is pinned under web-units/ and a units/ entry is unchanged", () => {
  const s = tinyRepo("t12");
  try {
    const r = s.build();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const { units } = JSON.parse(readFileSync(join(s.dir, "built", "refdocs-input.json"), "utf8"));
    const [alpha, beta] = units;
    assert.deepEqual(Object.keys(alpha), ["folder", "tag", "title", "note", "exhibit"], "a units/ entry gains no key");
    assert.match(alpha.exhibit, /\nGitHub folder: units\/alpha\nCommit: [0-9a-f]{40}\nPackage: @kaigilb\/gilbplatformcode-alpha\n/);
    assert.equal(beta.tree, "web-units");
    assert.match(beta.exhibit, /\nGitHub folder: web-units\/beta\nCommit: [0-9a-f]{40}\nPackage: @kaigilb\/gilbwebsitecode-beta\n/);
  } finally { s.clean(); }
});

test("T13 web dry run: partOf is the website library, units/ stays on the platform library, check passes", () => {
  const s = tinyRepo("t13");
  try {
    assert.equal(s.build().status, 0);
    const input = join(s.dir, "built", "refdocs-input.json");
    const r = run([W, "--dry-run", "--input", input]);
    assert.equal(r.status, 0);
    const dryOut = join(s.dir, "dry-run.out");
    writeFileSync(dryOut, r.stdout);
    const bodies = [...r.stdout.matchAll(/^\{\n[\s\S]*?\n\}$/gm)].map((m) => JSON.parse(m[0]));
    assert.equal(bodies[0].body.facts["a:partOf"]["@id"], PLAT_LIB);
    assert.equal(bodies[2].body.facts["a:partOf"]["@id"], WEB_LIB);
    const c = run([CHECK, "--input", input, "--dry-out", dryOut]);
    assert.equal(c.status, 0, c.stdout);
    assert.match(c.stdout, /ALL PASS/);
  } finally { s.clean(); }
});

test("T14 a folder name in both trees fails loudly and writes no input", () => {
  const s = tinyRepo("t14", { both: true });
  try {
    const r = s.build();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /'beta' exists in both units\/ and web-units\//);
    assert.ok(!existsSync(join(s.dir, "built", "refdocs-input.json")));
  } finally { s.clean(); }
});

test("T15 mock run: a web entry is created in the website library; an existing web tag is skipped, not re-created", () => {
  const s = tinyRepo("t15");
  try {
    assert.equal(s.build().status, 0);
    const input = join(s.dir, "built", "refdocs-input.json");
    const j = JSON.parse(readFileSync(input, "utf8"));
    j.units[1].tag = "t:Value.graph"; // the mock vault already holds this tag
    writeFileSync(input, JSON.stringify(j));
    writeFileSync(s.tok, TOKEN);
    const r = run(["--import", MOCK, W, "--token-file", s.tok, "--input", input]);
    assert.equal(r.status, 1, r.stdout.slice(-500));
    const rc = receiptOf(r.stdout);
    assert.deepEqual(rc.counts, { created: 2, "not-created": 2, unknown: 0, "never-sent": 0 });
    assert.equal(rc.items["t:Alpha.view doc"].state, "created");
    assert.equal(rc.items["t:Value.graph doc"].state, "not-created");
    assert.ok(!existsSync(s.tok));
  } finally { s.clean(); }
});

test("T16 mock run: a created web entry reads back with the website library as partOf", () => {
  const s = tinyRepo("t16");
  try {
    assert.equal(s.build().status, 0);
    writeFileSync(s.tok, TOKEN);
    const r = run(["--import", MOCK, W, "--token-file", s.tok, "--input", join(s.dir, "built", "refdocs-input.json")]);
    assert.equal(r.status, 0, r.stdout.slice(-500));
    const rc = receiptOf(r.stdout);
    assert.equal(rc.items["t:Beta.web doc"].state, "created");
    assert.equal(rc.items["t:Beta.web doc"].readback.partOfIsLibrary, true);
  } finally { s.clean(); }
});

// ---- --refresh ---------------------------------------------------------------------------------------------------
const RTAG = "t:Refresh.one";
const WANT = {
  title: "New Title (what it covers)", note: "Not the old one; take other.",
  exhibit: "**What it does:** Does the thing.\n\nGitHub folder: units/one\nCommit: " + "a".repeat(40) + "\nPackage: @kaigilb/gilbplatformcode-one\nClone: https://github.com/KaiGilb/GilbPlatformCode.git",
};
// A live document that equals WANT, with changes on top; extra seeds add more documents of the same tag.
function live(over = {}, exOver = {}) {
  return { tag: RTAG, title: WANT.title, name: WANT.title, label: WANT.title, appliesTo: WANT.note, exhibits: [{ text: WANT.exhibit, title: WANT.title, ...exOver }], ...over };
}
function refreshRun(name, seeds, { env = {}, flags = ["--refresh"] } = {}) {
  const s = sandbox(name);
  const input = join(s.dir, "refdocs-input.json");
  writeFileSync(input, JSON.stringify({ notice: "n", units: [{ folder: "one", tag: RTAG, title: WANT.title, note: WANT.note, exhibit: WANT.exhibit }] }));
  writeFileSync(s.tok, TOKEN);
  const log = join(s.dir, "requests.log");
  const r = run(["--import", MOCK, W, "--token-file", s.tok, "--input", input, ...flags], { MOCK_SEEDS: JSON.stringify(seeds), MOCK_LOG: log, ...env });
  const reqs = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const rc = receiptOf(r.stdout);
  const out = { r, rc, reqs, patches: reqs.filter((q) => q.method === "PATCH"), tokGone: !existsSync(s.tok) };
  s.clean();
  return out;
}
const DOC = RTAG + " doc", EXH = RTAG + " exhibit";
const tailOfUrl = (u) => u.split("/lws/r/")[1];

test("R1 without --refresh a present tag sends no PATCH and keeps the old receipt", () => {
  const x = refreshRun("r1", [live({ title: "Old" })], { flags: [] });
  assert.equal(x.patches.length, 0);
  assert.equal(x.r.status, 1);
  assert.deepEqual(x.rc.counts, { created: 0, "not-created": 2, unknown: 0, "never-sent": 0 });
  assert.match(x.rc.items[DOC].reason, /tag already present/);
});

test("R2 --refresh with live equal: unchanged, no PATCH, exit 0", () => {
  const x = refreshRun("r2", [live()]);
  assert.equal(x.patches.length, 0);
  assert.equal(x.rc.items[DOC].state, "unchanged");
  assert.equal(x.rc.items[EXH].state, "unchanged");
  assert.deepEqual(x.rc.counts, { created: 0, "not-created": 0, unknown: 0, "never-sent": 0, refreshed: 0, unchanged: 2, "not-refreshed": 0 });
  assert.equal(x.r.status, 0, x.r.stdout.slice(-400));
  assert.ok(x.tokGone);
  assert.ok(!x.reqs.some((q) => q.method === "POST"), "a present tag is never re-created");
});

test("R3 --refresh, title differs only: one doc PATCH with exactly title, name, label; If-Match is the served ETag; no exhibit PATCH", () => {
  const x = refreshRun("r3", [live({ title: "Old", name: "Old", label: "Old" })]);
  assert.equal(x.patches.length, 1);
  const p = x.patches[0];
  assert.deepEqual(p.body, { "a:title": WANT.title, "a:name": WANT.title, "a:label": WANT.title });
  assert.equal(p.headers["Content-Type"], "application/merge-patch+json");
  const tail = tailOfUrl(p.url);
  assert.equal(p.url, "https://appbuilder.gilb.com/lws/r/" + tail);
  assert.equal(p.headers["If-Match"], `W/"sha256:${tail}-0"`); // the mock serves exactly this ETag on GET
  assert.equal(x.rc.items[DOC].state, "refreshed");
  assert.equal(x.rc.items[EXH].state, "unchanged");
  assert.equal(x.rc.counts.refreshed, 1);
  assert.equal(x.r.status, 0, x.r.stdout.slice(-400));
  // the GET that gave the ETag came before the PATCH
  const gi = x.reqs.findIndex((q) => q.method === "GET" && q.url.endsWith("/lws/r/" + tail) && x.reqs.indexOf(q) > 0);
  assert.ok(gi >= 0 && gi < x.reqs.indexOf(p));
});

test("R3b only the facts that differ are sent (the note alone)", () => {
  const x = refreshRun("r3b", [live({ appliesTo: "old note" })]);
  assert.equal(x.patches.length, 1);
  assert.deepEqual(x.patches[0].body, { "a:appliesTo": WANT.note });
});

test("R4 --refresh, exhibit commit differs: exhibit PATCH with only a:referenceExhibit", () => {
  const x = refreshRun("r4", [live({}, { text: WANT.exhibit.replace("a".repeat(40), "b".repeat(40)) })]);
  assert.equal(x.patches.length, 1);
  assert.deepEqual(x.patches[0].body, { "a:referenceExhibit": WANT.exhibit });
  assert.equal(x.patches[0].headers["Content-Type"], "application/merge-patch+json");
  assert.match(x.patches[0].headers["If-Match"], /^W\/"sha256:exseed\d+-0"$/);
  assert.equal(x.rc.items[DOC].state, "unchanged");
  assert.equal(x.rc.items[EXH].state, "refreshed");
  assert.equal(x.r.status, 0, x.r.stdout.slice(-400));
});

test("R4b exhibit text and title both differ: both facts in the exhibit PATCH, document untouched", () => {
  const x = refreshRun("r4b", [live({}, { text: WANT.exhibit + "\nextra", title: "Old" })]);
  assert.equal(x.patches.length, 1);
  assert.deepEqual(x.patches[0].body, { "a:referenceExhibit": WANT.exhibit, "a:title": WANT.title });
});

test("R5 exhibit not starting with the marker: not-refreshed, no PATCH, exit non-zero", () => {
  const x = refreshRun("r5", [live({ title: "Old" }, { text: "Some hand-written text.", title: "Old" })]);
  assert.equal(x.patches.length, 0);
  assert.equal(x.rc.items[DOC].state, "not-refreshed");
  assert.equal(x.rc.items[EXH].state, "not-refreshed");
  assert.match(x.rc.items[DOC].reason, /does not start with/);
  assert.notEqual(x.r.status, 0);
});

test("R6 two exhibits: not-refreshed, no PATCH, exit non-zero", () => {
  const sd = live({ title: "Old" });
  sd.exhibits.push({ text: WANT.exhibit, title: WANT.title });
  const x = refreshRun("r6", [sd]);
  assert.equal(x.patches.length, 0);
  assert.equal(x.rc.items[DOC].state, "not-refreshed");
  assert.match(x.rc.items[DOC].reason, /2 exhibits/);
  assert.notEqual(x.r.status, 0);
});

test("R6b no exhibit at all: not-refreshed, no PATCH", () => {
  const x = refreshRun("r6b", [live({ title: "Old", exhibits: [] })]);
  assert.equal(x.patches.length, 0);
  assert.equal(x.rc.items[DOC].state, "not-refreshed");
  assert.notEqual(x.r.status, 0);
});

test("R6c two documents hold the tag: not-refreshed, no PATCH, no create", () => {
  const x = refreshRun("r6c", [live({ title: "Old" }), live({ title: "Older" })]);
  assert.equal(x.patches.length, 0);
  assert.ok(!x.reqs.some((q) => q.method === "POST"));
  assert.equal(x.rc.items[DOC].state, "not-refreshed");
  assert.match(x.rc.items[DOC].reason, /2 documents/);
  assert.notEqual(x.r.status, 0);
});

test("R7 412 on the document PATCH: not-refreshed, exhibit not patched, exit non-zero", () => {
  const x = refreshRun("r7", [live({ title: "Old" }, { text: "**What it does:** old.", title: "Old" })], { env: { MOCK_PATCH: "doc:412" } });
  assert.equal(x.patches.length, 1, "only the document PATCH was tried");
  assert.ok(!/exseed/.test(x.patches[0].url));
  assert.equal(x.rc.items[DOC].state, "not-refreshed");
  assert.match(x.rc.items[DOC].reason, /412.*re-run/);
  assert.equal(x.rc.items[EXH].state, "not-refreshed");
  assert.notEqual(x.r.status, 0);
});

test("R7b 412 on the exhibit PATCH: exhibit not-refreshed, exit non-zero", () => {
  const x = refreshRun("r7b", [live({}, { text: "**What it does:** old." })], { env: { MOCK_PATCH: "ex:412" } });
  assert.equal(x.rc.items[EXH].state, "not-refreshed");
  assert.match(x.rc.items[EXH].reason, /412/);
  assert.notEqual(x.r.status, 0);
});

test("R8 5xx on a PATCH: unknown, exit non-zero", () => {
  const x = refreshRun("r8", [live({ title: "Old" })], { env: { MOCK_PATCH: "doc:503" } });
  assert.equal(x.rc.items[DOC].state, "unknown");
  assert.notEqual(x.r.status, 0);
});

test("R8b another status on a PATCH: not-refreshed with the status and the body", () => {
  const x = refreshRun("r8b", [live({ title: "Old" })], { env: { MOCK_PATCH: "doc:403" } });
  assert.equal(x.rc.items[DOC].state, "not-refreshed");
  assert.match(x.rc.items[DOC].reason, /403: .*forced/);
  assert.notEqual(x.r.status, 0);
});

test("R9 a 200 that did not change what is live: the readback makes the unit unknown, exit non-zero", () => {
  const x = refreshRun("r9", [live({ title: "Old" })], { env: { MOCK_NOAPPLY: "1" } });
  assert.equal(x.patches.length, 1);
  assert.equal(x.rc.items[DOC].state, "unknown");
  assert.match(x.rc.items[DOC].reason, /readback still differs/);
  assert.equal(x.rc.counts.refreshed, 0);
  assert.notEqual(x.r.status, 0);
});

test("R10 everything differs: both refreshed and read back; no forbidden fact is ever sent; nothing is created or deleted", () => {
  const x = refreshRun("r10", [live({ title: "O", name: "O", label: "O", appliesTo: "o" }, { text: "**What it does:** old.", title: "O" })]);
  assert.equal(x.patches.length, 2);
  assert.ok(!/exseed/.test(x.patches[0].url) && /exseed/.test(x.patches[1].url), "document first, then exhibit");
  const FORBIDDEN = ["a:unitTag", "a:partOf", "a:directReader", "a:attribution", "a:license", "a:handsOffTo"];
  for (const p of x.patches) {
    for (const k of Object.keys(p.body)) assert.ok(!FORBIDDEN.includes(k), k);
    assert.ok(Object.values(p.body).every((v) => v !== null), "null is never sent");
  }
  assert.deepEqual(Object.keys(x.patches[0].body).sort(), ["a:appliesTo", "a:label", "a:name", "a:title"]);
  assert.deepEqual(Object.keys(x.patches[1].body).sort(), ["a:referenceExhibit", "a:title"]);
  assert.ok(!x.reqs.some((q) => q.method === "DELETE" || q.method === "POST" || q.method === "PUT"));
  assert.equal(x.rc.items[DOC].state, "refreshed");
  assert.equal(x.rc.items[EXH].state, "refreshed");
  assert.equal(x.rc.counts.refreshed, 2);
  assert.equal(x.r.status, 0, x.r.stdout.slice(-400));
  assert.ok(x.tokGone);
});

test("R11 --dry-run --refresh prints the refresh note, sends and reads nothing, and still ends on the dry-run line", () => {
  const s = sandbox("r11");
  try {
    writeFileSync(s.tok, TOKEN);
    const r = run([W, "--dry-run", "--refresh", "--token-file", s.tok, "--input", s.fixture]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /dry-run --refresh: refresh decisions .* need the live listing.* nothing was sent/);
    assert.ok(!/"state"|Bearer|"PATCH":/.test(r.stdout));
    const lines = r.stdout.trimEnd().split("\n");
    assert.equal(lines.at(-2), "dry-run: nothing sent, no key read");
    const posts = (r.stdout.match(/"POST":/g) || []).length;
    assert.equal(posts, fixtureUnits.length * 2);
  } finally { s.clean(); }
});

test("R12 marker present but not at the start of the exhibit: not-refreshed, no PATCH, exit non-zero", () => {
  const x = refreshRun("r12", [live({ title: "Old" }, { text: "Old text first.\n\n" + WANT.exhibit, title: "Old" })]);
  assert.equal(x.patches.length, 0);
  assert.equal(x.rc.items[DOC].state, "not-refreshed");
  assert.equal(x.rc.items[EXH].state, "not-refreshed");
  assert.match(x.rc.items[DOC].reason, /does not start with/);
  assert.notEqual(x.r.status, 0);
});

test("R13 exhibit PATCH answers 200 but the readback still serves the old exhibit text (document equal): exhibit unknown, exit non-zero", () => {
  const x = refreshRun("r13", [live({}, { text: WANT.exhibit.replace("a".repeat(40), "b".repeat(40)) })], { env: { MOCK_NOAPPLY: "1" } });
  assert.equal(x.patches.length, 1);
  assert.ok(/exseed/.test(x.patches[0].url), "only the exhibit was patched");
  assert.equal(x.rc.items[DOC].state, "unchanged");
  assert.equal(x.rc.items[EXH].state, "unknown");
  assert.match(x.rc.items[EXH].reason, /readback still differs: a:referenceExhibit/);
  assert.notEqual(x.r.status, 0);
});
