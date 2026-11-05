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
    // 44 units x 2 items = 88; t:Value.graph is the one seeded exact tag -> 2 not-created; 43 x 2 = 86 created.
    const expectSkipped = fixtureUnits.filter((u) => u.tag === "t:Value.graph").length;
    assert.equal(expectSkipped, 1);
    const n = fixtureUnits.length;
    const rc = receiptOf(r.stdout);
    assert.deepEqual(rc.counts, { created: (n - expectSkipped) * 2, "not-created": expectSkipped * 2, unknown: 0, "never-sent": 0 });
    assert.deepEqual(rc.counts, { created: 86, "not-created": 2, unknown: 0, "never-sent": 0 });
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
    assert.equal(made.length, 43);
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
  assert.ok(got.equals(readFileSync(FIXTURE_SRC)), "built input differs from the fixture");
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
