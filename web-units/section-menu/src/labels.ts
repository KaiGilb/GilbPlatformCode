/**
 * The section menu's words and timings, apart from the component so a site (and a test) can read
 * them without loading Vue.
 */

/** How long the pointer must rest on a section before its sub-pages are previewed. The app menu's value. */
export const HOVER_INTENT_MS = 120;
/** A click this soon after a hover opened the menu is the same gesture, not a request to close. */
export const HOVER_CLICK_GRACE_MS = 600;

/** Every word the menu draws. */
export interface WebMenuLabels {
  /** The accessible name of the menu's navigation landmark. */
  navLabel: string;
  /** The panel's heading and its accessible name. */
  goTo: string;
  /** The button's text when the page is in no section. */
  menu: string;
  /** The button's accessible name. */
  trigger: (currentLabel: string) => string;
  sections: string;
  /** The accessible name of the sections' group. */
  sectionsGroup: string;
  inSection: (label: string) => string;
  /** Under "In <section>" while another section than yours is previewed. */
  previewHint: (label: string) => string;
  alsoUseful: string;
  close: string;
  here: string;
  coming: string;
  /** The footer's hint on a wide window. */
  hint: string;
}

export const DEFAULT_WEB_LABELS: WebMenuLabels = {
  navLabel: "Site",
  goTo: "Go to",
  menu: "Menu",
  trigger: (label) => `Go to — you are on ${label}`,
  sections: "Sections",
  sectionsGroup: "Sections — Tab or the arrow keys move between them",
  inSection: (label) => `In ${label}`,
  previewHint: (label) => `Click a page to go to ${label}`,
  alsoUseful: "Also useful here",
  close: "Close",
  here: "You are here",
  coming: "Coming",
  hint: "Press Esc to close",
};
