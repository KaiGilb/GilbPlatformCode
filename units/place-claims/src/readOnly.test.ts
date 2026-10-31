// New. This unit only reads. The source (comments left out) names no HTTP method and no write verb, calls no network function itself (the
// requests are the peers' `listVaultRecordsPage` and `getResource`), and imports no write function of the record client.
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
  test.each(files)("%s: no method, no write verb, no write function, no network call", (f) => {
    const c = code(f);
    expect(c).not.toMatch(/\b(POST|PUT|PATCH|DELETE)\b/);
    expect(c).not.toMatch(/\bmethod\b|\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket/);
    expect(c).not.toMatch(/\b(createResource|patchResource|deleteResource|createRecord|patchRecord|deleteRecord)\b/);
  });
});
