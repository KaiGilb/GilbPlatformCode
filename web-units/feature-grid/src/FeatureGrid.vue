<script setup lang="ts">
/**
 * A grid of equal bordered tiles, one per point an offering makes: a short title, a line or two and an
 * optional icon. One column on a phone, two from 640 px, three from 1024 px. Static.
 *
 * Props: `heading?` and `features` (`{ title, description, icon? }[]`; `icon` is a short text such as an
 * emoji, drawn hidden from screen readers).
 */
import type { Feature } from "./types";

defineProps<{
  heading?: string;
  features: Feature[];
}>();
</script>

<template>
  <section class="fg">
    <h2 v-if="heading" class="fg-heading">{{ heading }}</h2>
    <div class="fg-grid">
      <div v-for="f in features" :key="f.title" class="fg-tile">
        <div v-if="f.icon" class="fg-icon" aria-hidden="true">{{ f.icon }}</div>
        <h3 class="fg-title">{{ f.title }}</h3>
        <p class="fg-text">{{ f.description }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral
   fallbacks. Sizes and breakpoints are the website starter's former Tailwind classes written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.fg, .fg * { box-sizing: border-box; }
.fg { margin: 0 auto; max-width: 72rem; padding: 4rem 1rem; }
.fg-heading {
  margin: 0 0 2.5rem; text-align: center; font-size: 1.5rem; line-height: 2rem; font-weight: 600;
  color: var(--site-block-fg, #1a1a1a);
}
.fg-grid { display: grid; gap: 2rem; }
.fg-tile {
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 20%, transparent);
  border-radius: var(--site-block-radius-lg, 0.5rem); padding: 1.5rem;
}
.fg-icon { margin-bottom: 0.75rem; font-size: 1.5rem; line-height: 2rem; }
.fg-title { margin: 0; font-size: inherit; font-weight: 500; color: var(--site-block-fg, #1a1a1a); }
.fg-text { margin: 0.5rem 0 0; font-size: 0.875rem; line-height: 1.25rem; color: var(--site-block-muted, #4b5563); }
@media (min-width: 640px) { .fg-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1024px) { .fg-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
