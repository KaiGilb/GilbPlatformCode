import type { Component } from "vue";

/** When the site name is drawn beside the logo. */
export type SiteLogoWordmark = "always" | "when-no-logo" | "never";

/** Props for `<SiteLogo>`. */
export interface SiteLogoProps {
  /** The site name. Shown as the wordmark, and used as the image alt when the wordmark is not shown. */
  name: string;
  /** Where the logo goes. Default `/`. */
  href?: string;
  /**
   * The address is outside this site's router. The link is then a plain `<a href>`,
   * even when `linkComponent` was passed.
   */
  external?: boolean;
  /** Logo image address. Empty draws no image. */
  logoSrc?: string;
  /** Image alt used only when the wordmark is not shown. Empty falls back to `name`. */
  logoAlt?: string;
  /** The image's `width` attribute, in CSS pixels. Default 32. Always set, so the layout does not jump. */
  logoWidth?: number;
  /** The image's `height` attribute, in CSS pixels. Default 32. */
  logoHeight?: number;
  /**
   * When to show `name` as text. Default `always`.
   * `never` with no image still shows the name, so the link is never empty.
   */
  wordmark?: SiteLogoWordmark;
  /** Route link, given `to`. The string `a` (the default) is a plain anchor, given `href`. */
  linkComponent?: string | Component;
  /** The image element, given `src`, `alt`, `width`, `height`, `decoding` and `loading`. Default `img`. */
  imageComponent?: string | Component;
  /** Draw only the image (`alt=""`, `aria-hidden`), with no link and no wordmark. */
  decorative?: boolean;
}
