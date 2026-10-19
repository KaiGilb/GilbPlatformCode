/**
 * How far the next card has travelled up over this one: 0 while the next card's top is 140 px (plus 70 % of the
 * viewport height) below, 1 when it has come up to 140 px from the top. Drives the scale-back and the veil.
 *
 * @param nextTop the next card's top, px from the viewport's top
 * @param vh the viewport height, px
 * @returns 0 to 1
 */
export function coverProgress(nextTop: number, vh: number): number {
  return Math.min(1, Math.max(0, 1 - (nextTop - 140) / (vh * 0.7)));
}

/**
 * The active step on the rail: the last card whose top has crossed 55 % of the viewport height.
 *
 * @param tops each card's top, px
 * @param vh the viewport height, px
 */
export function activeStep(tops: number[], vh: number): number {
  let active = 0;
  for (let i = 0; i < tops.length; i += 1) if (tops[i]! < vh * 0.55) active = i;
  return active;
}
