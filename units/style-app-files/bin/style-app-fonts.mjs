#!/usr/bin/env node
// style-app-fonts [appRoot]: reads <appRoot>/public/style.tokens.json and writes the fonts and public/fonts.css it needs.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { exportFonts } from "../src/index.mjs";

const appRoot = path.resolve(process.argv[2] ?? process.cwd());
let sheet;
try {
  sheet = JSON.parse(await readFile(path.join(appRoot, "public", "style.tokens.json"), "utf8"));
} catch (e) {
  const missing = e && e.code === "ENOENT";
  console.error(missing ? "public/style.tokens.json was not found; save a style in the Studio first." : "public/style.tokens.json is not valid JSON.");
  process.exit(1);
}
if (typeof sheet !== "object" || sheet === null || Array.isArray(sheet)) {
  console.error("public/style.tokens.json must hold a style sheet object.");
  process.exit(1);
}
try {
  const { families, warnings } = await exportFonts(sheet, { appRoot });
  for (const w of warnings) console.warn(`Warning: ${w}`);
  console.log(`fonts.css written (${families.length} font famil${families.length === 1 ? "y" : "ies"}${warnings.length ? `, ${warnings.length} warning(s)` : ""})`);
} catch {
  console.error("The fonts could not be exported.");
  process.exit(1);
}
