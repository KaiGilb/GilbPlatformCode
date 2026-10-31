// New. The catalogue is read only: nothing in this unit can send anything. The source (comments left out) names no HTTP method but GET
// and none of POST, PUT, PATCH, DELETE, and calls no network function at all.
import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const src = fileURLToPath(new URL(".", import.meta.url));
const files = readdirSync(src).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

/** The text of a source file with every comment removed. */
function code(file: string): string {
  const text = readFileSync(join(src, file), "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  let out = "";
  const visit = (n: ts.Node) => {
    const kids = n.getChildren(sf);
    if (kids.length === 0) out += n.getText(sf) + " ";
    else kids.forEach(visit);
  };
  visit(sf);
  return out;
}

describe("the source can only read", () => {
  test("there is source to look at", () => expect(files.length).toBeGreaterThan(0));
  test.each(files)("%s: no method but GET, no write verb, no network call", (f) => {
    const c = code(f);
    expect(c).not.toMatch(/\b(POST|PUT|PATCH|DELETE)\b/);
    for (const m of c.matchAll(/method\s*:\s*("[^"]*"|'[^']*'|`[^`]*`)/g)) expect((m[1] ?? "").slice(1, -1)).toBe("GET");
    expect(c).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/);
  });
});
