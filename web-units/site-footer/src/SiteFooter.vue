<script setup lang="ts">
/**
 * The site's footer. A top band holds the brand (or the `brand` slot) and an optional tagline, then a
 * link list when `links` is not empty. A bottom band holds the copyright line and an optional link on
 * the right. Words come from props: no i18n, no app config, no site-data import.
 *
 * Props: `brandName`, `tagline?`, `links?`, `navLabel?`, `copyrightName?`, `year?`, `endLink?`,
 * `linkComponent?`, `maxWidth?`.
 * Slot: `brand` replaces the brand-name paragraph.
 */
import { computed } from "vue";
import type { Component } from "vue";
import type { FooterEndLink, FooterLink } from "./types";

const props = withDefaults(
  defineProps<{
    /** The brand name. Also the copyright name when `copyrightName` is left out. */
    brandName: string;
    /** The line under the brand. Empty draws no paragraph. */
    tagline?: string;
    /** Footer links. Empty draws no nav. */
    links?: FooterLink[];
    /** The nav's accessible name. */
    navLabel?: string;
    /** The name in the copyright line. Defaults to `brandName`. */
    copyrightName?: string;
    /** The year in the copyright line. Defaults to the year read once below. */
    year?: number;
    /** A link on the right of the copyright line. Null draws none. Always a plain anchor. */
    endLink?: FooterEndLink | null;
    /** The host's route link (NuxtLink), given `to`. A plain `<a href>` when this is `"a"`. */
    linkComponent?: string | Component;
    /** The inner width, a CSS length. */
    maxWidth?: string;
  }>(),
  {
    tagline: "",
    links: () => [],
    navLabel: "Footer",
    endLink: null,
    linkComponent: "a",
    maxWidth: "1400px",
  },
);

// Read once per setup, not on every render and not when the module loads.
const fallbackYear = new Date().getFullYear();
const shownYear = computed(() => props.year ?? fallbackYear);
const shownCopyright = computed(() => props.copyrightName ?? props.brandName);

/** External links, and the plain-anchor default, take `href`. A route component takes `to`. */
function useAnchor(link: FooterLink): boolean {
  return link.external === true || props.linkComponent === "a";
}
</script>

<template>
  <footer data-site-footer class="sf" :style="{ '--_max': maxWidth }">
    <div class="sf-top">
      <div class="sf-brand">
        <slot name="brand">
          <p class="sf-name">{{ brandName }}</p>
        </slot>
        <p v-if="tagline" class="sf-tagline">{{ tagline }}</p>
      </div>
      <nav v-if="links.length > 0" class="sf-nav" :aria-label="navLabel">
        <ul>
          <li v-for="(link, i) in links" :key="i">
            <a
              v-if="useAnchor(link)"
              class="sf-link"
              :href="link.href"
              :rel="link.external ? 'noopener' : undefined"
            >{{ link.label }}</a>
            <component
              v-else
              :is="linkComponent"
              class="sf-link"
              :to="link.href"
            >{{ link.label }}</component>
          </li>
        </ul>
      </nav>
    </div>
    <div class="sf-bottom">
      <div class="sf-bottom-inner">
        <p class="sf-copy">© {{ shownYear }} {{ shownCopyright }}.</p>
        <a v-if="endLink" class="sf-end" :href="endLink.href">{{ endLink.label }}</a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral
   fallbacks. Sizes are the source footer's former Tailwind classes written out, plus a 44px link
   target. The colour transition runs only when the visitor has not asked for reduced motion. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.sf, .sf * { box-sizing: border-box; }
.sf {
  margin: 0;
  background: var(--site-block-bg, transparent);
  color: var(--site-block-muted, #6b7280);
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.25rem;
  border-top: 1px solid color-mix(in srgb, var(--site-block-muted, #6b7280) 10%, transparent);
}
.sf-top {
  display: grid;
  gap: 2.5rem;
  max-width: var(--_max);
  margin: 0 auto;
  padding: 3.5rem 1rem;
}
.sf-name {
  margin: 0;
  font-size: 1.125rem;
  line-height: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--site-block-fg, #1a1a1a);
}
.sf-tagline {
  margin: 0.75rem 0 0;
  max-width: 48ch;
  font-size: 0.875rem;
  line-height: 1.625;
  color: var(--site-block-muted, #6b7280);
}
.sf-nav ul {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sf-nav li { margin: 0; padding: 0; }
.sf-link, .sf-end {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--site-block-muted, #6b7280);
  text-decoration: none;
}
/* The right-hand link is the source footer's text-xs: 0.75rem. It stays 44px tall like the others. */
.sf-end {
  font-size: 0.75rem;
  line-height: 1rem;
}
.sf-link:hover, .sf-end:hover { color: var(--site-block-fg, #1a1a1a); }
.sf-link:focus-visible, .sf-end:focus-visible {
  color: var(--site-block-fg, #1a1a1a);
  outline: 2px solid var(--site-block-accent, #1d4ed8);
  outline-offset: 2px;
}
.sf-bottom {
  border-top: 1px solid color-mix(in srgb, var(--site-block-muted, #6b7280) 10%, transparent);
}
.sf-bottom-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  max-width: var(--_max);
  margin: 0 auto;
  padding: 1.5rem 1rem;
}
.sf-copy { margin: 0; }
@media (min-width: 768px) {
  .sf-top { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
}
@media (prefers-reduced-motion: no-preference) {
  .sf-link, .sf-end { transition: color var(--site-block-motion, 150ms); }
}
</style>
