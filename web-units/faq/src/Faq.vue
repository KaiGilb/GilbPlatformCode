<script setup lang="ts">
/**
 * Questions a site's visitors often ask, each a native `<details>`: its `<summary>` is the question and
 * opens the answer in place below it. It needs no script; with JavaScript off it works the same.
 *
 * Props: `heading?` and `items` (`{ q, a }[]`, the question and its answer as plain text).
 * Added in 0.2.0, off by default: `icon?` ("plus-minus" draws two bars that turn from + to − when open, instead of
 * the + that turns to ×) and `scrollMarginTop?` (a CSS length put on each summary, so a question reached by Tab
 * stops clear of a fixed header).
 */
import type { FaqItem } from "./types";

withDefaults(
  defineProps<{
    heading?: string;
    items: FaqItem[];
    icon?: "plus-cross" | "plus-minus";
    scrollMarginTop?: string;
  }>(),
  { icon: "plus-cross", scrollMarginTop: undefined },
);
</script>

<template>
  <section class="faq">
    <h2 v-if="heading" class="faq-heading">{{ heading }}</h2>
    <div class="faq-list">
      <details v-for="item in items" :key="item.q" class="faq-item">
        <summary class="faq-q" :style="scrollMarginTop ? { scrollMarginTop } : undefined">
          {{ item.q }}
          <span v-if="icon === 'plus-minus'" class="faq-sign faq-bars" aria-hidden="true" />
          <span v-else class="faq-sign" aria-hidden="true">+</span>
        </summary>
        <p class="faq-a">{{ item.a }}</p>
      </details>
    </div>
  </section>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral
   fallbacks. Sizes are the website starter's former Tailwind classes written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.faq, .faq * { box-sizing: border-box; }
.faq { margin: 0 auto; max-width: 48rem; padding: 4rem 1rem; }
.faq-heading {
  margin: 0 0 2rem; font-size: 1.5rem; line-height: 2rem; font-weight: 600;
  color: var(--site-block-fg, #1a1a1a);
}
.faq-item { padding: 1rem 0; }
.faq-item + .faq-item { border-top: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 15%, transparent); }
.faq-q {
  cursor: pointer; font-weight: 500; color: var(--site-block-fg, #1a1a1a);
  list-style: none; display: flex; justify-content: space-between; align-items: center;
}
.faq-sign {
  color: var(--site-block-muted, #4b5563);
  transition-property: transform; transition-duration: var(--site-block-motion, 150ms);
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
.faq-item[open] .faq-sign { transform: rotate(45deg); }
/* The plus-minus option: two bars; the vertical one lies flat when open. It does not use the turn above. */
.faq-q:has(.faq-bars)::-webkit-details-marker { display: none; }
.faq-bars { position: relative; flex: none; width: 1.25rem; height: 1.25rem; }
.faq-item[open] .faq-bars { transform: none; }
.faq-bars::before, .faq-bars::after {
  content: ""; position: absolute; top: 50%; left: 0; width: 100%; height: 2px; margin-top: -1px;
  border-radius: 1px; background: currentColor;
}
.faq-bars::after { transform: rotate(90deg); transition: transform var(--site-block-motion, 150ms) ease; }
.faq-item[open] .faq-bars::after { transform: rotate(0deg); }
@media (prefers-reduced-motion: reduce) { .faq-bars::after { transition: none; } }
.faq-a { margin: 0.75rem 0 0; color: var(--site-block-muted, #4b5563); }
@media (prefers-reduced-motion: reduce) { .faq-sign { transition: none; } }
</style>
