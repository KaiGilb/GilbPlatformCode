<script setup lang="ts">
/**
 * A "Get the app" link to an app store. It draws nothing when it has no address, so a page without an app never
 * shows a dead button. A click is told to the host as an event (for its analytics); the link opens as it would
 * anyway, and the unit never delays or blocks it.
 *
 * Props: `href`, `label?`, `ariaLabel?`, `variant?`, `location?`. Event: `click({ href, label, location })`.
 */
import type { AppStoreClick } from "./types";

const props = withDefaults(
  defineProps<{
    /** The store address. Empty or missing: nothing is drawn. */
    href?: string;
    /** The visible words. */
    label?: string;
    /** A longer name for screen readers, e.g. "Get Example on the App Store". Left out, the visible words are the name. */
    ariaLabel?: string;
    /** `header` is compact, for a site's top bar; `inline` is a little larger, for a place in the text. */
    variant?: "header" | "inline";
    /** Where on the page the button is; sent with the click event. */
    location?: string;
  }>(),
  { href: "", label: "Get the app", ariaLabel: "", variant: "header", location: "header" },
);
const emit = defineEmits<{ click: [detail: AppStoreClick] }>();

function onClick(): void {
  emit("click", { href: props.href, label: props.label, location: props.location });
}
</script>

<template>
  <a
    v-if="href"
    :href="href"
    target="_blank"
    rel="noopener"
    :class="['asb', `asb-${variant}`]"
    :aria-label="ariaLabel || undefined"
    @click="onClick"
  >
    <svg class="asb-glyph" viewBox="0 0 384 512" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM256.6 93c30.3-35.9 27.6-68.5 26.7-80.3-26.8 1.6-57.8 18.3-75.5 38.9-19.5 22.1-31 49.4-28.5 80.3 29 2.2 55.5-12.7 77.3-38.9z"
      />
    </svg>
    <span>{{ label }}</span>
  </a>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral fallbacks.
   Sizes are the Skalden site's former Tailwind and theme-function values written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.asb, .asb * { box-sizing: border-box; }
.asb {
  display: inline-flex; align-items: center; gap: 0.5rem; min-height: 44px; padding: 0.5rem 1.1rem;
  font-family: inherit; font-weight: 600; font-size: 1rem; line-height: 1.2; white-space: nowrap;
  border-radius: var(--site-block-radius, 1rem); text-decoration: none;
  background: var(--site-block-accent, #b45309); color: var(--site-block-on-accent, #ffffff);
  transition: opacity var(--site-block-motion, 150ms) ease;
}
.asb:hover, .asb:focus { opacity: 0.9; text-decoration: none; }
.asb:focus-visible { outline: 2px solid var(--site-block-accent, #b45309); outline-offset: 2px; }
.asb-glyph { flex-shrink: 0; }
.asb-inline { padding: 0.7rem 1.4rem; font-size: 1.05rem; }
@media (prefers-reduced-motion: reduce) { .asb { transition: none; } }
</style>
