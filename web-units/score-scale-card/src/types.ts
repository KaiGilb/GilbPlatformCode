/** A scale on a card: a bar from `min` to `max` with a "typical" marker and an "ours" marker. */
export interface ScoreScale {
  /** Text at the bar's left end, e.g. "0". */
  min: string;
  /** Text at the bar's right end, e.g. "100". */
  max: string;
  /** Legend line for the typical marker. Plain text. */
  typical: string;
  /** Position of the typical marker, percent of the bar (0 to 100; out-of-range values are held on the bar). */
  typicalAt: number;
  /** Legend line for our marker. Plain text. */
  ours: string;
  /** Position of our marker, percent of the bar (0 to 100; out-of-range values are held on the bar). */
  oursAt: number;
}

/** One card. `value` is the big figure; `title` + `what` or the shorter `label` is the text under it. */
export interface ScoreStat {
  value: string;
  title?: string;
  what?: string;
  label?: string;
  scale?: ScoreScale;
}

/** How many columns a card spans at one width. */
export interface CellSpans {
  /** Phones (under 640 px). */
  base: number;
  /** 640 px and wider. */
  sm: number;
  /** 1024 px and wider. */
  lg: number;
}

export interface StatGrid {
  /** Grid columns at 1024 px and wider. Under that the grid always has 2 columns. */
  lgCols: number;
  cells: CellSpans[];
}
