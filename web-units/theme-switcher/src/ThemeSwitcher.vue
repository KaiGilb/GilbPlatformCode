<script setup lang="ts">
/**
 * A header control for the visitor's theme: a disclosure button that opens a panel of native buttons, one per
 * theme (`aria-pressed`, a check mark on the active one, so the choice does not rest on colour). One theme is the
 * custom one: it shows a colour input, and the pick is moved to the nearest shade that stays above WCAG AA (4.5:1)
 * on `backgroundHex`. The choice is saved and put on <html>; pair it with `themeHeadScript` in <head> so the page
 * does not flash the wrong theme. The theme's colours are the host's CSS, selected by the theme attribute.
 *
 * Props: `modes`, `backgroundHex`, `defaultAccent`, `defaultTheme?`, `options?`, `labels?`.
 */
import { computed, onBeforeUnmount, onMounted, ref, nextTick, useId } from "vue";
import { AA_MIN, contrastRatio, nudgeToAA } from "./contrast";
import { applyToRoot, persist, readStored, themeOptions } from "./theme";
import type { ThemeMode, ThemeOptions } from "./types";

const props = withDefaults(
  defineProps<{
    /** The themes, in order. The host's CSS must style each `id` (the theme attribute on <html>). */
    modes: ThemeMode[];
    /** The background the custom accent must be readable on, "#rrggbb" (the custom theme's own background). */
    backgroundHex: string;
    /** The accent shown first and by "reset", "#rrggbb". */
    defaultAccent: string;
    /** The theme before a saved choice is read (default: the first mode). */
    defaultTheme?: string;
    /** Storage keys, attribute, accent variable and format; give the same object to `themeHeadScript`. */
    options?: Partial<ThemeOptions>;
    /** Words on the control. Default English; pass your language. */
    labels?: Partial<{
      trigger: string;
      current: string;
      panel: string;
      accentTitle: string;
      contrast: string;
      adjusted: string;
      pickAny: string;
      reset: string;
    }>;
  }>(),
  { options: () => ({}), labels: () => ({}) },
);

const L = computed(() => ({
  trigger: "Theme",
  current: "current theme",
  panel: "Colour theme",
  accentTitle: "Your accent colour",
  contrast: "Contrast vs background",
  adjusted: "Nudged to the nearest shade of your pick that stays above AA",
  pickAny: "Pick any colour; it is kept above WCAG AA automatically.",
  reset: "Reset to the default accent",
  ...props.labels,
}));
const o = computed(() => themeOptions(props.options));
const ids = computed(() => props.modes.map((m) => m.id));
const panelId = `theme-panel-${useId()}`;
const accentId = `theme-accent-${useId()}`;

const theme = ref<string>(props.defaultTheme ?? props.modes[0]?.id ?? "");
const accent = ref<string>(props.defaultAccent);
const adjusted = ref(false);
const open = ref(false);
const ready = ref(false);
const root = ref<HTMLElement | null>(null);
const triggerEl = ref<HTMLButtonElement | null>(null);

// The server cannot know the saved choice, so it draws the default; `ready` flips after hydration and the
// highlight then follows the saved choice as a normal patch (no hydration mismatch). The page's own theme is set
// before paint by the head script, not by this state.
const shown = computed(() => (ready.value ? theme.value : (props.defaultTheme ?? props.modes[0]?.id ?? "")));
const activeMode = computed(() => props.modes.find((m) => m.id === shown.value) ?? props.modes[0]);
const ratio = computed(() => contrastRatio(accent.value, props.backgroundHex));
const isCustom = computed(() => shown.value === o.value.customId);

const ICONS: Record<string, string> = {
  light: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  colorblind: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>',
  custom: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 10.5A6 6 0 0 1 6 13.5C6 9.5 12 3 12 3z"/></svg>',
};
// Icons are fixed strings of this unit, keyed by id; an id with no icon (or a site's own) shows the custom drop.
const icon = (id: string) => ICONS[id] ?? ICONS.custom ?? "";

function apply() {
  if (typeof document !== "undefined") applyToRoot(document.documentElement, theme.value, accent.value, o.value);
}
function save() {
  persist(typeof localStorage === "undefined" ? undefined : localStorage, theme.value, accent.value, o.value);
}
function close(returnFocus = false) {
  open.value = false;
  if (returnFocus) nextTick(() => triggerEl.value?.focus());
}
function choose(id: string) {
  theme.value = id;
  if (id === o.value.customId) {
    const g = nudgeToAA(accent.value, props.backgroundHex, AA_MIN, props.defaultAccent);
    accent.value = g.hex;
    adjusted.value = g.adjusted;
  }
  apply();
  save();
  // Stay open on the custom theme so the colour input can be reached.
  if (id !== o.value.customId) close(true);
}
function setAccent(raw: string) {
  const g = nudgeToAA(raw, props.backgroundHex, AA_MIN, props.defaultAccent);
  accent.value = g.hex;
  adjusted.value = g.adjusted;
  theme.value = o.value.customId;
  apply();
  save();
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && open.value) {
    e.stopPropagation();
    close(true);
  }
}
function onDocPointer(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) close(false);
}
onMounted(() => {
  const s = readStored(typeof localStorage === "undefined" ? undefined : localStorage, ids.value, o.value);
  if (s.accent) accent.value = s.accent;
  if (s.id) {
    theme.value = s.id;
    apply();
  }
  ready.value = true;
  document.addEventListener("pointerdown", onDocPointer);
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocPointer));
</script>

<template>
  <div ref="root" class="ts" @keydown="onKeydown">
    <button
      ref="triggerEl"
      type="button"
      class="ts-trigger"
      aria-haspopup="true"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <span class="ts-icon" aria-hidden="true" v-html="icon(activeMode?.id ?? '')" />
      <span class="ts-trigger-text">{{ L.trigger }}</span>
      <svg class="ts-caret" :class="{ 'ts-caret-open': open }" viewBox="0 0 12 12" aria-hidden="true">
        <polyline points="2,4 6,8 10,4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="ts-sr">— {{ L.current }}: {{ activeMode?.label }}</span>
    </button>

    <div v-show="open" :id="panelId" role="group" :aria-label="L.panel" class="ts-panel">
      <p class="ts-panel-title">{{ L.panel }}</p>
      <ul role="list" class="ts-list">
        <li v-for="m in modes" :key="m.id">
          <button type="button" class="ts-mode" :class="{ 'ts-mode-on': shown === m.id }" :aria-pressed="shown === m.id" @click="choose(m.id)">
            <span class="ts-mode-icon" aria-hidden="true" v-html="icon(m.id)" />
            <span class="ts-mode-text">
              <span class="ts-mode-label">
                {{ m.label }}
                <svg v-if="shown === m.id" class="ts-check" viewBox="0 0 14 14" aria-hidden="true">
                  <polyline points="2,7.5 5.5,11 12,3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span v-if="m.blurb" class="ts-mode-blurb">{{ m.blurb }}</span>
            </span>
          </button>
        </li>
      </ul>

      <div v-if="isCustom" class="ts-accent">
        <label :for="accentId" class="ts-accent-label">{{ L.accentTitle }}</label>
        <div class="ts-accent-row">
          <input :id="accentId" type="color" class="ts-color" :value="accent" @input="setAccent(($event.target as HTMLInputElement).value)" />
          <div class="ts-accent-text">
            <p class="ts-hex">{{ accent.toUpperCase() }}</p>
            <p class="ts-ratio">
              {{ L.contrast }}: <strong>{{ ratio.toFixed(2) }}:1</strong>
              <span class="ts-ok"> · AA&nbsp;&#10003;</span>
            </p>
          </div>
        </div>
        <p class="ts-note">{{ adjusted ? `${L.adjusted} (${AA_MIN}:1).` : L.pickAny }}</p>
        <button type="button" class="ts-reset" @click="setAccent(defaultAccent)">{{ L.reset }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral fallbacks.
   The control paints itself from the CURRENT theme, so it previews the theme it offers. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.ts, .ts * { box-sizing: border-box; }
.ts { position: relative; display: inline-block; }
.ts-trigger {
  display: inline-flex; align-items: center; gap: 0.5rem; min-height: 44px; padding: 0 0.75rem; cursor: pointer;
  font: inherit; font-size: 0.875rem; font-weight: 500; color: var(--site-block-fg, #1a1a1a); background: transparent;
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 30%, transparent); border-radius: 0.375rem;
  transition: background-color var(--site-block-motion, 150ms) ease;
}
.ts-trigger:hover { background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 6%, transparent); }
.ts-trigger:focus-visible, .ts-mode:focus-visible, .ts-color:focus-visible, .ts-reset:focus-visible {
  outline: 2px solid var(--site-block-accent, #b45309); outline-offset: 2px;
}
.ts-icon, .ts-mode-icon { display: inline-flex; }
.ts-caret { width: 0.75rem; height: 0.75rem; opacity: 0.7; transition: transform var(--site-block-motion, 150ms) ease; }
.ts-caret-open { transform: rotate(180deg); }
.ts-trigger-text { display: none; }
.ts-sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
}
.ts-panel {
  position: absolute; right: 0; z-index: 50; margin-top: 0.5rem; width: min(19rem, calc(100vw - 1.5rem)); padding: 0.75rem;
  color: var(--site-block-fg, #1a1a1a); background: var(--site-block-bg, #ffffff);
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 25%, transparent); border-radius: 0.5rem;
  box-shadow: var(--site-block-shadow, 0 10px 15px -3px rgb(0 0 0 / 0.2));
}
.ts-panel-title {
  margin: 0; padding: 0 0.25rem 0.5rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.025em; color: var(--site-block-muted, #4b5563);
}
.ts-list { display: flex; flex-direction: column; gap: 0.25rem; margin: 0; padding: 0; list-style: none; }
.ts-mode {
  display: flex; align-items: flex-start; gap: 0.75rem; width: 100%; padding: 0.5rem 0.75rem; cursor: pointer; text-align: left;
  font: inherit; color: var(--site-block-fg, #1a1a1a); background: transparent; border: 1px solid transparent; border-radius: 0.375rem;
}
.ts-mode:hover { border-color: color-mix(in srgb, var(--site-block-muted, #4b5563) 30%, transparent); background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 4%, transparent); }
.ts-mode-on { border-color: var(--site-block-accent, #b45309); background: color-mix(in srgb, var(--site-block-accent, #b45309) 10%, transparent); }
.ts-mode-icon { flex: none; margin-top: 0.125rem; color: var(--site-block-accent, #b45309); }
.ts-mode-text { min-width: 0; flex: 1; }
.ts-mode-label { display: flex; align-items: center; gap: 0.375rem; font-weight: 500; }
.ts-check { width: 0.875rem; height: 0.875rem; color: var(--site-block-accent, #b45309); }
.ts-mode-blurb { display: block; font-size: 0.75rem; color: var(--site-block-muted, #4b5563); }
.ts-accent {
  margin-top: 0.75rem; padding: 0.75rem; border-radius: 0.375rem;
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 25%, transparent);
  background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 3%, transparent);
}
.ts-accent-label { display: block; font-size: 0.875rem; font-weight: 500; }
.ts-accent-row { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem; }
.ts-color { flex: none; width: 3.5rem; height: 2.5rem; padding: 0.125rem; cursor: pointer; background: var(--site-block-bg, #ffffff); border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 30%, transparent); border-radius: 0.25rem; }
.ts-accent-text { min-width: 0; font-size: 0.875rem; }
.ts-hex { margin: 0; font-family: ui-monospace, monospace; }
.ts-ratio, .ts-note { margin: 0; font-size: 0.75rem; color: var(--site-block-muted, #4b5563); }
.ts-ratio strong { color: var(--site-block-fg, #1a1a1a); }
.ts-ok { color: var(--site-block-success, #15803d); }
.ts-note { margin-top: 0.5rem; }
.ts-reset {
  margin: 0.5rem 0 0; padding: 0; cursor: pointer; font: inherit; font-size: 0.75rem; font-weight: 500;
  color: var(--site-block-accent, #b45309); background: none; border: 0; border-radius: 0.25rem; text-decoration: underline; text-underline-offset: 2px;
}
.ts-reset:hover { text-decoration: none; }
@media (min-width: 640px) { .ts-trigger-text { display: inline; } }
@media (prefers-reduced-motion: reduce) { .ts-trigger, .ts-caret { transition: none; } }
</style>
