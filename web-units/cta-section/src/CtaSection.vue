<script setup lang="ts">
/**
 * A full-width band in the site's accent colour, with one heading, an optional line and one link to the
 * step the site wants the visitor to take next. Static.
 *
 * Props: `title`, `subtitle?`, `ctaLabel`, `ctaTo?` (default `/contact`), `linkComponent?` (the host's
 * route link, default a plain `<a href>`).
 */
import type { Component } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    ctaLabel: string;
    ctaTo?: string;
    linkComponent?: Component | string;
  }>(),
  { ctaTo: "/contact", linkComponent: "a" },
);

// A plain <a> takes the route as href; a router link component (NuxtLink, RouterLink) takes it as `to`.
const linkAttrs = (to: string) => (props.linkComponent === "a" ? { href: to } : { to });
</script>

<template>
  <section class="cta">
    <div class="cta-inner">
      <h2 class="cta-title">{{ title }}</h2>
      <p v-if="subtitle" class="cta-subtitle">{{ subtitle }}</p>
      <component :is="linkComponent" v-bind="linkAttrs(ctaTo)" class="cta-link">{{ ctaLabel }}</component>
    </div>
  </section>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral
   fallbacks. Sizes are the website starter's former Tailwind classes written out.
   The line under the heading is the full on-accent colour. The starter drew it at 85 % (white/85),
   which measures 4.2:1 on its #2563eb accent (computed from the sRGB mix), under WCAG AA's 4.5:1 for normal text; a site that
   wants a softer line sets --site-block-on-accent-soft to a colour that still clears 4.5:1. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.cta, .cta * { box-sizing: border-box; }
.cta { background: var(--site-block-accent, #2563eb); }
.cta-inner { margin: 0 auto; max-width: 56rem; padding: 4rem 1rem; text-align: center; }
.cta-title {
  margin: 0; font-size: 1.875rem; line-height: 2.25rem; font-weight: 700;
  color: var(--site-block-on-accent, #ffffff);
}
.cta-subtitle { margin: 1rem 0 0; color: var(--site-block-on-accent-soft, var(--site-block-on-accent, #ffffff)); }
.cta-link {
  margin-top: 2rem; display: inline-block; border-radius: var(--site-block-radius, 0.375rem);
  background: var(--site-block-on-accent, #ffffff); padding: 0.75rem 1.5rem; font-weight: 500;
  color: var(--site-block-accent, #2563eb); text-decoration: none;
  transition-property: opacity; transition-duration: var(--site-block-motion, 150ms);
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
.cta-link:hover { opacity: 0.9; }
@media (prefers-reduced-motion: reduce) { .cta-link { transition: none; } }
</style>
