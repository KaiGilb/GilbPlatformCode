import { describe, expect, it } from "vitest";
import { escapeVCardText, foldVCardLine } from "./vcardLine";

describe("escapeVCardText", () => {
  it("escapes backslash first, then newline, comma, and semicolon", () => {
    expect(escapeVCardText("a\\b,c;d")).toBe("a\\\\b\\,c\\;d");
    expect(escapeVCardText("a\nb")).toBe("a\\nb");
    expect(escapeVCardText("a\rb")).toBe("a\rb");
    expect(escapeVCardText("already\\n")).toBe("already\\\\n");
    expect(escapeVCardText("\\\n")).toBe("\\\\\\n");
  });
});

describe("foldVCardLine", () => {
  it("leaves 75 code units alone and folds the 76th", () => {
    const exact = "a".repeat(75);
    expect(foldVCardLine(exact)).toBe(exact);
    expect(foldVCardLine(exact + "Z")).toBe(`${exact}\r\n Z`);
  });

  it("continues in pieces of 74 after the first cut", () => {
    const line = "a".repeat(75 + 74 + 1);
    const folded = foldVCardLine(line);
    const parts = folded.split("\r\n");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveLength(75);
    expect(parts[1]).toBe(" " + "a".repeat(74));
    expect(parts[2]).toBe(" a");
  });

  it("counts UTF-16 code units, not graphemes", () => {
    const line = "é".repeat(76);
    expect(line.length).toBe(76);
    expect(foldVCardLine(line).includes("\r\n")).toBe(true);
  });
});
