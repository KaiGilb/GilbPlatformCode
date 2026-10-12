# Panes

Left, centre, and right. The centre is whatever the app puts there.

Drag a divider, or focus it and use the arrow keys. Moving the left divider right makes the left region wider. Moving the right divider right makes the right region narrower. The host stores the widths and whether a side is collapsed. This unit does not remember them itself.

Each divider reports the width it controls to assistive technology (`aria-valuenow`). Pass `leftMin`, `leftMax`, `rightMin` and `rightMax` in the layout and it reports the range too (`aria-valuemin`, `aria-valuemax`). Without them a screen reader assumes a range of 0 to 100.

Each region carries `data-region="left"`, `"center"` or `"right"`. The dividers are visible and show focus. Their classes are Tailwind utilities over the `editorial-tokens` colour variables (`--line-2`, `--focus`, `--accent`). Without Tailwind and those variables the classes do nothing and the dividers stay unstyled.

`units/app-shell` draws its wide-screen layout with this unit.

## Installing it into your app

Install it as a copy, not a link, so your app has one copy of React. First put this line in your app's own `.npmrc` (the unit's own `.npmrc` does not apply to your app's install):

```
install-links=true
```

Then install it:

```sh
npm install <path-to-the-library>/units/panes
```

Every later `npm install` and `npm ci`, CI included, then keeps the copy. Without that line a plain install makes a link, the unit brings a second copy of React, and the app fails with "Invalid hook call" and a type error that "two different types with this name exist". A one-off `npm install --install-links <path>` works only until the next plain install, and `npm ci` then refuses the lock file.

