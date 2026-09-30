/**
 * Paint order for overlays that are taken out of the page and attached to the document.
 * A menu opened from inside a photo must paint above that photo.
 * The picker is the top layer. Do not add a layer above it.
 */
export const LAYER = {
  adornment: 1,
  menuBackdrop: 100,
  menu: 101,
  dialog: 110,
  sheet: 120,
  chrome: 125,
  pickerBackdrop: 200,
  picker: 201,
} as const;

export type LayerName = keyof typeof LAYER;

/** The picker outranks every other named layer. */
export function pickerIsTop(layers: Record<string, number> = LAYER): boolean {
  const top = Math.max(...Object.values(layers));
  return layers.picker === top;
}
