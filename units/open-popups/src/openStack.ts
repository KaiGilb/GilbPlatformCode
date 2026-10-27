/**
 * The open-popover stack. A popover or menu that is portalled out of its layer (a type-definition popover, a New menu, a placement menu)
 * registers here while it is open. The layers that own Escape and Tab (the full-screen graph, the create
 * dialog) ask the stack, so a key typed in a portalled child is not taken for a key typed outside it:
 *  - Escape closes the top-most entry and nothing else;
 *  - Tab cycles inside the top-most entry's element;
 *  - opening one popover closes the others (exclusive).
 * Plain module state: there is one keyboard, so there is one stack.
 */

export interface OpenEntry {
  /** The popover's root element (null while it is not mounted). */
  el: () => HTMLElement | null;
  /** Close it (its own focus hand-back runs). */
  close: () => void;
  /** Close it without moving the focus (another popover is taking over, or the person pressed elsewhere). Default: `close`. */
  dismiss?: () => void;
  /** Exclusive entries close each other when one opens. */
  exclusive?: boolean;
}

const stack: OpenEntry[] = [];

/** Push `entry`; returns what removes it. Opening an exclusive entry closes the other exclusive ones first. */
export function registerOpen(entry: OpenEntry): () => void {
  if (entry.exclusive) for (const other of stack.slice()) if (other !== entry && other.exclusive) (other.dismiss ?? other.close)();
  stack.push(entry);
  return () => {
    const at = stack.indexOf(entry);
    if (at >= 0) stack.splice(at, 1);
  };
}

/** The newest open popover or menu, or null. */
export function topOpen(): OpenEntry | null {
  return stack[stack.length - 1] ?? null;
}

export const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Tab inside `el`: wraps at both ends, and brings focus that is outside `el` back in. */
export function tabInside(e: { shiftKey: boolean; preventDefault: () => void }, el: HTMLElement): void {
  const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
  const active = document.activeElement as HTMLElement | null;
  if (items.length === 0) {
    e.preventDefault();
    el.focus();
    return;
  }
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const inside = !!active && el.contains(active);
  if (e.shiftKey) {
    if (!inside || active === first || active === el) {
      e.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last || active === el) {
    e.preventDefault();
    first.focus();
  }
}
