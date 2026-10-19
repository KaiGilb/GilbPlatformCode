<script setup lang="ts">
/**
 * A set of pictures as a grid of equal tiles, each with its own text alternative and loaded lazily. Two
 * columns on a phone, three from 768 px, four from 1024 px. Static.
 *
 * Props: `heading?`, `images` (`{ src, alt }[]`; `src` is the list's key, so keep it distinct),
 * `imageComponent?` (the host's image component, default `<img>`), `imageProps?` (extra attributes for
 * every picture, for example `{ format: 'avif,webp' }` for Nuxt Image).
 */
import type { Component } from "vue";
import type { GalleryImage } from "./types";

withDefaults(
  defineProps<{
    heading?: string;
    images: GalleryImage[];
    imageComponent?: Component | string;
    imageProps?: Record<string, unknown>;
  }>(),
  { imageComponent: "img", imageProps: () => ({}) },
);
</script>

<template>
  <section class="ig">
    <h2 v-if="heading" class="ig-heading">{{ heading }}</h2>
    <div class="ig-grid">
      <component
        :is="imageComponent"
        v-for="img in images"
        :key="img.src"
        v-bind="imageProps"
        :src="img.src"
        :alt="img.alt"
        class="ig-image"
        loading="lazy"
      />
    </div>
  </section>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral
   fallbacks. Sizes and breakpoints are the website starter's former Tailwind classes written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.ig, .ig * { box-sizing: border-box; }
.ig { margin: 0 auto; max-width: 72rem; padding: 4rem 1rem; }
.ig-heading {
  margin: 0 0 2rem; font-size: 1.5rem; line-height: 2rem; font-weight: 600;
  color: var(--site-block-fg, #1a1a1a);
}
.ig-grid { display: grid; gap: 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ig-image {
  display: block; max-width: 100%; width: 100%; height: 10rem; object-fit: cover;
  border-radius: var(--site-block-radius, 0.375rem);
}
@media (min-width: 768px) { .ig-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1024px) { .ig-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
