import { describe, expect, it } from "vitest";
import { statementRefHref } from "./statementHref";

describe("statementRefHref", () => {
  it("returns the trimmed http(s) text, not a rewritten address", () => {
    expect(statementRefHref("https://example.test")).toBe("https://example.test");
    expect(statementRefHref("http://example.test/y")).toBe("http://example.test/y");
    expect(statementRefHref("  https://Example.TEST/A  ")).toBe("https://Example.TEST/A");
  });

  it("refuses every other scheme, including a broken-up javascript scheme", () => {
    for (const hostile of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "java\nscript:alert(1)",
      "  javascript:alert(1)  ",
      "data:text/html,x",
      "vbscript:msgbox",
      "file:///etc/passwd",
      "ftp://example.test/a",
      "//example.test/a",
      "Some.Target",
      "httpfoo",
      "",
      "   ",
    ]) {
      expect(statementRefHref(hostile)).toBeNull();
    }
  });
});
