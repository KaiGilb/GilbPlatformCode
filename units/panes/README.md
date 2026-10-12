# Panes

Left, centre, and right. The centre is whatever the app puts there.

Drag a divider, or focus it and use the arrow keys. Moving the left divider right makes the left region wider. Moving the right divider right makes the right region narrower. The host stores the widths and whether a side is collapsed. This unit does not remember them itself.

Each region carries `data-region="left"`, `"center"` or `"right"`. The dividers are visible and show focus. Their classes are Tailwind utilities over the `editorial-tokens` colour variables (`--line-2`, `--focus`, `--accent`). Without Tailwind and those variables the classes do nothing and the dividers stay unstyled.

`units/app-shell` draws its wide-screen layout with this unit.
