import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { ActionRow } from "./ActionRow";
import { StyleStudio } from "./studio/index";

afterEach(cleanup);
const row = () => screen.getByTestId("gs-actionrow");
const labels = () => Array.from(row().querySelectorAll("button")).map((b) => b.textContent);

describe("ActionRow (Mac order)", () => {
  it("orders destructive, cancel, primary (primary rightmost and default)", () => {
    render(<ActionRow destructive={{ label: "Delete" }} cancel={{ label: "Cancel" }} primary={{ label: "Save" }} />);
    expect(labels()).toEqual(["Delete", "Cancel", "Save"]);
    const btns = row().querySelectorAll("button");
    expect(btns[0]!.className).toContain("gs-actionrow__far");
    expect(btns[2]!.getAttribute("data-default")).toBe("true");
  });
  it("confirm mode: Cancel then red Delete rightmost, Cancel is default", () => {
    render(<ActionRow cancel={{ label: "Cancel" }} primary={{ label: "Delete", danger: true }} />);
    expect(labels()).toEqual(["Cancel", "Delete"]);
    const btns = row().querySelectorAll("button");
    expect(btns[1]!.className).toContain("gs-btn--danger");
    expect(btns[0]!.getAttribute("data-default")).toBe("true");
  });
  it("is right-aligned and equal-width on narrow", () => {
    render(<ActionRow cancel={{ label: "Cancel" }} primary={{ label: "Save" }} />);
    const css = row().querySelector("style")!.textContent!;
    expect(css).toMatch(/justify-content:flex-end/);
    expect(css).toMatch(/max-width:380px\)\{\.gs-actionrow>button\{flex:1 1 0/);
  });
  it("Studio preview shows both patterns in Mac order", () => {
    render(<StyleStudio />);
    const rows = screen.getAllByTestId("gs-actionrow").map((r) => Array.from(r.querySelectorAll("button")).map((b) => b.textContent));
    expect(rows).toContainEqual(["Delete", "Cancel", "Save"]);
    expect(rows).toContainEqual(["Cancel", "Delete"]);
  });
});

/** Returns the rows (runs of adjacent <button>s) where a positive button comes before Cancel/Close (only a far-left Delete/Remove/Don't may precede it). */
function badRows(src: string): string[][] {
  const runs = src.match(/(<button\b[\s\S]*?<\/button>\s*){2,}/g) ?? [];
  const bad: string[][] = [];
  for (const run of runs) {
    const text = (run.match(/<button\b[\s\S]*?<\/button>/g) ?? []).map((b) => b.replace(/<[^>]+>/g, "").trim());
    const ci = text.findIndex((t) => /^(Cancel|Close)$/i.test(t));
    if (ci > 0 && text.slice(0, ci).some((t) => !/^(Delete|Remove|Don.t)/i.test(t))) bad.push(text);
  }
  return bad;
}

describe("static check: no positive rendered after Cancel/Close in src/studio", () => {
  it("every studio file passes", () => {
    for (const f of readdirSync("src/studio").filter((x) => x.endsWith(".tsx"))) {
      const src = readFileSync(`src/studio/${f}`, "utf8");
      expect(badRows(src), f).toEqual([]);
      expect(src, f).not.toMatch(/primary=\{\{\s*label:\s*"(Cancel|Close)"/);
    }
  });
  it("the checker catches a bad row", () => {
    expect(badRows(`<button>Save</button>\n<button>Cancel</button>`)).toHaveLength(1);
    expect(badRows(`<button>Cancel</button>\n<button>Save</button>`)).toHaveLength(0);
    expect(badRows(`<button>Delete</button>\n<button>Cancel</button>\n<button>Save</button>`)).toHaveLength(0);
  });
});
