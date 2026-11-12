// @vitest-environment node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, installFont, makeApp, sheetWith } from "./fixtures";

afterEach(cleanup);
const bin = fileURLToPath(new URL("../bin/style-app-fonts.mjs", import.meta.url));

/** Runs the bin as its own node process; kills only that child if it hangs. */
function run(args: string[], cwd?: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("the bin did not finish in 20 s"));
    }, 20_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

describe("style-app-fonts", () => {
  it("exits 1 with a sentence when the tokens file is missing", async () => {
    const app = makeApp();
    const r = await run([app]);
    expect(r.code).toBe(1);
    expect(r.err).toBe("public/style.tokens.json was not found; save a style in the Studio first.\n");
    expect(existsSync(path.join(app, "public/fonts.css"))).toBe(false);
  });
  it("exits 1 with a sentence when the tokens file is not valid JSON or not an object", async () => {
    const app = makeApp();
    writeFileSync(path.join(app, "public/style.tokens.json"), "{oops");
    const bad = await run([app]);
    expect(bad.code).toBe(1);
    expect(bad.err).toBe("public/style.tokens.json is not valid JSON.\n");
    writeFileSync(path.join(app, "public/style.tokens.json"), "[1]");
    const arr = await run([app]);
    expect(arr.code).toBe(1);
    expect(arr.err).toBe("public/style.tokens.json must hold a style sheet object.\n");
  });
  it("exits 0 and writes fonts.css for good tokens", async () => {
    const app = makeApp();
    installFont(app, "inter");
    writeFileSync(path.join(app, "public/style.tokens.json"), JSON.stringify(sheetWith({ sans: { family: "Inter", source: "bundled" } })));
    const r = await run([app]);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toBe("fonts.css written (1 font family)\n");
    expect(readFileSync(path.join(app, "public/fonts.css"), "utf8")).toContain("url(/fonts/inter/inter-latin-400-normal.woff2)");
    expect(existsSync(path.join(app, "public/fonts/inter/inter-latin-600-normal.woff2"))).toBe(true);
  });
  it("exits 0 and prints a warning for a missing package", async () => {
    const app = makeApp();
    writeFileSync(path.join(app, "public/style.tokens.json"), JSON.stringify(sheetWith({ sans: { family: "Fraunces", source: "bundled" } })));
    const r = await run([app]);
    expect(r.code).toBe(0);
    expect(r.err).toBe("Warning: Font package @fontsource/fraunces is not installed; skipped.\n");
    expect(r.out).toContain("1 warning(s)");
  });
  it("uses the current folder when no appRoot is given", async () => {
    const app = makeApp();
    mkdirSync(path.join(app, "public"), { recursive: true });
    writeFileSync(path.join(app, "public/style.tokens.json"), JSON.stringify(sheetWith({})));
    const r = await run([], app);
    expect(r.code, r.err).toBe(0);
    expect(existsSync(path.join(app, "public/fonts.css"))).toBe(true);
  });
});
