/** Heading element for the band's title. */
export type TitledSectionHeadingLevel = "h1" | "h2" | "h3";

/** `bg` uses the page background; `alt` uses the alternating surface. */
export type TitledSectionTone = "bg" | "alt";

/**
 * Vertical padding.
 * `lg` is 50px, and 100px from 768px. `sm` is 70px at every breakpoint.
 */
export type TitledSectionPadding = "lg" | "sm";

/** `center` centres the ornament, heading and rule. `start` aligns them to the start. */
export type TitledSectionAlign = "center" | "start";

/** Props of `<TitledSection>`. `title` is required; every other field has a default except `id`. */
export interface TitledSectionProps {
  /** The band's heading text. */
  title: string;
  /**
   * Heading element. Default `h2`: a reusable band usually sits under a page h1.
   * The source band defaulted to `h1` for standalone pages; pass `h1` for that case.
   */
  headingLevel?: TitledSectionHeadingLevel;
  /** Band background. Default `bg`. */
  tone?: TitledSectionTone;
  /** Vertical padding. Default `lg` (50px, 100px from 768px). */
  padding?: TitledSectionPadding;
  /**
   * Ornament image address. Empty (the default) draws no ornament.
   * The host supplies the file; this package does not.
   */
  ornamentSrc?: string;
  /** Ornament width attribute, and the rendered width in px. Default 25. */
  ornamentWidth?: number;
  /** Ornament height attribute in px. Reserves the ratio; CSS height stays `auto`. Default 29. */
  ornamentHeight?: number;
  /** Draw the short rule under the heading. Default true. */
  rule?: boolean;
  /** Alignment of the ornament, heading and rule. Default `center`. */
  align?: TitledSectionAlign;
  /** Inner max width. Default `1140px`. */
  maxWidth?: string;
  /**
   * Set on the `<section>`. The heading id is this plus `-title`, and the section's
   * `aria-labelledby` points at the heading. With no id, the heading id comes from `useId()`.
   */
  id?: string;
}
