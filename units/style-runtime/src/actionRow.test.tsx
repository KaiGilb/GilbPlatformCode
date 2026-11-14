import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ACTION_ROW_CSS, ensureActionRowCss } from "./actionRowCss";
import { ActionRow } from "./react";
import { toCssText, toCssVars } from "./css";
import { contrastRatio } from "./color";
import { validSheet } from "./fixtures";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("style[data-gs-actionrow]").forEach((n) => n.remove());
});

const btn = (label: string, cls = "") => <button className={cls}>{label}</button>;
const order = (c: HTMLElement) => Array.from(c.querySelectorAll("button")).map((b) => b.textContent);

describe("ActionRow DOM order", () => {
  it("destructive, cancel, primary: Delete far left, Save rightmost and default", () => {
    const { container } = render(<ActionRow destructive={btn("Delete")} cancel={btn("Cancel")} primary={btn("Save")} />);
    expect(order(container)).toEqual(["Delete", "Cancel", "Save"]);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("gs-actionrow");
    expect(root.hasAttribute("data-plan-button-row")).toBe(true);
    expect(root.getAttribute("data-default")).toBe("primary");
    expect(root.children[0]!.className).toContain("gs-actionrow__far");
    expect(root.children[1]!.className).not.toContain("gs-actionrow__far");
  });
  it("cancel + primary", () => {
    const { container } = render(<ActionRow cancel={btn("Cancel")} primary={btn("Save")} />);
    expect(order(container)).toEqual(["Cancel", "Save"]);
    expect(container.querySelector(".gs-actionrow__far")).toBeNull();
  });
  it("record view: Edit primary + Delete destructive gives Delete, Edit", () => {
    const { container } = render(<ActionRow primary={btn("Edit")} destructive={btn("Delete", "gs-btn gs-btn--danger")} />);
    expect(order(container)).toEqual(["Delete", "Edit"]);
    const del = container.querySelector("button")!;
    expect(del.className).toContain("gs-actionrow__far");
    expect(del.className).toContain("gs-btn--danger");
  });
  it("primary alone", () => {
    const { container } = render(<ActionRow primary={btn("Done")} />);
    expect(order(container)).toEqual(["Done"]);
  });
  it("confirm mode: Cancel, Delete; no far slot; Cancel is the default", () => {
    const { container } = render(<ActionRow confirm destructive={btn("Ignored")} cancel={btn("Cancel")} primary={btn("Delete", "gs-btn gs-btn--danger gs-btn--primary")} />);
    expect(order(container)).toEqual(["Cancel", "Delete"]);
    const root = container.firstElementChild as HTMLElement;
    expect(root.hasAttribute("data-confirm")).toBe(true);
    expect(root.getAttribute("data-default")).toBe("cancel");
    expect(container.querySelector(".gs-actionrow__far")).toBeNull();
  });
  it("a text destructive slot is wrapped so it is still a far child", () => {
    const { container } = render(<ActionRow destructive="Delete" primary={btn("Edit")} />);
    expect(container.firstElementChild!.firstElementChild!.className).toBe("gs-actionrow__far");
  });
  it("writes the CSS once, even after several mounts", () => {
    render(<ActionRow primary={btn("A")} />);
    render(<ActionRow primary={btn("B")} />);
    expect(document.head.querySelectorAll("style[data-gs-actionrow]")).toHaveLength(1);
  });
});

describe("ensureActionRowCss", () => {
  it("is idempotent and writes ACTION_ROW_CSS", () => {
    ensureActionRowCss();
    ensureActionRowCss();
    const all = document.head.querySelectorAll("style[data-gs-actionrow]");
    expect(all).toHaveLength(1);
    expect(all[0]!.textContent).toBe(ACTION_ROW_CSS);
  });
  it("works on another document", () => {
    const other = document.implementation.createHTMLDocument("x");
    ensureActionRowCss(other);
    ensureActionRowCss(other);
    expect(other.head.querySelectorAll("style[data-gs-actionrow]")).toHaveLength(1);
  });
});

describe("the CSS", () => {
  it("has the row, far, container and media rules", () => {
    expect(ACTION_ROW_CSS).toContain(".gs-actionrow{display:flex;flex-wrap:nowrap;align-items:center;justify-content:flex-end;gap:12px;width:100%;container-type:inline-size}");
    expect(ACTION_ROW_CSS).toContain(".gs-actionrow > .gs-actionrow__far{margin-right:auto}");
    expect(ACTION_ROW_CSS).toContain("@container (max-width:380px)");
    expect(ACTION_ROW_CSS).toContain("@media (max-width:420px)");
    for (const sel of [":where(.gs-btn)", ":where(.gs-btn--primary)", ":where(.gs-btn--secondary)", ":where(.gs-btn--danger)", ":where(.gs-btn--danger.gs-btn--primary)", "min-height:44px", ":focus-visible"])
      expect(ACTION_ROW_CSS).toContain(sel);
  });
  it("has no Tailwind, no import, no url()", () => {
    expect(ACTION_ROW_CSS).not.toMatch(/@apply|@import|url\s*\(|@tailwind/i);
  });
});

describe("toCssText carries the row and --accent-ink", () => {
  const css = toCssText(validSheet());
  it("contains the action row CSS after the variables", () => {
    expect(css).toContain(".gs-actionrow");
    expect(css.endsWith(ACTION_ROW_CSS + "\n")).toBe(true);
    expect(css).toContain("--accent-ink:");
    expect(css).toContain("--on-bad:");
  });
  it("keeps every variable value free of unsafe characters", () => {
    for (const mode of ["light", "dark"] as const) {
      for (const [k, v] of Object.entries(toCssVars(validSheet(), mode))) expect(v, k).not.toMatch(/[;{}<>\\]|url\s*\(|@import|expression\s*\(|\/\*/i);
    }
  });
  it("--accent-ink has contrast >= 4.5 against the paper and a hex surface, in both modes, over several accents", () => {
    for (const accent of ["#a85c3b", "#f2e94e", "#2244cc", "#ffffff", "#000000", "#d68b5e"]) {
      const s = validSheet();
      s.palette.accent = accent;
      s.dark = { accent, paper: "#151719", ink: "#e9e3da" };
      for (const mode of ["light", "dark"] as const) {
        const v = toCssVars(s, mode);
        expect(v["--accent-ink"], accent).toMatch(/^#[0-9a-f]{6}$/i);
        expect(contrastRatio(v["--accent-ink"]!, v["--paper"]!), `${mode} ${accent}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("--accent-ink is in the dark and light blocks too", () => {
    const dark = css.slice(css.indexOf('[data-theme="dark"] {'));
    expect(dark.slice(0, dark.indexOf("}"))).toContain("--accent-ink:");
  });
});
