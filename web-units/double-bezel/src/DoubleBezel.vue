<script setup lang="ts">
import { computed } from "vue";

/**
 * A machined two-shell mount for a picture, a screenshot or a device frame.
 * The outer shell is a tinted face with a hairline ring. The slot holds the
 * picture, clipped by the inner window and its soft top highlight.
 * A device-frame browser frame inside drops its own corner, border and shadow,
 * because the bezel is its mount. `onDark` is for a dark section.
 * Static paint: no motion of its own.
 */
const props = withDefaults(defineProps<{ tint?: string; tintAlpha?: number; onDark?: boolean }>(), {
  tint: "",
  tintAlpha: 0.16,
  onDark: false,
});
const shellStyle = computed(() => ({
  "--bz-tint": props.tint || "transparent",
  "--bz-tint-a": String(props.tintAlpha),
}));
</script>

<template>
  <div class="bz" :class="{ 'bz--dark': onDark }" :style="shellStyle">
    <div class="bz-core">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* Outer shell: tinted face, hairline ring, token depth. */
.bz {
  padding: 0.375rem;
  border-radius: 2rem;
  background:
    linear-gradient(color-mix(in srgb, var(--bz-tint) calc(var(--bz-tint-a) * 100%), transparent), color-mix(in srgb, var(--bz-tint) calc(var(--bz-tint-a) * 100%), transparent)),
    color-mix(in srgb, var(--site-block-bg, #ffffff) 78%, white);
  border: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 8%, transparent);
  box-shadow: var(--site-block-shadow-lg, 0 16px 40px -8px rgb(28 28 20 / 0.12));
}

/* Inner window: clipped, with a soft top highlight. */
.bz-core {
  overflow: hidden;
  border-radius: 1.625rem;
  background-color: color-mix(in srgb, var(--site-block-bg, #ffffff) 86%, white);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.55),
    inset 0 0 0 1px color-mix(in srgb, var(--site-block-fg, #1a1a1a) 6%, transparent);
}

/* A device-frame browser frame inside drops its corner, border and shadow. */
.bz-core :deep(.df-browser) {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

/* Dark section: hairlines and highlight for a dark ground. */
.bz--dark {
  background:
    linear-gradient(color-mix(in srgb, var(--bz-tint) 10%, transparent), color-mix(in srgb, var(--bz-tint) 10%, transparent)),
    color-mix(in srgb, var(--site-block-fg, #1a1a1a) 86%, white);
  border-color: color-mix(in srgb, var(--site-block-bg, #ffffff) 16%, transparent);
}

/* Dark window: deeper face, quieter highlight. */
.bz--dark .bz-core {
  background-color: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 92%, white);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.14),
    inset 0 0 0 1px color-mix(in srgb, var(--site-block-bg, #ffffff) 10%, transparent);
}
</style>
