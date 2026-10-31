// @vitest-environment node
// New. This unit sends nothing itself: every write goes through `vault-resources`, after the fence. No fetch and no method in the source.
import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const src = fileURLToPath(new URL(".", import.meta.url));
const files = readdirSync(src).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
function code(file: string): string {
  const sf = ts.createSourceFile(file, readFileSync(join(src, file), "utf8"), ts.ScriptTarget.Latest, true);
  let out = "";
  const visit = (n: ts.Node) => {
    if (n.kind === ts.SyntaxKind.JSDoc) return; // a doc comment is not code
    const kids = n.getChildren(sf);
    if (kids.length === 0) out += n.getText(sf) + " ";
    else kids.forEach(visit);
  };
  visit(sf);
  return out;
}
describe("the source makes no request of its own", () => {
  test("there is source to look at", () => expect(files.length).toBeGreaterThan(0));
  test.each(files)("%s: no fetch, no method, no direct record-client call", (f) => {
    const c = code(f);
    expect(c).not.toMatch(/\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket|\bmethod\b/);
    // the only write functions it calls are the record client's three, and every call of them is preceded by the fence in the same function
    expect(c).not.toMatch(/\b(createRecord|patchRecord|deleteRecord)\b/);
  });
});
