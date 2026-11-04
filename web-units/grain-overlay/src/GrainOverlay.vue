<script setup lang="ts">
/**
 * Fixed film-grain over the whole page: one inert element.
 * Static paint: no animation, nothing to gate for reduced motion.
 * Hidden from assistive tech. The host sets zIndex so the grain sits
 * above page content and below the host's menus and header.
 */
const props = withDefaults(defineProps<{ zIndex?: number }>(), { zIndex: 30 });

// Encoded once at module scope: a 180px fractal-noise tile.
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23g)'/%3E%3C/svg%3E\")"
</script>

<template>
  <div class="go" aria-hidden="true" :style="{ zIndex: props.zIndex, backgroundImage: GRAIN_URI }" />
</template>

<style scoped>
/* The source's Tailwind (pointer-events-none fixed inset-0) and its inline opacity and repeat,
   written as plain CSS. A fixed element never repaints with scroll. */
.go {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.03;
  background-repeat: repeat;
}
</style>
