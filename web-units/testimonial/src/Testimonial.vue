<script setup lang="ts">
/**
 * One quoted statement by a named person, with the person's name, an optional role and an optional small
 * round picture beside the name. Static.
 *
 * Props: `quote`, `author`, `role?`, `avatar?` (the picture's address; its text alternative is the
 * author's name), `imageComponent?` (the host's image component, default `<img>`), `imageProps?` (extra
 * attributes for the picture).
 */
import type { Component } from "vue";

withDefaults(
  defineProps<{
    quote: string;
    author: string;
    role?: string;
    avatar?: string;
    imageComponent?: Component | string;
    imageProps?: Record<string, unknown>;
  }>(),
  { imageComponent: "img", imageProps: () => ({}) },
);
</script>

<template>
  <section class="tm">
    <blockquote class="tm-quote">&ldquo;{{ quote }}&rdquo;</blockquote>
    <div class="tm-by">
      <component :is="imageComponent" v-if="avatar" v-bind="imageProps" :src="avatar" :alt="author" class="tm-avatar" width="40" height="40" />
      <div class="tm-who">
        <p class="tm-author">{{ author }}</p>
        <p v-if="role" class="tm-role">{{ role }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral
   fallbacks. Sizes and breakpoints are the website starter's former Tailwind classes written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.tm, .tm * { box-sizing: border-box; }
.tm { margin: 0 auto; max-width: 48rem; padding: 4rem 1rem; text-align: center; }
.tm-quote {
  margin: 0; font-size: 1.25rem; line-height: 1.625; font-weight: 500;
  color: var(--site-block-fg, #1a1a1a);
}
.tm-by { margin-top: 1.5rem; display: flex; align-items: center; justify-content: center; gap: 0.75rem; }
.tm-avatar { display: block; max-width: 100%; height: 2.5rem; width: 2.5rem; border-radius: 9999px; }
.tm-who { text-align: left; }
.tm-author { margin: 0; font-weight: 500; color: var(--site-block-fg, #1a1a1a); }
.tm-role { margin: 0; font-size: 0.875rem; line-height: 1.25rem; color: var(--site-block-muted, #4b5563); }
@media (min-width: 640px) { .tm-quote { font-size: 1.5rem; line-height: 2rem; } }
</style>
