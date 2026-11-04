<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useScrollFrame } from "./useScrollFrame";

/**
 * A parallax plane: its content drifts at a small rate against the scroll, on one
 * shared frame bus. The outer element is the measuring box; only the inner is
 * transformed, so the measurement never chases its own transform. Offset = distance
 * of the layer's centre from the viewport centre × `rate`, written as `translate3d`,
 * transform only. Off-screen layers by more than 200px do no work. Reduced motion:
 * no subscription, no transform, no `will-change`. Decorative by default: inert and
 * `aria-hidden`. Pass `:decorative="false"` only for real content.
 */
const props = withDefaults(
  defineProps<{
    /** Parallax rate. Positive lags the scroll (reads deeper), negative leads it. Keep small: the band system is tuned for 0.05 to 0.2. */
    rate?: number;
    /** Decorative planes are inert to input and hidden from assistive tech. */
    decorative?: boolean;
    /** Rendered wrapper element. */
    tag?: string;
    /** Classes for the INNER (transformed) element. Layout that must ride the transform (a height chain, flex alignment) belongs on the inner, not the outer. */
    innerClass?: string;
  }>(),
  { rate: 0.12, decorative: true, tag: "div", innerClass: "" },
);

const outerEl = ref<HTMLElement | null>(null)
const innerEl = ref<HTMLElement | null>(null)
const { subscribe, reduced } = useScrollFrame()

let unsubscribe: (() => void) | null = null

onMounted(() => {
  const outer = outerEl.value
  const inner = innerEl.value
  if (!outer || !inner || reduced) return

  inner.style.willChange = 'transform'

  unsubscribe = subscribe(() => {
    const rect = outer.getBoundingClientRect()
    const vh = window.innerHeight
    // Off-screen bands do no work (frame-bus discipline from the ported StickyStack).
    if (rect.top > vh + 200 || rect.bottom < -200) return
    const centerDelta = rect.top + rect.height / 2 - vh / 2
    const offset = -centerDelta * props.rate
    inner.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = null
})
</script>

<template>
  <component
    :is="tag"
    ref="outerEl"
    :class="decorative ? 'pl-inert' : undefined"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <div ref="innerEl" :class="innerClass">
      <slot />
    </div>
  </component>
</template>

<style scoped>
.pl-inert { pointer-events: none; }
</style>
