// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { commitFromVersionJson, main as runMain, parseSteps, validAppName } from "../scripts/app-runner.mjs";
// @ts-expect-error plain ESM script without types
import { main as compareMain } from "../scripts/compare.mjs";
// @ts-expect-error plain ESM script without types
import { APP_TESTS, TESTS, testOf, toAppResults, toResults, writeResults } from "../scripts/results.mjs";

const tmp = () => fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "app-runner-"));

function capture(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = compareMain(args, { ...process.env, SPEED_LAB_RUNS: "" }, {
    log: (m: unknown) => { stdout.push(String(m)); },
    error: (m: unknown) => { stderr.push(String(m)); },
  });
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

const META = {
  app: { name: "speed-lab-self", url: "http://localhost:5261/?entries=500&latency=600", commit: "db4a9e9" + "0".repeat(33) },
  at: "2026-11-01T13:05:01.000Z",
  runner: { commit: "c0ffee" + "a".repeat(34), dirty: false, appVersion: "0.9.0" },
};
const row = (test: string, engine: string, profile: string, pass: boolean, ms: number) => ({
  test, engine, profile, pass,
  values: { firstRowMs: ms, fullMs: ms + 10, source: pass ? "preview" : "nope", page: "entries", requestsTotal: 5, writes: 0 },
  failed: pass ? [] : ["source is one of memory, device, preview, network"],
  error: undefined,
});

describe("A app runner", () => {
  it("parseSteps: both kinds, spaces trimmed, unknown kind throws, empty is []", () => {
    expect(parseSteps("click:signin-ann, wait:entry-e1")).toEqual([
      { kind: "click", testid: "signin-ann" },
      { kind: "wait", testid: "entry-e1" },
    ]);
    expect(parseSteps("  click: foo , wait: bar ")).toEqual([
      { kind: "click", testid: "foo" },
      { kind: "wait", testid: "bar" },
    ]);
    expect(parseSteps("")).toEqual([]);
    expect(parseSteps("   ")).toEqual([]);
    expect(() => parseSteps("hover:x")).toThrow(/hover/);
    expect(() => parseSteps("click:")).toThrow(/data-testid/);
  });

  it("rejects an app name that is not a short name, before any browser", async () => {
    expect(validAppName("speed-lab-self")).toBe(true);
    expect(validAppName("a")).toBe(true);
    expect(validAppName("a".repeat(40))).toBe(true);
    expect(validAppName("9app")).toBe(true);
    expect(validAppName("")).toBe(false);
    expect(validAppName("A")).toBe(false);
    expect(validAppName("-a")).toBe(false);
    expect(validAppName("a_b")).toBe(false);
    expect(validAppName("a".repeat(41))).toBe(false);
    const quiet = { log() {}, error(m: unknown) { this.last = String(m); }, last: "" };
    const bad = await runMain(["--url", "http://localhost:5261/", "--app", "Speed Lab"], {}, quiet);
    expect(bad.code).toBe(2);
    expect(bad.rows).toEqual([]);
    expect(quiet.last).toContain("--app");
    const missingUrl = await runMain(["--app", "speed-lab-self"], {}, quiet);
    expect(missingUrl.code).toBe(2);
    expect(quiet.last).toContain("--url");
    const step = await runMain(["--url", "http://localhost:5261/", "--app", "a", "--steps", "hover:no"], {}, quiet);
    expect(step.code).toBe(2);
    expect(step.rows).toEqual([]);
    const storage = await runMain(["--url", "http://localhost:5261/", "--app", "a", "--storage-state", path.join(tmp(), "no-such.json")], {}, quiet);
    expect(storage.code).toBe(2);
    expect(quiet.last).toContain("storage state");
  });

  it("commitFromVersionJson takes the first string and ignores the rest", () => {
    expect(commitFromVersionJson({ revision: "abc" })).toBe("abc");
    expect(commitFromVersionJson({ commit: "def456" })).toBe("def456");
    expect(commitFromVersionJson({})).toBe("unknown");
    expect(commitFromVersionJson({ revision: 12, commit: "abc" })).toBe("abc");
    expect(commitFromVersionJson({ revision: null, sha: "fff" })).toBe("fff");
    expect(commitFromVersionJson({ gitSha: "zzz" })).toBe("zzz");
    expect(commitFromVersionJson({ revision: "", commit: "abc" })).toBe("abc");
    expect(commitFromVersionJson(null)).toBe("unknown");
    expect(commitFromVersionJson(["abc"])).toBe("unknown");
    expect(commitFromVersionJson({ revision: { sha: "no" }, sha: "ok" })).toBe("ok");
  });

  it("toAppResults names the app and its commit, and one failed row fails the file", () => {
    expect(Object.isFrozen(APP_TESTS)).toBe(true);
    expect(Object.isFrozen(APP_TESTS["SL-101"])).toBe(true);
    expect(Object.keys(TESTS)).toEqual(["SL-001", "SL-002", "SL-003", "SL-004", "SL-005", "SL-006", "SL-007"]);
    expect(testOf("B1 cold first visit")).toEqual({ id: "SL-001", variant: null });
    const { files } = toAppResults([
      row("SL-101", "chromium", "desktop", true, 10),
      row("SL-101", "webkit", "phone", false, 10),
      row("SL-102", "chromium", "desktop", true, 8),
    ], META);
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("20261101T130501Z-speed-lab-self-db4a9e9-SL-101.json");
    expect(files[1].name).toBe("20261101T130501Z-speed-lab-self-db4a9e9-SL-102.json");
    expect(files[0].body.schema).toBe("speed-lab.result/1");
    expect(files[0].body.title).toBe(APP_TESTS["SL-101"].title);
    expect(files[0].body.primary).toBe("firstRowMs");
    expect(files[0].body.app).toEqual({ name: "speed-lab-self", url: META.app.url, commit: META.app.commit });
    expect(files[0].body.run).toEqual({ at: META.at, commit: META.runner.commit, dirty: false, appVersion: "0.9.0", tool: "run-app" });
    expect(files[0].body.condition).toEqual({ browser: "REAL", vault: "as the app is configured", url: META.app.url });
    expect(files[0].body.pass).toBe(false);
    expect(files[0].body.rows[0]).toMatchObject({ engine: "chromium", profile: "desktop", variant: null, pass: true });
    expect(files[0].body.rows[0]).not.toHaveProperty("test");
    expect(files[0].body.rows[1].error).toBeNull();
    expect(files[1].body.pass).toBe(true);
    expect(files[1].body.test).toBe("SL-102");
    const unknown = toAppResults([row("SL-101", "chromium", "desktop", true, 10)], { ...META, app: { ...META.app, commit: "unknown" } });
    expect(unknown.files[0].name).toBe("20261101T130501Z-speed-lab-self-unknown-SL-101.json");
    expect(unknown.files[0].body.app.commit).toBe("unknown");
    const short = toAppResults([row("SL-101", "chromium", "desktop", true, 10)], { ...META, app: { ...META.app, commit: "abc" } });
    expect(short.files[0].name).toBe("20261101T130501Z-speed-lab-self-abc-SL-101.json");
    const own = toResults({ ts: "20261101T130501Z", base: META.app.url, rows: [{ engine: "chromium", profile: "desktop", scenario: "B1 cold first visit", pass: true, values: { firstRowMs: 1 }, failed: [], error: null }] }, { commit: META.runner.commit, dirty: false, appVersion: "0.9.0", at: META.at });
    expect(own.files[0].body).not.toHaveProperty("app");
    expect(own.files[0].body.run.tool).toBe("proof:browser");
  });

  it("compare requires --app for SL-101 and does not mix apps, or a runner file, into a judgement", () => {
    const missing = capture(["SL-101"]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("SL-101 needs --app <name>");
    expect(capture(["SL-102"]).stderr).toContain("SL-102 needs --app <name>");

    const dir = tmp();
    const writeApp = (app: string, ms: number, at: string) => {
      const { files } = toAppResults([
        row("SL-101", "chromium", "desktop", true, ms),
        row("SL-101", "webkit", "phone", true, ms),
      ], { ...META, at, app: { name: app, url: "http://example.test/", commit: "abc1234ffff" } });
      writeResults(dir, files);
    };
    writeApp("a", 100, "2026-11-01T13:01:00.000Z");
    writeApp("a", 100, "2026-11-01T13:02:00.000Z");
    writeApp("a", 100, "2026-11-01T13:03:00.000Z");
    writeApp("b", 100, "2026-11-01T13:04:00.000Z");
    writeApp("b", 100, "2026-11-01T13:05:00.000Z");
    writeApp("b", 400, "2026-11-01T13:06:00.000Z");
    const onlyA = capture(["SL-101", "--app", "a", "--runs", dir]);
    expect(onlyA.code).toBe(0);
    expect(onlyA.stdout).not.toContain("SLOWER");
    expect(onlyA.stdout).not.toContain("400");
    const onlyB = capture(["SL-101", "--app", "b", "--runs", dir]);
    expect(onlyB.code).toBe(1);
    expect(onlyB.stdout).toContain("SLOWER");
    const none = capture(["SL-101", "--app", "c", "--runs", dir]);
    expect(none.code).toBe(2);
    expect(none.stderr).toContain("no result files for SL-101 for app c");

    const own = tmp();
    for (const [ms, at] of [[100, "2026-11-01T13:01:00.000Z"], [100, "2026-11-01T13:02:00.000Z"], [100, "2026-11-01T13:03:00.000Z"]] as const) {
      const proof = {
        ts: "20261101T130100Z", base: "http://localhost:5261/?entries=500&latency=600",
        rows: ["chromium", "webkit"].flatMap((engine) => ["desktop", "phone"].map((profile) => ({
          engine, profile, scenario: "B1 cold first visit", pass: true, values: { firstRowMs: ms, fullMs: 20 }, failed: [], error: null,
        }))),
      };
      writeResults(own, toResults(proof, { commit: "db4a9e9" + "0".repeat(33), dirty: false, appVersion: "0.8.0", at }).files);
    }
    const before = capture(["SL-001", "--runs", own]);
    fs.writeFileSync(path.join(own, "20261101T130900Z-a-abcdefg-SL-001.json"), JSON.stringify({
      schema: "speed-lab.result/1", test: "SL-001", title: "cold first visit: first row and full list from the network", primary: "firstRowMs",
      app: { name: "a", url: "http://example.test/", commit: "abcdefg" },
      run: { at: "2026-11-01T13:09:00.000Z", commit: "bbbbbbb", dirty: false, appVersion: "0.9.0", tool: "run-app" },
      condition: { browser: "REAL", vault: "as the app is configured", url: "http://example.test/" },
      rows: ["chromium", "webkit"].flatMap((engine) => ["desktop", "phone"].map((profile) => ({
        engine, profile, variant: null, pass: false, values: { firstRowMs: 9000 }, failed: ["nope"], error: null,
      }))),
      pass: false,
    }));
    const after = capture(["SL-001", "--runs", own]);
    expect(after.code).toBe(before.code);
    expect(after.code).toBe(0);
    expect(after.stdout).not.toContain("9000");
    expect(after.stdout).not.toContain("FAIL");
    const runnerOnly = tmp();
    fs.copyFileSync(path.join(own, "20261101T130900Z-a-abcdefg-SL-001.json"), path.join(runnerOnly, "20261101T130900Z-a-abcdefg-SL-001.json"));
    const ignored = capture(["SL-001", "--runs", runnerOnly]);
    expect(ignored.code).toBe(2);
    expect(ignored.stderr).toContain(`no result files for SL-001 in ${runnerOnly}`);
  });

  it("compare shows the measured app's commit for SL-101 and Speed Lab's own commit for SL-001", () => {
    const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "app-runner-"));
    const runner = { commit: "ffffffff" + "f".repeat(32), dirty: true, appVersion: "0.9.0" };
    const writeApp = (commit: string, at: string) => {
      const { files } = toAppResults(
        [row("SL-101", "chromium", "desktop", true, 10)],
        { ...META, at, app: { name: "a", url: "http://example.test/", commit }, runner },
      );
      writeResults(dir, files);
    };
    writeApp("1111111aaaa", "2026-11-01T13:01:00.000Z");
    writeApp("2222222bbbb", "2026-11-01T13:02:00.000Z");
    const app = capture(["SL-101", "--app", "a", "--runs", dir]);
    expect(app.stdout).toContain("1111111");
    expect(app.stdout).toContain("2222222");
    expect(app.stdout).toContain("app commit");
    expect(app.stdout).toContain("| at | app commit | runner |");
    expect(app.stdout).toContain("| 1111111 | fffffff-dirty |");
    expect(app.stdout).toContain("| 2222222 | fffffff-dirty |");
    expect(app.stdout).not.toContain("1111111-dirty");

    const proof = {
      ts: "20261101T130100Z", base: "http://localhost:5261/?entries=500&latency=600",
      rows: [{ engine: "chromium", profile: "desktop", scenario: "B1 cold first visit", pass: true, values: { firstRowMs: 10, fullMs: 20 }, failed: [], error: null }],
    };
    writeResults(dir, toResults(proof, { commit: "db4a9e9" + "0".repeat(33), dirty: false, appVersion: "0.8.0", at: "2026-11-01T13:03:00.000Z" }).files);
    const own = capture(["SL-001", "--runs", dir]);
    expect(own.stdout).toContain("| at | commit |");
    expect(own.stdout).not.toContain("app commit");
  });
});
