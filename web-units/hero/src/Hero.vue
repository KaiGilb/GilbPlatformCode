<script setup lang="ts">
/**
 * The hero section that opens a web page: the headline in large type, an optional line under it, an
 * optional picture beside it and an optional button to the page's one main next step. Static: it needs
 * no script in the browser.
 *
 * Props: `title`, `subtitle?`, `ctaLabel?`, `ctaTo?` (default `/contact`), `image?`, `imageAlt?` (default
 * the title), `linkComponent?` (the host's route link, default a plain `<a href>`), `imageComponent?` (the
 * host's image component, default `<img>`), `imageProps?` (extra attributes for the picture, for example
 * `{ format: 'avif,webp' }` for Nuxt Image).
 */
import type { Component } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    ctaLabel?: string;
    ctaTo?: string;
    image?: string;
    imageAlt?: string;
    linkComponent?: Component | string;
    imageComponent?: Component | string;
    imageProps?: Record<string, unknown>;
  }>(),
  { ctaTo: "/contact", linkComponent: "a", imageComponent: "img", imageProps: () => ({}) },
);

// A plain <a> takes the route as href; a router link component (NuxtLink, RouterLink) takes it as `to`.
const linkAttrs = (to: string) => (props.linkComponent === "a" ? { href: to } : { to });
</script>

<template>
  <section class="hero">
    <div class="hero-inner" :class="{ 'has-image': image }">
      <div class="hero-text">
        <h1 class="hero-title">{{ title }}</h1>
        <p v-if="subtitle" class="hero-subtitle">{{ subtitle }}</p>
        <component :is="linkComponent" v-if="ctaLabel" v-bind="linkAttrs(ctaTo)" class="hero-cta">{{ ctaLabel }}</component>
      </div>
      <component
        :is="imageComponent"
        v-if="image"
        v-bind="imageProps"
        :src="image"
        :alt="imageAlt || title"
        class="hero-image"
        loading="eager"
      />
    </div>
  </section>
</template>

<style scoped>
/* Theme: the --site-block-* variables, which the site maps from its own tokens (the same set for every
   website block in this library); the fallbacks are neutral. Sizes and breakpoints are the website
   starter's former Tailwind classes written out, so the unit needs no Tailwind. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.hero, .hero * { box-sizing: border-box; }
.hero { background: color-mix(in srgb, var(--site-block-accent, #2563eb) 5%, transparent); }
.hero-inner {
  margin: 0 auto; max-width: 72rem; padding: 5rem 1rem;
  display: grid; gap: 2.5rem; align-items: center;
}
.hero-text { text-align: center; }
.has-image .hero-text { text-align: inherit; }
.hero-title {
  margin: 0; font-size: 2.25rem; line-height: 2.5rem; font-weight: 700; letter-spacing: -0.025em;
  color: var(--site-block-fg, #1a1a1a);
}
.hero-subtitle {
  margin: 1.25rem auto 0; max-width: 42rem; font-size: 1.125rem; line-height: 1.75rem;
  color: var(--site-block-muted, #4b5563);
}
.has-image .hero-subtitle { margin-left: 0; margin-right: 0; max-width: none; }
.hero-cta {
  margin-top: 2rem; display: inline-block; border-radius: var(--site-block-radius, 0.375rem);
  background: var(--site-block-accent, #2563eb); padding: 0.75rem 1.5rem; font-weight: 500;
  color: var(--site-block-on-accent, #ffffff); text-decoration: none;
  transition-property: opacity; transition-duration: var(--site-block-motion, 150ms);
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
.hero-cta:hover { opacity: 0.9; }
.hero-image { display: block; max-width: 100%; width: 100%; height: auto; border-radius: var(--site-block-radius-lg, 0.5rem); }
@media (min-width: 640px) {
  .hero-title { font-size: 3rem; line-height: 1; }
}
@media (min-width: 1024px) {
  .hero-inner { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hero-text { grid-column: span 2 / span 2; }
  .has-image .hero-text { grid-column: auto; }
}
@media (prefers-reduced-motion: reduce) { .hero-cta { transition: none; } }
</style>
