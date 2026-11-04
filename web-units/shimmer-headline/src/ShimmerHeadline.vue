<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

/**
 * Plain text in the server HTML, with no script, with reduced motion
 * and when settled: the heading is ordinary text in the page colour.
 * On first entry into view, after 220ms, one 3.2s background-clip: text
 * pass of a narrow highlight band, ease-in-out.
 * Only background-position animates.
 * On animationend the class goes and the text is plain again.
 * A 3.8s net settles it if animationend never comes.
 * Once per page view. The pass works across wrapped lines.
 */
const props = withDefaults(defineProps<{ tag?: string; onDark?: boolean }>(), { tag: "h2", onDark: false });

const el = ref<HTMLElement | null>(null)

let observer: IntersectionObserver | null = null
let startTimer: number | undefined
let settleTimer: number | undefined
let onSweepEnd: ((event: AnimationEvent) => void) | null = null

onMounted(() => {
  const headline = el.value
  if (!headline || typeof window === 'undefined') return
  // Reduced motion: static ink, no sweep, no observer (spec impl 3).
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (!('IntersectionObserver' in window)) return

  // Settle: drop the clip so the headline is ordinary ink text again.
  const settle = () => {
    if (settleTimer !== undefined) window.clearTimeout(settleTimer)
    settleTimer = undefined
    headline.classList.remove('sh--sweeping')
    if (onSweepEnd) headline.removeEventListener('animationend', onSweepEnd)
    onSweepEnd = null
  }

  onSweepEnd = (event: AnimationEvent) => {
    // includes(), not equality: Vue rewrites @keyframes names in scoped styles
    // (sh-sweep gains the scope-id suffix), so the event name arrives
    // decorated. Found live: the exact-match filter never fired and the clip
    // stayed applied, resting the headline transparent.
    if (!event.animationName.includes('sh-sweep')) return
    settle()
  }

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        // Once only: one sweep per page view, then the observer is done.
        observer?.disconnect()
        observer = null
        startTimer = window.setTimeout(() => {
          headline.addEventListener('animationend', onSweepEnd!)
          headline.classList.add('sh--sweeping')
          // Readability net: if animationend never arrives (throttled tab,
          // interrupted animation), settle to ink shortly after the pass
          // should have finished. The final state must always be plain ink.
          settleTimer = window.setTimeout(settle, 3800)
        }, 220)
      }
    },
    // Same reveal line the text-reveal system releases at, so the two gestures
    // fire together (useReveal geometry, assets/css/main.css).
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  )
  observer.observe(headline)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  if (startTimer !== undefined) window.clearTimeout(startTimer)
  if (settleTimer !== undefined) window.clearTimeout(settleTimer)
  if (onSweepEnd && el.value) el.value.removeEventListener('animationend', onSweepEnd)
})
</script>

<template>
  <component :is="tag" ref="el" class="sh" :class="{ 'sh--dark': onDark }"><slot /></component>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .sh.sh--sweeping {
    background-image: linear-gradient(
      100deg,
      var(--site-block-fg, #1a1a1a) 0%,
      var(--site-block-fg, #1a1a1a) 40%,
      var(--site-block-shimmer, #e7b339) 50%,
      var(--site-block-fg, #1a1a1a) 60%,
      var(--site-block-fg, #1a1a1a) 100%
    );
    background-size: 300% 100%;
    background-repeat: no-repeat;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
    animation: sh-sweep 3.2s ease-in-out both;
  }
  .sh.sh--dark.sh--sweeping {
    background-image: linear-gradient(
      100deg,
      var(--site-block-bg, #ffffff) 0%,
      var(--site-block-bg, #ffffff) 40%,
      var(--site-block-shimmer, #e7b339) 50%,
      var(--site-block-bg, #ffffff) 60%,
      var(--site-block-bg, #ffffff) 100%
    );
  }
}
@keyframes sh-sweep {
  from { background-position: 100% 0; }
  to { background-position: 0% 0; }
}
</style>
