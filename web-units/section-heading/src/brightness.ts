/**
 * How bright the headline's second line is, from where its top is: 0 while its top is below `startAt` of the
 * viewport height, 1 once it has risen `window` of the viewport height past that. A short snap, not a crawl.
 *
 * @param top the line's top, px from the viewport's top
 * @param vh the viewport height, px
 * @param startAt fraction of `vh` where it starts (0.78 on the Gilb Websites page)
 * @param window fraction of `vh` over which it goes from 0 to 1 (0.13)
 * @returns a number from 0 to 1
 */
export function brightness(top: number, vh: number, startAt = 0.78, window = 0.13): number {
  return Math.min(1, Math.max(0, (vh * startAt - top) / (vh * window)));
}
