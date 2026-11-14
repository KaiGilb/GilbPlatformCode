# menu-place

Puts a menu in the visible band. Below the anchor if it fits, otherwise above.

## What this is

Puts a menu in the visible band: below the anchor if it fits, otherwise above, otherwise shifted so both edges sit in the band. `placeMenu({ anchor, menuHeight, band, menuWidth?, gap? })` answers `{ left, top, width, maxHeight }`. It only does the placing; it draws nothing.

For a three-dots "..." header menu (more, overflow, kebab, dropdown) take `MenuButton` from `units/section-menu` (Escape and outside click close it, focus returns to the button, arrow keys move).
