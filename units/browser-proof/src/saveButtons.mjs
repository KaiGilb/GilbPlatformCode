// The save-as-you-type check (RuleUiSaveAsYouType): a record screen has no Save, Done, Edit or Apply button and no Cancel that cancels nothing,
// because its fields save as the person types. `collectFieldButtons` reads the visible buttons out of a live page, leaving out those inside
// a dialog (a confirmation keeps its own buttons) or inside `[data-button-row-ignore]` / `[data-autosave-ignore]`; `judgeSaveButtons` is pure and
// decides; `assertNoSaveButtons` does both and throws one Error that lists every problem. A Cancel beside Delete or Remove is a confirmation
// and is allowed. Links (`a[href]`) are read as buttons too. It is a list of labels, not a proof: a Save button with another label passes. No packages.

/** Runs in the page. Self-contained on purpose: it is sent to Chrome as text, so it may use nothing from this module. */
function collectInPage() {
  const BUTTON = "button, [role=button], a.btn, input[type=submit], a[href]";
  const IGNORED = "dialog, [role=dialog], [role=alertdialog], [data-button-row-ignore], [data-autosave-ignore]";
  const visible = (el) => {
    if (el.closest(IGNORED)) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse") return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
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
    // An icon button has no letter or digit in its text (an emoji, a symbol): its name is then its aria-label or title.
    if (t && /[\p{L}\p{N}]/u.test(t)) return t;
    return (b.getAttribute("aria-label") || "").trim() || (b.getAttribute("title") || "").trim() || t || (b.tagName === "INPUT" ? String(b.value || "") : "") || "(no label)";
  };
  const all = [...document.querySelectorAll(BUTTON)].filter(visible);
  return all.map((b) => {
    const top = b.getBoundingClientRect().top;
    const rowLabels = all
      .filter((o) => o !== b && ((b.parentElement && b.parentElement.contains(o)) || (b.parentElement && b.parentElement.parentElement && b.parentElement.parentElement.contains(o))))
      .filter((o) => Math.abs(o.getBoundingClientRect().top - top) <= 4)
      .map(label);
    return { label: label(b), path: path(b), rowLabels };
  });
}

/**
 * Reads every visible button (and link) of the page that is not inside a dialog, `[role=dialog]`, `[role=alertdialog]`, `[data-button-row-ignore]` or
 * `[data-autosave-ignore]`. Returns `{ label, path, rowLabels }`: `rowLabels` are the labels of the other such buttons that share its
 * parent or grandparent and sit on one line (tops within 4 px).
 *
 * @param {{ eval(expression: string): Promise<any> }} page
 */
export async function collectFieldButtons(page) {
  return page.eval(`(${collectInPage.toString()})()`);
}

const SAVE = /^(save|save changes|save and close|save\s*(…|\.\.\.)|done|edit|edit\s.+|apply|ok|update|submit)$/i;
const CANCEL = /^(cancel|discard|discard changes|revert)$/i;
const CONFIRMS = /^(delete|remove)\b/i;

/**
 * Judges buttons from `collectFieldButtons`. Pure. Returns a list of `{ path, rule, message }`, empty when there is none to remove.
 * Rules: `save-button`, `cancel-without-act`. A Cancel in a row with a button that starts with Delete or Remove is a confirmation and is allowed.
 *
 * @param {Array<{ label: string, path: string, rowLabels?: string[] }>} buttons
 */
export function judgeSaveButtons(buttons) {
  const out = [];
  for (const b of buttons) {
    const label = String(b.label ?? "").trim();
    if (SAVE.test(label)) {
      out.push({ path: b.path, rule: "save-button", message: `"${label}": a record screen saves as the person types; remove this button (RuleUiSaveAsYouType).` });
    } else if (CANCEL.test(label) && !(b.rowLabels ?? []).some((l) => CONFIRMS.test(String(l).trim()))) {
      out.push({ path: b.path, rule: "cancel-without-act", message: `"${label}": there is nothing to cancel; fields save as the person types (RuleUiSaveAsYouType).` });
    }
  }
  return out;
}

/**
 * Collects and judges; throws one Error that lists every problem, or returns how many buttons it checked.
 *
 * @param {{ eval(expression: string): Promise<any> }} page
 */
export async function assertNoSaveButtons(page) {
  const buttons = await collectFieldButtons(page);
  const bad = judgeSaveButtons(buttons);
  if (bad.length) {
    throw new Error(`${bad.length} save-button ${bad.length === 1 ? "problem" : "problems"} (of ${buttons.length} buttons):\n${bad.map((v) => `  - [${v.rule}] ${v.message} (${v.path})`).join("\n")}`);
  }
  return buttons.length;
}
