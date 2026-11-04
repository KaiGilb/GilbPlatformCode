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
 * (default `floor(12 / groups.length)`).
 */
export interface MenuGroup {
  heading: string;
  items: MenuItem[];
  columns?: 1 | 2;
  cta?: MenuCta;
  span?: number;
}
