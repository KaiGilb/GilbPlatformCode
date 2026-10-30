// @vitest-environment node
// A static check: no source file that live mode loads sends PATCH, POST, PUT or DELETE, except src/live/writes.ts, behind its gate.
// (The sign-in unit's own calls are in node_modules and are not scanned.)
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const src = path.resolve(__dirname, "../src");

/** Every file reachable from the live app by relative imports. */
function liveGraph(entry: string): string[] {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const base = path.resolve(path.dirname(file), m[1]!);
      const hit = [".ts", ".tsx", "/index.ts"].map((e) => base + e).find((f) => fs.existsSync(f));
      if (hit) walk(hit);
    }
  };
  walk(entry);
  return [...seen];
}
const WRITE = /["'`](PATCH|POST|PUT|DELETE)["'`]|\bmethod\s*[:=]\s*["'`]/;

describe("L8 no write code path in live mode", () => {
  const files = liveGraph(path.join(src, "live/LiveApp.tsx"));

  test("L8 the live graph is what we think it is: it reaches the list and the entry page, and not the stand-in or the rename page", () => {
    const names = files.map((f) => path.relative(src, f));
    expect(names).toEqual(expect.arrayContaining(["live/LiveApp.tsx", "entries.ts", "screens/Entries.tsx", "screens/LiveEntry.tsx", "speed.ts", "live/writes.ts", "live/writeJobs.ts"]));
    expect(names).not.toContain("fakePlatform.ts");
    expect(names).not.toContain("screens/Entry.tsx");
    expect(names).not.toContain("standin.ts");
  });

  test("L8 no live-mode source file sends PATCH, POST, PUT or DELETE, except live/writes.ts", () => {
    for (const f of files) {
      const name = path.relative(src, f);
      if (name === "live/writes.ts") continue;
      expect(fs.readFileSync(f, "utf8"), name).not.toMatch(WRITE);
    }
  });

  test("W1 live/writes.ts is the one place: it holds every write verb, and it sends only through its gate", () => {
    const text = fs.readFileSync(path.join(src, "live/writes.ts"), "utf8");
    for (const verb of ["PATCH", "POST", "DELETE"]) expect(text).toContain(`"${verb}"`);
    expect(text.match(/o\.fetch\(/g)).toHaveLength(1); // the only network call, inside `send`
    expect(text).toMatch(/async function send\([\s\S]*?gate\(method, url\);\s*return o\.fetch\(/);
  });

  test("L8 the check itself sees a write (it is not blind): the stand-in's rename page has one", () => {
    expect(fs.readFileSync(path.join(src, "screens/Entry.tsx"), "utf8")).toMatch(WRITE);
  });
});
