// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { checkStorageStateFile, main as runMain } from "../scripts/app-runner.mjs";
// @ts-expect-error plain ESM script without types
import { forgetSignin } from "../scripts/forget-signin.mjs";
// @ts-expect-error plain ESM script without types
import { insideGitTree, parseArgs, saveSignin } from "../scripts/save-signin.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "speed-lab-signin-"));
  tempDirs.push(dir);
  if (insideGitTree(dir)) throw new Error(`temp root is inside a git work tree: ${dir}`);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

async function capture(fn: () => Promise<unknown>) {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = ((m?: unknown) => { out.push(String(m)); }) as typeof console.log;
  console.error = ((m?: unknown) => { err.push(String(m)); }) as typeof console.error;
  try {
    return { result: await fn(), out, err };
  } finally {
    console.log = log;
    console.error = error;
  }
}

describe("S save sign-in", () => {
  it("parseArgs defaults to chromium, __speedMeter and 600000, and refuses a bad out or url", () => {
    expect(parseArgs(["--url", "https://app.example/records", "--out", "session.json"])).toEqual({
      url: "https://app.example/records",
      out: "session.json",
      key: "__speedMeter",
      page: null,
      engine: "chromium",
      timeout: 600000,
    });
    expect(parseArgs([
      "--url", "http://localhost:5261/?entries=30",
      "--out", "a.json",
      "--key", "__speedProof",
      "--page", "entries",
      "--engine", "webkit",
      "--timeout", "5000",
    ])).toEqual({
      url: "http://localhost:5261/?entries=30",
      out: "a.json",
      key: "__speedProof",
      page: "entries",
      engine: "webkit",
      timeout: 5000,
    });
    expect(() => parseArgs(["--url", "https://app.example/"])).toThrow(/--out/);
    expect(() => parseArgs(["--url", "https://app.example/", "--out", "session.txt"])).toThrow(/\.json/);
    expect(() => parseArgs(["--url", "ftp://app.example/records", "--out", "session.json"])).toThrow(/http/);
    expect(() => parseArgs(["--out", "session.json"])).toThrow(/--url/);
    expect(() => parseArgs(["--url", "https://app.example/", "--out", "a.json", "--engine", "firefox"])).toThrow(/engine/);
  });

  it("insideGitTree is true in this worktree and false under the temp root", () => {
    const inside = path.resolve(HERE, "../x.json");
    expect(inside.endsWith(`${path.sep}apps${path.sep}speed-lab${path.sep}x.json`)).toBe(true);
    expect(insideGitTree(inside)).toBe(true);
    const dir = tempDir();
    const outside = path.join(dir, "x.json");
    expect(insideGitTree(dir), `temp root is inside a git work tree: ${dir}`).toBe(false);
    expect(insideGitTree(outside), `temp root is inside a git work tree: ${dir}`).toBe(false);
    expect(outside.startsWith(dir)).toBe(true);
  });

  it("forget-signin deletes a temp json file, refuses a path in the repo, and reports a missing file", () => {
    const dir = tempDir();
    const file = path.join(dir, "session.json");
    fs.writeFileSync(file, "{\"cookies\":[1,2,3]}", { mode: 0o600 });
    fs.chmodSync(file, 0o600);
    const gone = forgetSignin(file);
    expect(gone).toEqual({ code: 0, message: `forgotten: ${file}` });
    expect(fs.existsSync(file)).toBe(false);

    const txt = path.join(dir, "session.txt");
    fs.writeFileSync(txt, "keep");
    expect(forgetSignin(txt).code).toBe(2);
    expect(fs.readFileSync(txt, "utf8")).toBe("keep");

    const repoPath = path.resolve(HERE, "../x.json");
    expect(fs.existsSync(repoPath)).toBe(false);
    const refused = forgetSignin(repoPath);
    expect(refused.code).toBe(2);
    expect(refused.message).toContain("git");
    expect(fs.existsSync(repoPath)).toBe(false);

    const missing = path.join(dir, "missing.json");
    expect(forgetSignin(missing)).toEqual({ code: 0, message: `nothing to forget: ${missing}` });
  });

  it("saveSignin refuses a git path, a non-http url, and a file that is not mode 600, and writes nothing", async () => {
    const repoPath = path.resolve(HERE, "../not-written.json");
    expect(fs.existsSync(repoPath)).toBe(false);
    const git = await capture(() => saveSignin({ url: "http://127.0.0.1:9/", out: repoPath, headless: true, timeout: 1000 }));
    expect(git.result).toEqual({ code: 2 });
    expect(git.out).toEqual([]);
    expect(git.err).toEqual(["--out is inside a git work tree"]);
    expect(fs.existsSync(repoPath)).toBe(false);

    const dir = tempDir();
    const ftpOut = path.join(dir, "ftp.json");
    const ftp = await capture(() => saveSignin({ url: "ftp://app.example/records", out: ftpOut, headless: true, timeout: 1000 }));
    expect(ftp.result).toEqual({ code: 2 });
    expect(ftp.out).toEqual([]);
    expect(ftp.err.join("\n")).toContain("http");
    expect(fs.existsSync(ftpOut)).toBe(false);

    const wide = path.join(dir, "wide.json");
    const secret = "SESSION-SECRET-SENTINEL";
    fs.writeFileSync(wide, `{"token":"${secret}"}`);
    fs.chmodSync(wide, 0o644);
    expect(fs.statSync(wide).mode & 0o777).toBe(0o644);
    const refused = await capture(() => saveSignin({ url: "http://127.0.0.1:9/", out: wide, headless: true, timeout: 1000 }));
    expect(refused.result).toEqual({ code: 2 });
    expect(refused.out).toEqual([]);
    expect(refused.err).toEqual(["existing file is readable by others; remove it first"]);
    expect(refused.err.join("\n")).not.toContain(secret);
    expect(fs.readFileSync(wide, "utf8")).toBe(`{"token":"${secret}"}`);
    expect(fs.statSync(wide).mode & 0o777).toBe(0o644);
  });

  it("run-app refuses a storage state others can read and accepts mode 600", async () => {
    const dir = tempDir();
    const secret = "SESSION-SECRET-SENTINEL";
    const wide = path.join(dir, "wide.json");
    fs.writeFileSync(wide, `{"cookies":[{"value":"${secret}"}]}`);
    fs.chmodSync(wide, 0o644);
    expect(fs.statSync(wide).mode & 0o077).not.toBe(0);
    expect(checkStorageStateFile(wide)).toBe("storage state is readable by others: chmod 600 it");
    const quiet = { log() {}, error(m: unknown) { this.last = String(m); }, last: "" };
    const refused = await runMain(["--url", "http://127.0.0.1:9/", "--app", "a", "--storage-state", wide, "--commit", "abc"], {}, quiet);
    expect(refused.code).toBe(2);
    expect(refused.rows).toEqual([]);
    expect(quiet.last).toBe("storage state is readable by others: chmod 600 it");
    expect(quiet.last).not.toContain(secret);
    expect(JSON.stringify(refused)).not.toContain(secret);

    const tight = path.join(dir, "tight.json");
    fs.writeFileSync(tight, `{"cookies":[{"value":"${secret}"}]}`);
    fs.chmodSync(tight, 0o600);
    expect(fs.statSync(tight).mode & 0o077).toBe(0);
    const accepted = checkStorageStateFile(tight);
    expect(accepted).toBeNull();
    expect(String(accepted)).not.toContain(secret);
  });
});
