/**
 * The section menu's line icons, drawn in `currentColor` so every theme colours them through its own
 * tokens. Decorative: the row's text carries the name. A host with icons of its own passes
 * `renderIcon` to the menu instead.
 *
 * The set came with the menu from GilbApp (the agreed mockup MOCKUP-2026-10-18-SectionMenu-GilbApp).
 */
import type { ReactElement } from "react";

/** The names of the icons this unit draws. */
export type MenuIconKey =
  | "vaults" | "records" | "stake" | "files" | "standards" | "onto" | "trash" | "admin"
  | "leaf" | "book" | "net" | "news" | "help" | "cam" | "user" | "home" | "bot" | "key"
  | "plus" | "graph" | "filter" | "search" | "upload" | "globe" | "tree" | "share"
  | "card" | "paneLeft" | "paneRight" | "signout" | "device";

const SHAPES: Record<MenuIconKey, ReactElement> = {
  vaults: <><path d="M12 3 21 12 12 21 3 12Z"/></>,
  records: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 10v10"/></>,
  stake: <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14a5 5 0 0 1 5.5 5"/></>,
  files: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></>,
  standards: <><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></>,
  onto: <><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5"/></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></>,
  admin: <><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/></>,
  leaf: <><path d="M5 19c8 0 14-6 14-15C10 4 5 9 5 19Z"/><path d="M5 19 13 11"/></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></>,
  net: <><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7l7.5 0M7.5 8l3.5 8M16.8 9.2 13.3 16"/></>,
  news: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/></>,
  cam: <><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 14h.01M15 14h.01"/></>,
  key: <><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  graph: <><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="12" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.3 7.2 15.7 10.8M8.3 16.8l7.4-3.6"/></>,
  filter: <><path d="M3 5h18l-7 8v6l-4 2v-8z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
  tree: <><path d="M12 3v18M12 8l-6 4M12 8l6 4M12 14l-5 4M12 14l5 4"/></>,
  share: <><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14"/></>,
  card: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  paneLeft: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></>,
  paneRight: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/></>,
  signout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></>,
  device: <><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></>,
};

/** True when `name` is an icon this unit draws. */
export function isMenuIconKey(name: string): name is MenuIconKey {
  return Object.prototype.hasOwnProperty.call(SHAPES, name);
}

/**
 * One menu icon at `size` px. Decorative: the row's text carries the name.
 * @param name the icon's name
 * @param size its width and height in px (default 20)
 */
export function MenuIcon({ name, size = 20 }: { name: MenuIconKey; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {SHAPES[name]}
    </svg>
  );
}
