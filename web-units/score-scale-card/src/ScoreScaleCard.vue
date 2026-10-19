<script setup lang="ts">
/**
 * Stat cards in a responsive grid: a big figure, a title and a line, and on a scored card a bar with a "typical"
 * tick, an "ours" dot, a two-line legend and one plain sentence for screen readers. Needs no script.
 *
 * Props: `items` (the cards), `headingLevel?` (the title's level, default 3), `cardAttrs?` (attributes put on
 * every card, e.g. a reveal marker) and `rangeText?` (the opening words of the screen-reader sentence).
 */
import { computed } from "vue";
import { defaultRange, pct, scaleSentence, statGrid } from "./grid";
import type { ScoreStat } from "./types";

const props = withDefaults(
  defineProps<{
    items: ScoreStat[];
    headingLevel?: 2 | 3 | 4 | 5 | 6;
    cardAttrs?: Record<string, string | undefined>;
    rangeText?: (min: string, max: string) => string;
  }>(),
  { headingLevel: 3, cardAttrs: () => ({}), rangeText: defaultRange },
);

const grid = computed(() => statGrid(props.items));
const heading = computed(() => `h${props.headingLevel}`);
const cellStyle = (i: number) => {
  const c = grid.value.cells[i]!;
  return { "--ssc-span": c.base, "--ssc-span-sm": c.sm, "--ssc-span-lg": c.lg };
};
</script>

<template>
  <ul role="list" class="ssc" :style="{ '--ssc-lg-cols': grid.lgCols }">
    <li
      v-for="(stat, i) in items"
      :key="stat.value + (stat.title ?? stat.label ?? '')"
      class="ssc-card"
      :style="cellStyle(i)"
      v-bind="cardAttrs"
    >
      <p class="ssc-value">{{ stat.value }}</p>
      <template v-if="stat.title || stat.what">
        <component :is="heading" v-if="stat.title" class="ssc-title">{{ stat.title }}</component>
        <p v-if="stat.what" class="ssc-what">{{ stat.what }}</p>
      </template>
      <p v-else-if="stat.label" class="ssc-label">{{ stat.label }}</p>

      <template v-if="stat.scale">
        <div class="ssc-scale" aria-hidden="true">
          <div class="ssc-track">
            <span class="ssc-typical" :style="{ left: pct(stat.scale.typicalAt) }" />
            <span class="ssc-ours" :style="{ left: pct(stat.scale.oursAt) }" />
          </div>
          <div class="ssc-ends">
            <span>{{ stat.scale.min }}</span>
            <span>{{ stat.scale.max }}</span>
          </div>
          <div class="ssc-legend">
            <p class="ssc-legend-typical">
              <span class="ssc-swatch"><span class="ssc-swatch-typical" /></span>
              <span class="ssc-legend-text">{{ stat.scale.typical }}</span>
            </p>
            <p class="ssc-legend-ours">
              <span class="ssc-swatch"><span class="ssc-swatch-ours" /></span>
              <span class="ssc-legend-text">{{ stat.scale.ours }}</span>
            </p>
          </div>
        </div>
        <p class="ssc-sr">{{ scaleSentence(stat.scale, rangeText) }}</p>
      </template>
    </li>
  </ul>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral fallbacks.
   Sizes are the Gilb Websites landing page's former Tailwind classes written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.ssc, .ssc * { box-sizing: border-box; }
.ssc {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem;
  margin: 0; padding: 0; list-style: none;
}
.ssc-card {
  grid-column: span var(--ssc-span, 1);
  display: flex; flex-direction: column; min-width: 0; padding: 1.25rem;
  border-radius: var(--site-block-radius-lg, 1.5rem);
  background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 4%, transparent);
  border: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 8%, transparent);
}
.ssc-value {
  margin: 0; font-size: 2.25rem; font-weight: 650; letter-spacing: -0.035em; line-height: 1.02;
  text-wrap: balance; color: var(--site-block-accent, #b45309);
}
.ssc-title { margin: 0.75rem 0 0; font-size: 1rem; line-height: 1.5; font-weight: 600; color: var(--site-block-fg, #1a1a1a); }
.ssc-what { margin: 0.5rem 0 0; font-size: 0.875rem; line-height: 1.6; color: var(--site-block-muted, #4b5563); }
.ssc-label { margin: 0.75rem 0 0; font-size: 0.875rem; line-height: 1.375; color: var(--site-block-muted, #4b5563); }
.ssc-scale { margin-top: auto; padding-top: 1.5rem; }
.ssc-track {
  position: relative; height: 0.375rem; margin: 0 0.375rem; border-radius: 999px;
  background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 10%, transparent);
}
.ssc-typical {
  position: absolute; top: 50%; width: 3px; height: 1rem; transform: translate(-50%, -50%);
  border-radius: 999px; background: var(--site-block-muted, #4b5563);
}
.ssc-ours {
  position: absolute; top: 50%; width: 0.75rem; height: 0.75rem; transform: translate(-50%, -50%);
  border-radius: 999px; background: var(--site-block-accent, #b45309);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--site-block-accent, #b45309) 20%, transparent);
}
.ssc-ends {
  display: flex; justify-content: space-between; gap: 0.75rem; margin: 0.625rem 0.375rem 0;
  font-size: 0.75rem; line-height: 1rem; font-variant-numeric: tabular-nums; color: var(--site-block-muted, #4b5563);
}
.ssc-legend {
  margin-top: 0.75rem; padding-top: 0.75rem; font-size: 0.75rem; line-height: 1.375;
  border-top: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 7%, transparent);
}
.ssc-legend p { display: flex; align-items: flex-start; gap: 0.625rem; margin: 0; }
.ssc-legend p + p { margin-top: 0.375rem; }
.ssc-legend-typical { color: var(--site-block-muted, #4b5563); }
.ssc-legend-ours { font-weight: 500; color: var(--site-block-fg, #1a1a1a); }
.ssc-swatch { display: flex; align-items: center; justify-content: center; flex: none; width: 0.75rem; height: 1.375em; }
.ssc-swatch-typical { width: 3px; height: 0.875rem; border-radius: 999px; background: var(--site-block-muted, #4b5563); }
.ssc-swatch-ours { width: 0.625rem; height: 0.625rem; border-radius: 999px; background: var(--site-block-accent, #b45309); }
.ssc-legend-text { min-width: 0; }
.ssc-sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
}
@media (min-width: 640px) {
  .ssc { gap: 1rem; }
  .ssc-card { grid-column: span var(--ssc-span-sm, 1); padding: 1.75rem; }
}
@media (min-width: 1024px) {
  .ssc { grid-template-columns: repeat(var(--ssc-lg-cols, 3), minmax(0, 1fr)); }
  .ssc-card { grid-column: span var(--ssc-span-lg, 1); }
}
</style>
