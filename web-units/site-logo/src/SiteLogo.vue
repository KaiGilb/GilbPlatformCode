<script setup lang="ts">
/**
 * One link: an optional logo image and an optional wordmark. The site name is the accessible name.
 * There is no aria-label on the link. When the wordmark is shown the image alt is empty, so the name
 * is not spoken twice and the visible text is not hidden. When the wordmark is not shown, the image
 * alt is `logoAlt`, or `name` when that is empty.
 *
 * `wordmark="never"` with no image still draws the name: an empty link is never produced.
 * `decorative` draws only the image (empty alt, hidden from assistive tech), for a sibling that is already the link.
 * `external`, or the default link, is a plain `<a href>`. Any other `linkComponent` receives `to`.
 *
 * Props: `name`, `href?`, `external?`, `logoSrc?`, `logoAlt?`, `logoWidth?`, `logoHeight?`, `wordmark?`,
 * `linkComponent?`, `imageComponent?`, `decorative?`.
 */
import { computed, type Component } from "vue";

// Props are inlined. defineProps<SomeImportedType>() makes Vue's compiler read that file, which needs
// TypeScript installed in the site. SiteLogoProps in ./types is the host-facing type and must match this shape.
const props = withDefaults(
  defineProps<{
    /** The site name. Shown as the wordmark, and used as the image alt when the wordmark is not shown. */
    name: string;
    /** Where the logo goes. Default `/`. */
    href?: string;
    /**
     * The address is outside this site's router. The link is then a plain `<a href>`,
     * even when `linkComponent` was passed.
     */
    external?: boolean;
    /** Logo image address. Empty draws no image. */
    logoSrc?: string;
    /** Image alt used only when the wordmark is not shown. Empty falls back to `name`. */
    logoAlt?: string;
    /** The image's `width` attribute, in CSS pixels. Default 32. Always set, so the layout does not jump. */
    logoWidth?: number;
    /** The image's `height` attribute, in CSS pixels. Default 32. */
    logoHeight?: number;
    /**
     * When to show `name` as text. Default `always`.
     * `never` with no image still shows the name, so the link is never empty.
     */
    wordmark?: "always" | "when-no-logo" | "never";
    /** Route link, given `to`. The string `a` (the default) is a plain anchor, given `href`. */
    linkComponent?: string | Component;
    /** The image element, given `src`, `alt`, `width`, `height`, `decoding` and `loading`. Default `img`. */
    imageComponent?: string | Component;
    /** Draw only the image (`alt=""`, `aria-hidden`), with no link and no wordmark. */
    decorative?: boolean;
  }>(),
  {
    href: "/",
    external: false,
    logoSrc: "",
    logoAlt: "",
    logoWidth: 32,
    logoHeight: 32,
    wordmark: "always",
    linkComponent: "a",
    imageComponent: "img",
    decorative: false,
  },
);

const showImage = computed(() => props.logoSrc !== "");
/** No image: always show the name. An image: show it only for `always`. Decorative never shows it. */
const showWordmark = computed(() => !props.decorative && (!showImage.value || props.wordmark === "always"));
/** Empty when the wordmark (or decorative mode) already accounts for the name. */
const imageAlt = computed(() => (showWordmark.value ? "" : props.logoAlt || props.name));
/** A plain anchor for the default link and for any external address. A route component gets `to`. */
const plainAnchor = computed(() => props.external || props.linkComponent === "a");
const linkBind = computed(() => (plainAnchor.value ? { href: props.href } : { to: props.href }));
</script>

<template>
  <!-- Decorative: the image only. No empty src, which would request the page itself. No link, no wordmark. -->
  <component
    :is="imageComponent"
    v-if="decorative && showImage"
    class="sl-img"
    :src="logoSrc"
    alt=""
    :width="logoWidth"
    :height="logoHeight"
    decoding="async"
    loading="eager"
    aria-hidden="true"
  />
  <component :is="plainAnchor ? 'a' : linkComponent" v-else-if="!decorative" class="sl" v-bind="linkBind">
    <component
      :is="imageComponent"
      v-if="showImage"
      class="sl-img"
      :src="logoSrc"
      :alt="imageAlt"
      :width="logoWidth"
      :height="logoHeight"
      decoding="async"
      loading="eager"
    />
    <span v-if="showWordmark">{{ name }}</span>
  </component>
</template>

<style scoped>
/* Theme: --site-block-accent (the same set as every website block in this library); a blue fallback.
   Sizes are the source's former Tailwind classes written out: inline-flex, centred, gap 0.5rem,
   semibold, text-lg, no underline, and a 44px tap target the sources did not set. */
/* Box sizes include padding and border whatever the page's own reset. The wordmark inherits the page font. */
.sl, .sl *, .sl-img { box-sizing: border-box; }
.sl {
  display: inline-flex; align-items: center; gap: 0.5rem; min-height: 44px;
  font-family: inherit; font-weight: 600; font-size: 1.125rem; line-height: 1.75rem;
  color: var(--site-block-accent, #1d4ed8); text-decoration: none;
}
.sl:visited, .sl:hover { color: var(--site-block-accent, #1d4ed8); text-decoration: none; }
.sl:focus-visible { outline: 2px solid var(--site-block-accent, #1d4ed8); outline-offset: 2px; }
.sl-img { display: block; height: 2rem; width: auto; }
</style>
