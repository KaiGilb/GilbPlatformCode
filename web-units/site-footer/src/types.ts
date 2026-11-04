/** One footer link. `external` is always a plain anchor with rel="noopener", and no target is set. */
export interface FooterLink {
  /** The words the visitor reads. */
  label: string;
  /** A route, or a full address when `external` is set. */
  href: string;
  /** Draw a plain `<a href>`, even when the host passed a route-link component. */
  external?: boolean;
}

/** The optional link on the right of the copyright line. */
export interface FooterEndLink {
  label: string;
  href: string;
}
