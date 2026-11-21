// Used by gitSave.reliability.test.mjs: writes a file and saves it with the bridge's own saveTurnToGit, again and again,
// until it is killed. Prints "attempt <n> <ok|error>" after each save. Arguments: <repo> <privateDir> <first file number>.
import fs from "node:fs";
import path from "node:path";
import { saveTurnToGit } from "../bridge/bridge.mjs";

const [repo, priv, start] = process.argv.slice(2);
for (let n = Number(start); ; n++) {
  fs.writeFileSync(path.join(repo, `f${n}.txt`), String(n));
  const r = await saveTurnToGit({ folder: repo, summary: `save ${n}`, turnId: `r${n}`, env: process.env, privateDir: priv });
  process.stdout.write(`attempt ${n} ${r.ok ? "ok" : `error ${r.reason}`}\n`);
}
