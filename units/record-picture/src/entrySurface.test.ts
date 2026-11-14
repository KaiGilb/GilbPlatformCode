// @vitest-environment node
// The "." entry is small: what it reaches by import is its own files and the two required peers, never the optional ones.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL(".", import.meta.url));

function specsOf(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(join(src, file), "utf8"), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) out.push(n.moduleSpecifier.text);
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) out.push(n.arguments[0].text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function closure(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const f = queue.shift()!;
    if (files.has(f)) continue;
    files.add(f);
    for (const s of specsOf(f)) {
      if (s.startsWith("./")) {
        const next = `${s.slice(2)}.ts`;
        expect(existsSync(join(src, next)), `${f} imports ${s}`).toBe(true);
        queue.push(next);
      } else packages.add(s);
    }
  }
  return { files: [...files].sort(), packages: [...packages].sort() };
}

describe("the entries' import surface", () => {
  it('"." reaches only index, link, flow and types, and only lws-records and photo-ref', () => {
    const c = closure("index.ts");
    expect(c.files).toEqual(["flow.ts", "index.ts", "link.ts", "types.ts"]);
    expect(c.packages).toEqual(["@kaigilb/gilbplatformcode-lws-records", "@kaigilb/gilbplatformcode-photo-ref"]);
    for (const p of c.packages) expect(p).not.toMatch(/picture-shrink|picture-pick|picture-set|picture-upload|session-bridge/);
  });
  it('"./prepare" reaches only picture-shrink and picture-pick', () => {
    expect(closure("prepare.ts").packages).toEqual(["@kaigilb/gilbplatformcode-picture-pick", "@kaigilb/gilbplatformcode-picture-shrink"]);
  });
  it('"./vault" reaches only picture-set, the bridge and the two required peers (picture-upload is picture-set\'s own peer)', () => {
    expect(closure("vault.ts").packages).toEqual([
      "@kaigilb/gilbplatformcode-lws-records",
      "@kaigilb/gilbplatformcode-lws-session-bridge",
      "@kaigilb/gilbplatformcode-photo-ref",
      "@kaigilb/gilbplatformcode-picture-set",
    ]);
  });
});
