/**
 * The opacity of one line from where its top is: dim while its top is below `fadeStart` of the viewport height,
 * lit once it is above `fadeEnd`, a smoothstep between. As the Gilb Websites landing page's ScrubLines.
 *
 * @param top the line's top, px from the viewport's top
 * @param vh the viewport height, px
 * @param dim opacity of a line not yet reached
 * @param lit opacity of a line that has been reached
 * @param fadeStart fraction of `vh` where a line starts to brighten
 * @param fadeEnd fraction of `vh` where it is fully lit (smaller than `fadeStart`)
 * @returns opacity rounded to 3 decimals
 */
export function lineOpacity(top: number, vh: number, dim: number, lit: number, fadeStart: number, fadeEnd: number): number {
  const span = vh * (fadeStart - fadeEnd);
  const t = Math.min(1, Math.max(0, (vh * fadeStart - top) / span));
  const p = t * t * (3 - 2 * t);
  return Math.round((dim + (lit - dim) * p) * 1000) / 1000;
}
