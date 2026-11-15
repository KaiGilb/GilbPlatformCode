import { thumbUriOf, type CopyMap } from "@kaigilb/gilbplatformcode-picture-set";
import { SignedImage } from "@kaigilb/gilbplatformcode-signed-picture";
import type { ReactNode } from "react";

export interface PictureThumbProps {
  /** The record's stored picture (its master's address), or null when it has none. */
  stored: string | null;
  /** A picture on this device not stored yet (a local object URL); it wins over `stored` while it is set. */
  previewUrl?: string | null;
  /** The vault's copy map, or null while it is not listed yet (the thumbnail then waits, showing the placeholder). */
  copies: CopyMap | null;
  vaultOrigin: string;
  /** What shows while there is no picture, and while a picture loads. */
  placeholder?: ReactNode;
  /** The button's accessible name, e.g. `View picture of ${name}`. */
  label: string;
  /** Called on a tap with the button, to hand to `openStored({ el })` so focus returns to it when the viewer closes. */
  onOpen(el: HTMLElement): void;
  /** Class of the image box (default "thumb"), of the button (default "thumb-btn") and of the empty box (default "thumb thumb--empty"). */
  className?: string;
  buttonClassName?: string;
  emptyClassName?: string;
}

/**
 * A record's picture as a list thumbnail: the small copy (signed fetch, loaded when it nears the screen) inside a button that opens the full
 * screen viewer. A record with no picture gets the placeholder in a box that is not a button.
 */
export function PictureThumb(p: PictureThumbProps) {
  const { stored, previewUrl = null, copies, vaultOrigin, placeholder = null, label, onOpen } = p;
  if (!stored && !previewUrl) {
    return (
      <div className={p.emptyClassName ?? "thumb thumb--empty"} aria-hidden="true">
        {placeholder}
      </div>
    );
  }
  return (
    <button type="button" className={p.buttonClassName ?? "thumb-btn"} aria-label={label} onClick={(e) => onOpen(e.currentTarget)}>
      <SignedImage className={p.className ?? "thumb"} fileUri={stored ? thumbUriOf(copies, stored) : null} vaultOrigin={vaultOrigin} previewUrl={previewUrl} placeholder={placeholder} alt="" />
    </button>
  );
}
