<script setup lang="ts">
/**
 * A container that fades up every `[data-reveal]` element inside it as the element scrolls into view (the
 * `useReveal` composable on a wrapper, plus the CSS it needs). Put `data-reveal` on what should glide in.
 *
 * Props: `tag?` (the wrapper's element, default `div`).
 */
import { ref } from "vue";
import { useReveal } from "./useReveal";

withDefaults(defineProps<{ tag?: string }>(), { tag: "div" });
const root = ref<HTMLElement | null>(null);
useReveal(root);
</script>

<template>
  <component :is="tag" ref="root"><slot /></component>
</template>

<style>
/* Not scoped, on purpose: the classes land on the host's own elements inside the slot. Names are prefixed `sf-`.
   Distance, time and curve are the Gilb Websites page's measured values: translateY(24px), 1 s,
   cubic-bezier(0.25, 0.05, 0.3, 0.7), and `--sf-delay` for the stagger. Gated by `html.sf-motion` (set after
   mount, when motion is allowed) and by the reduced-motion query. */
@media (prefers-reduced-motion: no-preference) {
  html.sf-motion .sf-hidden { opacity: 0; transform: translateY(24px); }
  html.sf-motion .sf-shown {
    opacity: 1; transform: none;
    transition: opacity 1s cubic-bezier(0.25, 0.05, 0.3, 0.7), transform 1s cubic-bezier(0.25, 0.05, 0.3, 0.7);
    transition-delay: var(--sf-delay, 0ms);
  }
}
</style>
