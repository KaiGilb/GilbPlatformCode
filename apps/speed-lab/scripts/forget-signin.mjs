// Overwrites a saved sign-in file with zeros and deletes it. Refuses a path that is not .json or is inside a git work tree.
// node scripts/forget-signin.mjs --out <file.json>
import { closeSync, existsSync, fsyncSync, openSync, statSync, unlinkSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { insideGitTree } from "./save-signin.mjs";

function whyOf(e) {
  const line = String(e?.message ?? e).split("\n")[0].trim();
  return line || "failed";
}

/** { code, message }. 0 forgotten or nothing to forget; 2 refused. Does not print. */
export function forgetSignin(out) {
  if (typeof out !== "string" || !out.endsWith(".json")) return { code: 2, message: "--out must end in .json" };
  if (insideGitTree(out)) return { code: 2, message: "--out is inside a git work tree" };
  if (!existsSync(out)) return { code: 0, message: `nothing to forget: ${out}` };
  const size = statSync(out).size;
  const fd = openSync(out, "r+");
  try {
    if (size > 0) writeSync(fd, Buffer.alloc(size), 0, size, 0);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  unlinkSync(out);
  return { code: 0, message: `forgotten: ${out}` };
}

function parseForgetArgs(argv) {
  let out;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a !== "--out") throw new Error(`unknown argument: ${a}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) throw new Error("--out needs a value");
    if (out !== undefined) throw new Error("--out given twice");
    out = v;
  }
  if (out === undefined) throw new Error("--out is required");
  return out;
}

function main() {
  let out;
  try { out = parseForgetArgs(process.argv.slice(2)); }
  catch (e) {
    console.error(whyOf(e));
    process.exitCode = 2;
    return;
  }
  try {
    const result = forgetSignin(out);
    if (result.code === 0) console.log(result.message);
    else console.error(result.message);
    process.exitCode = result.code;
  } catch (e) {
    console.error(whyOf(e));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
