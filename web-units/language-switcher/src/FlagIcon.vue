<script setup lang="ts">
/**
 * A small inline-SVG flag. Inline, not emoji: flag emoji draw as two bare letters on Windows. It is decorative
 * (hidden from screen readers); the language's name is always written next to it or in the button's name.
 * A key the unit has no drawing for is shown as a badge with the key's first two letters.
 */
import { computed } from "vue";

const props = defineProps<{ flag: string }>();
const badge = computed(() => props.flag.slice(0, 2).toUpperCase());
</script>

<template>
  <svg v-if="flag === 'no'" class="fi" viewBox="0 0 16 12" width="22" height="16" aria-hidden="true" focusable="false">
    <rect width="16" height="12" fill="#BA0C2F" />
    <rect x="4" width="3" height="12" fill="#fff" />
    <rect y="4" width="16" height="3" fill="#fff" />
    <rect x="4.75" width="1.5" height="12" fill="#00205B" />
    <rect y="4.75" width="16" height="1.5" fill="#00205B" />
  </svg>
  <svg v-else-if="flag === 'us'" class="fi" viewBox="0 0 19 10" width="22" height="16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <rect width="19" height="10" fill="#fff" />
    <g fill="#B22234">
      <rect y="0" width="19" height="0.77" />
      <rect y="1.54" width="19" height="0.77" />
      <rect y="3.08" width="19" height="0.77" />
      <rect y="4.62" width="19" height="0.77" />
      <rect y="6.15" width="19" height="0.77" />
      <rect y="7.69" width="19" height="0.77" />
      <rect y="9.23" width="19" height="0.77" />
    </g>
    <rect width="7.6" height="5.38" fill="#3C3B6E" />
    <g fill="#fff">
      <circle cx="1.9" cy="1.08" r="0.28" /><circle cx="3.8" cy="1.08" r="0.28" /><circle cx="5.7" cy="1.08" r="0.28" />
      <circle cx="1.9" cy="2.69" r="0.28" /><circle cx="3.8" cy="2.69" r="0.28" /><circle cx="5.7" cy="2.69" r="0.28" />
      <circle cx="1.9" cy="4.3" r="0.28" /><circle cx="3.8" cy="4.3" r="0.28" /><circle cx="5.7" cy="4.3" r="0.28" />
    </g>
  </svg>
  <svg v-else-if="flag === 'gb'" class="fi" viewBox="0 0 60 30" width="22" height="16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <rect width="60" height="30" fill="#012169" />
    <path d="M0 0 60 30M60 0 0 30" stroke="#fff" stroke-width="6" />
    <path d="M0 0 60 30M60 0 0 30" stroke="#C8102E" stroke-width="2" />
    <path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10" />
    <path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6" />
  </svg>
  <svg v-else-if="flag === 'de'" class="fi" viewBox="0 0 5 3" width="22" height="16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <rect width="5" height="3" fill="#FFCE00" />
    <rect width="5" height="2" fill="#DD0000" />
    <rect width="5" height="1" fill="#000" />
  </svg>
  <svg v-else-if="flag === 'fr'" class="fi" viewBox="0 0 3 2" width="22" height="16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <rect width="3" height="2" fill="#ED2939" />
    <rect width="2" height="2" fill="#fff" />
    <rect width="1" height="2" fill="#002395" />
  </svg>
  <svg v-else-if="flag === 'es'" class="fi" viewBox="0 0 3 2" width="22" height="16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <rect width="3" height="2" fill="#AA151B" />
    <rect y="0.5" width="3" height="1" fill="#F1BF00" />
  </svg>
  <span v-else class="fi fi-badge" aria-hidden="true">{{ badge }}</span>
</template>

<style scoped>
/* A flag is a picture with its own colours; the unit's theme colours only touch the badge and the hairline. */
.fi { display: block; flex: none; width: 22px; height: 16px; border-radius: 2px; box-shadow: 0 0 0 1px color-mix(in srgb, var(--site-block-fg, #1a1a1a) 12%, transparent); }
.fi-badge {
  display: flex; align-items: center; justify-content: center; font-size: 0.625rem; line-height: 1; font-weight: 600;
  letter-spacing: 0.02em; color: var(--site-block-fg, #1a1a1a);
  background: color-mix(in srgb, var(--site-block-muted, #4b5563) 15%, transparent);
}
</style>
