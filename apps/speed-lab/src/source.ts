// Where the first rows on a page came from, decided at the moment they are SEEN (not at mount).
import type { PaintSource } from "./proof";

/**
 * - `preview`: the rows are a partial preview of the first network load (the walk's first pages, not yet the whole list);
 * - `memory`: rows were already there at mount, and not from the device;
 * - `device`: the rows were put in from the device copy (even one that arrived late, after the page had mounted);
 * - `network`: the first rows are the full network answer.
 */
export function decideSource(i: { hadRowsAtMount: boolean; partial: boolean; fromDevice: boolean }): PaintSource {
  if (i.partial) return "preview";
  if (i.hadRowsAtMount) return i.fromDevice ? "device" : "memory";
  return i.fromDevice ? "device" : "network";
}
