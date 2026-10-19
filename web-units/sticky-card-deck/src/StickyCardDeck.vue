<script setup lang="ts">
/**
 * A deck of cards: every card is a direct child of one containing block and pins with `position: sticky`, each
 * a little lower than the one before (a visible edge of layered cards), while the next card scrolls up and
 * covers it. As the next card travels up, the settled card scales back a little and a veil dims it
 * (transform and opacity only). From 1280 px a thin rail of numbers tracks the active step. No scroll-jacking:
 * the native scroll is untouched. Under reduced motion the cards are a plain static list and the rail is hidden.
 *
 * Props: `steps`; `scaleBack?` (0.045), `veil?` (0.5), `contentAttrs?`. Slot `card` ({ step, index, number })
 * replaces the default card content (a tag, a number, a title, a paragraph).
 */
import { onMounted, ref } from "vue";
import { activeStep, coverProgress } from "./progress";
import { useScrollFrame } from "./useScrollFrame";
import type { DeckStep } from "./types";

const props = withDefaults(
  defineProps<{
    steps: DeckStep[];
    /** How much a covered card shrinks at full cover (0.045 is 4.5 %). */
    scaleBack?: number;
    /** The veil's opacity on a card at full cover (0.5). */
    veil?: number;
    /** Attributes put on the default card's tag, title row and paragraph, e.g. a reveal marker. */
    contentAttrs?: Record<string, string | undefined>;
  }>(),
  { scaleBack: 0.045, veil: 0.5, contentAttrs: () => ({}) },
);

const stackEl = ref<HTMLElement | null>(null);
const { subscribe, reduced } = useScrollFrame();
const num = (i: number) => String(i + 1).padStart(2, "0");

onMounted(() => {
  const stack = stackEl.value;
  if (!stack || reduced) return;
  const cards = Array.from(stack.querySelectorAll<HTMLElement>("[data-stack-card]"));
  const dims = Array.from(stack.querySelectorAll<HTMLElement>("[data-stack-dim]"));
  const ticks = Array.from(stack.querySelectorAll<HTMLElement>("[data-stack-tick]"));
  if (cards.length < 2) return;
  subscribe(() => {
    const r = stack.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top > vh + 200 || r.bottom < -200) return;
    for (let i = 0; i < cards.length - 1; i += 1) {
      const p = coverProgress(cards[i + 1]!.getBoundingClientRect().top, vh);
      cards[i]!.style.transform = `scale(${(1 - props.scaleBack * p).toFixed(4)})`;
      if (dims[i]) dims[i]!.style.opacity = (props.veil * p).toFixed(3);
    }
    if (ticks.length) {
      const active = activeStep(cards.map((c) => c.getBoundingClientRect().top), vh);
      ticks.forEach((t, i) => t.classList.toggle("is-active", i === active));
    }
  });
});
</script>

<template>
  <div ref="stackEl" class="sd">
    <div class="sd-rail" aria-hidden="true">
      <div class="sd-rail-inner">
        <span v-for="(step, i) in steps" :key="`tick-${step.title}`" data-stack-tick class="sd-tick">{{ num(i) }}</span>
      </div>
    </div>
    <article v-for="(step, i) in steps" :key="step.title" data-stack-card class="sd-card" :style="{ '--sd-i': i }">
      <slot name="card" :step="step" :index="i" :number="num(i)">
        <div v-if="step.tag" class="sd-tag-row" v-bind="contentAttrs"><span class="sd-pill"><span class="sd-dot" aria-hidden="true" />{{ step.tag }}</span></div>
        <div class="sd-head" v-bind="contentAttrs">
          <span class="sd-num" aria-hidden="true">{{ num(i) }}</span>
          <h3 class="sd-title">{{ step.title }}</h3>
        </div>
        <div class="sd-keyline" aria-hidden="true" />
        <p v-if="step.body" class="sd-body" v-bind="contentAttrs">{{ step.body }}</p>
      </slot>
      <div data-stack-dim class="sd-veil" aria-hidden="true" />
    </article>
  </div>
</template>

<style scoped>
/* Theme: the --site-block-* variables; neutral fallbacks. Sizes are the Gilb Websites page's former Tailwind and
   scrollcraft classes written out. */
.sd, .sd * { box-sizing: border-box; }
.sd { position: relative; }
.sd-card {
  position: sticky; top: calc(clamp(84px, 11vh, 120px) + var(--sd-i, 0) * 14px); overflow: hidden;
  min-height: clamp(240px, 34vh, 320px); padding: 2rem 1.5rem; border-radius: 1.5rem; transform-origin: center top;
  color: var(--site-block-fg, #1a1a1a);
  /* A solid base under the card, so stacked cards hide the ones behind. */
  background-color: color-mix(in srgb, var(--site-block-bg, #ffffff) 94%, var(--site-block-fg, #1a1a1a));
  border: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 8%, transparent);
}
.sd-card + .sd-card { margin-top: 44vh; }
.sd-tag-row { margin-bottom: 1.25rem; }
.sd-pill {
  display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.9rem; border-radius: 999px;
  font-size: 0.8rem; font-weight: 500; letter-spacing: 0.01em; color: var(--site-block-muted, #4b5563);
  border: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 8%, transparent);
  background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 4%, transparent);
}
.sd-dot { flex: none; width: 0.4rem; height: 0.4rem; border-radius: 999px; background: var(--site-block-accent, #b45309); }
.sd-head { display: flex; align-items: baseline; gap: 1rem; }
.sd-num {
  font-size: clamp(2.4rem, 6vw, 4.5rem); font-weight: 650; letter-spacing: -0.035em; line-height: 1.02;
  color: var(--site-block-accent, #b45309);
}
.sd-title { margin: 0; font-size: clamp(1.4rem, 3vw, 2.2rem); font-weight: 650; letter-spacing: -0.035em; line-height: 1.02; text-wrap: balance; }
.sd-keyline {
  width: 3.5rem; height: 2px; margin-top: 1rem; border-radius: 1px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--site-block-accent, #b45309) 85%, transparent), transparent);
}
.sd-body { margin: 1.25rem 0 0; max-width: 42rem; font-size: 1rem; line-height: 1.6; color: var(--site-block-muted, #4b5563); }
.sd-veil { position: absolute; inset: 0; border-radius: inherit; opacity: 0; pointer-events: none; background: var(--site-block-bg, #ffffff); }
.sd-rail { display: none; }
@media (min-width: 640px) {
  .sd-card { padding: 3rem 2.5rem; }
  .sd-head { gap: 1.5rem; }
  .sd-body { font-size: 1.125rem; }
}
@media (min-width: 1280px) {
  .sd-rail { display: block; position: absolute; top: 0; bottom: 0; left: -4.5rem; width: 2rem; }
  .sd-rail-inner {
    position: sticky; top: calc(clamp(84px, 11vh, 120px) + 1rem); display: flex; flex-direction: column;
    align-items: center; gap: 1.1rem;
  }
  .sd-tick {
    position: relative; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; font-variant-numeric: tabular-nums;
    color: var(--site-block-muted, #4b5563); transition: color 300ms ease;
  }
  .sd-tick:not(:last-child)::after {
    content: ""; position: absolute; left: 50%; top: calc(100% + 0.2rem); width: 1px; height: 0.7rem;
    background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 10%, transparent);
  }
  .sd-tick.is-active { color: var(--site-block-accent, #b45309); }
}
@media (prefers-reduced-motion: reduce) {
  .sd-card { position: static; transform: none !important; min-height: 0; }
  .sd-card + .sd-card { margin-top: 2.5rem; }
  .sd-veil, .sd-rail { display: none; }
  .sd-tick { transition: none; }
}
</style>
