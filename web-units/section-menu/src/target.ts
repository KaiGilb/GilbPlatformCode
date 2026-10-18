/**
 * Remembers which fragment the page had before the site's router could rewrite the address.
 *
 * Before the page's script runs, the menu's button is a link to `#<panel id>`, and the panel opens by CSS
 * `:target`. When the script takes over, the menu must see that the visitor opened it. But a router (Nuxt's
 * vue-router) replaces the address without the fragment before the menu mounts (Agent.Tester round 9, D19),
 * so the menu cannot rely on `location.hash` at mount. A host calls this as early as it can — in Nuxt, at the
 * top of a client plugin with `enforce: 'pre'` — and the menu reads it at takeover. Calling it is optional:
 * the menu also reads `location.hash`, `:target`, and whether focus is already inside its panel.
 */
let remembered: string | null = null;

/**
 * Records the current fragment, and any fragment the visitor goes to until the menu takes over.
 * Safe to call more than once and on the server (it does nothing there).
 */
export function rememberSectionMenuTarget(): void {
  if (typeof window === "undefined") return;
  remembered = window.location.hash || remembered;
  if (!listening) {
    listening = true;
    window.addEventListener("hashchange", () => {
      if (window.location.hash) remembered = window.location.hash;
    });
  }
}
let listening = false;

/** The fragment remembered for `panelId`'s menu, read once: true when it was `#<panelId>`. */
export function takeRememberedTarget(panelId: string): boolean {
  const hit = remembered === `#${panelId}`;
  if (hit) remembered = null;
  return hit;
}
