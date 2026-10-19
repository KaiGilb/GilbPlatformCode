<script setup lang="ts">
/**
 * A fixed site header: clear over the page's top, solid once the visitor has scrolled past it, and while they scroll
 * DOWN the bar's background, logo and links slide away and only the call-to-action stays, in the same place; any
 * scroll UP brings the whole bar back. Also draws the "skip to content" link and the sentinel that tells when the
 * top has left the screen. The page's footer and main are the host's.
 *
 * Slots: `logo`, `nav` (links or a section menu; put your own `<nav aria-label>` in it) and `cta`
 * (default: a link from `ctaHref` and `ctaLabel`). Props: `skipTarget?`, `skipLabel?`, `ctaHref?`, `ctaLabel?`.
 *
 * Before the page's script runs, none of the scroll behaviour runs and the bar is the clear bar: it works as plain
 * HTML. The behaviour is `createHeaderController` (headerState.ts); this file connects it to the window.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { browserEnv, createHeaderController, INPUT_EVENTS, isSolid, type HeaderConfig, type HeaderController, type HeaderView } from "./headerState";

const props = withDefaults(
  defineProps<{
    /** The id the skip link jumps to, with its #. */
    skipTarget?: string;
    /** The skip link's text. */
    skipLabel?: string;
    /** Used by the default call-to-action. */
    ctaHref?: string;
    ctaLabel?: string;
    /** Overrides of the scroll thresholds, in px and ms (hideAfterPx, deadZonePx, topPx, settleMs, inputWindowMs). */
    thresholds?: Partial<HeaderConfig>;
  }>(),
  { skipTarget: "#main", skipLabel: "Skip to content", ctaHref: "#meeting", ctaLabel: "", thresholds: () => ({}) },
);

const sentinel = ref<HTMLElement | null>(null);
// Starts as the server draws it: clear, shown.
const view = ref<HeaderView>({ scrolled: false, hidden: false, holdClear: true });
const solid = computed(() => isSolid(view.value));
let controller: HeaderController | null = null;
let observer: IntersectionObserver | null = null;
const onScroll = () => controller?.onScroll();
const noteInput = () => controller?.noteInput();

onMounted(() => {
  controller = createHeaderController(browserEnv(), (v) => { view.value = v; }, props.thresholds);
  controller.mount();
  window.addEventListener("scroll", onScroll, { passive: true });
  for (const type of INPUT_EVENTS) window.addEventListener(type, noteInput, { passive: true, capture: true });
  if (!sentinel.value || !("IntersectionObserver" in window)) return;
  observer = new IntersectionObserver(([entry]) => { controller?.setScrolled(!entry!.isIntersecting); }, { threshold: 0 });
  observer.observe(sentinel.value);
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
  for (const type of INPUT_EVENTS) window.removeEventListener(type, noteInput, { capture: true });
  controller?.destroy();
  controller = null;
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div class="hsh-root">
    <a :href="skipTarget" class="hsh-skip">{{ skipLabel }}</a>
    <!-- While this strip at the page's top is on screen we are "at the top". -->
    <div ref="sentinel" class="hsh-sentinel" aria-hidden="true" />
    <header
      class="hsh"
      :class="[solid ? 'hsh-solid' : 'hsh-clear', { 'hsh-past-top': view.scrolled, 'hsh-hidden': view.hidden }]"
    >
      <div class="hsh-inner">
        <div class="hsh-fade hsh-logo"><slot name="logo" /></div>
        <div class="hsh-right">
          <div class="hsh-fade hsh-nav"><slot name="nav" /></div>
          <div class="hsh-cta">
            <slot name="cta"><a v-if="ctaLabel" :href="ctaHref" class="hsh-cta-link">{{ ctaLabel }}</a></slot>
          </div>
        </div>
      </div>
    </header>
  </div>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral fallbacks.
   Sizes are the Gilb Websites landing layout's former Tailwind classes and rules written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.hsh-root, .hsh-root * { box-sizing: border-box; }
.hsh-root { display: contents; }

/* Keyboard users jump the chrome (WCAG 2.4.1). Hidden until focused. */
.hsh-skip {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
}
.hsh-skip:focus {
  position: absolute; z-index: 50; left: 1rem; top: 1rem; width: auto; height: auto; margin: 0;
  padding: 0.5rem 1rem; overflow: visible; clip: auto; white-space: normal; border-radius: 0.375rem;
  background: var(--site-block-accent, #b45309); color: var(--site-block-on-accent, #ffffff);
}

.hsh-sentinel { position: absolute; top: 0; width: 1px; height: 3rem; pointer-events: none; }

.hsh { position: fixed; top: 0; left: 0; right: 0; z-index: var(--site-block-header-z, 40); }
.hsh-inner {
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  height: 4rem; max-width: 72rem; margin: 0 auto; padding: 0 1rem;
}
@media (min-width: 640px) { .hsh-inner { padding: 0 1.5rem; } }
.hsh-right { display: flex; align-items: center; }
.hsh-nav { display: flex; align-items: center; }
.hsh-cta { display: flex; }
.hsh-cta-link {
  display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 1.25rem;
  border-radius: 999px; font-size: 0.875rem; font-weight: 600; white-space: nowrap; text-decoration: none;
  background: var(--site-block-accent, #b45309); color: var(--site-block-on-accent, #ffffff);
  box-shadow: 0 8px 24px -6px color-mix(in srgb, var(--site-block-accent, #b45309) 35%, transparent);
}

/* The bar's background lives on its own layer (::before) so it can slide away while the call-to-action stays put.
   The header is position:fixed with a z-index, so it is its own stacking context and z-index:-1 keeps the layer
   behind the logo, links and button. */
.hsh::before {
  content: ""; position: absolute; inset: 0; z-index: -1; border-bottom: 1px solid transparent;
  transition: background-color 300ms ease, border-color 300ms ease, transform 250ms ease, opacity 250ms ease;
}
.hsh-clear::before { background-color: transparent; }

/* Solid chrome once scrolled. Keyboard focus that brings the bar back past the top also gets it, so logo and links
   never sit unbacked over page content. */
.hsh-solid::before, .hsh-past-top:has(:focus-visible)::before {
  background-color: color-mix(in srgb, var(--site-block-bg, #ffffff) 92%, transparent);
  border-bottom-color: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 8%, transparent);
}
@supports (backdrop-filter: blur(1px)) {
  .hsh-solid::before, .hsh-past-top:has(:focus-visible)::before {
    backdrop-filter: blur(12px);
    background-color: color-mix(in srgb, var(--site-block-bg, #ffffff) 78%, transparent);
  }
}

/* Logo and links. Showing: visibility flips at once, then they fade in. */
.hsh-fade { transition: opacity 250ms ease, transform 250ms ease, visibility 0s linear 0s; }

/* Hidden state. It does not apply while keyboard focus is inside the bar (:focus-visible, e.g. Shift+Tab back up
   from the page), nor while a menu in the bar is open (an element inside it with aria-expanded="true"): then the
   full bar shows. A mouse click on the button gives it focus but not :focus-visible, so it cannot pin the bar open. */
.hsh-hidden:not(:has(:focus-visible)):not(:has([aria-expanded="true"])) {
  /* The empty strip must not swallow clicks meant for the page underneath. */
  pointer-events: none;
}
.hsh-hidden:not(:has(:focus-visible)):not(:has([aria-expanded="true"]))::before { transform: translateY(-100%); opacity: 0; }

/* Hiding: fade and slide out, THEN visibility:hidden, so the logo and links leave the tab order and the
   accessibility tree and a screen reader cannot land on an invisible link. */
.hsh-hidden:not(:has(:focus-visible)):not(:has([aria-expanded="true"])) .hsh-fade {
  opacity: 0; transform: translateY(-12px); visibility: hidden;
  transition: opacity 200ms ease, transform 200ms ease, visibility 0s linear 200ms;
}

/* The button keeps its exact place and stays clickable; with no bar behind it, a dark shadow under the glow lifts
   it off the content as a floating button. */
.hsh-hidden:not(:has(:focus-visible)):not(:has([aria-expanded="true"])) .hsh-cta { pointer-events: auto; }
.hsh-hidden:not(:has(:focus-visible)):not(:has([aria-expanded="true"])) .hsh-cta-link,
.hsh-hidden:not(:has(:focus-visible)):not(:has([aria-expanded="true"])) .hsh-cta :slotted(*) {
  box-shadow:
    0 8px 24px -6px color-mix(in srgb, var(--site-block-accent, #b45309) 35%, transparent),
    0 12px 32px -8px var(--site-block-header-lift, rgb(0 0 0 / 0.7));
}

/* Reduced motion: no slide, no fade; the bar hides and shows instantly. */
@media (prefers-reduced-motion: reduce) {
  .hsh::before, .hsh-fade, .hsh-hidden:not(:has(:focus-visible)):not(:has([aria-expanded="true"])) .hsh-fade { transition: none; }
}
</style>
