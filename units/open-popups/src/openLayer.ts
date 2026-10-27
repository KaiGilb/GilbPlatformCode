import { modalIsOpen } from "./layers";

/**
 * The host's create dialog portals to `document.body`. The portal root is the outer div
 * `data-testid="connected-create-root"`. The panel inside
 * it is `[role="dialog"][aria-modal="true"]`; the backdrop button is only on the root.
 * Other modals are not in `openPortalRoots`, so they are found by `[aria-modal="true"]` or `[role="dialog"]`.
 */
const OPEN_LAYER = '[data-testid="connected-create-root"], [aria-modal="true"], [role="dialog"]';

/**
 * A line being edited must not treat this as leaving. True for the whole time a create dialog
 * is open (`modalIsOpen`), and when `node` sits in a modal layer. A blur whose
 * `relatedTarget` is null still counts while the dialog is open.
 */
export function insideOpenLayer(node: Node | null): boolean {
  if (modalIsOpen()) return true;
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  return !!el?.closest(OPEN_LAYER);
}
