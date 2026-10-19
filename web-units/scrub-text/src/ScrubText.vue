<script setup lang="ts">
/**
 * Lines of text that fill from dim to bright as the page scrolls, one line after another: each line brightens as
 * its top travels from `fadeStart` to `fadeEnd` of the viewport height, and stays lit above that, so the block
 * fills top to bottom as the visitor reads. Scrolling back up un-fills lines that fall below the zone.
 *
 * The served HTML, the no-script state and reduced motion are fully opaque: no opacity is written then. The block
 * is armed (dimmed) only if it is still fully below the fold when it mounts, so a mid-page reload never dims text
 * the visitor is reading.
 *
 * Props: `lines`; `dim?` (0.38), `lit?` (1), `fadeStart?` (0.85), `fadeEnd?` (0.55). See the README on `dim`.
 */
import { onMounted, ref } from "vue";
import { lineOpacity } from "./opacity";
import { useScrollFrame } from "./useScrollFrame";

const props = withDefaults(
  defineProps<{
    lines: string[];
    dim?: number;
    lit?: number;
    fadeStart?: number;
    fadeEnd?: number;
  }>(),
  { dim: 0.38, lit: 1, fadeStart: 0.85, fadeEnd: 0.55 },
);

const wrapEl = ref<HTMLElement | null>(null);
const { subscribe, reduced } = useScrollFrame();

onMounted(() => {
  const wrap = wrapEl.value;
  if (!wrap || reduced) return;
  const els = Array.from(wrap.querySelectorAll<HTMLElement>("[data-scrub-line]"));
  if (els.length === 0) return;
  if (wrap.getBoundingClientRect().top >= window.innerHeight) {
    for (const el of els) el.style.opacity = String(props.dim);
  }
  // The last value written per line: a line outside the zone costs no style write per frame.
  const last: number[] = els.map(() => Number.NaN);
  subscribe(() => {
    const r = wrap.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top > vh + 120 || r.bottom < -120) return;
    for (let i = 0; i < els.length; i += 1) {
      const o = lineOpacity(els[i]!.getBoundingClientRect().top, vh, props.dim, props.lit, props.fadeStart, props.fadeEnd);
      if (o === last[i]) continue;
      last[i] = o;
      els[i]!.style.opacity = String(o);
    }
  });
});
</script>

<template>
  <div ref="wrapEl" class="st">
    <p v-for="(line, i) in lines" :key="i" data-scrub-line class="st-line">{{ line }}</p>
  </div>
</template>

<style scoped>
/* Theme: the --site-block-* variables; neutral fallbacks. No CSS transition on purpose: opacity is written every
   frame from the scroll position, so a transition would only lag behind the scroll. */
.st, .st * { box-sizing: border-box; }
.st-line {
  margin: 0; font-size: clamp(1.6rem, 3.6vw, 2.75rem); font-weight: 650; letter-spacing: -0.035em; line-height: 1.02;
  text-wrap: balance; color: var(--site-block-fg, #1a1a1a);
}
.st-line + .st-line { margin-top: 1.25rem; }
</style>
