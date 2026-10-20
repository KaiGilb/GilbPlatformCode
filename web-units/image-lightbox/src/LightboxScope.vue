<script setup lang="ts">
/**
 * Wrap an article, or any rendered content, and every picture in it opens full screen when clicked, with no
 * change to the pictures. All the pictures that open form one set: arrow keys, previous and next buttons and
 * a "3 of 12" counter move through them in page order.
 *
 * A picture does not open if it has no alt text (decoration), if it or a parent carries `data-no-lightbox`
 * (the author's opt-out), or if it sits inside a link (the link keeps its job). A picture in a `<figure>` shows
 * the `<figcaption>` under it; `data-full="/big.jpg"` names a larger original to show.
 *
 * It adds no box (`display: contents`). Before the script runs the pictures are plain pictures; after, each
 * one that opens gets the button role, a tab stop and a zoom cursor.
 *
 * Props: `words?`, `showCaption?`, `maxZoom?`.
 */
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef } from "vue";
import LightboxViewer from "./LightboxViewer.vue";
import { MAX_ZOOM, collectSet, resolveWords, whySkipped } from "./lightboxCore";
import { lightboxScopeKey } from "./scopeKey";
import type { LightboxItem, LightboxWords } from "./types";

const props = withDefaults(
  defineProps<{ words?: Partial<LightboxWords>; showCaption?: boolean; maxZoom?: number }>(),
  { showCaption: true, maxZoom: MAX_ZOOM },
);
provide(lightboxScopeKey, true);

const root = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const items = shallowRef<LightboxItem[]>([]);
const index = ref(0);
const words = computed(() => resolveWords(props.words));
let observer: MutationObserver | null = null;

function target(e: Event): HTMLImageElement | null {
  const t = e.target as Element | null;
  const img = t?.closest?.("img") ?? null;
  return img && root.value?.contains(img) && whySkipped(img) === null ? (img as HTMLImageElement) : null;
}
function openAt(img: HTMLImageElement): void {
  const set = collectSet(root.value!, img);
  items.value = set.items;
  index.value = set.index;
  isOpen.value = true;
}
function onClick(e: MouseEvent): void {
  const img = target(e);
  if (img) openAt(img);
}
function onKeydown(e: KeyboardEvent): void {
  if (e.key !== "Enter" && e.key !== " ") return;
  const img = target(e);
  if (!img) return;
  e.preventDefault();
  openAt(img);
}
/** Mark the pictures that open: button role, tab stop, a cursor hook. Done after mount, never in the server's HTML. */
function mark(): void {
  for (const img of root.value?.querySelectorAll("img") ?? []) {
    if (whySkipped(img) === null) {
      img.setAttribute("data-lightbox", "");
      img.setAttribute("role", "button");
      img.setAttribute("aria-haspopup", "dialog");
      if (!img.hasAttribute("tabindex")) img.setAttribute("tabindex", "0");
    } else if (img.hasAttribute("data-lightbox")) {
      for (const a of ["data-lightbox", "role", "aria-haspopup", "tabindex"]) img.removeAttribute(a);
    }
  }
}
onMounted(() => {
  mark();
  if (typeof MutationObserver !== "undefined" && root.value) {
    observer = new MutationObserver(() => mark());
    observer.observe(root.value, { childList: true, subtree: true });
  }
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="root" class="ilb-scope" @click="onClick" @keydown="onKeydown">
    <slot />
  </div>
  <LightboxViewer
    v-if="isOpen"
    v-model:index="index"
    :items="items"
    :words="words"
    :show-caption="showCaption"
    :max-zoom="maxZoom"
    @close="isOpen = false"
  />
</template>

<style scoped>
.ilb-scope { display: contents; }
.ilb-scope :deep(img[data-lightbox]) { cursor: zoom-in; }
</style>
