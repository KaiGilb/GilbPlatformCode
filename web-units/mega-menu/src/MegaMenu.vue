<script setup lang="ts">
/**
 * Full-width top sheet (default 80dvh) plus a transparent click-catcher over the
 * rest of the viewport (20dvh at the default height). The host owns open state,
 * hover intent and where focus returns. While open, this component locks body
 * scroll, traps Tab on the sheet's links and buttons, focuses the first
 * destination, and reports close / pointer events.
 *
 * An item with no href is static text: no link, no tab stop, no hover change.
 * Close reasons: 'esc' (Escape), 'outside' (the catcher, or a click on the sheet
 * padding, the nav or the centring wrapper; not the gaps between groups), 'link' (any link), 'button' (the bottom Close control).
 *
 * `document` and `window` are read only inside the handlers below, never at
 * module load and never in the setup body, so a server render does not touch them.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, useId, watch, type Component } from "vue";
import { FOCUSABLE_SELECTOR, nextFocusIndex } from "./focusTrap";
import type { MenuCta, MenuGroup, MenuItem, MenuStack } from "./types";

const props = withDefaults(
  defineProps<{
    /** The host owns this. When false the sheet is not in the document. */
    open: boolean;
    /** The regions of the sheet. A `MenuStack` is one cell holding several groups. Nothing here is a page of any one site. */
    groups: (MenuGroup | MenuStack)[];
    /** Accessible name of the dialog. */
    label?: string;
    /** Accessible name of the nav inside the dialog. */
    navLabel?: string;
    /** The bottom-edge Close control. */
    closeLabel?: string;
    /**
     * Draws an internal link, given `to`, when this is a component rather than "a".
     * Default a plain `<a href>`. An external item is always `<a href>`.
     */
    linkComponent?: string | Component;
    /** Stacking of the overlay. Default 40, the source overlay plane. */
    zIndex?: number;
    /** Height of the sheet. The catcher covers whatever is left below it. */
    sheetHeight?: string;
    /** Max width of the group grid inside the full-width sheet. */
    maxWidth?: string;
    /**
     * Id of the dialog. The host's trigger points `aria-controls` at this.
     * When omitted, the id comes from `useId()`, so two menus on one page do not share one.
     */
    panelId?: string;
  }>(),
  {
    label: "Site menu",
    navLabel: "Main",
    closeLabel: "Close",
    linkComponent: "a",
    zIndex: 40,
    sheetHeight: "80dvh",
    maxWidth: "80rem",
  },
);

const emit = defineEmits<{
  /** Ask the host to close. Only 'esc' is the key; the host restores focus for that reason alone. */
  (e: "close", reason: "esc" | "outside" | "link" | "button"): void;
  /** Pointer entered the sheet: the host cancels its mouse-out close timer. */
  (e: "pointer-enter"): void;
  /** Pointer left the sheet: the host starts its mouse-out close timer. */
  (e: "pointer-leave"): void;
}>();

const panelEl = ref<HTMLElement | null>(null);
const uid = useId().replace(/[^A-Za-z0-9_-]/g, "") || "mm";
/** Dialog id: the host's `panelId`, or the same `useId()` the group ids are built from. */
const panelDomId = computed(() => props.panelId || uid);

type DrawnItem =
  | { kind: "item"; item: MenuItem; i: number }
  | { kind: "cta"; cta: MenuCta; i: number };

interface DrawnGroup {
  heading: string;
  id: string;
  columns: 1 | 2;
  tone: "link" | "quiet" | "card";
  /** Quiet group whose rows have no sub line: the source's use-case rhythm. */
  plain: boolean;
  entries: DrawnItem[];
}

interface DrawnCell {
  id: string;
  span: number;
  stack: boolean;
  groups: DrawnGroup[];
}

/** A stack holds an array of groups. A group that only carries a non-array `stack` key (a spread) stays a group. */
function isMenuStack(entry: MenuGroup | MenuStack): entry is MenuStack {
  return Array.isArray((entry as MenuStack).stack);
}

/** Cells in order. A stack is one cell. One stagger index runs across every row, including rows inside a stack (the CTA takes the next number). */
const drawn = computed<DrawnCell[]>(() => {
  const count = props.groups.length;
  const fallback = count > 0 ? Math.floor(12 / count) : 12;
  let n = 0;
  const drawGroup = (group: MenuGroup, id: string): DrawnGroup => {
    const entries: DrawnItem[] = group.items.map((item) => ({ kind: "item", item, i: n++ }));
    if (group.cta) entries.push({ kind: "cta", cta: group.cta, i: n++ });
    // Static-only groups are the source's audience cards unless the host asked for "link" or "quiet".
    const card =
      group.tone === "card" ||
      (group.tone !== "link" && group.tone !== "quiet" && group.items.length > 0 && group.items.every((item) => !item.href));
    const tone = group.tone === "quiet" ? "quiet" : card ? "card" : "link";
    return {
      heading: group.heading,
      id,
      columns: group.columns === 2 ? 2 : 1,
      tone,
      plain: tone === "quiet" && group.items.every((item) => !item.sub),
      entries,
    };
  };
  return props.groups.map((entry, index) => {
    const stack = isMenuStack(entry);
    const groups = stack ? entry.stack : [entry];
    return {
      id: `${uid}-c${index}`,
      span: entry.span ?? fallback,
      stack,
      groups: groups.map((group, gi) => drawGroup(group, `${uid}-g${index}-${gi}`)),
    };
  });
});

function labelClass(tone: DrawnGroup["tone"]): string {
  if (tone === "quiet") return "mm-quiet";
  if (tone === "link") return "mm-item-label mm-display";
  return "mm-item-label";
}

function linkIs(external?: boolean): string | Component {
  if (external) return "a";
  // Props are reactive; a component object must be the raw one or Vue warns and re-renders it.
  const c = props.linkComponent;
  return typeof c === "string" ? c : toRaw(c);
}

function linkBind(href: string | undefined, external?: boolean): { href: string } | { to: string } {
  const value = href ?? "";
  if (external || props.linkComponent === "a") return { href: value };
  return { to: value };
}

// Saved inline overflow, so close puts back what the host had set (including "").
let previousOverflow = "";
let locked = false;
let listening = false;

function lockScroll(): void {
  if (typeof document === "undefined" || locked) return;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  locked = true;
}

function unlockScroll(): void {
  if (typeof document === "undefined" || !locked) return;
  document.body.style.overflow = previousOverflow;
  locked = false;
}

function focusables(): HTMLElement[] {
  const panel = panelEl.value;
  if (!panel || typeof document === "undefined") return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function onKeydown(event: KeyboardEvent): void {
  if (typeof document === "undefined") return;
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close", "esc");
    return;
  }
  if (event.key !== "Tab") return;
  const panel = panelEl.value;
  const els = focusables();
  if (!panel || els.length === 0) return;
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && panel.contains(active);
  const current = active instanceof HTMLElement ? els.indexOf(active) : -1;
  // Inside the sheet only the first and last destinations are edges. A slot control that is
  // not a destination (index -1) is never an edge, so it keeps the browser's Tab.
  const atEdge = !inside || (event.shiftKey ? current === 0 : current === els.length - 1);
  if (!atEdge) return;
  // Outside the sheet, both Tab and Shift+Tab enter at the first destination:
  // nextFocusIndex sends every outside index to the first item.
  const next = nextFocusIndex(els, inside ? current : -1, event.shiftKey);
  const target = els[next];
  if (!target) return;
  event.preventDefault();
  target.focus();
}

function addKeys(): void {
  if (typeof window === "undefined" || listening) return;
  window.addEventListener("keydown", onKeydown);
  listening = true;
}

function removeKeys(): void {
  if (typeof window === "undefined" || !listening) return;
  window.removeEventListener("keydown", onKeydown);
  listening = false;
}

function engage(): void {
  if (typeof document === "undefined") return;
  const wasLocked = locked;
  lockScroll();
  addKeys();
  if (!wasLocked) void nextTick(() => focusables()[0]?.focus());
}

function disengage(): void {
  unlockScroll();
  removeKeys();
}

onMounted(() => {
  if (props.open) engage();
});

watch(
  () => props.open,
  (open) => {
    if (open) engage();
    else disengage();
  },
);

onBeforeUnmount(() => {
  disengage();
});
</script>

<template>
  <Transition name="mm-fade">
  <div
    v-if="open"
    class="mm"
    :style="{ zIndex, '--mm-sheet': sheetHeight, '--mm-max': maxWidth }"
  >
    <div
      :id="panelDomId"
      ref="panelEl"
      class="mm-sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
      @click.self="emit('close', 'outside')"
      @mouseenter="emit('pointer-enter')"
      @mouseleave="emit('pointer-leave')"
    >
      <div class="mm-ground" aria-hidden="true" />
      <nav class="mm-nav" :aria-label="navLabel" @click.self="emit('close', 'outside')">
        <div class="mm-body" @click.self="emit('close', 'outside')">
        <div class="mm-grid">
          <div
            v-for="cell in drawn"
            :key="cell.id"
            class="mm-group"
            :class="{ 'mm-stack': cell.stack }"
            :style="{ '--mm-span': String(cell.span) }"
          >
            <div :class="{ 'mm-stack-inner': cell.stack }">
              <div v-for="group in cell.groups" :key="group.id">
                <p :id="group.id" class="mm-label">{{ group.heading }}</p>
                <ul
                  class="mm-list"
                  :class="{
                    'mm-cols-2': group.columns === 2,
                    'mm-list-card': group.tone === 'card',
                    'mm-list-quiet': group.tone === 'quiet',
                    'mm-list-plain': group.plain,
                  }"
                  :aria-labelledby="group.id"
                >
                  <li
                    v-for="entry in group.entries"
                    :key="entry.i"
                    class="mm-item"
                    :style="{ '--i': String(entry.i) }"
                  >
                    <template v-if="entry.kind === 'item'">
                      <component
                        :is="linkIs(entry.item.external)"
                        v-if="entry.item.href"
                        v-bind="linkBind(entry.item.href, entry.item.external)"
                        class="mm-link"
                        @click="emit('close', 'link')"
                      >
                        <span :class="labelClass(group.tone)">{{ entry.item.label }}</span>
                        <span v-if="entry.item.sub" class="mm-sub">{{ entry.item.sub }}</span>
                      </component>
                      <div v-else class="mm-static">
                        <span :class="labelClass(group.tone)">{{ entry.item.label }}</span>
                        <span v-if="entry.item.sub" class="mm-sub">{{ entry.item.sub }}</span>
                      </div>
                    </template>
                    <component
                      :is="linkIs(entry.cta.external)"
                      v-else
                      v-bind="linkBind(entry.cta.href, entry.cta.external)"
                      class="mm-link mm-cta"
                      @click="emit('close', 'link')"
                    >{{ entry.cta.label }}</component>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        </div>

        <div v-if="$slots.footer" class="mm-footer">
          <slot name="footer" />
        </div>

        <button type="button" class="mm-close" @click="emit('close', 'button')">
          <span>{{ closeLabel }}</span>
          <svg class="mm-close-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </nav>
    </div>

    <!-- Not a tab stop. The Close control and Esc are the keyboard path. -->
    <div class="mm-catcher" aria-hidden="true" @click="emit('close', 'outside')" />
  </div>
  </Transition>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block); neutral fallbacks.
   The sheet is position:fixed, so it does not take a place in the page. */
.mm, .mm * { box-sizing: border-box; }
.mm { position: fixed; inset: 0; }

.mm-sheet {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  height: var(--mm-sheet, 80dvh);
  overflow-y: auto;
  /* A focused row stays clear of the sticky Close bar (WCAG 2.4.11). */
  scroll-padding-bottom: 4rem;
  color: var(--site-block-fg, #1a1a1a);
  /* Legacy rgba(), not color-mix: the same channels in color() rasterise a row off. */
  box-shadow: 0 4px 12px -2px var(--site-block-shadow, rgba(0, 0, 0, 0.08));
  border-bottom-right-radius: var(--site-block-radius, 0.5rem);
  border-bottom-left-radius: var(--site-block-radius, 0.5rem);
}

/* Full-bleed ground, the same box as the source's absolute wash (the sheet itself has no padding). */
.mm-ground {
  position: absolute;
  inset: 0;
  background: var(--site-block-bg, #ffffff);
  background-image: var(--site-block-sheet-wash, none);
  border-bottom-right-radius: inherit;
  border-bottom-left-radius: inherit;
}

/* Default sheet 80dvh, so this band is the transparent bottom 20dvh.
   A custom sheet height leaves the rest of the viewport. */
.mm-catcher {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  top: var(--mm-sheet, 80dvh);
  cursor: pointer;
}

.mm-nav {
  position: relative;
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  width: 100%;
  min-height: 100%;
  padding: 5rem 1.25rem 0.5rem;
}

/* The source's centring wrapper: the grid sits in the middle of the sheet's free height. */
.mm-body { display: flex; flex: 1 0 auto; flex-direction: column; justify-content: center; }

.mm-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 3rem;
  align-content: start;
  width: 100%;
  max-width: var(--mm-max, 80rem);
  margin-inline: auto;
}

.mm-group { min-width: 0; }

/* One cell, several headed lists. Below 640px they sit in one column. */
.mm-stack-inner {
  display: grid;
  gap: 2.5rem;
}

.mm-stack-inner > * { min-width: 0; }

.mm-label {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--site-block-muted, #4b5563);
}

/* Product column: mt-3, space-y-2. Cards and quiet lists override. */
.mm-list {
  list-style: none;
  display: grid;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  padding: 0;
}

.mm-list-card {
  gap: 0.5rem 1.5rem;
  margin-top: 1.5rem;
}

.mm-list-quiet {
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.mm-list-plain { gap: 0.625rem; }

.mm-item { margin: 0; padding: 0; min-width: 0; }

.mm-link, .mm-cta, .mm-close { min-height: 44px; }

.mm-link {
  display: block;
  width: 100%;
  padding: 0;
  color: var(--site-block-fg, #1a1a1a);
  font: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: color var(--site-block-motion, 180ms) ease;
}

/* Audience cards: 1.1rem semibold, snug leading. The display class overrides this on product links. */
.mm-item-label {
  display: block;
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.375;
  color: var(--site-block-fg, #1a1a1a);
}

.mm-display {
  display: inline-block;
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1.12;
  font-size: clamp(1.7rem, 3.2vw, 2.4rem);
  color: var(--site-block-fg, #1a1a1a);
}

.mm-link:hover .mm-item-label,
.mm-link:hover .mm-display {
  color: var(--site-block-accent, #2563eb);
}

/* Quieter links (source .mj-menu-quiet): medium weight, the label inside the 44px link. */
.mm-quiet {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  font-size: 1.02rem;
  font-weight: 500;
  color: var(--site-block-fg, #1a1a1a);
}

.mm-quiet:hover,
.mm-link:hover .mm-quiet {
  color: var(--site-block-accent, #2563eb);
}

.mm-sub {
  display: block;
  margin-top: 0;
  font-size: 0.9rem;
  font-weight: 400;
  line-height: 1.45;
  color: var(--site-block-muted, #4b5563);
}

.mm-list-card .mm-sub { margin-top: 0.25rem; }

/* Static rows (no href): the same type, and nothing on them reacts to the pointer. */
.mm-static {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  min-height: 44px;
  background: transparent;
  cursor: default;
}

/* Audience card chrome. Horizontal margin and padding cancel, so the words stay aligned with the label. */
.mm-list-card .mm-static,
.mm-list-card .mm-link:not(.mm-cta) {
  display: block;
  width: auto;
  margin: 0 -0.75rem;
  padding: 0.7rem 0.75rem;
  border-radius: 8px;
  min-height: 0;
}

/* Use-case rows are the quiet line itself: the wrapper must not add a box. */
.mm-list-plain .mm-static { display: contents; }

.mm-static,
.mm-static:hover,
.mm-static:hover .mm-item-label,
.mm-static .mm-item-label,
.mm-static:hover .mm-quiet,
.mm-static .mm-quiet {
  color: var(--site-block-fg, #1a1a1a);
  background: transparent;
  cursor: default;
}

.mm-cta {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  align-self: flex-start;
  width: auto;
  margin-top: 0;
  padding: 0.75rem 1.75rem;
  border-radius: var(--site-block-cta-radius, var(--site-block-radius, 0.5rem));
  background: var(--site-block-cta, var(--site-block-accent, #2563eb));
  color: var(--site-block-on-cta, var(--site-block-on-accent, #ffffff));
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.5;
}

.mm-cta:hover,
.mm-cta:focus-visible {
  background: var(--site-block-cta-hover, color-mix(in srgb, var(--site-block-cta, var(--site-block-accent, #2563eb)) 88%, black));
}

.mm-link:focus-visible,
.mm-cta:focus-visible,
.mm-close:focus-visible {
  outline: 2px solid var(--site-block-accent, #2563eb);
  outline-offset: 3px;
}

.mm-link:not(.mm-cta):focus-visible { border-radius: 2px; }

.mm-footer { margin-top: 1.25rem; color: var(--site-block-fg, #1a1a1a); }

.mm-close {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  width: 100%;
  margin-top: auto;
  padding: 0.85rem 0.5rem 0.65rem;
  border: 0;
  background-color: transparent;
  background-image: linear-gradient(180deg, var(--site-block-bg-fade, rgba(255, 255, 255, 0)) 0%, var(--site-block-bg, #ffffff) 36%);
  color: var(--site-block-muted, #4b5563);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}

.mm-close:hover { color: var(--site-block-fg, #1a1a1a); }
.mm-close-icon { display: block; }

@media (min-width: 640px) {
  .mm-nav { padding-right: 2rem; padding-left: 2rem; }
  .mm-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mm-stack-inner { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 768px) {
  .mm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem 2.5rem; }
  .mm-stack { grid-column: span 2; }
  /* Stack only. A quiet list outside a stack keeps the base gap and margin. */
  .mm-stack .mm-list-quiet:not(.mm-list-plain) { margin-top: 0.25rem; gap: 0.25rem; }
  .mm-stack .mm-list-plain { margin-top: 0.75rem; }
}

@media (min-width: 1024px) {
  .mm-nav { padding-right: 2.5rem; padding-left: 2.5rem; }
  .mm-grid { grid-template-columns: repeat(12, minmax(0, 1fr)); }
  .mm-group { grid-column: span var(--mm-span, 12); }
  .mm-stack-inner { grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 1.25rem; }
  .mm-stack .mm-list-quiet:not(.mm-list-plain) { margin-top: 0.75rem; gap: 0.5rem; }
  .mm-stack .mm-list-plain { gap: 0; }
}

/* The sheet fades in and out: opacity only. With reduced motion there is no transition. */
@media (prefers-reduced-motion: no-preference) {
  .mm-fade-enter-active { transition: opacity var(--site-block-motion-enter, 240ms) ease; }
  .mm-fade-leave-active { transition: opacity var(--site-block-motion, 180ms) ease; }
  .mm-fade-enter-from, .mm-fade-leave-to { opacity: 0; }
}

/* Reduced motion: the sheet is complete at once. No stagger, no colour transition. */
@media (prefers-reduced-motion: reduce) {
  .mm-link, .mm-cta, .mm-close { transition: none; }
}

@media (prefers-reduced-motion: no-preference) {
  .mm-item {
    animation: mm-in var(--site-block-motion-rise, 0.55s) cubic-bezier(0.25, 0.05, 0.3, 0.7) both;
    animation-delay: calc(min(var(--i), 10) * 40ms);
  }
}

@keyframes mm-in {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: none; }
}
</style>
