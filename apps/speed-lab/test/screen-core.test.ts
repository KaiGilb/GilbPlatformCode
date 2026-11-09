// @vitest-environment node
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { compileDoneText, parseScreenSteps, redactUrl, selectorOf, settle, summarise } from "../scripts/screen-core.mjs";
// @ts-expect-error plain ESM script without types
import { main as runScreen } from "../scripts/screen-runner.mjs";

const row = (key: string, text: boolean, face: string, sig = "") => ({ key, text, face, sig });

describe("screen-core", () => {
  it("parseScreenSteps: each kind, semicolon, a comma inside a selector", () => {
    expect(parseScreenSteps("click:go-away; wait:row; click-css:div.a, div.b; wait-css:ul > li; click-label:Go back; pause:20")).toEqual([
      { kind: "click", arg: "go-away" },
      { kind: "wait", arg: "row" },
      { kind: "click-css", arg: "div.a, div.b" },
      { kind: "wait-css", arg: "ul > li" },
      { kind: "click-label", arg: "Go back" },
      { kind: "pause", arg: "20" },
    ]);
    expect(parseScreenSteps("  click: foo ; ; pause:0 ")).toEqual([
      { kind: "click", arg: "foo" },
      { kind: "pause", arg: "0" },
    ]);
    expect(parseScreenSteps("")).toEqual([]);
    expect(parseScreenSteps("   ")).toEqual([]);
  });

  it("parseScreenSteps rejects an unknown kind, a missing argument, and a pause that is not a whole number", () => {
    expect(() => parseScreenSteps("hover:x")).toThrow("unknown step kind: hover");
    expect(() => parseScreenSteps("click:")).toThrow("step click needs an argument");
    expect(() => parseScreenSteps("click-css:")).toThrow("step click-css needs an argument");
    expect(() => parseScreenSteps("pause:")).toThrow("step pause needs an argument");
    expect(() => parseScreenSteps("pause:1.5")).toThrow("step pause needs a whole number");
    expect(() => parseScreenSteps("pause:no")).toThrow("step pause needs a whole number");
  });

  it("selectorOf escapes quotes and backslashes, and leaves a css selector as given", () => {
    expect(selectorOf({ kind: "click", arg: "row" })).toBe('[data-testid="row"]');
    expect(selectorOf({ kind: "wait", arg: 'a"b\\c' })).toBe('[data-testid="a\\"b\\\\c"]');
    expect(selectorOf({ kind: "click-label", arg: 'say "hi"' })).toBe('[aria-label="say \\"hi\\""]');
    expect(selectorOf({ kind: "click-css", arg: "div.a, div.b" })).toBe("div.a, div.b");
    expect(selectorOf({ kind: "wait-css", arg: "ul > li" })).toBe("ul > li");
    expect(() => selectorOf({ kind: "pause", arg: "10" })).toThrow("step pause has no selector");
  });

  it("summarise: odd, even, empty, ignores null", () => {
    expect(summarise([5, 1, 3])).toEqual({ n: 3, median: 3, min: 1, max: 5 });
    expect(summarise([1, 2, 3, 4])).toEqual({ n: 4, median: 2.5, min: 1, max: 4 });
    expect(summarise([1.04, 1.06])).toEqual({ n: 2, median: 1.1, min: 1, max: 1.1 });
    expect(summarise([10, null, 30, undefined, NaN, 20])).toEqual({ n: 3, median: 20, min: 10, max: 30 });
    expect(summarise([])).toEqual({ n: 0, median: null, min: null, max: null });
    expect(summarise([null, undefined, NaN])).toEqual({ n: 0, median: null, min: null, max: null });
  });

  it("settle is done after the quiet window, at the last change not the tick", () => {
    const got = settle([
      { t: 0, rows: [row("a", false, "loading")] },
      { t: 40, rows: [row("a", true, "painted", "1:a")] },
      { t: 139, rows: [row("a", true, "painted", "1:a")] },
      { t: 140, rows: [row("a", true, "painted", "1:a")] },
    ], { quietMs: 100, minRows: 1 });
    expect(got.done).toBe(true);
    expect(got.doneAt).toBe(40);
    expect(got.counts).toEqual({ rows: 1, painted: 1, none: 0, broken: 0 });
  });

  it("settle: a late picture resets the quiet window and moves doneAt", () => {
    const got = settle([
      { t: 0, rows: [row("a", true, "painted", "1:a")] },
      { t: 50, rows: [row("a", true, "painted", "1:a")] },
      { t: 80, rows: [row("a", true, "painted", "1:b")] },
      { t: 120, rows: [row("a", true, "painted", "1:b")] },
      { t: 180, rows: [row("a", true, "painted", "1:b")] },
    ], { quietMs: 100, minRows: 1 });
    expect(got.done).toBe(true);
    expect(got.doneAt).toBe(80);
  });

  it("settle stops at the first quiet window and ignores a later change", () => {
    const got = settle([
      { t: 0, rows: [row("a", true, "painted", "1:a")] },
      { t: 100, rows: [row("a", true, "painted", "1:a")] },
      { t: 500, rows: [row("a", true, "painted", "1:b")] },
      { t: 700, rows: [row("a", true, "painted", "1:b")] },
    ], { quietMs: 100, minRows: 1 });
    expect(got.done).toBe(true);
    expect(got.doneAt).toBe(0);
    expect(got.lastFaceAt).toBe(0);
  });

  it("settle: a loading face never completes", () => {
    const got = settle([
      { t: 0, rows: [row("a", true, "painted", "1:a"), row("b", true, "loading", "")] },
      { t: 500, rows: [row("a", true, "painted", "1:a"), row("b", true, "loading", "")] },
    ], { quietMs: 100, minRows: 1 });
    expect(got.done).toBe(false);
    expect(got.doneAt).toBe(null);
    expect(got.firstRowAt).toBe(0);
    expect(got.allTextAt).toBe(0);
    expect(got.lastFaceAt).toBe(0);
  });

  it("settle: fewer rows than minRows is not done", () => {
    const got = settle([
      { t: 0, rows: [row("a", true, "painted", "1:a")] },
      { t: 500, rows: [row("a", true, "painted", "1:a")] },
    ], { quietMs: 100, minRows: 2 });
    expect(got.done).toBe(false);
    expect(got.doneAt).toBe(null);
    expect(got.allTextAt).toBe(null);
    expect(got.firstRowAt).toBe(0);
    expect(got.lastFaceAt).toBe(0);
  });

  it("settle: a broken picture can settle, and stamps firstRowAt, allTextAt, lastFaceAt", () => {
    const broken = settle([
      { t: 0, rows: [row("a", true, "broken", "1:")] },
      { t: 100, rows: [row("a", true, "broken", "1:")] },
    ], { quietMs: 100, minRows: 1 });
    expect(broken.done).toBe(true);
    expect(broken.doneAt).toBe(0);
    expect(broken.counts).toEqual({ rows: 1, painted: 0, none: 0, broken: 1 });

    const got = settle([
      { t: 10, rows: [row("a", false, "none"), row("b", false, "loading", "")] },
      { t: 20, rows: [row("a", true, "none"), row("b", false, "loading", "")] },
      { t: 30, rows: [row("a", false, "none"), row("b", false, "loading", "")] },
      { t: 40, rows: [row("a", true, "none"), row("b", true, "loading", "3:abc")] },
      { t: 80, rows: [row("a", true, "none"), row("b", true, "painted", "3:abc")] },
      { t: 90, rows: [row("a", true, "painted", "1:a"), row("b", true, "painted", "3:abc")] },
      { t: 190, rows: [row("a", true, "painted", "1:a"), row("b", true, "painted", "3:abc")] },
    ], { quietMs: 100, minRows: 2 });
    expect(got).toEqual({
      done: true,
      doneAt: 90,
      firstRowAt: 20,
      allTextAt: 40,
      lastFaceAt: 90,
      doneTextAt: null,
      counts: { rows: 2, painted: 2, none: 0, broken: 0 },
    });
  });

  it("settle: textOk false keeps a finished screen from being done", () => {
    const got = settle([
      { t: 0, rows: [row("a", true, "painted", "1:a")], textOk: false },
      { t: 500, rows: [row("a", true, "painted", "1:a")], textOk: false },
    ], { quietMs: 100, minRows: 1 });
    expect(got.done).toBe(false);
    expect(got.doneAt).toBe(null);
    expect(got.doneTextAt).toBe(null);
    expect(got.lastFaceAt).toBe(0);
    expect(got.counts).toEqual({ rows: null, painted: null, none: null, broken: null });
  });

  it("settle: text turning true is a change and starts the quiet window", () => {
    const early = settle([
      { t: 0, rows: [row("a", true, "painted", "1:a")], textOk: false },
      { t: 40, rows: [row("a", true, "painted", "1:a")], textOk: false },
      { t: 80, rows: [row("a", true, "painted", "1:a")], textOk: true },
      { t: 179, rows: [row("a", true, "painted", "1:a")], textOk: true },
    ], { quietMs: 100, minRows: 1 });
    expect(early.done).toBe(false);
    expect(early.doneAt).toBe(null);
    expect(early.doneTextAt).toBe(80);

    const got = settle([
      { t: 0, rows: [row("a", true, "painted", "1:a")], textOk: false },
      { t: 40, rows: [row("a", true, "painted", "1:a")], textOk: false },
      { t: 80, rows: [row("a", true, "painted", "1:a")], textOk: true },
      { t: 179, rows: [row("a", true, "painted", "1:a")], textOk: true },
      { t: 180, rows: [row("a", true, "painted", "1:a")], textOk: true },
    ], { quietMs: 100, minRows: 1 });
    expect(got.done).toBe(true);
    expect(got.doneAt).toBe(80);
    expect(got.doneTextAt).toBe(80);
    expect(got.counts).toEqual({ rows: 1, painted: 1, none: 0, broken: 0 });
  });

  it("settle: doneTextAt stays at the first match when a later picture moves doneAt", () => {
    const got = settle([
      { t: 0, rows: [row("a", true, "loading", "")], textOk: false },
      { t: 30, rows: [row("a", true, "loading", "")], textOk: true },
      { t: 70, rows: [row("a", true, "painted", "1:a")], textOk: true },
      { t: 170, rows: [row("a", true, "painted", "1:a")], textOk: true },
    ], { quietMs: 100, minRows: 1 });
    expect(got.done).toBe(true);
    expect(got.doneAt).toBe(70);
    expect(got.doneTextAt).toBe(30);
    expect(got.lastFaceAt).toBe(70);
  });

  it("settle: an absent textOk is the old done rule, and doneTextAt stays null", () => {
    const got = settle([
      { t: 0, rows: [row("a", true, "painted", "1:a")] },
      { t: 100, rows: [row("a", true, "painted", "1:a")] },
    ], { quietMs: 100, minRows: 1 });
    expect(got.done).toBe(true);
    expect(got.doneAt).toBe(0);
    expect(got.doneTextAt).toBe(null);
    expect(got.counts).toEqual({ rows: 1, painted: 1, none: 0, broken: 0 });
  });

  it("compileDoneText accepts a backreference and rejects a source that does not compile", () => {
    const src = "from (\\d+) of \\1 vaults read";
    expect(compileDoneText(src)).toBe(src);
    const re = new RegExp(src);
    expect(re.test("62 rows from 24 of 24 vaults read")).toBe(true);
    expect(re.test("32 rows from 16 of 24 vaults read")).toBe(false);
    expect(compileDoneText("all \\d+ read")).toBe("all \\d+ read");
    expect(() => compileDoneText("(")).toThrow("--done-text is not a regular expression");
    expect(() => compileDoneText("(")).toThrow("Unterminated group");
  });

  it("a --done-text that does not compile exits 2", async () => {
    const errors: string[] = [];
    const got = await runScreen(
      ["--url", "http://127.0.0.1:9/", "--app", "a", "--rows", "li", "--network", "n", "--done-text", "("],
      {},
      { log() {}, error(m: unknown) { errors.push(String(m)); } },
    );
    expect(got.code).toBe(2);
    expect(got.runs).toEqual([]);
    expect(errors.join("\n")).toContain("--done-text is not a regular expression");
  });

  it("redactUrl drops the query and the hash", () => {
    expect(redactUrl("https://ex.com:8443/a/b?x=1#h")).toBe("https://ex.com:8443/a/b");
    expect(redactUrl("http://127.0.0.1:5262/img?id=1&delay=2")).toBe("http://127.0.0.1:5262/img");
    expect(redactUrl("https://ex.com")).toBe("https://ex.com/");
    expect(redactUrl("not a url")).toBe("(unparsable)");
    expect(redactUrl("")).toBe("(unparsable)");
  });
});
