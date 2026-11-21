// @vitest-environment node
// The take script: what it asks for, what it copies and what it renames. It runs against this folder's own files, so a
// change to the starter that the script does not follow fails here. This file is not copied into a new app.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error a plain Node script with JSDoc types, not a module of the app
import { checkOptions, take, TakeError } from "../scripts/take.mjs";

const app = process.cwd();
// Outside the library, as a new app must be: beside the clone, under a name no project uses.
const scratch = resolve(app, "..", "..", "..", `.starter-app-take-test-${process.pid}`);
const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");
let n = 0;
const fresh = () => join(scratch, `app-${++n}`);

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("checkOptions", () => {
  it("takes an id and a name; the vault suffix defaults to the id without hyphens, and no port is asked for", () => {
    expect(checkOptions({ id: "plant-diary", name: " Plant Diary " })).toEqual({ id: "plant-diary", name: "Plant Diary", suffix: "plantdiary", port: null });
    expect(checkOptions({ id: "plants", name: "Plants", suffix: "garden", port: "5301" })).toEqual({ id: "plants", name: "Plants", suffix: "garden", port: 5301 });
  });

  it.each([
    [{ name: "Plants" }, "--id must start with a letter"],
    [{ id: "Plants", name: "Plants" }, "--id must start with a letter"],
    [{ id: "plants" }, "--name is missing"],
    [{ id: "plants", name: 'Pla"nts' }, "--name must not hold a quote"],
    [{ id: "plants", name: "Plants", suffix: "my-plants" }, "--suffix must hold only lower-case letters and digits."],
    [{ id: "plants", name: "Plants", port: "80" }, "--port must be a whole number from 1024 to 65535."],
    [{ id: "plants", name: "Plants", port: "5251" }, "--port 5251 is not free to take"],
    [{ id: "plants", name: "Plants", port: "5173" }, "--port 5173 is not free to take"],
  ])("refuses %j", (options, sentence) => {
    expect(() => checkOptions(options)).toThrow(TakeError);
    expect(() => checkOptions(options)).toThrow(sentence);
  });
});

describe("take", () => {
  it("copies the starter, renames it, points its units at this library, and leaves out what a new app must not inherit", () => {
    const dest = fresh();
    const done = take(dest, { id: "plant-diary", name: "Plant Diary", port: 5301 });

    const pkg = JSON.parse(read(dest, "package.json"));
    expect(pkg.name).toBe("plant-diary");
    const units = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([name]) => name.startsWith("@kaigilb/"));
    expect(units.length).toBeGreaterThan(15);
    for (const [name, value] of units) {
      const folder = resolve(dest, String(value).replace(/^file:/, ""));
      expect(folder, name).toBe(resolve(app, "..", "..", "units", name.replace("@kaigilb/gilbplatformcode-", "")));
      expect(existsSync(join(folder, "package.json")), name).toBe(true);
    }

    const settings = read(dest, "src/settings.ts");
    expect(settings).toContain('appId: "plant-diary"');
    expect(settings).toContain('appName: "Plant Diary"');
    expect(settings).toContain('vaultNameSuffix: "plantdiary"');
    expect(settings).toContain('vaultType: ""'); // the new app's own type is still to be set
    expect(read(dest, "index.html")).toContain("<title>Plant Diary</title>");
    expect(read(dest, "vite.config.ts")).toContain("server: { port: 5301, strictPort: true");
    expect(read(dest, "vite.config.ts")).not.toContain("5262");
    expect(read(dest, "scripts/browser-proof.mjs")).toContain("http://localhost:5301");

    expect(read(dest, ".npmrc")).toBe(read(app, ".npmrc")); // units are installed as copies
    expect(read(dest, "public/style.tokens.json")).toBe(read(app, "public/style.tokens.json"));
    for (const left of ["node_modules", "dist", "package-lock.json", "scripts/take.mjs", "test/take.test.ts"]) expect(existsSync(join(dest, left)), left).toBe(false);
    for (const kept of ["README.md", "src/main.tsx", "src/App.tsx", "src/fake.tsx", "src/sections.tsx", "src/records/RecordsHome.tsx", "styles/app.css", "test/app.test.tsx", "test/setup.ts", "scripts/check-build.mjs", ".gitignore", "tsconfig.json"]) {
      expect(done.files, kept).toContain(kept);
      expect(existsSync(join(dest, kept)), kept).toBe(true);
    }
  });

  it("without a port it keeps the starter's", () => {
    const dest = fresh();
    take(dest, { id: "plants", name: "Plants" });
    expect(read(dest, "vite.config.ts")).toBe(read(app, "vite.config.ts"));
  });

  it("refuses a folder that holds something, and a folder inside the library, and writes nothing", () => {
    const full = fresh();
    mkdirSync(full, { recursive: true });
    take(full, { id: "plants", name: "Plants" });
    const before = readdirSync(full).sort();
    expect(() => take(full, { id: "other", name: "Other" })).toThrow("is not empty");
    expect(readdirSync(full).sort()).toEqual(before);
    expect(read(full, "src/settings.ts")).toContain('appId: "plants"');

    const inside = resolve(app, "..", "taken-app");
    expect(() => take(inside, { id: "plants", name: "Plants" })).toThrow("must be outside the library's folder");
    expect(existsSync(inside)).toBe(false);
  });

  it("as a command: exit 2 when called wrong, exit 1 with the sentence when refused, exit 0 and the next steps when taken", () => {
    const script = join(app, "scripts", "take.mjs");
    const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    expect(run().status).toBe(2);
    expect(run(fresh(), "--id").status).toBe(2);
    const refused = run(fresh(), "--id", "Bad Id", "--name", "X");
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("--id must start with a letter");
    const dest = fresh();
    const taken = run(dest, "--id", "plants", "--name", "Plants");
    expect(taken.status, taken.stderr).toBe(0);
    expect(taken.stdout).toContain(`Took the starter as "Plants" (plants) into ${dest}`);
    expect(taken.stdout).toContain("The dev port is still the starter's, 5262.");
    expect(taken.stdout).toContain("npm install, then npm test, then npm run dev:fake");
  });
});
