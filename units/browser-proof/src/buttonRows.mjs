// The button-row check (RuleUiActionRowMacOrder): every row of two or more buttons is right-aligned, the positive button is rightmost,
// Cancel or Close sits immediately left of it, a destructive third action (Delete) sits alone at the far left, and a "Delete X?" confirm
// puts its red button rightmost. `collectButtonRows` reads the rows out of a live page, `judgeButtonRows` is pure and decides, and
// `assertButtonRows` does both and throws one Error that lists every violation. No packages.

/** Runs in the page. Self-contained on purpose: it is sent to Chrome as text, so it may use nothing from this module. */
function collectInPage(opts) {
  const BUTTON = "button, [role=button], a.btn, input[type=submit]";
  const EXPLICIT = ["[data-plan-button-row]", ".gs-actionrow", ...(opts.selectors || [])].join(", ");
  const round = (n) => Math.round(n * 10) / 10;
  const num = (v) => parseFloat(v) || 0;

  const visible = (el) => {
    if (el.closest("[data-button-row-ignore]")) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse") return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const rect = (r) => ({ left: round(r.left), top: round(r.top), right: round(r.right), bottom: round(r.bottom), width: round(r.width), height: round(r.height) });

  const path = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && parts.length < 3; e = e.parentElement) {
      let p = e.tagName.toLowerCase();
      if (e.id) {
        parts.unshift(`${p}#${e.id}`);
        break;
      }
      const cls = [...e.classList].slice(0, 2);
      if (cls.length) p += "." + cls.join(".");
      parts.unshift(p);
    }
    return parts.join(" > ");
  };

  const label = (b) => {
    const t = (b.textContent || "").replace(/\s+/g, " ").trim();
    return t || (b.getAttribute("aria-label") || "").trim() || (b.tagName === "INPUT" ? String(b.value || "") : "") || "(no label)";
  };

  // Colour to [r, g, b, a] from the computed "rgb(...)", "rgba(...)" or "color(srgb ...)" text.
  const parse = (css) => {
    const m = /^rgba?\(([^)]+)\)$/.exec(css || "");
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    const c = /^color\(srgb ([^)]+)\)$/.exec(css || "");
    if (c) {
      const p = c[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1];
    }
    return null;
  };
  const redFamily = (css) => {
    const c = parse(css);
    if (!c || c[3] < 0.2) return false;
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d === 0) return false;
    const l = (max + min) / 2;
    const sat = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return (h >= 345 || h <= 15) && sat > 0.35;
  };
  const isRed = (b) => {
    const s = getComputedStyle(b);
    const dangerClass = [...b.classList].some((c) => /danger/i.test(c) || /(^|[-_])bad($|[-_])/i.test(c));
    const flagged = b.hasAttribute("data-danger") && b.getAttribute("data-danger") !== "false";
    return dangerClass || flagged || redFamily(s.color) || redFamily(s.backgroundColor);
  };
  const isDefault = (b) => b.hasAttribute("autofocus") || b.hasAttribute("data-default") || (b.getAttribute("type") || "").toLowerCase() === "submit";

  const all = [...document.querySelectorAll(BUTTON)].filter(visible);
  const explicit = new Set(document.querySelectorAll(EXPLICIT));
  const candidates = new Set(explicit);
  for (const b of all) {
    let p = b.parentElement;
    for (let depth = 0; p && depth < 2; depth++, p = p.parentElement) candidates.add(p);
  }

  const bySignature = new Map();
  for (const el of candidates) {
    if (el.closest("[data-button-row-ignore]")) continue;
    const isExplicit = explicit.has(el);
    const mine = all.filter((b) => b !== el && (isExplicit ? el.contains(b) : b.parentElement === el || (b.parentElement && b.parentElement.parentElement === el)));
    if (mine.length < 2) continue;
    if (!isExplicit) {
      const tops = mine.map((b) => b.getBoundingClientRect().top);
      if (Math.max(...tops) - Math.min(...tops) > 4) continue;
    }
    const sig = mine.map((b) => all.indexOf(b)).join(",");
    const prev = bySignature.get(sig);
    // The same buttons seen from a wrapper and from the element around them: keep the explicit one, else the innermost.
    const better = !prev || (isExplicit && !prev.isExplicit) || (isExplicit === prev.isExplicit && prev.el.contains(el));
    if (better) bySignature.set(sig, { el, mine, isExplicit });
  }

  const rows = [];
  for (const { el, mine } of bySignature.values()) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const left = r.left + num(s.borderLeftWidth) + num(s.paddingLeft);
    const right = r.right - num(s.borderRightWidth) - num(s.paddingRight);
    const top = r.top + num(s.borderTopWidth) + num(s.paddingTop);
    const bottom = r.bottom - num(s.borderBottomWidth) - num(s.paddingBottom);
    rows.push({
      path: path(el),
      rect: rect({ left, right, top, bottom, width: right - left, height: bottom - top }),
      buttons: mine
        .map((b) => ({ label: label(b), rect: rect(b.getBoundingClientRect()), isRed: isRed(b), isDefault: isDefault(b) }))
        .sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top),
    });
  }
  rows.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  return rows;
}

/**
 * Reads every button row out of the page at its current size. A row is any `[data-plan-button-row]` or `.gs-actionrow` (and anything
 * matching `selectors`), plus any element with two or more visible buttons (`button`, `[role=button]`, `a.btn`, `input[type=submit]`)
 * as its children or grandchildren that sit on one line (tops within 4 px). Hidden elements and anything inside `[data-button-row-ignore]`
 * are skipped. Returns plain data: `{ path, rect (the row's content box), buttons: [{ label, rect, isRed, isDefault }] }`, buttons left to right.
 *
 * @param {{ eval(expression: string): Promise<any> }} page
 * @param {{ selectors?: string[] }} [opts] extra selectors that count as a row, as well as the two built in
 */
export async function collectButtonRows(page, { selectors = [] } = {}) {
  return page.eval(`(${collectInPage.toString()})(${JSON.stringify({ selectors })})`);
}

const NEGATIVE = /^(cancel|close|no|back|not now|dismiss)$/i;
const DANGER = /^(delete|remove|discard|erase|clear)\b/i;

/** `"negative"`, `"danger"` or `"positive"` for one button. A negative label wins over a red colour. */
export function classifyButton(b) {
  const label = String(b.label ?? "").trim();
  if (NEGATIVE.test(label)) return "negative";
  if (DANGER.test(label) || b.isRed) return "danger";
  return "positive";
}

/**
 * Judges rows from `collectButtonRows`. Pure. Returns a list of `{ path, rule, message }`, empty when every row follows the rule.
 * Rules: `not-right-aligned`, `negative-right-of-positive`, `positive-not-rightmost`, `danger-not-far-left`, `confirm-order`, `stretched`.
 *
 * @param {Array<{ path: string, rect: any, buttons: any[] }>} rows
 * @param {{ viewportWidth: number }} opts
 */
export function judgeButtonRows(rows, { viewportWidth }) {
  const out = [];
  for (const row of rows) {
    const buttons = [...row.buttons].sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
    if (buttons.length < 2) continue;
    const kinds = buttons.map(classifyButton);
    const names = buttons.map((b) => b.label).join(" | ");
    const say = (rule, text) => out.push({ path: row.path, rule, message: `Row '${names}': ${text}` });
    const count = (k) => kinds.filter((x) => x === k).length;
    const confirm = buttons.length === 2 && count("negative") === 1 && count("danger") === 1 && count("positive") === 0;
    const last = buttons[buttons.length - 1];
    const lastKind = kinds[kinds.length - 1];
    const width = row.rect.right - row.rect.left;

    const filled = buttons.reduce((sum, b) => sum + b.rect.width, 0) >= width - 2;
    const short = row.rect.right - last.rect.right;
    if (short > 2 && !filled) say("not-right-aligned", `the buttons end ${Math.round(short)}px short of the right edge, so right-align them.`);

    const firstPositive = kinds.indexOf("positive");
    const negBeyond = buttons.filter((_, i) => kinds[i] === "negative" && firstPositive !== -1 && kinds.slice(0, i).includes("positive"));
    if (negBeyond.length) say("negative-right-of-positive", `${negBeyond.map((b) => b.label).join(" and ")} must sit left of ${buttons[firstPositive].label}.`);

    const positives = buttons.filter((_, i) => kinds[i] === "positive");
    const rightPositive = positives[positives.length - 1];
    if (!confirm && positives.length && lastKind !== "positive") say("positive-not-rightmost", `${rightPositive.label} must be the rightmost button.`);

    if (!confirm) {
      const stray = buttons.filter((_, i) => kinds[i] === "danger" && i !== 0);
      if (stray.length) {
        const tail = rightPositive ? ` and ${rightPositive.label} rightmost` : "";
        say("danger-not-far-left", `${stray.map((b) => b.label).join(" and ")} must sit alone at the far left${tail}.`);
      }
    } else if (lastKind !== "danger") {
      const danger = buttons[kinds.indexOf("danger")];
      const neg = buttons[kinds.indexOf("negative")];
      say("confirm-order", `${danger.label} (the red button) must be rightmost in a delete confirmation, with ${neg.label} to its left.`);
    }

    const limit = buttons.length === 2 ? 0.45 : buttons.length === 3 ? 0.3 : null;
    if (viewportWidth > 480 && limit !== null && width > 0 && buttons.every((b) => b.rect.width > limit * width)) {
      say("stretched", `the buttons are stretched across the row on a ${Math.round(viewportWidth)}px screen, so let each take its own width at the right.`);
    }
  }
  return out;
}

/**
 * Collects and judges at the page's current viewport; throws one Error that lists every violation, or returns how many rows it checked.
 * `viewportWidth` defaults to the page's `window.innerWidth`. Zero rows found returns 0: assert on the count when the page must have some.
 *
 * @param {{ eval(expression: string): Promise<any> }} page
 * @param {{ selectors?: string[], viewportWidth?: number }} [opts]
 */
export async function assertButtonRows(page, opts = {}) {
  const viewportWidth = opts.viewportWidth ?? (await page.eval("window.innerWidth"));
  const rows = await collectButtonRows(page, { selectors: opts.selectors });
  const bad = judgeButtonRows(rows, { viewportWidth });
  if (bad.length) {
    throw new Error(`${bad.length} button row ${bad.length === 1 ? "problem" : "problems"} at ${viewportWidth}px wide (of ${rows.length} rows):\n${bad.map((v) => `  - [${v.rule}] ${v.message} (${v.path})`).join("\n")}`);
  }
  return rows.length;
}
