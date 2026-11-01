// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { forgetSignin } from "../scripts/forget-signin.mjs";
// @ts-expect-error plain ESM script without types
import { insideGitTree, parseArgs, saveSignin } from "../scripts/save-signin.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPEED_TMP = "/Users/kaigilb/Developer/.grok-runs/speedkit-dev/sl5c/tmp";

function tempRoot(): string {
  if (!insideGitTree(path.join(SPEED_TMP, "x.json"))) return SPEED_TMP;
  const env = process.env.TMPDIR;
  if (env && env !== SPEED_TMP && !insideGitTree(path.join(env, "x.json"))) {
    console.log(`temp root: ${env} (${SPEED_TMP} is inside a git work tree)`);
    return env;
  }
  throw new Error(`${SPEED_TMP} is inside a git work tree and TMPDIR (${env ?? "unset"}) is not a usable temp root outside a repo`);
}

function tempDir(): string {
  const root = tempRoot();
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, "save-signin-"));
}

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
    expect(insideGitTree(outside)).toBe(false);
    expect(outside.startsWith(tempRoot())).toBe(true);
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
});
