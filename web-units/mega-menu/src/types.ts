/** A row in a group. No `href` means static text: not a link, not a tab stop. */
export interface MenuItem {
  label: string;
  sub?: string;
  href?: string;
  /** Plain `<a href>`, even when the host passes a link component. */
  external?: boolean;
}

/** A filled action, drawn as the last row of its group. */
export interface MenuCta {
  label: string;
  href: string;
  external?: boolean;
}

/**
 * One region of the sheet.
 * `columns` 2 lays the rows in two columns from 640px up.
 * `span` is how many of the 12 columns the region takes at ≥1024px
 * (default `floor(12 / groups.length)`; a stack counts as one).
 * `tone` `"quiet"` draws the group's links in the quieter type.
 * `tone` `"card"` draws the audience cards (1.1rem label, padded row, sub tucked under it).
 * Default `"link"` draws the large display links. A group with no tone whose items are all
 * static resolves to `"card"` (the source's static column); pass `"link"` to keep the display type.
 */
export interface MenuGroup {
  heading: string;
  items: MenuItem[];
  columns?: 1 | 2;
  cta?: MenuCta;
  span?: number;
  tone?: "link" | "quiet" | "card";
}

export interface MenuStack {
  /** Groups drawn in ONE grid cell: side by side from 640px, one above the other from 1024px, as the source's side column. */
  stack: MenuGroup[];
  /** Columns of the 12 the cell takes from 1024px; default as for a group. */
  span?: number;
}
