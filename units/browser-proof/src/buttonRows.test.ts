import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertButtonRows, classifyButton, collectButtonRows, findChrome, judgeButtonRows, startBrowser, type ButtonRow } from "./index.mjs";

type B = [label: string, left: number, width: number, flags?: { red?: boolean }];
const rect = (left: number, width: number) => ({ left, top: 10, right: left + width, bottom: 50, width, height: 40 });
/** A row whose content box runs from `from` to `to`. */
const row = (from: number, to: number, buttons: B[], path = "div.actions"): ButtonRow => ({
  path,
  rect: { left: from, top: 0, right: to, bottom: 60, width: to - from, height: 60 },
  buttons: buttons.map(([label, left, width, f]) => ({ label, rect: rect(left, width), isRed: f?.red === true, isDefault: false })),
});
const rules = (r: ButtonRow, viewportWidth = 1280) => judgeButtonRows([r], { viewportWidth }).map((v) => v.rule);

describe("judgeButtonRows: the table", () => {
  const table: Array<[string, ButtonRow, number, string[]]> = [
    ["record view Edit | Delete", row(100, 1180, [["Edit", 960, 100], ["Delete", 1070, 110, { red: true }]]), 1280, ["positive-not-rightmost", "danger-not-far-left"]],
    ["Delete ...... Edit, right-aligned", row(100, 1180, [["Delete", 100, 100, { red: true }], ["Edit", 1080, 100]]), 1280, []],
    ["Save | Cancel", row(100, 1180, [["Save", 960, 100], ["Cancel", 1070, 110]]), 1280, ["negative-right-of-positive", "positive-not-rightmost"]],
    ["Cancel | Save, left-aligned", row(100, 1180, [["Cancel", 100, 80], ["Save", 190, 80]]), 1280, ["not-right-aligned"]],
    ["Cancel | Save, right-aligned", row(100, 1180, [["Cancel", 990, 80], ["Save", 1100, 80]]), 1280, []],
    ["confirm Cancel | Delete", row(100, 1180, [["Cancel", 960, 100], ["Delete", 1070, 110, { red: true }]]), 1280, []],
    ["confirm Delete | Cancel", row(100, 1180, [["Delete", 960, 100, { red: true }], ["Cancel", 1070, 110]]), 1280, ["confirm-order"]],
    ["phone 390, equal share Delete | Edit", row(16, 374, [["Delete", 16, 175, { red: true }], ["Edit", 199, 175]]), 390, []],
    ["desktop 1280, two-up 50/50 Delete | Edit", row(100, 1180, [["Delete", 100, 536, { red: true }], ["Edit", 644, 536]]), 1280, ["stretched"]],
    ["Delete | Cancel | Save", row(100, 1180, [["Delete", 100, 100, { red: true }], ["Cancel", 900, 100], ["Save", 1010, 170]]), 1280, []],
  ];
  it.each(table)("%s", (_name, r, width, expected) => {
    expect(rules(r, width)).toEqual(expected);
  });

  it("names the labels in one plain sentence", () => {
    const [v] = judgeButtonRows([row(100, 1180, [["Edit", 960, 100], ["Delete", 1070, 110, { red: true }]])], { viewportWidth: 1280 }).filter((x) => x.rule === "danger-not-far-left");
    expect(v).toEqual({ path: "div.actions", rule: "danger-not-far-left", message: "Row 'Edit | Delete': Delete must sit alone at the far left and Edit rightmost." });
  });
  it("says how far short of the right edge a left-aligned row ends", () => {
    const [v] = judgeButtonRows([row(100, 1180, [["Cancel", 100, 80], ["Save", 190, 80]])], { viewportWidth: 1280 });
    expect(v!.message).toBe("Row 'Cancel | Save': the buttons end 910px short of the right edge, so right-align them.");
  });
  it("allows 2px of slack at the right edge, and equal-share buttons that fill the row", () => {
    expect(rules(row(100, 1180, [["Cancel", 990, 80], ["Save", 1098, 80]]))).toEqual([]);
    expect(rules(row(100, 1180, [["Cancel", 990, 80], ["Save", 1096, 80]]))).toEqual(["not-right-aligned"]);
    // Buttons that together fill the row (here 2px wider than it, as rounding does) are never "short of the right edge".
    expect(rules(row(0, 200, [["Cancel", 0, 101], ["Save", 90, 101]]), 390)).toEqual([]);
  });
  it("a stretched row is fine on a phone, only a 2-button or 3-button row counts, and 45% / 30% are the limits", () => {
    const two = (w: number) => row(0, 1000, [["Cancel", 1000 - 2 * w - 8, w], ["Save", 1000 - w, w]]);
    expect(rules(two(460), 1280)).toEqual(["stretched"]);
    expect(rules(two(440), 1280)).toEqual([]);
    expect(rules(two(460), 480)).toEqual([]);
    expect(rules(two(460), 481)).toEqual(["stretched"]);
    const three = (w: number) => row(0, 1000, [["Delete", 0, w, { red: true }], ["Cancel", 1000 - 2 * w - 8, w], ["Save", 1000 - w, w]]);
    expect(rules(three(310), 1280)).toEqual(["stretched"]);
    expect(rules(three(290), 1280)).toEqual([]);
    const four = row(0, 1000, [["A", 0, 240], ["B", 250, 240], ["C", 500, 240], ["D", 760, 240]]);
    expect(rules(four, 1280)).toEqual([]);
  });
  it("sorts buttons left to right itself, ignores a single button, and reports each broken row with its own path", () => {
    expect(rules(row(0, 1000, [["Save", 900, 100], ["Cancel", 780, 100]]))).toEqual([]);
    expect(rules(row(0, 1000, [["Save", 900, 100]]))).toEqual([]);
    const v = judgeButtonRows([row(0, 1000, [["Cancel", 0, 80], ["Save", 90, 80]], "a"), row(0, 1000, [["Cancel", 800, 80], ["Save", 900, 100]], "b"), row(0, 1000, [["Save", 800, 80], ["Cancel", 900, 100]], "c")], { viewportWidth: 1280 });
    expect(v.map((x) => `${x.path}:${x.rule}`)).toEqual(["a:not-right-aligned", "c:negative-right-of-positive", "c:positive-not-rightmost"]);
  });
});

describe("classifyButton", () => {
  it.each([
    ["Cancel", false, "negative"],
    ["close", false, "negative"],
    ["Not now", false, "negative"],
    ["Cancel", true, "negative"],
    ["Delete", false, "danger"],
    ["Delete photo", false, "danger"],
    ["Remove", false, "danger"],
    ["Clear all", false, "danger"],
    ["Wipe", true, "danger"],
    ["Save", false, "positive"],
    ["Deleted items", false, "positive"],
    ["Back up", false, "positive"],
  ] as const)("%s (red %s) is %s", (label, isRed, kind) => {
    expect(classifyButton({ label, isRed })).toBe(kind);
  });
  it("a red button that is not named Delete is still the destructive one: Archive (red) | Save fails like Delete | Save", () => {
    expect(rules(row(0, 1000, [["Save", 700, 100], ["Archive", 900, 100, { red: true }]]))).toEqual(["positive-not-rightmost", "danger-not-far-left"]);
  });
});

const chromePath = findChrome();
const page = (body: string, css = "") =>
  `data:text/html,${encodeURIComponent(`<!doctype html><meta name=viewport content="width=device-width"><style>*{box-sizing:border-box}body{margin:0;font:14px sans-serif}.r{display:flex;gap:8px;padding:8px 16px}.end{justify-content:flex-end}.start{justify-content:flex-start}button{padding:8px 12px}.red{background:#c0392b;color:#fff}${css}</style>${body}`)}`;

describe("button rows in real Chrome", () => {
  const good = `<div class="r end gs-actionrow" id=good><button>Cancel</button><button>Save</button></div>
    <div class="r end" id=confirm><button>Cancel</button><button class=red style="background:rgb(200,40,40)">Remove</button></div>
    <div class="r start" data-button-row-ignore><button>Save</button><button>Cancel</button></div>
    <div class="r start" style="display:none"><button>Save</button><button>Cancel</button></div>
    <div class="r start"><button hidden>Save</button><button>Cancel</button></div>`;
  const bad = `<div class="r start" id=bad><button>Cancel</button><button>Save</button></div>
    <div class="r end"><span><button>Edit</button></span><span><button style="background:#e11d2e;color:#fff">Archive</button></span></div>`;

  it.skipIf(!chromePath)("PASS on a clean page and FAIL on a bad one, at 1280 and at 390", async () => {
    const work = mkdtempSync(join(tmpdir(), "bp-rows-"));
    const { page: p, close } = await startBrowser({ profileDir: join(work, "profiles"), width: 1280, height: 800 });
    try {
      for (const [width, height] of [[1280, 800], [390, 844]] as const) {
        await p.setViewport({ width, height });
        await p.goto(page(good));
        expect(await p.eval("window.innerWidth")).toBe(width);
        const rows = await collectButtonRows(p);
        expect(rows.map((r) => r.buttons.map((b) => b.label))).toEqual([["Cancel", "Save"], ["Cancel", "Remove"]]);
        expect(rows[0]!.path).toContain("#good");
        expect(rows[1]!.buttons.map((b) => b.isRed)).toEqual([false, true]);
        expect(rows[0]!.rect.right).toBeGreaterThan(rows[0]!.buttons[1]!.rect.right - 0.5);
        expect(await assertButtonRows(p)).toBe(2);

        await p.goto(page(bad));
        const found = await collectButtonRows(p);
        expect(found).toHaveLength(2);
        expect(found[1]!.buttons.map((b) => [b.label, b.isRed])).toEqual([["Edit", false], ["Archive", true]]);
        const err = await assertButtonRows(p).then(() => null, (e: Error) => e);
        expect(err, `a failure at ${width}px`).not.toBeNull();
        expect(err!.message).toContain("[not-right-aligned] Row 'Cancel | Save'");
        expect(err!.message).toContain("[positive-not-rightmost] Row 'Edit | Archive': Edit must be the rightmost button.");
        expect(err!.message).toContain("[danger-not-far-left] Row 'Edit | Archive': Archive must sit alone at the far left and Edit rightmost.");
        expect(err!.message).toContain(`at ${width}px wide`);
      }
    } finally {
      await close();
      rmSync(work, { recursive: true, force: true });
    }
  }, 60000);
  if (!chromePath) it("(skipped: Chrome was not found on this machine)", () => undefined);
});
