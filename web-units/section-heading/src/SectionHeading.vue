<script setup lang="ts">
/**
 * A section's heading: an optional pill label with a dot, a headline of one or two lines (line 1 bright, line 2
 * dim and brightening as it scrolls into place), then a supporting paragraph offset to the right from 768 px.
 *
 * The second line's dim state is the served state, in the muted colour; a bright copy (hidden from screen readers)
 * lies over it and fades in with scroll progress, by opacity only. With no script or under reduced motion the
 * heading is the static two-tone look, fully legible.
 *
 * Props: `line1`; `pill?`, `line2?`, `body?`, `level?` (2 to 6, default 2), `blockAttrs?` (attributes put on the
 * pill, the headline and the paragraph, e.g. a reveal marker).
 */
import { computed, onMounted, ref } from "vue";
import { brightness } from "./brightness";
import { useScrollFrame } from "./useScrollFrame";

const props = withDefaults(
  defineProps<{
    line1: string;
    pill?: string;
    line2?: string;
    body?: string;
    level?: 2 | 3 | 4 | 5 | 6;
    blockAttrs?: Record<string, string | undefined>;
  }>(),
  { pill: "", line2: "", body: "", level: 2, blockAttrs: () => ({}) },
);
const tag = computed(() => `h${props.level}`);

const dimLine = ref<HTMLElement | null>(null);
const brightLine = ref<HTMLElement | null>(null);
const { subscribe, reduced } = useScrollFrame();

onMounted(() => {
  const dim = dimLine.value;
  const bright = brightLine.value;
  if (!dim || !bright || reduced) return;
  subscribe(() => {
    const r = dim.getBoundingClientRect();
    if (r.top > window.innerHeight + 100 || r.bottom < -100) return;
    bright.style.opacity = brightness(r.top, window.innerHeight).toFixed(3);
  });
});
</script>

<template>
  <div class="sh">
    <span v-if="pill" class="sh-pill" v-bind="blockAttrs"><span class="sh-dot" aria-hidden="true" />{{ pill }}</span>
    <component :is="tag" class="sh-title" v-bind="blockAttrs">
      <span class="sh-line">{{ line1 }}</span>
      <span v-if="line2" class="sh-line sh-second">
        <span ref="dimLine" class="sh-dim">{{ line2 }}</span>
        <span ref="brightLine" class="sh-bright" aria-hidden="true">{{ line2 }}</span>
      </span>
    </component>
    <p v-if="body" class="sh-body" v-bind="blockAttrs">{{ body }}</p>
  </div>
</template>

<style scoped>
/* Theme: the --site-block-* variables; neutral fallbacks. Sizes are the Gilb Websites page's former Tailwind and
   display-type classes written out. No CSS transition on the bright copy: its opacity follows the scroll. */
.sh, .sh * { box-sizing: border-box; }
.sh-pill {
  display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.9rem; border-radius: 999px;
  font-size: 0.8rem; font-weight: 500; letter-spacing: 0.01em; color: var(--site-block-muted, #4b5563);
  border: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 8%, transparent);
  background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 4%, transparent);
}
.sh-dot { flex: none; width: 0.4rem; height: 0.4rem; border-radius: 999px; background: var(--site-block-accent, #b45309); }
.sh-title {
  margin: 1.5rem 0 0; font-size: clamp(2.1rem, 5.5vw, 3.9rem); font-weight: 650; letter-spacing: -0.035em;
  line-height: 1.02; text-wrap: balance; color: var(--site-block-fg, #1a1a1a);
}
.sh-line { display: block; }
.sh-second { position: relative; }
.sh-dim { display: block; color: var(--site-block-muted, #4b5563); }
.sh-bright { position: absolute; inset: 0; display: block; opacity: 0; color: var(--site-block-fg, #1a1a1a); }
.sh-body {
  margin: 1.5rem 0 0; max-width: 36rem; font-size: 1.125rem; line-height: 1.6; color: var(--site-block-muted, #4b5563);
}
@media (min-width: 768px) { .sh-body { margin-left: auto; } }
</style>
