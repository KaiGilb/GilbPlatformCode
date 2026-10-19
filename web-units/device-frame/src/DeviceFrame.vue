<script setup lang="ts">
/**
 * A frame around a REAL screenshot: a browser window (three dots and an address pill over the picture) or a phone
 * (a bezel, with or without an island). The whole frame is a link when `url` is given. It needs no script.
 *
 * Props: `image`, `alt`, `domain` (browser), `imagePhone?`, `url?`, `eager?`, `device?`, `chrome?`, `imageWidth?`,
 * `imageHeight?`, `phoneWidth?`, `phoneHeight?`.
 */
import { computed } from "vue";
import type { DeviceKind, PhoneChrome } from "./types";

const props = withDefaults(
  defineProps<{
    /** The capture: a URL or a path the host can serve. */
    image: string;
    /** What the capture shows, in words (it is the only text a screen reader gets for the picture). */
    alt: string;
    /** The address pill's text in the browser frame, e.g. the live site's domain. Not drawn on a phone. */
    domain?: string;
    /** A smaller copy of `image` for screens under 640 px wide. Browser frame only. */
    imagePhone?: string;
    /** When set, the whole frame is a link that opens in a new tab. */
    url?: string;
    /** Load the picture at once (the first one on the page). Everything else loads lazily. */
    eager?: boolean;
    device?: DeviceKind;
    chrome?: PhoneChrome;
    /** The browser capture's own width and height in pixels. Give both and the frame holds its final size before the picture loads. */
    imageWidth?: number;
    imageHeight?: number;
    /** The phone capture's own width and height in pixels (default 780 by 1688, a 390 by 844 screen at 2x). */
    phoneWidth?: number;
    phoneHeight?: number;
  }>(),
  { domain: "", imagePhone: "", url: "", eager: false, device: "browser", chrome: "island", phoneWidth: 780, phoneHeight: 1688 },
);

const isPhone = computed(() => props.device === "iphone");
const hasIsland = computed(() => isPhone.value && props.chrome !== "bezel");
</script>

<template>
  <component
    :is="url ? 'a' : 'div'"
    :href="url || undefined"
    :target="url ? '_blank' : undefined"
    :rel="url ? 'noopener' : undefined"
    :class="['df', isPhone ? 'df-phone' : 'df-browser', { 'df-link': url }]"
  >
    <template v-if="isPhone">
      <span class="df-phone-body">
        <span class="df-phone-screen">
          <span v-if="hasIsland" class="df-phone-statusbar" aria-hidden="true">
            <span class="df-phone-island" />
          </span>
          <img
            :src="image"
            :alt="alt"
            :width="phoneWidth"
            :height="phoneHeight"
            :loading="eager ? 'eager' : 'lazy'"
            decoding="async"
            class="df-phone-img"
            :class="{ 'df-has-island': hasIsland }"
          />
        </span>
      </span>
    </template>
    <template v-else>
      <div class="df-bar" aria-hidden="true">
        <span class="df-dot" /><span class="df-dot" /><span class="df-dot" />
        <span v-if="domain" class="df-domain">{{ domain }}</span>
      </div>
      <picture class="df-picture">
        <source v-if="imagePhone" media="(max-width: 639px)" :srcset="imagePhone" />
        <img
          :src="image"
          :alt="alt"
          :width="imageWidth"
          :height="imageHeight"
          :loading="eager ? 'eager' : 'lazy'"
          decoding="async"
          class="df-img"
        />
      </picture>
    </template>
  </component>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral fallbacks.
   The phone's hardware colours are --site-block-device-* variables with their own fallbacks. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.df, .df * { box-sizing: border-box; }
.df { display: block; color: inherit; text-decoration: none; }
.df-link { transition: transform var(--site-block-motion, 150ms) ease, box-shadow var(--site-block-motion, 150ms) ease; }
a.df-link:hover { transform: translateY(-4px); }
@media (prefers-reduced-motion: reduce) { a.df-link:hover { transform: none; } }

/* Browser window */
.df-browser {
  overflow: hidden; border-radius: 1.5rem;
  /* A solid base under the picture, derived from the page background, so a scene behind the frame does not tint it. */
  background-color: color-mix(in srgb, var(--site-block-bg, #ffffff) 92%, var(--site-block-device-lift, #ffffff));
}
.df-bar {
  display: flex; align-items: center; gap: 0.45rem; padding: 0.65rem 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 8%, transparent);
  background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 3%, transparent);
}
.df-dot {
  flex: none; width: 0.55rem; height: 0.55rem; border-radius: 999px;
  background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 18%, transparent);
}
.df-domain {
  margin-left: 0.6rem; padding: 0.15rem 0.7rem; border-radius: 999px; overflow: hidden; white-space: nowrap;
  text-overflow: ellipsis; font-size: 0.78rem; letter-spacing: 0.01em; color: var(--site-block-muted, #4b5563);
  background: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 5%, transparent);
}
.df-picture { display: block; }
.df-img { display: block; width: 100%; height: auto; }

/* Phone */
.df-phone { width: min(17.5rem, 100%); margin-inline: auto; }
.df-phone-body {
  position: relative; display: block; padding: 0.62rem; border-radius: 2.55rem;
  background: var(--site-block-device-body, #1c1c1e);
  box-shadow: inset 0 0 0 1px var(--site-block-device-rim, rgb(255 255 255 / 0.14)), inset 0 0 0 3px var(--site-block-device-edge, #0b0b0c), 0 22px 48px var(--site-block-device-shadow, rgb(0 0 0 / 0.55));
}
.df-phone-body::before, .df-phone-body::after {
  content: ""; position: absolute; right: -2px; width: 3px; border-radius: 2px; pointer-events: none;
  background: var(--site-block-device-button, #2a2a2c);
}
.df-phone-body::before { top: 22%; height: 12%; }
.df-phone-body::after { top: 38%; height: 7%; }
.df-phone-screen {
  position: relative; display: block; overflow: hidden; border-radius: 1.7rem; aspect-ratio: 390 / 844;
  background: var(--site-block-device-screen, #f6f1e8);
}
.df-phone-img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; object-position: top center; }
.df-phone-img.df-has-island { inset: 2.15rem 0 0 0; }
.df-phone-statusbar {
  position: absolute; top: 0; right: 0; left: 0; z-index: 2; height: 2.15rem; pointer-events: none;
  background: var(--site-block-device-statusbar, #e8e6e2);
}
.df-phone-island {
  position: absolute; top: 0.42rem; left: 50%; width: 5.1rem; height: 1.18rem; transform: translateX(-50%);
  border-radius: 999px; background: var(--site-block-device-island, #000);
}
</style>
