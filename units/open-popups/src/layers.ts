import { createContext, useContext } from "react";

/**
 * The create dialog's layer. Every page layer (`z-[70]` sheets, `z-[80]` viewers, `z-[90]` pickers)
 * stays below this. Inline style, not a `z-[N]` class: jsdom does not compute Tailwind z-index.
 */
export const MODAL_LAYER_Z = 100;

/** Open create-dialog portal roots, oldest first. The last one owns the keyboard. */
export const openPortalRoots: HTMLElement[] = [];

/** True while at least one create dialog is open. */
export function modalIsOpen(): boolean {
  return openPortalRoots.length > 0;
}

/** True when `target` is inside the newest open create dialog. */
export function eventTargetInTopDialog(target: EventTarget | null): boolean {
  const top = openPortalRoots[openPortalRoots.length - 1];
  return !!top && target instanceof Node && top.contains(target);
}

/**
 * The open dialog's portal root, when this component is rendered inside one.
 * Otherwise `document.body` (a page layer, which the dialog must stay above).
 */
export const ModalPortalContext = createContext<HTMLElement | null>(null);

export function useModalPortalTarget(): HTMLElement {
  return useContext(ModalPortalContext) ?? document.body;
}
