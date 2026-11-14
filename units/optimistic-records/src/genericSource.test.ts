// @vitest-environment node
// The unit is generic: no word of any one kind of record, and no data-fetching library.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("the source", () => {
  it.each(["index.ts", "useRecordList.ts"])("%s names no kind of record and no data library", (file) => {
    const src = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
    expect(src).not.toMatch(/camera|plant|bike|film|react-query|tanstack|swr/i);
  });
  it("the only package it imports is react", () => {
    const src = readFileSync(fileURLToPath(new URL("./useRecordList.ts", import.meta.url)), "utf8");
    expect([...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1])).toEqual(["react"]);
  });
});
