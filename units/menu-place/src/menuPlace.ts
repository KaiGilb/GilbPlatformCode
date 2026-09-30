export interface MenuBand {
  top: number;
  bottom: number;
  width: number;
}

export interface MenuAnchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PlacedMenu {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/**
 * Below the anchor when the menu fits in the band, otherwise above, otherwise shifted
 * so both edges sit in the band. A menu taller than the band scrolls inside itself.
 */
export function placeMenu(args: {
  anchor: MenuAnchor;
  menuHeight: number;
  band: MenuBand;
  menuWidth?: number;
  gap?: number;
  margin?: number;
}): PlacedMenu {
  const menuWidth = args.menuWidth ?? 224;
  const gap = args.gap ?? 6;
  const margin = args.margin ?? 8;
  const { anchor, band } = args;
  const availH = Math.max(120, band.bottom - band.top);
  const height = Math.min(args.menuHeight, availH);
  const left = Math.min(Math.max(margin, anchor.right - menuWidth), band.width - menuWidth - margin);
  let top: number;
  if (anchor.bottom + gap + height <= band.bottom) top = anchor.bottom + gap;
  else if (anchor.top - gap - height >= band.top) top = anchor.top - gap - height;
  else {
    top = Math.min(Math.max(band.top, anchor.bottom + gap), band.bottom - height);
    if (top < band.top) top = band.top;
  }
  return { left, top, width: menuWidth, maxHeight: height };
}
