<script setup lang="ts">
/**
 * A picture in Markdown content, for a Nuxt Content site to use in place of the default `ProseImg`. Inside a
 * `LightboxScope` it is only the picture (the scope opens it, as one of the set); on its own it is an
 * `ImageLightbox` for that one picture. Markdown can opt a picture out with `![alt](/a.jpg){data-no-lightbox="true"}`.
 *
 * Inside a scope the picture carries `data-full` = its Markdown path, so the viewer shows that file even when the host's
 * image component draws a resized copy.
 *
 * Props: `src`, `alt`, `width?`, `height?`, `imageComponent?`; every other attribute reaches the picture.
 * To use the host's image component, wrap this in a file at `components/content/ProseImg.vue` (README, "How to
 * take it") and pass it as `image-component`.
 */
import { inject } from "vue";
import ImageLightbox from "./ImageLightbox.vue";
import { lightboxScopeKey } from "./scopeKey";

withDefaults(
  defineProps<{
    src?: string;
    alt?: string;
    width?: number | string;
    height?: number | string;
    imageComponent?: object | string;
  }>(),
  { src: "", alt: "", imageComponent: "img" },
);
const inScope = inject(lightboxScopeKey, false);
</script>

<template>
  <!-- data-full: the viewer shows the file the Markdown names, not a resized variant an image component may have made. -->
  <component :is="imageComponent" v-if="inScope" :src="src" :alt="alt" :width="width" :height="height" :data-full="src || undefined" />
  <ImageLightbox v-else :src="src" :alt="alt" :width="width" :height="height" :image-component="imageComponent" />
</template>
