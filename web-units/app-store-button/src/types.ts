/** What the click event carries, for the host's analytics. */
export interface AppStoreClick {
  /** The store address that was opened. */
  href: string;
  /** The visible words. */
  label: string;
  /** Where on the page the button is (the `location` prop). */
  location: string;
}
