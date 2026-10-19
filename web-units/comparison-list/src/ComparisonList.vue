<script setup lang="ts">
/**
 * "Typical against us" per topic, as a semantic list: each row is a list item with the topic as a heading and the
 * two answers as paragraphs. From 768 px it is three columns (topic, typical, ours) under a column header, with the
 * "ours" column tinted and closed at both ends; under that, one card per row. It needs no script.
 *
 * Every answer carries a screen-reader label with the full column name, so a row reads "topic, <typical label>: ...,
 * <ours label>: ..." at any width. The visible column header (wide) and the short labels (phones) repeat that, so
 * both are hidden from screen readers.
 *
 * Props: `rows`, `themLabel`, `usLabel`, `themShort?`, `usShort?`, `headingLevel?`, `rowAttrs?`.
 */
import { computed } from "vue";
import type { ComparisonRow } from "./types";

const props = withDefaults(
  defineProps<{
    rows: ComparisonRow[];
    /** The left column's full name, shown over the column and read before each left answer. */
    themLabel: string;
    /** The right column's full name. */
    usLabel: string;
    /** A short form of `themLabel` drawn before the left answer on phones (e.g. "Typical:"). Left out when not given. */
    themShort?: string;
    /** A short form of `usLabel` drawn before the right answer on phones. */
    usShort?: string;
    /** The topic's heading level, 2 to 6 (default 3). */
    headingLevel?: 2 | 3 | 4 | 5 | 6;
    /** Attributes put on the column header and on every row, e.g. a reveal marker. */
    rowAttrs?: Record<string, string | undefined>;
  }>(),
  { headingLevel: 3, rowAttrs: () => ({}) },
);
const heading = computed(() => `h${props.headingLevel}`);
</script>

<template>
  <div v-if="rows.length" class="cmp">
    <div class="cmp-head" aria-hidden="true" v-bind="rowAttrs">
      <span />
      <span class="cmp-head-them">{{ themLabel }}</span>
      <span class="cmp-head-us">{{ usLabel }}</span>
    </div>
    <ul role="list" class="cmp-rows">
      <li v-for="row in rows" :key="row.topic" class="cmp-row" v-bind="rowAttrs">
        <component :is="heading" class="cmp-topic">{{ row.topic }}</component>
        <p class="cmp-them">
          <span v-if="themShort" class="cmp-short cmp-short-them" aria-hidden="true">{{ themShort }}</span>
          <span class="cmp-sr">{{ themLabel }}: </span>{{ row.them }}
        </p>
        <p class="cmp-us">
          <span v-if="usShort" class="cmp-short cmp-short-us" aria-hidden="true">{{ usShort }}</span>
          <svg class="cmp-check" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 8.5l3.2 3L13 4.5" />
          </svg>
          <span class="cmp-sr">{{ usLabel }}: </span>{{ row.us }}
        </p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral fallbacks.
   Sizes are the Gilb Websites landing page's former Tailwind classes written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.cmp, .cmp * { box-sizing: border-box; }
.cmp { color: var(--site-block-fg, #1a1a1a); }
.cmp-head { display: none; }
.cmp-rows { display: grid; gap: 0.75rem; margin: 0; padding: 0; list-style: none; }
.cmp-row {
  padding: 0.5rem 0; border-radius: 1.25rem;
  border: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 8%, transparent);
  background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 3%, transparent);
}
.cmp-topic {
  margin: 0; padding: 0.5rem 1rem; font-size: 1rem; line-height: 1.5; font-weight: 600;
  color: var(--site-block-fg, #1a1a1a);
}
.cmp-them {
  margin: 0; padding: 0.25rem 1rem 0.75rem; font-size: 0.875rem; line-height: 1.6;
  color: var(--site-block-muted, #4b5563);
}
.cmp-us {
  margin: 0; padding: 0.5rem 1rem; font-size: 1rem; line-height: 1.6; font-weight: 500;
  color: var(--site-block-fg, #1a1a1a);
}
.cmp-short { font-weight: 600; }
.cmp-short-them { margin-right: 0.25rem; }
.cmp-short-us { margin-right: 0.375rem; color: var(--site-block-accent, #b45309); }
.cmp-check {
  display: inline-block; width: 0.85em; height: 0.85em; margin-right: 0.5rem; transform: translateY(-1px);
  color: var(--site-block-accent, #b45309);
}
.cmp-sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
}

@media (min-width: 768px) {
  .cmp-head, .cmp-row { display: grid; grid-template-columns: 20% 34% minmax(0, 1fr); }
  .cmp-head-them {
    padding: 1.5rem 1.25rem 1.25rem; font-size: 0.75rem; line-height: 1rem; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.08em; color: var(--site-block-muted, #4b5563);
  }
  .cmp-head-us {
    padding: 1.5rem 1.25rem 1.25rem; font-size: 0.75rem; line-height: 1rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em; color: var(--site-block-accent, #b45309);
    border: 1px solid color-mix(in srgb, var(--site-block-accent, #b45309) 35%, transparent); border-bottom: 0;
    border-radius: 1.25rem 1.25rem 0 0;
    background: color-mix(in srgb, var(--site-block-accent, #b45309) 8%, transparent);
  }
  .cmp-rows { display: block; }
  .cmp-row { padding: 0; border: 0; border-radius: 0; background: transparent; }
  .cmp-topic, .cmp-them, .cmp-us {
    padding: 1.15rem 1.25rem;
    border-top: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 7%, transparent);
  }
  .cmp-them { font-size: 1rem; line-height: 1.5rem; }
  .cmp-us {
    font-weight: 400;
    border-left: 1px solid color-mix(in srgb, var(--site-block-accent, #b45309) 35%, transparent);
    border-right: 1px solid color-mix(in srgb, var(--site-block-accent, #b45309) 35%, transparent);
    background: color-mix(in srgb, var(--site-block-accent, #b45309) 8%, transparent);
  }
  .cmp-row:first-child > * { border-top-width: 0; }
  .cmp-row:last-child .cmp-us {
    border-bottom: 1px solid color-mix(in srgb, var(--site-block-accent, #b45309) 35%, transparent);
    border-radius: 0 0 1.25rem 1.25rem;
  }
  .cmp-short { display: none; }
}
</style>
