export interface DoubleBezelProps {
  /** Any CSS colour laid over the outer shell at `tintAlpha`; empty for none. */
  tint?: string;
  /** 0 to 1, default 0.16. */
  tintAlpha?: number;
  /** Lines and highlight for a dark section. */
  onDark?: boolean;
}
