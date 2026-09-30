/**
 * Copy text and report what happened.
 *
 * The button in the app used to call the clipboard and ignore both a missing
 * API and a rejected permission. The person could not tell success from a
 * block. This function never throws. It returns one of three words.
 */

export type CopyTextResult = "copied" | "unavailable" | "denied";

export interface ClipboardWriter {
  writeText(text: string): Promise<void> | void;
}

/**
 * Write `text` with the clipboard you pass.
 *
 * - `copied` — `writeText` finished (resolved, or returned a non-promise).
 * - `unavailable` — you passed null, undefined, or an object with no `writeText`.
 * - `denied` — `writeText` threw, or the promise rejected. Any failure is
 *   `denied`. This function does not try to tell a permission block from
 *   another clipboard error.
 *
 * An empty string is still a write. The host decides whether to offer the
 * control. This function does not refuse an empty string.
 */
export async function copyText(
  text: string,
  clipboard: Partial<ClipboardWriter> | null | undefined,
): Promise<CopyTextResult> {
  if (clipboard == null || typeof clipboard.writeText !== "function") return "unavailable";
  try {
    await clipboard.writeText(text);
    return "copied";
  } catch {
    return "denied";
  }
}

/**
 * The clipboard on this runtime, or null when there is none.
 * In a browser, pass the result to {@link copyText}. In a test, pass a fake.
 */
export function browserClipboard(): ClipboardWriter | null {
  const nav = globalThis.navigator;
  if (nav == null) return null;
  const clipboard = nav.clipboard;
  if (clipboard == null || typeof clipboard.writeText !== "function") return null;
  return clipboard;
}
