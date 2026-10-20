/**
 * One way to share. `href` is a template: `{url}`, `{title}` and `{text}` (title and url joined by a space)
 * are replaced by the page address, the title and both, each URL-encoded.
 */
export interface ShareTarget {
  /** Stable key, e.g. "x". */
  id: string;
  /** The network's name, e.g. "X". Used in the link's name: "<shareOn> <label>". */
  label: string;
  /** Link template, e.g. "https://example.test/share?u={url}&t={title}". */
  href: string;
  /** The icon's SVG path (`d`), drawn in a 24 by 24 box with the text colour. */
  icon: string;
  /** Open in a new tab (default true). Use false for `mailto:` links. */
  newTab?: boolean;
}
