// A copy of style-runtime's src/actionRowCss.ts (this unit has no dependencies, so it carries its own).
// actionRowCss.test.ts fails if the two strings differ. Edit both together.
// The action row's CSS (RuleUiActionRowMacOrder): plain CSS, no Tailwind, no React. toCssText appends it, so
// it arrives with loadStyle; ensureActionRowCss() writes it for a host that never calls loadStyle.
// Button looks use :where() (zero specificity) so an app's own .gs-btn rules always win.
// Tokens read: --gs-button-* (the sheet's button look), --ink, --lines, --surface, --accent, --bad / --on-bad.
export const ACTION_ROW_CSS = [
  // The row: right-aligned, one line, never full-width two-up on a wide screen. The row is the size container;
  // only its children are restyled by the @container rule (a container cannot be styled by its own query).
  ".gs-actionrow{display:flex;flex-wrap:nowrap;align-items:center;justify-content:flex-end;gap:12px;width:100%;container-type:inline-size}",
  // The destructive or third action sits alone at the far left.
  ".gs-actionrow > .gs-actionrow__far{margin-right:auto}",
  // Narrow: the buttons share the width in equal parts, same order.
  "@container (max-width:380px){.gs-actionrow > *{flex:1 1 0;min-width:0}.gs-actionrow > .gs-actionrow__far{margin-right:0}}",
  "@media (max-width:420px){.gs-actionrow > *{flex:1 1 0;min-width:0}.gs-actionrow > .gs-actionrow__far{margin-right:0}}",
  // Button looks.
  ":where(.gs-btn){display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;padding:0 18px;font:inherit;font-weight:600;line-height:1.2;text-align:center;cursor:pointer;background:var(--gs-button-bg,var(--accent));color:var(--gs-button-fg,var(--on-accent));border:var(--gs-button-border,1px solid transparent);border-radius:var(--gs-button-radius,var(--r-md,8px))}",
  ":where(.gs-btn:hover:not(:disabled)){background:var(--gs-button-hover-bg,var(--gs-button-bg,var(--accent)))}",
  ":where(.gs-btn:disabled){opacity:.5;cursor:not-allowed}",
  ":where(.gs-btn:focus-visible){outline:3px solid var(--accent);outline-offset:2px}",
  ":where(.gs-btn--primary){background:var(--gs-button-bg,var(--accent));color:var(--gs-button-fg,var(--on-accent));border:var(--gs-button-border,1px solid transparent)}",
  ":where(.gs-btn--secondary){background:transparent;color:var(--ink);border:1px solid color-mix(in srgb,var(--lines,var(--ink)) 40%,transparent)}",
  ":where(.gs-btn--secondary:hover:not(:disabled)){background:color-mix(in srgb,var(--ink) 8%,transparent)}",
  ":where(.gs-btn--danger){background:var(--surface,var(--paper));color:var(--bad);border:1px solid var(--bad)}",
  ":where(.gs-btn--danger:hover:not(:disabled)){background:color-mix(in srgb,var(--bad) 10%,var(--surface,var(--paper)))}",
  // A confirm row (the destructive act is the row's whole purpose): the red button is filled.
  ":where(.gs-btn--danger.gs-btn--primary),:where(.gs-actionrow[data-confirm] > .gs-btn:last-child){background:var(--bad);color:var(--on-bad,#ffffff);border:1px solid var(--bad)}",
  ":where(.gs-btn--danger.gs-btn--primary:hover:not(:disabled)),:where(.gs-actionrow[data-confirm] > .gs-btn:last-child:hover:not(:disabled)){background:color-mix(in srgb,var(--bad) 88%,var(--ink))}",
].join("\n");

const ATTR = "data-gs-actionrow";

/** Writes ACTION_ROW_CSS once per document (one <style data-gs-actionrow>). Safe to call on every render. */
export function ensureActionRowCss(doc: Document = document): void {
  const head = doc.head ?? doc.documentElement;
  if (!head || doc.querySelector(`style[${ATTR}]`)) return;
  const el = doc.createElement("style");
  el.setAttribute(ATTR, "");
  el.textContent = ACTION_ROW_CSS;
  head.appendChild(el);
}
