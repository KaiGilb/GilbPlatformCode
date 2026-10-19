/** One card. `title` and `body` are drawn by the default card; a host that fills the `card` slot may use them as it likes. */
export interface DeckStep {
  title: string;
  body?: string;
  /** A small phase label drawn top-left by the default card. */
  tag?: string;
}
