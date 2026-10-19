<script setup lang="ts">
/**
 * Plan cards as a radio group: click, tap or arrow keys pick one, and the picked card rises. Each card is preceded
 * by a visually hidden radio and the look follows `:checked`, so it works before the page's script runs and with
 * JavaScript off. Under the cards, an optional collapsed `<details>` list of one-off extras (also no script).
 *
 * Props: `plans`, `label`, `modelValue?` (the picked plan's name, for v-model), `name?`, `extras?`, `headingLevel?`,
 * `itemAttrs?`. Events: `update:modelValue` (name) and `pick` ({ plan, byVisitor }).
 */
import { computed, onBeforeMount, onMounted, ref, useId, watch } from "vue";
import { readPick } from "./pick";
import type { Extras, Plan, PlanPick } from "./types";

const props = withDefaults(
  defineProps<{
    plans: Plan[];
    /** The group's accessible name, e.g. "Pricing". */
    label: string;
    /** The picked plan's name. Without it the featured plan starts picked, and the browser holds the pick. */
    modelValue?: string;
    /** The radios' shared name; one per instance by default. */
    name?: string;
    extras?: Extras;
    /** The plan names' level, 2 to 6 (default 3). The extras heading uses the same level. */
    headingLevel?: 2 | 3 | 4 | 5 | 6;
    /** Attributes put on each card's wrapper and on the extras wrapper, e.g. a reveal marker. */
    itemAttrs?: Record<string, string | undefined>;
  }>(),
  { headingLevel: 3, itemAttrs: () => ({}) },
);
const emit = defineEmits<{
  "update:modelValue": [plan: string];
  pick: [pick: PlanPick];
}>();

const uid = useId();
const groupName = computed(() => props.name ?? `pp-${uid}`);
const idOf = (i: number, part: string) => `${groupName.value}-${i}-${part}`;
const featuredName = computed(() => props.plans.find((p) => p.featured)?.name ?? "");
const current = computed(() => props.modelValue ?? featuredName.value);
const heading = computed(() => `h${props.headingLevel}`);
const group = ref<HTMLElement | null>(null);
let byVisitor = false;

function report(changedNow: boolean) {
  if (!group.value) return;
  const p = readPick(group.value, groupName.value, featuredName.value, byVisitor, changedNow);
  byVisitor = p.byVisitor;
  emit("pick", p);
  if (changedNow) emit("update:modelValue", p.plan);
}
// A host that changes `modelValue` later moves the check here.
watch(current, (name) => {
  group.value?.querySelectorAll<HTMLInputElement>("input[type=radio]").forEach((r) => { r.checked = r.value === name; });
});
// Hydration writes each radio's `checked` from the props and so undoes a pick the visitor made before the script
// ran. Read that pick just before hydration starts (the group is found by its id) and put it back afterwards.
let before: string | null = null;
onBeforeMount(() => {
  const el = document.getElementById(`${groupName.value}-group`);
  const r = el && [...el.querySelectorAll<HTMLInputElement>("input[type=radio]")].find((i) => i.checked);
  before = r ? r.value : null;
});
// A pick made before the script ran shows up as a checked card other than the default.
onMounted(() => {
  if (before !== null && props.modelValue === undefined) {
    group.value?.querySelectorAll<HTMLInputElement>("input[type=radio]").forEach((r) => { r.checked = r.value === before; });
  }
  report(false);
});
</script>

<template>
  <div class="pp">
    <div :id="`${groupName}-group`" ref="group" class="pp-plans" role="radiogroup" :aria-label="label" @change="report(true)">
      <div v-for="(plan, i) in plans" :key="plan.name" class="pp-item" v-bind="itemAttrs">
        <input
          :id="idOf(i, 'in')"
          type="radio"
          :name="groupName"
          :value="plan.name"
          :checked="plan.name === current"
          class="pp-input"
          :aria-labelledby="idOf(i, 'name')"
          :aria-describedby="`${idOf(i, 'price')} ${idOf(i, 'features')}`"
        />
        <article class="pp-card">
          <p v-if="plan.featuredNote" class="pp-note">{{ plan.featuredNote }}</p>
          <component :is="heading" :id="idOf(i, 'name')" class="pp-name">{{ plan.name }}</component>
          <p :id="idOf(i, 'price')" class="pp-price">{{ plan.price }}</p>
          <ul :id="idOf(i, 'features')" class="pp-features">
            <li v-for="f in plan.features" :key="f">{{ f }}</li>
          </ul>
          <label :for="idOf(i, 'in')" class="pp-hit" aria-hidden="true" />
        </article>
      </div>
    </div>

    <div v-if="extras?.items?.length" class="pp-extras-wrap" v-bind="itemAttrs">
      <details class="pp-extras">
        <summary class="pp-summary">
          <component :is="heading" v-if="extras.heading" :id="`${groupName}-extras`" class="pp-ex-heading">{{ extras.heading }}</component>
          <span v-if="extras.teaser" class="pp-ex-teaser">{{ extras.teaser }}</span>
          <span v-if="extras.fromPrice" class="pp-ex-from">{{ extras.fromPrice }}</span>
          <span class="pp-ex-cue">
            <span v-if="extras.openLabel" class="pp-ex-open">{{ extras.openLabel }}</span>
            <span v-if="extras.closeLabel" class="pp-ex-close">{{ extras.closeLabel }}</span>
            <span class="pp-icon" aria-hidden="true" />
          </span>
        </summary>
        <div class="pp-ex-body">
          <p v-if="extras.body" class="pp-ex-intro">{{ extras.body }}</p>
          <ul class="pp-ex-list" :aria-labelledby="extras.heading ? `${groupName}-extras` : undefined">
            <li v-for="item in extras.items" :key="item.name" class="pp-ex-item">
              <p class="pp-ex-name">{{ item.name }}</p>
              <p class="pp-ex-price">{{ item.price }}</p>
              <p v-if="item.body" class="pp-ex-line">{{ item.body }}</p>
            </li>
          </ul>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral fallbacks.
   Sizes are the Gilb Websites landing page's former Tailwind classes and main.css rules written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.pp, .pp * { box-sizing: border-box; }
.pp { color: var(--site-block-fg, #1a1a1a); }
.pp-plans { display: grid; gap: 1.5rem; }
.pp-item { position: relative; }
.pp-input {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
}
.pp-card {
  position: relative; padding: 2rem; border-radius: 1.5rem;
  background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 4%, transparent);
  border: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 8%, transparent);
}
.pp-card:hover { border-color: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 18%, transparent); }
.pp-note { margin: 0; font-size: 0.875rem; line-height: 1.25rem; font-weight: 500; color: var(--site-block-accent, #b45309); }
.pp-name { margin: 0.25rem 0 0; font-size: 1.5rem; line-height: 1.1; font-weight: 650; letter-spacing: -0.035em; }
.pp-price { margin: 1rem 0 0; font-size: 2rem; line-height: 1.02; font-weight: 650; letter-spacing: -0.035em; color: var(--site-block-fg, #1a1a1a); }
.pp-features { margin: 1.5rem 0 0; padding: 0; list-style: none; font-size: 0.875rem; line-height: 1.6; color: var(--site-block-muted, #4b5563); }
.pp-features li { padding: 0.625rem 0; }
.pp-features li + li { border-top: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 6%, transparent); }
.pp-hit { position: absolute; inset: 0; cursor: pointer; border-radius: 1.5rem; }

/* The picked card. */
.pp-input:checked + .pp-card {
  z-index: 10; padding-top: 3rem; padding-bottom: 3rem;
  background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 7%, transparent);
  border-color: color-mix(in srgb, var(--site-block-accent, #b45309) 45%, transparent);
  box-shadow: 0 0 28px -4px color-mix(in srgb, var(--site-block-accent, #b45309) 30%, transparent), 0 28px 80px -14px rgb(0 0 0 / 0.35);
}
.pp-input:checked + .pp-card .pp-price { color: var(--site-block-accent, #b45309); }
.pp-input:focus-visible + .pp-card { outline: 2px solid var(--site-block-accent, #b45309); outline-offset: 4px; }

/* Extras */
.pp-extras-wrap { max-width: 48rem; margin: 3.5rem auto 0; }
.pp-extras {
  padding: 0 1.5rem; border-radius: 1.5rem;
  background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 4%, transparent);
  border: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 8%, transparent);
}
.pp-extras:has(> .pp-summary:focus-visible) { border-color: color-mix(in srgb, var(--site-block-accent, #b45309) 40%, transparent); }
.pp-summary {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0.25rem 1rem;
  padding: 1.5rem 0; cursor: pointer; list-style: none;
}
.pp-summary::-webkit-details-marker { display: none; }
.pp-summary:focus-visible { outline: 2px solid var(--site-block-accent, #b45309); outline-offset: 4px; border-radius: 0.75rem; }
.pp-ex-heading { grid-column: 1; grid-row: 1; margin: 0; font-size: 1.5rem; line-height: 1.1; font-weight: 650; letter-spacing: -0.035em; }
.pp-ex-teaser { grid-column: 1 / span 2; grid-row: 2; font-size: 0.875rem; line-height: 1.6; color: var(--site-block-muted, #4b5563); }
.pp-ex-from { grid-column: 1; grid-row: 3; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--site-block-fg, #1a1a1a); }
.pp-ex-cue { grid-column: 2; grid-row: 1; display: flex; align-items: center; gap: 0.75rem; justify-self: end; }
.pp-ex-open, .pp-ex-close { white-space: nowrap; font-size: 0.875rem; font-weight: 500; color: var(--site-block-accent, #b45309); }
.pp-ex-close { display: none; }
.pp-extras[open] .pp-ex-open { display: none; }
.pp-extras[open] .pp-ex-close { display: inline; }
.pp-icon { position: relative; flex: none; width: 1.25rem; height: 1.25rem; color: var(--site-block-accent, #b45309); }
.pp-icon::before, .pp-icon::after {
  content: ""; position: absolute; top: 50%; left: 0; width: 100%; height: 2px; margin-top: -1px; border-radius: 1px; background: currentColor;
}
.pp-icon::after { transform: rotate(90deg); }
.pp-extras[open] .pp-icon::after { transform: rotate(0deg); }
.pp-ex-body { padding: 1rem 0 1.5rem; border-top: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 6%, transparent); }
.pp-ex-intro { margin: 0; font-size: 0.875rem; line-height: 1.6; color: var(--site-block-muted, #4b5563); }
.pp-ex-intro + .pp-ex-list { margin-top: 0.5rem; }
.pp-ex-list { margin: 0; padding: 0; list-style: none; }
.pp-ex-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 0.25rem 1rem; padding: 1rem 0; }
.pp-ex-item + .pp-ex-item { border-top: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 6%, transparent); }
.pp-ex-name, .pp-ex-price { margin: 0; font-weight: 500; color: var(--site-block-fg, #1a1a1a); }
.pp-ex-price { white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
.pp-ex-line { grid-column: 1 / span 2; margin: 0; font-size: 0.875rem; line-height: 1.6; color: var(--site-block-muted, #4b5563); }

@media (min-width: 640px) {
  .pp-summary { grid-template-columns: minmax(0, 1fr) auto auto; gap: 0.25rem 1.5rem; padding: 1.75rem 0; }
  .pp-extras { padding: 0 2rem; }
  .pp-ex-from { grid-column: 2; grid-row: 1; white-space: nowrap; text-align: right; }
  .pp-ex-cue { grid-column: 3; }
  .pp-ex-body { padding-bottom: 2rem; }
  .pp-ex-item { gap: 0.25rem 1.5rem; }
}
@media (min-width: 1024px) {
  .pp-plans { grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: center; }
  .pp-input:checked + .pp-card { transform: translateY(-1.5rem) scale(1.03); }
}
@media (hover: hover) {
  .pp-extras:has(> .pp-summary:hover) { border-color: color-mix(in srgb, var(--site-block-accent, #b45309) 40%, transparent); }
}
@media (prefers-reduced-motion: no-preference) {
  .pp-card {
    transition: transform 0.6s cubic-bezier(0.25, 0.05, 0.3, 0.7), padding 0.5s cubic-bezier(0.25, 0.05, 0.3, 0.7),
      background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  }
  .pp-icon::after { transition: transform 0.3s cubic-bezier(0.25, 0.05, 0.3, 0.7); }
  .pp-extras { transition: border-color 0.2s ease; }
}
</style>
