// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { TESTS, runsDir, testOf, toResults, writeResults } from "../scripts/results.mjs";
// @ts-expect-error plain ESM script without types
import { judge } from "../scripts/compare.mjs";

const APP = path.resolve(__dirname, "..");
const tmp = () => fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "results-"));

const SCENARIOS = [
  "B1 cold first visit", "B2 back from an entry", "B3 reload, from the device", "B4 sign-out and Ben", "B5 hover warms",
  "B6 tab closed without sign-out", "B7 slow disk, held 0 ms", "B7 slow disk, held 600 ms",
];
const BASE = "http://localhost:5261/?entries=500&latency=600";
const META = { commit: "db4a9e9" + "0".repeat(33), dirty: false, appVersion: "0.7.0", at: "2026-11-01T13:05:01.000Z" };
const fixture = () => {
  const rows: any[] = [];
  for (const engine of ["chromium", "webkit"]) for (const profile of ["desktop", "phone"]) for (const scenario of SCENARIOS) {
    const bad = scenario === "B4 sign-out and Ben" && engine === "webkit" && profile === "phone";
    rows.push({ engine, profile, scenario, pass: !bad, values: { firstRowMs: 10, fullMs: 20 }, failed: bad ? ["Ann seen"] : [], error: undefined });
  }
  return { ts: "20261101T130501Z", base: BASE, rows };
};

describe("R results.mjs and compare.mjs", () => {
  it("R1 every scenario maps to its id and variant; an unknown one is null and listed as unmapped", () => {
    expect(testOf("B1 cold first visit")).toEqual({ id: "SL-001", variant: null });
    expect(testOf("B2 back from an entry")).toEqual({ id: "SL-002", variant: null });
    expect(testOf("B3 reload, from the device")).toEqual({ id: "SL-003", variant: null });
    expect(testOf("B4 sign-out and Ben")).toEqual({ id: "SL-004", variant: null });
    expect(testOf("B5 hover warms")).toEqual({ id: "SL-005", variant: null });
    expect(testOf("B6 tab closed without sign-out")).toEqual({ id: "SL-006", variant: null });
    expect(testOf("B7 slow disk, held 0 ms")).toEqual({ id: "SL-007", variant: "held 0 ms" });
    expect(testOf("B7 slow disk, held 600 ms")).toEqual({ id: "SL-007", variant: "held 600 ms" });
    expect(testOf("B7 slow disk setup")).toEqual({ id: "SL-007", variant: "setup" });
    expect(testOf("B8 something new")).toBeNull();
    const p = fixture();
    p.rows.push({ engine: "chromium", profile: "desktop", scenario: "B8 something new", pass: true, values: {}, failed: [] });
    expect(toResults(p, META).unmapped).toEqual(["B8 something new"]);
    expect(Object.isFrozen(TESTS)).toBe(true);
    expect(TESTS["SL-004"].primary).toBeNull();
    expect(TESTS["SL-007"].primary).toBe("firstRowMs");
  });

  it("R2 toResults: 7 files, SL-004 fails, names and conditions are right", () => {
    const { files, unmapped } = toResults(fixture(), META);
    expect(unmapped).toEqual([]);
    expect(files).toHaveLength(7);
    for (const f of files) {
      expect(f.name).toMatch(/^20261101T130501Z-db4a9e9-SL-00[1-7]\.json$/);
      expect(f.body.schema).toBe("speed-lab.result/1");
      expect(f.body.pass).toBe(f.body.test !== "SL-004");
      expect(f.body.condition).toMatchObject({ browser: "REAL", vault: "MOCK", base: BASE, entries: 500, latencyMs: 600 });
      expect(f.body.run).toMatchObject({ at: META.at, commit: META.commit, dirty: false, appVersion: "0.7.0", tool: "proof:browser" });
    }
    expect(files.find((f: any) => f.body.test === "SL-007").body.rows).toHaveLength(8);
    expect(files.find((f: any) => f.body.test === "SL-001").body.primary).toBe("firstRowMs");
    const dirty = toResults(fixture(), { ...META, dirty: true }).files[0].name;
    expect(dirty).toBe("20261101T130501Z-db4a9e9-dirty-SL-001.json");
    const bare = toResults({ ...fixture(), base: "http://localhost:5261/" }, META).files[0].body.condition;
    expect(bare.entries).toBeNull();
    expect(bare.latencyMs).toBeNull();
  });

  it("R3 writeResults never overwrites", () => {
    const dir = path.join(tmp(), "runs");
    const f = [{ name: "a-SL-001.json", body: { x: 1 } }];
    const [p] = writeResults(dir, f);
    const first = fs.readFileSync(p, "utf8");
    expect(() => writeResults(dir, [{ name: "a-SL-001.json", body: { x: 2 } }])).toThrow(p);
    expect(fs.readFileSync(p, "utf8")).toBe(first);
  });

  it("R4 judge known answers", () => {
    const run = (earlier: number[], latest: number | null, pass = true) => ({
      k: [...earlier.map((v) => ({ pass: true, values: { firstRowMs: v } })), { pass, values: { firstRowMs: latest } }],
    });
    const one = (r: any, primary: string | null = "firstRowMs") => judge(r, primary)[0];
    expect(one(run([100, 100, 100, 100], 130)).flags).toEqual(["SLOWER"]);
    expect(one(run([100, 100, 100, 100], 124)).flags).toEqual([]);
    expect(one(run([10, 10, 10], 25)).flags).toEqual([]);
    const few = one(run([100], 500));
    expect(few.flags).toEqual([]);
    expect(few.notes).toEqual(["too few runs to judge"]); // not judged
    expect(one(run([100, 100, 100], 100, false)).flags).toEqual(["FAIL"]);
    expect(one(run([100, 100, 100], null)).flags).toEqual(["NO READING"]);
    expect(one({ k: [{ pass: true, values: {} }, { pass: true, values: {} }] }, null).flags).toEqual([]);
  });

  it("R5 compare CLI end to end", () => {
    const compare = (...args: string[]) => spawnSync("node", ["scripts/compare.mjs", ...args], { cwd: APP, encoding: "utf8", env: { ...process.env, SPEED_LAB_RUNS: "" } });
    const empty = tmp();
    const none = compare("SL-001", "--runs", empty);
    expect(none.status).toBe(2);
    expect(none.stderr).toContain(`no result files for SL-001 in ${empty}`);
    const dir = tmp();
    [100, 100, 300].forEach((ms, i) => {
      const p = fixture();
      p.rows.forEach((r) => { r.values.firstRowMs = ms; });
      const meta = { ...META, at: `2026-11-01T13:0${i}:00.000Z` };
      writeResults(dir, toResults(p, meta).files);
    });
    const slow = compare("SL-001", "--runs", dir);
    expect(slow.status).toBe(1);
    expect(slow.stdout).toContain("SLOWER");
    const fine = compare("SL-004", "--runs", dir);
    expect(fine.status).toBe(1); // the failing webkit/phone row is flagged
    expect(fine.stdout).toContain("FAIL: webkit/phone");
    expect(compare("SL-099", "--runs", dir).status).toBe(2);
    const two = tmp();
    [100, 100].forEach((ms, i) => {
      const p = fixture();
      p.rows.forEach((r) => { r.values.firstRowMs = ms; r.pass = true; r.failed = []; });
      writeResults(two, toResults(p, { ...META, at: `2026-11-01T13:0${i}:00.000Z` }).files);
    });
    const nj = compare("SL-001", "--runs", two);
    expect(nj.status).toBe(3);
    expect(nj.stdout).toContain("not judged");
    expect(compare("SL-004", "--runs", two).status).toBe(0);
    expect(compare("SL-001", "--runs", dir).status).toBe(1);
  });

  it("R6 runsDir honours SPEED_LAB_RUNS and falls back", () => {
    expect(runsDir({ SPEED_LAB_RUNS: "/x/y" }, "/app")).toBe("/x/y");
    expect(runsDir({}, "/app")).toBe(path.join("/app", "runs"));
    expect(runsDir({ SPEED_LAB_RUNS: "" }, "/app")).toBe(path.join("/app", "runs"));
  });
});
