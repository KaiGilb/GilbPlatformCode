/** One picture the viewer can show. */
export interface LightboxItem {
  /** The file shown in the viewer: the larger original if the host gave one, else the picture's own file. */
  src: string;
  /** What the picture shows, in words. Never empty: a picture with no alt text does not open. */
  alt: string;
  /** The text shown under the picture (a `figcaption`'s text, else the alt text). */
  caption: string;
  /** The element to give focus back to when the viewer closes. */
  el?: HTMLElement | null;
}

/** Every word the viewer shows or speaks. English defaults; pass your own language. */
export interface LightboxWords {
  /** The dialog's name for a screen reader. */
  dialog: string;
  close: string;
  previous: string;
  next: string;
  zoomIn: string;
  zoomOut: string;
  /** The name of the button that returns the picture to fit-to-screen size. It must contain `fit`, the words drawn on it. */
  zoomReset: string;
  /** The short word drawn on that button, e.g. "Fit". Keep it inside `zoomReset` so the visible label is part of the name. */
  fit: string;
  /** "3 of 12": builds the counter's text, shown and read when the picture changes. */
  count: (position: number, total: number) => string;
}
