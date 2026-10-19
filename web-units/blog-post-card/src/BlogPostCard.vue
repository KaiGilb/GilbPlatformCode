<script setup lang="ts">
/**
 * One post of a site's blog in a list: a bordered card that is a link to the post, with an optional
 * cover picture, an optional date, the title and an optional excerpt. Static.
 *
 * Props: `title`, `to` (the post's route), `excerpt?`, `date?` (any string `Date` reads, such as
 * `2026-05-28`), `image?` (the cover; its text alternative is the title), `formatDate?` (how the date is
 * written; default the visitor's `toLocaleDateString()`), `linkComponent?` (the host's route link, default
 * a plain `<a href>`), `imageComponent?` (default `<img>`), `imageProps?` (extra attributes for the cover).
 */
import type { Component } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    to: string;
    excerpt?: string;
    date?: string;
    image?: string;
    formatDate?: (date: string) => string;
    linkComponent?: Component | string;
    imageComponent?: Component | string;
    imageProps?: Record<string, unknown>;
  }>(),
  {
    // Gotcha: the default writes the date in the locale of whoever renders it, so a prerendered page and
    // the visitor's browser may write it differently. Pass formatDate with a fixed locale to avoid that.
    formatDate: (date: string) => new Date(date).toLocaleDateString(),
    linkComponent: "a",
    imageComponent: "img",
    imageProps: () => ({}),
  },
);

// A plain <a> takes the route as href; a router link component (NuxtLink, RouterLink) takes it as `to`.
const linkAttrs = (to: string) => (props.linkComponent === "a" ? { href: to } : { to });
</script>

<template>
  <component :is="linkComponent" v-bind="linkAttrs(to)" class="bpc">
    <component :is="imageComponent" v-if="image" v-bind="imageProps" :src="image" :alt="title" class="bpc-image" loading="lazy" />
    <div class="bpc-body">
      <p v-if="date" class="bpc-date">{{ formatDate(date) }}</p>
      <h3 class="bpc-title">{{ title }}</h3>
      <p v-if="excerpt" class="bpc-excerpt">{{ excerpt }}</p>
    </div>
  </component>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral
   fallbacks. Sizes are the website starter's former Tailwind classes written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.bpc, .bpc * { box-sizing: border-box; }
.bpc {
  display: block; overflow: hidden; color: inherit; text-decoration: inherit;
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 20%, transparent);
  border-radius: var(--site-block-radius-lg, 0.5rem);
  transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
  transition-duration: var(--site-block-motion, 150ms); transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
.bpc:hover { border-color: var(--site-block-accent, #2563eb); }
.bpc-image { display: block; max-width: 100%; width: 100%; height: 10rem; object-fit: cover; }
.bpc-body { padding: 1.25rem; }
.bpc-date { margin: 0; font-size: 0.75rem; line-height: 1rem; color: var(--site-block-muted, #4b5563); }
.bpc-title { margin: 0.25rem 0 0; font-size: inherit; font-weight: 500; color: var(--site-block-accent, #2563eb); }
.bpc:hover .bpc-title { text-decoration-line: underline; }
.bpc-excerpt { margin: 0.5rem 0 0; font-size: 0.875rem; line-height: 1.25rem; color: var(--site-block-muted, #4b5563); }
@media (prefers-reduced-motion: reduce) { .bpc { transition: none; } }
</style>
