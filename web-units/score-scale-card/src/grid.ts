/**
 * The pure parts of the score-scale cards: the grid rule, the marker position and the sentence a screen
 * reader hears for a scale. Moved without change in behaviour from the Gilb Websites landing page
 * (pages/index.vue `statGrid`, `scaleSentence`, `pct`; see README "Source").
 */
import type { ScoreScale, ScoreStat, StatGrid } from "./types";

/**
 * Which grid the cards sit in, and how wide each card is, at three widths.
 *
 * - Phones (under 640 px): 2 columns; a scored card takes the whole row; an odd last plain card spans both.
 * - 640 px and up: 2 per row for every card; an odd last card spans both.
 * - 1024 px and up: when the scored cards pair up and the plain cards come in threes, a 6-column grid with scored
 *   cards 3 wide (two per row) and plain cards 2 wide (three per row). Otherwise one equal row for 4 or 5 cards,
 *   else 3 per row (2 per row for one or two cards).
 *
 * @param stats the cards, in order
 * @returns the 1024 px column count and each card's spans
 */
export function statGrid(stats: ScoreStat[]): StatGrid {
  const scored = stats.filter((s) => s.scale).length;
  const plain = stats.length - scored;
  const sixUp = scored > 0 && scored % 2 === 0 && plain % 3 === 0;
  let lgCols = 3;
  if (sixUp) lgCols = 6;
  else if (stats.length <= 2) lgCols = 2;
  else if (stats.length === 4) lgCols = 4;
  else if (stats.length === 5) lgCols = 5;

  const lastPlain = stats.map((s) => !s.scale).lastIndexOf(true);
  const oddPlainLast = (i: number) => i === lastPlain && plain % 2 === 1;
  const cells = stats.map((s, i) => {
    const base = s.scale || oddPlainLast(i) ? 2 : 1;
    let sm = base;
    if (s.scale) sm = 1;
    else if (oddPlainLast(i)) sm = 1;
    // An odd total leaves a lone last card at 640 to 1023 px; it spans both columns.
    if (i === stats.length - 1 && stats.length % 2 === 1) sm = 2;
    const lg = sixUp ? (s.scale ? 3 : 2) : 1;
    return { base, sm, lg };
  });
  return { lgCols, cells };
}

/**
 * The sentence a screen reader hears for a scored card's bar, which is drawn for sighted readers only. Built from
 * the card's own fields, so it cannot disagree with the visible labels.
 *
 * @param scale the card's scale
 * @param range builds the opening words from the two end labels; the default is English
 * @returns e.g. "Scale 0 to 100. Most sites: under 50 on a phone. Ours: 95+ (90+ on a phone)."
 */
export function scaleSentence(scale: ScoreScale, range: (min: string, max: string) => string = defaultRange): string {
  const end = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
  return `${range(scale.min, scale.max)} ${end(scale.typical)} ${end(scale.ours)}`;
}

/** The English opening of the sentence. */
export const defaultRange = (min: string, max: string): string => `Scale ${min} to ${max}.`;

/**
 * A marker position as a CSS percentage, held on the bar if the number is out of range or not a number.
 *
 * @param n percent from the content
 */
export const pct = (n: number): string => `${Math.min(100, Math.max(0, Number(n) || 0))}%`;
