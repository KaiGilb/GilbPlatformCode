/**
 * The website image-lightbox unit: a full-screen picture viewer. One picture, every picture in an article, or a
 * Nuxt Content ProseImg.
 */
export { default as ImageLightbox } from "./ImageLightbox.vue";
export { default as LightboxScope } from "./LightboxScope.vue";
export { default as ProseImg } from "./ProseImg.vue";
export { defaultWords, resolveWords, readSwipe, stepIndex, whySkipped } from "./lightboxCore";
export type { LightboxItem, LightboxWords } from "./types";
