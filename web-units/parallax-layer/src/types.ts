export interface ParallaxLayerProps {
  /** Parallax rate. Positive lags the scroll (reads deeper), negative leads it. Keep small: the band system is tuned for 0.05 to 0.2. */
  rate?: number;
  /** Decorative planes are inert to input and hidden from assistive tech. */
  decorative?: boolean;
  /** Rendered wrapper element. */
  tag?: string;
  /** Classes for the INNER (transformed) element. Layout that must ride the transform (a height chain, flex alignment) belongs on the inner, not the outer. */
  innerClass?: string;
}
