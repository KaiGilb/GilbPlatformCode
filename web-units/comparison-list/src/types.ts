/** One topic and the two answers compared on it. Plain text. Topics are the list's keys, so keep them distinct. */
export interface ComparisonRow {
  topic: string;
  /** What is typical (the left answer). */
  them: string;
  /** What we do (the right answer, marked with a check). */
  us: string;
}
