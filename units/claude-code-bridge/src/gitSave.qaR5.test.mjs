// @vitest-environment node
// Agent.Tester D4 verify, adopted into the unit: a ref-lock record whose `expect` is not a 40/64-hex id never proves a lock (N7).
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { saveTurnToGit } from "../bridge/bridge.mjs";
const temps = []; afterEach(() => { for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true }); });
describe.skipIf(process.platform === "win32")("N7 strict expect", () => {
  for (const bad of ["", "abc", "1".repeat(39), "g".repeat(40)]) {
    it(`expect ${JSON.stringify(bad.slice(0, 8))}… with a lock holding exactly that -> kept`, async () => {
      const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "qa-r5-"))); temps.push(d);
      const f = path.join(d, "p"); fs.mkdirSync(f); const priv = path.join(d, "priv");
      fs.writeFileSync(path.join(f, "a.txt"), "a");
      expect((await saveTurnToGit({ folder: f, summary: "first", turnId: "t0", env: process.env, privateDir: priv })).ok).toBe(true);
      fs.writeFileSync(path.join(f, "b.txt"), "b");
      const gitDir = path.join(f, ".git"); const lock = path.join(gitDir, "refs/heads/main.lock");
      fs.writeFileSync(lock, bad ? `${bad}\n` : "");
      const dead = spawn("true").pid; await new Promise((r) => setTimeout(r, 200));
      fs.mkdirSync(path.join(priv, "calls"), { recursive: true });
      fs.writeFileSync(path.join(priv, "calls", `${crypto.createHash("sha256").update(gitDir).digest("hex").slice(0, 32)}.json`), JSON.stringify({ pid: dead, start: Date.now() - 1000, limit: 20000, gitDir, lockRel: "refs/heads/main.lock", expect: bad }));
      const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv });
      expect(r.ok).toBe(false);
      expect(fs.existsSync(lock)).toBe(true);
    });
  }
});
