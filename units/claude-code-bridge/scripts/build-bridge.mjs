#!/usr/bin/env node
/**
 * Builds bridge/bridge.mjs and bridge/vite-plugin.mjs from src/bridge.ts and src/vitePlugin.ts.
 * Type annotations are removed and nothing else is changed (ts.transpileModule, ES2022, comments kept),
 * with ONE exception, for bridge.mjs: the Time line reader.
 *
 * What is inlined, from where, and why: src/bridge.ts has one line, `import { extractTimeLines } from "@kaigilb/gilbplatformcode-time-line";`
 * (so tsc and the tests see the real unit units/time-line). The built bridge.mjs is ONE file that runs on a person's computer and cannot resolve
 * a package there, so this build replaces that import line with the unit's own code: src/timeValues.ts and src/timeLine.ts of ../time-line,
 * transpiled with the same options, their relative imports and `export` keywords taken off, wrapped in one block that exposes only
 * extractTimeLines. The reader therefore exists once as source (the unit) and the built file always holds its current code. The build FAILS
 * (throws) when the import line is not found exactly once, a unit file is missing, the unit's src/index.ts exports a file this build does not
 * inline, an import or export is left at the start of a line, or the block does not parse. A test (src/build.test.mjs) runs the built block
 * on every case of the unit's fixtures.
 *   node scripts/build-bridge.mjs           writes the two files
 *   import { buildAll } from "./build-bridge.mjs"   returns { "bridge.mjs": text, "vite-plugin.mjs": text } without writing
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const COMPILER_OPTIONS = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, removeComments: false };

/** The one import line of src/bridge.ts that the build replaces by the unit's code. */
export const TIME_LINE_IMPORT = 'import { extractTimeLines } from "@kaigilb/gilbplatformcode-time-line";';
/** The unit's source files that are inlined, in this order (timeValues first: timeLine uses it), and nothing else may be exported by its index. */
const TIME_LINE_FILES = ["timeValues", "timeLine"];
const TIME_LINE_DIR = join(root, "..", "time-line");
export const TIME_LINE_MARKER = "/* inlined from units/time-line (timeValues.ts, timeLine.ts) by build-bridge.mjs; do not edit */";
export const TIME_LINE_OPEN = "const { extractTimeLines } = (() => { " + TIME_LINE_MARKER;
export const TIME_LINE_CLOSE = "return { extractTimeLines };\n})();";

/** The text of one unit source file, as the bridge needs it: transpiled, without its relative imports and without `export `. */
function unitCode(name) {
  const file = join(TIME_LINE_DIR, "src", `${name}.ts`);
  if (!existsSync(file)) throw new Error(`time-line inline: the unit file ${file} is missing`);
  let js = ts.transpileModule(readFileSync(file, "utf8"), { fileName: `units/time-line/src/${name}.ts`, compilerOptions: COMPILER_OPTIONS }).outputText;
  js = js.replace(/^import\s[^;]*?from\s+"\.\/[^"]*";[ \t]*\n/gm, ""); // import ... from "./x";
  js = js.replace(/^export\s*\{[^}]*\}\s*;?[ \t]*\n/gm, ""); // export { a, b };
  js = js.replace(/^export (?=(?:async |const |let |var |function|class |enum ))/gm, "");
  const left = /^(import|export) /m.exec(js);
  if (left) throw new Error(`time-line inline: ${name}.ts still has "${left[1]} " at the start of a line after stripping; the build cannot inline it`);
  return js;
}

/** The block that replaces the import line. Throws when the unit is not what the build expects. */
function timeLineBlock() {
  const indexFile = join(TIME_LINE_DIR, "src", "index.ts");
  if (!existsSync(indexFile)) throw new Error(`time-line inline: ${indexFile} is missing`);
  const named = new Set([...readFileSync(indexFile, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]));
  const want = new Set(TIME_LINE_FILES.map((f) => `./${f}`));
  const extra = [...named].filter((n) => !want.has(n));
  const missing = [...want].filter((n) => !named.has(n));
  if (extra.length > 0 || missing.length > 0) {
    throw new Error(`time-line inline: units/time-line/src/index.ts exports from [${[...named].join(", ")}] but this build inlines [${[...want].join(", ")}]; change TIME_LINE_FILES in scripts/build-bridge.mjs (extra: ${extra.join(", ") || "none"}; missing: ${missing.join(", ") || "none"})`);
  }
  const block = `${TIME_LINE_OPEN}\n${TIME_LINE_FILES.map(unitCode).join("\n")}\n${TIME_LINE_CLOSE}`;
  // Two unit files must not declare the same name: a duplicate would stop the built file at start-up. Say it here, not on a person's computer.
  try {
    new Function(block.slice(block.indexOf("=> {") + 4, block.lastIndexOf(TIME_LINE_CLOSE)) + "\nreturn { extractTimeLines };");
  } catch (e) {
    throw new Error(`time-line inline: the inlined block does not parse: ${e instanceof Error ? e.message : e}`);
  }
  return block;
}

/**
 * src/settingGrants.ts is inlined the same way (the built bridge is one file). bridge.ts imports its names with ONE line,
 * `import { a, b } from "./settingGrants.js";`; the build replaces it with `const { a, b } = (() => { <file>; return { a, b }; })();`.
 * The file's own imports (fs, path, crypto) are dropped because bridge.ts already has them in scope; any other import fails the build.
 */
export const SETTING_GRANTS_MARKER = "/* inlined from src/settingGrants.ts by build-bridge.mjs; do not edit */";
const SETTING_GRANTS_IMPORT = /^import \{([^}]*)\} from "\.\/settingGrants\.js";[ \t]*\n/m;
const SETTING_GRANTS_KEEP = new Set(["node:fs", "node:path", "node:crypto"]);

/**
 * src/approvedActions.ts is inlined the same way, right after settingGrants (it uses plainFileCheck, which is then already in the built file's scope, so its
 * `import ... from "./settingGrants.js"` line is dropped; bridge.ts must import that name too, and the build fails if it does not).
 */
export const APPROVED_ACTIONS_MARKER = "/* inlined from src/approvedActions.ts by build-bridge.mjs; do not edit */";
const APPROVED_ACTIONS_IMPORT = /^import \{([^}]*)\} from "\.\/approvedActions\.js";[ \t]*\n/m;

function settingGrantsBlock(names, srcName = "settingGrants", marker = SETTING_GRANTS_MARKER, scopeNames = []) {
  const file = join(root, "src", `${srcName}.ts`);
  if (!existsSync(file)) throw new Error(`setting grants inline: ${file} is missing`);
  let js = ts.transpileModule(readFileSync(file, "utf8"), { fileName: `src/${srcName}.ts`, compilerOptions: COMPILER_OPTIONS }).outputText;
  js = js.replace(/^import\s*(?:\{([^}]*)\}\s*)?[^;]*?from\s+"([^"]+)";[ \t]*\n/gm, (all, imported, from) => {
    if (from === "./settingGrants.js" && srcName !== "settingGrants") {
      const missing = (imported ?? "").split(",").map((x) => x.trim()).filter(Boolean).filter((n) => !scopeNames.includes(n));
      if (missing.length > 0) throw new Error(`approved actions inline: ${srcName}.ts uses ${missing.join(", ")} from settingGrants, which bridge.ts does not import`);
      return "";
    }
    if (!SETTING_GRANTS_KEEP.has(from)) throw new Error(`setting grants inline: ${srcName}.ts imports "${from}", which the build cannot inline (only fs, path, crypto)`);
    return "";
  });
  js = js.replace(/^export (?=(?:async |const |let |var |function|class |enum ))/gm, "");
  const left = /^(import|export) /m.exec(js);
  if (left) throw new Error(`setting grants inline: ${srcName}.ts still has "${left[1]} " at the start of a line after stripping`);
  const list = names.join(", ");
  const block = `const { ${list} } = (() => { ${marker}\n${js}\nreturn { ${list} };\n})();`;
  try {
    new Function("fs", "path", "crypto", block.slice(block.indexOf("=> {") + 4, block.lastIndexOf("\nreturn {")) + `\nreturn { ${list} };`);
  } catch (e) {
    throw new Error(`setting grants inline: the inlined block does not parse or a name is missing: ${e instanceof Error ? e.message : e}`);
  }
  return block;
}

const TARGETS = [
  { from: "src/bridge.ts", to: "bridge/bridge.mjs" },
  // The plugin imports the bridge by its source name; in the built folder that file is bridge.mjs.
  { from: "src/vitePlugin.ts", to: "bridge/vite-plugin.mjs", swap: ['from "./bridge.js"', 'from "./bridge.mjs"'] },
];

export function buildAll() {
  const out = {};
  for (const t of TARGETS) {
    const text = readFileSync(join(root, t.from), "utf8");
    let js = ts.transpileModule(text, {
      fileName: t.from,
      compilerOptions: COMPILER_OPTIONS,
    }).outputText;
    if (t.from === "src/bridge.ts") {
      if (js.split(TIME_LINE_IMPORT).length !== 2) throw new Error(`${t.from}: expected the line ${TIME_LINE_IMPORT} exactly once`);
      const block = timeLineBlock();
      js = js.replace(TIME_LINE_IMPORT, () => block);
    }
    if (t.from === "src/bridge.ts") {
      const m = SETTING_GRANTS_IMPORT.exec(js);
      if (!m || js.split('from "./settingGrants.js"').length !== 2) throw new Error(`${t.from}: expected one import { ... } from "./settingGrants.js"`);
      const names = m[1].split(",").map((x) => x.trim()).filter(Boolean);
      const block = settingGrantsBlock(names);
      js = js.replace(SETTING_GRANTS_IMPORT, () => block + "\n");
      const am = APPROVED_ACTIONS_IMPORT.exec(js);
      if (!am || js.split('from "./approvedActions.js"').length !== 2) throw new Error(`${t.from}: expected one import { ... } from "./approvedActions.js"`);
      const aNames = am[1].split(",").map((x) => x.trim()).filter(Boolean);
      js = js.replace(APPROVED_ACTIONS_IMPORT, () => settingGrantsBlock(aNames, "approvedActions", APPROVED_ACTIONS_MARKER, names) + "\n");
    }
    if (t.swap) {
      if (js.split(t.swap[0]).length !== 2) throw new Error(`${t.from}: expected ${t.swap[0]} exactly once`);
      js = js.replace(t.swap[0], t.swap[1]);
    }
    out[t.to] = js;
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [to, js] of Object.entries(buildAll())) {
    mkdirSync(dirname(join(root, to)), { recursive: true });
    writeFileSync(join(root, to), js);
    console.log(`built ${to}`);
  }
}
