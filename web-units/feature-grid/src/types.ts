/** One tile of a feature grid: its title, a line or two, and an optional short icon text (for example an emoji). */
export interface Feature {
  title: string;
  description: string;
  icon?: string;
}
