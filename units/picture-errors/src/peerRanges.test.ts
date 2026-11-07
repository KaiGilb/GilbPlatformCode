import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Run from the unit's own folder (npm test does), so the sibling units are ../<name>.
// A range here is one or more carets joined by `||`, e.g. "^0.1.0 || ^0.2.0". No semver package is needed.
type V = [number, number, number];
const parse = (s: string): V => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(s.trim());
  if (!m) throw new Error(`not a plain version: ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};
const cmp = (a: V, b: V): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
/** ^X.Y.Z: at or above it, below the next change of the left-most non-zero part. */
function caret(range: string, v: V): boolean {
  const m = /^\^(\d+\.\d+\.\d+)$/.exec(range.trim());
  if (!m) throw new Error(`not a caret range: ${range}`);
  const lo = parse(m[1]!);
  const hi: V = lo[0] > 0 ? [lo[0] + 1, 0, 0] : lo[1] > 0 ? [0, lo[1] + 1, 0] : [0, 0, lo[2] + 1];
  return cmp(v, lo) >= 0 && cmp(v, hi) < 0;
}
const satisfies = (range: string, v: V): boolean => range.split("||").some((r) => caret(r, v));

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as { peerDependencies: Record<string, string> };
const peers = Object.entries(pkg.peerDependencies).filter(([name]) => name.startsWith("@kaigilb/"));

describe("the check itself", () => {
  it("reads carets of 0.x and 1.x and the || form", () => {
    expect(satisfies("^0.1.0", parse("0.2.0"))).toBe(false);
    expect(satisfies("^0.1.0 || ^0.2.0", parse("0.2.0"))).toBe(true);
    expect(satisfies("^0.1.0 || ^0.2.0", parse("0.3.0"))).toBe(false);
    expect(satisfies("^1.2.0", parse("1.9.0"))).toBe(true);
    expect(satisfies("^1.2.0", parse("2.0.0"))).toBe(false);
  });
});

describe("every @kaigilb peer range holds the version in the sibling unit", () => {
  it("has @kaigilb peers to check", () => {
    expect(peers.length).toBeGreaterThan(0);
  });
  for (const [name, range] of peers) {
    it(`${name} ${range}`, () => {
      const dir = name.replace("@kaigilb/gilbplatformcode-", "");
      const sibling = JSON.parse(readFileSync(resolve(process.cwd(), "..", dir, "package.json"), "utf8")) as { version: string };
      expect(satisfies(range, parse(sibling.version))).toBe(true);
    });
  }
});
