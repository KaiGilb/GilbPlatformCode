<script setup lang="ts">
/**
 * One picture that opens full screen when clicked, or when Enter or Space is pressed on it. It draws the picture
 * exactly as the host's own image component would (all other attributes, such as class, loading, fetchpriority,
 * sizes and style, reach the picture), so it can be the page's largest picture without changing it.
 *
 * Before the script runs it is only the picture. After, it gets the button role, a tab stop and a zoom cursor.
 * A picture with no alt text is decoration and does not open.
 *
 * Props: `src`, `alt`, `width?`, `height?`, `fullSrc?`, `caption?`, `imageComponent?`, `words?`, `showCaption?`,
 * `maxZoom?`, `disabled?`.
 */
import { computed, onMounted, ref } from "vue";
import LightboxViewer from "./LightboxViewer.vue";
import { MAX_ZOOM, resolveWords } from "./lightboxCore";
import type { LightboxItem, LightboxWords } from "./types";

// A multi-root component does not pass attributes on by itself; they are given to the picture by hand.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    src: string;
    alt: string;
    width?: number | string;
    height?: number | string;
    /** A larger original to show in the viewer; the picture's own file when not given. */
    fullSrc?: string;
    /** Text under the picture in the viewer; the alt text when not given. */
    caption?: string;
    /** The host's image component (e.g. the Nuxt image component); a plain img when not given. */
    imageComponent?: object | string;
    words?: Partial<LightboxWords>;
    showCaption?: boolean;
    maxZoom?: number;
    /** Keep the picture as a plain picture that does not open. */
    disabled?: boolean;
  }>(),
  { imageComponent: "img", showCaption: true, maxZoom: MAX_ZOOM },
);

const ready = ref(false);
const isOpen = ref(false);
const picture = ref<unknown>(null);
onMounted(() => { ready.value = true; });

const enabled = computed(() => !props.disabled && !!props.alt?.trim());
const active = computed(() => ready.value && enabled.value);
const words = computed(() => resolveWords(props.words));
const items = computed<LightboxItem[]>(() => {
  const el = (picture.value as { $el?: HTMLElement } | null)?.$el ?? (picture.value as HTMLElement | null);
  return [{ src: props.fullSrc || props.src, alt: props.alt.trim(), caption: props.caption?.trim() || props.alt.trim(), el }];
});
const index = ref(0);

function open(): void { if (active.value) isOpen.value = true; }
function onKeydown(e: KeyboardEvent): void {
  if (!active.value || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  open();
}
</script>

<template>
  <component
    :is="imageComponent"
    ref="picture"
    v-bind="$attrs"
    :src="src"
    :alt="alt"
    :width="width"
    :height="height"
    :role="active ? 'button' : undefined"
    :tabindex="active ? 0 : undefined"
    :aria-haspopup="active ? 'dialog' : undefined"
    :class="{ 'ilb-zoomable': active }"
    @click="open"
    @keydown="onKeydown"
  />
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
.ilb-zoomable { cursor: zoom-in; }
</style>
