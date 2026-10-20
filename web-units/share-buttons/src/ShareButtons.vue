<script setup lang="ts">
/**
 * A row of share links and a copy-link button. The links are plain anchors (they work with no script); the copy
 * button uses the Clipboard API and says "copied" in a polite live region that is always in the page, so a screen
 * reader announces it. Every word and the list of targets are props.
 *
 * Props: `url`, `title`, `heading?`, `shareOn?`, `copyLabel?`, `copiedText?`, `copyFailedText?`, `copyFallbackLabel?`, `newTabText?`,
 * `targets?`, `resetMs?`.
 * When the clipboard refuses or is absent, the same live region says `copyFailedText` and a read-only field with the address
 * appears with its text selected, so the visitor can copy it by hand.
 * Event: `copy(ok)`: the copy button was used and the clipboard did (true) or did not (false) take the address.
 */
import { nextTick, onBeforeUnmount, ref } from "vue";
import { copyIcon, defaultShareTargets, shareHref } from "./targets";
import type { ShareTarget } from "./types";

const props = withDefaults(
  defineProps<{
    /** The absolute address to share. */
    url: string;
    /** The page title, used as the share text. */
    title: string;
    /** A short word before the buttons. Left out when empty. */
    heading?: string;
    /** The start of each link's name: "<shareOn> <target label>". */
    shareOn?: string;
    /** The copy button's name. */
    copyLabel?: string;
    /** Said after a successful copy. */
    copiedText?: string;
    /** Said (and shown) when the clipboard could not take the address. */
    copyFailedText?: string;
    /** The name of the read-only field that shows the address when copying failed. */
    copyFallbackLabel?: string;
    /** Added to the name of a link that opens a new tab. */
    newTabText?: string;
    /** The share targets; the default is X, Facebook, WhatsApp, Reddit and email. */
    targets?: ShareTarget[];
    /** How long "copied" stays, in milliseconds. */
    resetMs?: number;
  }>(),
  {
    heading: "Share",
    shareOn: "Share on",
    copyLabel: "Copy link",
    copiedText: "Link copied",
    copyFailedText: "Could not copy. Select the link below and copy it.",
    copyFallbackLabel: "Link to copy",
    newTabText: "(opens in a new tab)",
    targets: () => defaultShareTargets,
    resetMs: 2000,
  },
);
const emit = defineEmits<{ copy: [ok: boolean] }>();

/** A link's name: "<shareOn> <label>", and the new-tab words when it opens one. */
const linkName = (t: ShareTarget): string => `${props.shareOn} ${t.label}${t.newTab === false ? "" : ` ${props.newTabText}`}`;

const copied = ref(false);
const failed = ref(false);
const field = ref<HTMLInputElement | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copyLink(): Promise<void> {
  clearTimeout(timer);
  try {
    await navigator.clipboard.writeText(props.url);
  } catch {
    // The clipboard is not available (denied, an old browser, or a page that is not secure): say so, and show the
    // address in a field with its text selected, so it can be copied by hand.
    copied.value = false;
    failed.value = true;
    emit("copy", false);
    await nextTick();
    field.value?.focus();
    field.value?.select();
    return;
  }
  failed.value = false;
  copied.value = true;
  emit("copy", true);
  timer = setTimeout(() => (copied.value = false), props.resetMs);
}
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div class="sb">
    <span v-if="heading" class="sb-heading">{{ heading }}</span>

    <a
      v-for="t in targets"
      :key="t.id"
      class="sb-btn"
      :href="shareHref(t.href, url, title)"
      :target="t.newTab === false ? undefined : '_blank'"
      :rel="t.newTab === false ? undefined : 'noopener'"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="t.icon" /></svg>
      <span class="sb-sr">{{ linkName(t) }}</span>
    </a>

    <button type="button" class="sb-btn" @click="copyLink">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="copyIcon" /></svg>
      <span class="sb-sr">{{ copyLabel }}</span>
    </button>

    <span class="sb-status" :class="{ 'sb-sr': !copied && !failed, 'sb-failed': failed }" role="status" aria-live="polite">{{ copied ? copiedText : failed ? copyFailedText : "" }}</span>

    <input v-if="failed" ref="field" class="sb-field" type="text" readonly :value="url" :aria-label="copyFallbackLabel" @focus="($event.target as HTMLInputElement).select()" />
  </div>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral fallbacks.
   Sizes are the Skalden site's former Tailwind classes written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.sb, .sb * { box-sizing: border-box; }
.sb { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
.sb-heading {
  margin-right: 0.25rem; font-size: 0.875rem; line-height: 1.25rem; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.14em; color: var(--site-block-muted, #4b5563);
}
.sb-btn {
  display: inline-flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; padding: 0;
  border-radius: 999px; cursor: pointer; text-decoration: none; font: inherit;
  color: var(--site-block-muted, #4b5563); background: transparent;
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 30%, transparent);
  transition: color var(--site-block-motion, 150ms), border-color var(--site-block-motion, 150ms);
}
.sb-btn:hover, .sb-btn:focus-visible { color: var(--site-block-accent, #b45309); border-color: var(--site-block-accent, #b45309); }
.sb-btn:focus-visible { outline: 2px solid var(--site-block-accent, #b45309); outline-offset: 2px; }
.sb-btn svg { width: 18px; height: 18px; fill: currentColor; }
.sb-status { font-size: 0.875rem; line-height: 1.25rem; color: var(--site-block-accent, #b45309); }
.sb-failed { color: var(--site-block-fg, #1a1a1a); }
.sb-field {
  flex: 1 1 100%; min-width: 0; padding: 0.5rem 0.75rem; font: inherit; font-size: 0.875rem; line-height: 1.25rem;
  color: var(--site-block-fg, #1a1a1a); background: var(--site-block-bg, #ffffff); border-radius: 0.375rem;
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 50%, transparent);
}
.sb-field:focus-visible { outline: 2px solid var(--site-block-accent, #b45309); outline-offset: 2px; }
.sb-sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
}
@media (prefers-reduced-motion: reduce) { .sb-btn { transition: none; } }
</style>
