/**
 * The shape of a website's section menu, and the helpers that read it.
 *
 * The site writes its menu as data (sections, their sub-pages, places, a call to action); the
 * component draws it. Nothing here is a page of any one site.
 *
 * ⚠ AVAILABILITY. A page that is not built is left out of the menu, not drawn
 * (Rule_Code_gilb-app-nav-truth). `coming` exists only for an entry the owner names as coming:
 * it is drawn greyed out and is not a link.
 */

/** One link in the menu: a page of the site (`to`) or an address elsewhere (`href`). */
export interface WebMenuLink {
  id: string;
  label: string;
  /** One line under the label. */
  description?: string;
  /** A route of this site, drawn with the host's link component (for example NuxtLink). */
  to?: string;
  /** An address outside the site, drawn as a plain link. */
  href?: string;
  /** Opens `href` in a new tab. */
  newTab?: boolean;
  /** Named as coming by the owner: drawn greyed out, not a link. */
  coming?: boolean;
}

/** One section: a main page on the menu's left, with its sub-pages previewed on the right. */
export interface WebMenuSection extends WebMenuLink {
  /** The section's sub-pages. None: the section is a single page. */
  links?: readonly WebMenuLink[];
  /** Ids of places ("Also useful here") that fit this section. */
  also?: readonly string[];
}

/** The call to action at the foot of the panel. */
export interface WebMenuCta {
  label: string;
  to?: string;
  href?: string;
}

/** A site's whole menu. */
export interface WebMenu {
  sections: readonly WebMenuSection[];
  /** "Also useful here": places a section names by id in `also`. */
  places?: readonly WebMenuLink[];
  cta?: WebMenuCta;
}

/** Drops a trailing slash (but not from "/"), and any query or hash, so two spellings of a path compare equal. */
export function normalisePath(path: string): string {
  const bare = path.split(/[?#]/)[0] || "/";
  return bare.length > 1 ? bare.replace(/\/+$/, "") || "/" : bare;
}

/**
 * The section a path is in: the section whose own page or one of whose sub-pages is the path or
 * holds it (`/blog/post` is in the section at `/blog`). The longest match wins; `/` matches only itself.
 * @param menu the site's menu
 * @param path the current route's path
 * @returns the section's id, or undefined when the path is in none
 */
export function currentSectionId(menu: WebMenu, path: string): string | undefined {
  const here = normalisePath(path);
  let best: { id: string; length: number } | undefined;
  for (const s of menu.sections) {
    for (const to of [s.to, ...(s.links ?? []).map((l) => l.to)]) {
      if (!to) continue;
      const t = normalisePath(to);
      const hit = here === t || (t !== "/" && here.startsWith(t + "/"));
      if (hit && (!best || t.length > best.length)) best = { id: s.id, length: t.length };
    }
  }
  return best?.id;
}

/**
 * The places that fit a section, in the places' own order.
 * @param section one section; its `also` names place ids
 * @param places the site's places
 */
export function placesFor(section: Pick<WebMenuSection, "also">, places: readonly WebMenuLink[] = []): WebMenuLink[] {
  const also = section.also ?? [];
  return places.filter((p) => also.includes(p.id));
}
