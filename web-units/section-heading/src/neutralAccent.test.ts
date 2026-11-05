// Guard: the accent fallback is the neutral #2563eb, never a source site's brand colour.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const SRC = join(process.cwd(), "src");
const css = readdirSync(SRC)
  .filter((f) => f.endsWith(".vue"))
  .map((f) => readFileSync(join(SRC, f), "utf8"))
  .map((s) => (s.split("<style")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, ""))
  .join("\n");
const OLD = ["1d4ed8", "b45309", "f5b942"].map((h) => "#" + h);

describe("neutral accent fallback", () => {
  test("every accent fallback is #2563eb", () => {
    const fallbacks = [...css.matchAll(/var\(--site-block-accent,\s*([^)]*)\)/g)].map((m) => m[1]);
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(new Set(fallbacks)).toEqual(new Set(["#2563eb"]));
  });

  test("no source-site brand colour is left in the styles", () => {
    for (const old of OLD) expect(css.toLowerCase()).not.toContain(old);
  });
});
