<script setup lang="ts">
/**
 * A section band: an optional ornament, a heading, a short rule, then the default slot.
 * The slot's wrapper is rendered only when the default slot is given.
 *
 * Props: `title`, `headingLevel?` (default h2), `tone?`, `padding?`, `ornamentSrc?`,
 * `ornamentWidth?`, `ornamentHeight?`, `rule?`, `align?`, `maxWidth?`, `id?`.
 */
import { computed, useId } from "vue";

// Props are inlined. defineProps<SomeImportedType>() makes Vue's compiler read that file, which needs
// TypeScript installed in the site. TitledSectionProps in ./types is the host-facing type and must match this shape.
const props = withDefaults(
  defineProps<{
    /** The band's heading text. */
    title: string;
    /**
     * Heading element. Default `h2`: a reusable band usually sits under a page h1.
     * The source band defaulted to `h1` for standalone pages; pass `h1` for that case.
     */
    headingLevel?: "h1" | "h2" | "h3";
    /** Band background. Default `bg`. */
    tone?: "bg" | "alt";
    /** Vertical padding. Default `lg` (50px, 100px from 768px). */
    padding?: "lg" | "sm";
    /**
     * Ornament image address. Empty (the default) draws no ornament.
     * The host supplies the file; this package does not.
     */
    ornamentSrc?: string;
    /** Ornament width attribute, and the rendered width in px. Default 25. */
    ornamentWidth?: number;
    /** Ornament height attribute in px. Reserves the ratio; CSS height stays `auto`. Default 29. */
    ornamentHeight?: number;
    /** Draw the short rule under the heading. Default true. */
    rule?: boolean;
    /** Alignment of the ornament, heading and rule. Default `center`. */
    align?: "center" | "start";
    /** Inner max width. Default `1140px`. */
    maxWidth?: string;
    /**
     * Set on the `<section>`. The heading id is this plus `-title`, and the section's
     * `aria-labelledby` points at the heading. With no id, the heading id comes from `useId()`.
     */
    id?: string;
  }>(),
  {
    headingLevel: "h2",
    tone: "bg",
    padding: "lg",
    ornamentSrc: "",
    ornamentWidth: 25,
    ornamentHeight: 29,
    rule: true,
    align: "center",
    maxWidth: "1140px",
  },
);

const autoId = useId();
const headingId = computed(() => (props.id ? `${props.id}-title` : autoId));
</script>

<template>
  <section
    :id="id || undefined"
    class="ts"
    :class="{ 'ts--alt': tone === 'alt', 'ts--sm': padding === 'sm', 'ts--start': align === 'start' }"
    :aria-labelledby="headingId"
  >
    <div class="ts-inner" :style="{ '--_max': maxWidth }">
      <div class="ts-head">
        <img
          v-if="ornamentSrc"
          class="ts-ornament"
          :src="ornamentSrc"
          alt=""
          aria-hidden="true"
          :width="ornamentWidth"
          :height="ornamentHeight"
          :style="{ '--_ow': `${ornamentWidth}px` }"
        >
        <component :is="headingLevel" :id="headingId" class="ts-title">{{ title }}</component>
        <div v-if="rule" class="ts-rule" aria-hidden="true" />
      </div>
      <!-- No empty margin under a title-only band: the wrapper exists only with a default slot. -->
      <div v-if="$slots.default" class="ts-body">
        <slot />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral fallbacks.
   Sizes are the source band's measured values, written out (no Tailwind).
   The heading stays 39px at every breakpoint: there is no mobile step-down.
   The rule is navy #0c447c, not the hero's bright blue: 7.81:1 on the alt band #e5e5e5, where #2494ec is 2.56:1. */
.ts, .ts * { box-sizing: border-box; }
.ts {
  padding-inline: 1rem;
  padding-block: 50px;
  background: var(--site-block-bg, transparent);
  font-family: inherit;
}
@media (min-width: 768px) {
  .ts:not(.ts--sm) { padding-block: 100px; }
}
.ts--sm { padding-block: 70px; }
.ts--alt { background: var(--site-block-surface-alt, #e5e5e5); }
.ts-inner { max-width: var(--_max, 1140px); margin: 0 auto; }
.ts-head { text-align: center; }
.ts--start .ts-head { text-align: start; }
.ts-ornament { display: block; width: var(--_ow, 25px); height: auto; margin: 0 auto 6px; }
.ts--start .ts-ornament { margin: 0 0 6px; }
.ts-title {
  margin: 0;
  font-size: var(--site-block-section-title-size, 39px);
  line-height: 1.3;
  font-family: var(--site-block-display-font, inherit);
  font-weight: var(--site-block-section-title-weight, 400);
  color: var(--site-block-fg, #1a1a1a);
}
.ts-rule { width: 100px; height: 3px; margin: 1.25rem auto 0; background: var(--site-block-accent, #0c447c); }
.ts--start .ts-rule { margin: 1.25rem 0 0; }
.ts-body { margin-top: 3rem; font-family: inherit; }
</style>
