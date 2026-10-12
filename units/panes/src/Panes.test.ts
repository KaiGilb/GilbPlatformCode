import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Panes, type PaneLayout } from "./Panes";

const layout = (over: Partial<PaneLayout> = {}): PaneLayout => ({
  leftW: 300,
  rightW: 376,
  leftCollapsed: false,
  rightCollapsed: false,
  setLeftW: () => {},
  setRightW: () => {},
  ...over,
});

const html = (l: PaneLayout) =>
  renderToStaticMarkup(createElement(Panes, { layout: l, left: "L", center: "C", right: "R" }));

test("each region carries data-region, and the side regions carry their widths", () => {
  const out = html(layout());
  expect(out).toContain('data-region="left"');
  expect(out).toContain('data-region="center"');
  expect(out).toContain('data-region="right"');
  expect(out).toMatch(/data-region="left"[^>]*style="width:300px"/);
  expect(out).toMatch(/data-region="right"[^>]*style="width:376px"/);
});

test("both dividers are focusable separators, drawn visible with a focus ring", () => {
  const out = html(layout());
  const dividers = out.match(/<div role="separator"[^>]*>/g) ?? [];
  expect(dividers).toHaveLength(2);
  for (const d of dividers) {
    expect(d).toContain('tabindex="0"');
    expect(d).toContain("bg-[var(--line-2)]");
    expect(d).toContain("focus-visible:outline-[var(--accent)]");
    expect(d).toContain("cursor-col-resize");
  }
});

test("a collapsed side draws neither its region nor its divider", () => {
  const out = html(layout({ leftCollapsed: true }));
  expect(out).not.toContain('data-region="left"');
  expect((out.match(/role="separator"/g) ?? []).length).toBe(1);
  expect(out).toContain('data-region="center"');
});

test("each divider reports the width it controls, and no range when the host passes no limits", () => {
  const out = html(layout());
  const dividers = out.match(/<div role="separator"[^>]*>/g) ?? [];
  expect(dividers).toHaveLength(2);
  const [left, right] = dividers;
  expect(left).toContain('aria-valuenow="300"');
  expect(right).toContain('aria-valuenow="376"');
  for (const d of dividers) {
    expect(d).not.toContain("aria-valuemin");
    expect(d).not.toContain("aria-valuemax");
  }
});

test("with the host's limits each divider reports its range", () => {
  const out = html(layout({ leftMin: 180, leftMax: 440, rightMin: 280, rightMax: 520, leftW: 300.4 }));
  const dividers = out.match(/<div role="separator"[^>]*>/g) ?? [];
  const [left, right] = dividers;
  expect(left).toContain('aria-valuenow="300"');
  expect(left).toContain('aria-valuemin="180"');
  expect(left).toContain('aria-valuemax="440"');
  expect(right).toContain('aria-valuenow="376"');
  expect(right).toContain('aria-valuemin="280"');
  expect(right).toContain('aria-valuemax="520"');
});
