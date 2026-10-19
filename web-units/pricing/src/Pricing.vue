<script setup lang="ts">
/**
 * An offering's plans side by side: each column has the plan's name, its price, an optional period, the
 * list of what it includes and an optional button to choose it. A plan marked `featured` gets the accent
 * border and a filled button. One column on a phone, two from 640 px, three from 1024 px. Static.
 *
 * Props: `heading?`, `plans` (`Plan[]`; a plan's button goes to `ctaTo`, default `/contact`), and
 * `linkComponent?` (the host's route link, default a plain `<a href>`).
 */
import type { Component } from "vue";
import type { Plan } from "./types";

const props = withDefaults(
  defineProps<{
    heading?: string;
    plans: Plan[];
    linkComponent?: Component | string;
  }>(),
  { linkComponent: "a" },
);

// A plain <a> takes the route as href; a router link component (NuxtLink, RouterLink) takes it as `to`.
const linkAttrs = (to: string) => (props.linkComponent === "a" ? { href: to } : { to });
</script>

<template>
  <section class="pr">
    <h2 v-if="heading" class="pr-heading">{{ heading }}</h2>
    <div class="pr-grid">
      <div v-for="p in plans" :key="p.name" class="pr-plan" :class="{ 'is-featured': p.featured }">
        <h3 class="pr-name">{{ p.name }}</h3>
        <p class="pr-price-line"><span class="pr-price">{{ p.price }}</span>
          <span v-if="p.period" class="pr-period">/{{ p.period }}</span></p>
        <ul class="pr-list">
          <li v-for="feat in p.features" :key="feat" class="pr-item">
            <span class="pr-check" aria-hidden="true">&check;</span>{{ feat }}
          </li>
        </ul>
        <component :is="linkComponent" v-if="p.ctaLabel" v-bind="linkAttrs(p.ctaTo || '/contact')" class="pr-cta">{{ p.ctaLabel }}</component>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral
   fallbacks. Sizes and breakpoints are the website starter's former Tailwind classes written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.pr, .pr * { box-sizing: border-box; }
.pr { margin: 0 auto; max-width: 72rem; padding: 4rem 1rem; }
.pr-heading {
  margin: 0 0 2.5rem; text-align: center; font-size: 1.5rem; line-height: 2rem; font-weight: 600;
  color: var(--site-block-fg, #1a1a1a);
}
.pr-grid { display: grid; gap: 1.5rem; }
.pr-plan {
  display: flex; flex-direction: column; padding: 1.5rem; border-radius: var(--site-block-radius-lg, 0.5rem);
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 20%, transparent);
}
.pr-plan.is-featured {
  border-color: var(--site-block-accent, #2563eb);
  box-shadow: 0 0 0 1px var(--site-block-accent, #2563eb);
}
.pr-name { margin: 0; font-size: inherit; font-weight: 600; color: var(--site-block-fg, #1a1a1a); }
.pr-price-line { margin: 0.75rem 0 0; }
.pr-price { font-size: 1.875rem; line-height: 2.25rem; font-weight: 700; color: var(--site-block-fg, #1a1a1a); }
.pr-period { font-size: 0.875rem; line-height: 1.25rem; color: var(--site-block-muted, #4b5563); }
.pr-list {
  margin: 1.25rem 0 0; padding: 0; list-style: none; flex: 1 1 0%;
  font-size: 0.875rem; line-height: 1.25rem; color: var(--site-block-muted, #4b5563);
}
.pr-item { display: flex; gap: 0.5rem; }
.pr-item + .pr-item { margin-top: 0.5rem; }
.pr-check { color: var(--site-block-accent, #2563eb); }
.pr-cta {
  margin-top: 1.5rem; display: inline-block; text-align: center; text-decoration: none;
  border-radius: var(--site-block-radius, 0.375rem); padding: 0.75rem 1.25rem; font-weight: 500;
  border: 1px solid var(--site-block-accent, #2563eb); color: var(--site-block-accent, #2563eb);
  transition-property: opacity; transition-duration: var(--site-block-motion, 150ms);
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
.is-featured .pr-cta {
  border: 0; background: var(--site-block-accent, #2563eb); color: var(--site-block-on-accent, #ffffff);
}
.pr-cta:hover { opacity: 0.9; }
@media (min-width: 640px) { .pr-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1024px) { .pr-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) { .pr-cta { transition: none; } }
</style>
