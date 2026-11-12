// @vitest-environment node
// This unit holds NO term: the picture fact's name is always a parameter. How this test is meaningful: it parses every non-test source
// file with the TypeScript compiler and collects every STRING LITERAL (and template-literal text) in the code, comments excluded, then asserts
// none of them is a likely default fact name ("image", "picture", "photo", "a:image", ...). Comments may say "picture" freely; a value may not.
// A planted `const f = "image"` proves the scanner sees a literal.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL(".", import.meta.url));
const FORBIDDEN = new Set(["image", "picture", "photo", "a:image", "a:picture", "a:photo", "img", "a:img"]);

function literalsOf(file: string, text: string): { text: string; line: number }[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: { text: string; line: number }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      out.push({ text: n.text, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
const bad = (file: string, text: string) => literalsOf(file, text).filter((l) => FORBIDDEN.has(l.text.trim().toLowerCase()));

describe("no default fact name in src", () => {
  const files = readdirSync(src).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f));
  it("scans the unit's source files", () => {
    expect(files.sort()).toEqual(["flow.ts", "index.ts", "link.ts", "prepare.ts", "types.ts", "vault.ts"]);
  });
  it.each(files)("%s has no string literal that is a fact name", (f) => {
    expect(bad(f, readFileSync(join(src, f), "utf8"))).toEqual([]);
  });
  it("the scanner sees a literal default, a template head, and ignores a comment", () => {
    expect(bad("x.ts", `export const f = (fact = "image") => fact;`)).toHaveLength(1);
    expect(bad("x.ts", "export const k = `a:picture`;")).toHaveLength(1);
    expect(bad("x.ts", `export const k = { picture: 1 }["picture"];`)).toHaveLength(1);
    expect(bad("x.ts", `// the picture, "image"\nexport const k = 1; /* "picture" */`)).toEqual([]);
  });
  it("pictureOfFacts and pictureLinkPatch take the name from the caller, so a name the unit never heard of works", async () => {
    const { pictureOfFacts, pictureLinkPatch } = await import("./index");
    expect(pictureOfFacts({ "a:zzSnapshot": "x" }, "zzSnapshot")).toBe("x");
    expect(pictureLinkPatch("zzSnapshot", "m")).toEqual({ zzSnapshot: { "@id": "m" } });
  });
});
