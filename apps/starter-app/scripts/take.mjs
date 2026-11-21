#!/usr/bin/env node
// Takes the starter for a new app: copies this folder to a new one, points its units at this library, and renames it.
//
//   node <library>/apps/starter-app/scripts/take.mjs <new-app-folder> --id <app-id> --name "<App name>" [--suffix <vault-suffix>] [--port <port>]
//
//   --id      lower-case letters, digits and hyphens: the app's short id (storage keys, package name)
//   --name    the app's name as people read it (sign-in card, header, sign-in email)
//   --suffix  added to a person's own name to name their vault for the app; default: the id without hyphens
//   --port    the app's own dev port; without it the starter's port is kept and you must change it before you run two apps
//
// It writes only inside <new-app-folder>, which must not exist yet or must be empty. It installs nothing and asks no
// server anything. Exit 0 = taken, 1 = refused (it says why), 2 = called wrong.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STARTER = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Not copied: what an install or a build makes, the lock file (its paths are this library's), and this script with its test. */
const LEFT_OUT = new Set(["node_modules", "dist", "proof-out", "package-lock.json", "tsconfig.tsbuildinfo", "scripts/take.mjs", "test/take.test.ts"]);
/** Ports no app may take: Gilb's own two rigs, and the two tool defaults that collide between projects. */
const REFUSED_PORTS = new Set([5197, 5251, 5173, 8787]);

export class TakeError extends Error {}

/**
 * Checks what was asked for.
 *
 * @param {{ id?: string, name?: string, suffix?: string, port?: string | number }} o
 * @returns {{ id: string, name: string, suffix: string, port: number | null }}
 * @throws {TakeError} with a plain sentence
 */
export function checkOptions(o) {
  const id = String(o.id ?? "");
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new TakeError("--id must start with a letter and hold only lower-case letters, digits and hyphens.");
  const name = String(o.name ?? "").trim();
  if (!name) throw new TakeError('--name is missing: give the app\'s name as people read it, for example --name "Plant Diary".');
  if (/["\\<>\n]/.test(name)) throw new TakeError('--name must not hold a quote, a backslash, "<", ">" or a line break.');
  const suffix = String(o.suffix ?? id.replace(/-/g, ""));
  if (!/^[a-z0-9]+$/.test(suffix)) throw new TakeError("--suffix must hold only lower-case letters and digits.");
  let port = null;
  if (o.port !== undefined) {
    port = Number(o.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new TakeError("--port must be a whole number from 1024 to 65535.");
    if (REFUSED_PORTS.has(port)) throw new TakeError(`--port ${port} is not free to take: 5197 and 5251 are Gilb's own rigs, 5173 and 8787 are tool defaults that collide.`);
  }
  return { id, name, suffix, port };
}

/** Replaces exactly one occurrence, and refuses when the text to replace is not there: the starter and this script must not drift apart. */
function swap(text, from, to, file) {
  const at = text.indexOf(from);
  if (at < 0 || text.indexOf(from, at + from.length) >= 0) throw new TakeError(`take: expected exactly one ${JSON.stringify(from)} in ${file}. The starter changed; this script must change with it.`);
  return text.slice(0, at) + to + text.slice(at + from.length);
}

/**
 * The new text of one copied file, or the same text for a file that is copied as it is.
 *
 * @param {string} file the path inside the app, with forward slashes
 * @param {string} text the starter's text
 * @param {{ id: string, name: string, suffix: string, port: number | null, unitsPath: string }} o `unitsPath` is the path from the new app to the library's units folder
 * @returns {string}
 */
export function rewriteFile(file, text, o) {
  if (file === "package.json") {
    const pkg = JSON.parse(text);
    pkg.name = o.id;
    pkg.version = "0.1.0";
    pkg.description = `${o.name}: a GilbPlatform app, started from the starter app.`;
    let units = 0;
    for (const group of ["dependencies", "devDependencies"]) {
      for (const [dep, value] of Object.entries(pkg[group] ?? {})) {
        if (typeof value === "string" && value.startsWith("file:../../units/")) {
          pkg[group][dep] = `file:${o.unitsPath}/${value.slice("file:../../units/".length)}`;
          units++;
        }
      }
    }
    if (units === 0) throw new TakeError("take: package.json names no unit of this library. The starter changed; this script must change with it.");
    return JSON.stringify(pkg, null, 2) + "\n";
  }
  if (file === "src/settings.ts") {
    let t = swap(text, 'appId: "starter"', `appId: ${JSON.stringify(o.id)}`, file);
    t = swap(t, 'appName: "Starter"', `appName: ${JSON.stringify(o.name)}`, file);
    return swap(t, 'vaultNameSuffix: "starter"', `vaultNameSuffix: ${JSON.stringify(o.suffix)}`, file);
  }
  if (file === "index.html") return swap(text, "<title>Starter</title>", `<title>${o.name.replace(/&/g, "&amp;")}</title>`, file);
  if (file === "vite.config.ts" && o.port !== null) {
    let t = swap(text, "// Port 5262 is this app's allocation in the dev-port map (Rule_Code_dev-ports, RuleDevportPinConfig). A new app draws its own.", `// Port ${o.port} is this app's own dev port.`, file);
    t = swap(t, 'server: { port: 5262, strictPort: true, host: "localhost" }', `server: { port: ${o.port}, strictPort: true, host: "localhost" }`, file);
    return swap(t, 'preview: { port: 5262, strictPort: true, host: "localhost" }', `preview: { port: ${o.port}, strictPort: true, host: "localhost" }`, file);
  }
  if (file === "scripts/browser-proof.mjs" && o.port !== null) return swap(text, 'process.argv[3] ?? "http://localhost:5262"', `process.argv[3] ?? "http://localhost:${o.port}"`, file);
  return text;
}

function filesOf(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = relative(base, join(dir, entry.name)).split(sep).join("/");
    if (LEFT_OUT.has(rel)) continue;
    if (entry.isDirectory()) out.push(...filesOf(join(dir, entry.name), base));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

const REWRITTEN = new Set(["package.json", "src/settings.ts", "index.html", "vite.config.ts", "scripts/browser-proof.mjs"]);

/**
 * Copies the starter to `target` and renames it.
 *
 * @param {string} target the new app's folder; it must not exist or must be empty
 * @param {{ id?: string, name?: string, suffix?: string, port?: string | number }} options
 * @param {{ starter?: string }} [from] the starter folder (default: the one this script is in)
 * @returns {{ target: string, files: string[], options: ReturnType<typeof checkOptions>, unitsPath: string }}
 * @throws {TakeError}
 */
export function take(target, options, from = {}) {
  const starter = from.starter ?? STARTER;
  const o = checkOptions(options);
  const dest = resolve(target);
  if (existsSync(dest) && readdirSync(dest).length > 0) throw new TakeError(`${dest} is not empty. Name a folder that does not exist yet.`);
  const inside = relative(resolve(starter, "..", ".."), dest);
  if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) throw new TakeError("The new app must be outside the library's folder: it is its own project, not a part of the library.");
  const units = resolve(starter, "..", "..", "units");
  const rel = relative(dest, units).split(sep).join("/");
  const unitsPath = isAbsolute(rel) ? units.split(sep).join("/") : rel; // another drive: the full path
  const files = filesOf(starter);
  mkdirSync(dest, { recursive: true });
  for (const file of files) {
    const to = join(dest, file);
    mkdirSync(dirname(to), { recursive: true });
    if (REWRITTEN.has(file)) writeFileSync(to, rewriteFile(file, readFileSync(join(starter, file), "utf8"), { ...o, unitsPath }));
    else cpSync(join(starter, file), to);
  }
  return { target: dest, files, options: o, unitsPath };
}

function parseArgs(argv) {
  const out = { target: undefined, options: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (!["id", "name", "suffix", "port"].includes(key) || argv[i + 1] === undefined) return null;
      out.options[key] = argv[++i];
    } else if (out.target === undefined) out.target = a;
    else return null;
  }
  return out.target === undefined ? null : out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error('usage: node take.mjs <new-app-folder> --id <app-id> --name "<App name>" [--suffix <vault-suffix>] [--port <port>]');
    process.exit(2);
  }
  try {
    const done = take(args.target, args.options);
    console.log(`Took the starter as "${done.options.name}" (${done.options.id}) into ${done.target}: ${done.files.length} files.`);
    console.log(`Its units are installed from ${done.unitsPath} (this library). Keep the library where it is, or change those paths in package.json.`);
    if (done.options.port === null) console.log("The dev port is still the starter's, 5262. Give the app its own in vite.config.ts before you run it beside another app.");
    console.log("Next, in the new folder: npm install, then npm test, then npm run dev:fake. The README says the rest.");
  } catch (e) {
    if (!(e instanceof TakeError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}
