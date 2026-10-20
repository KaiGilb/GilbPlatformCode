<script setup lang="ts">
/**
 * A language switcher: a button showing the current language's flag opens a short list of the other languages.
 * It is a disclosure (a button that shows and hides a list of links or buttons), not a listbox: the items are
 * ordinary links or buttons, reached with Tab, and the arrow keys, Home and End also move between them.
 *
 * Opening keeps focus on the button. Escape closes the list and returns focus to the button (also when focus
 * was still on the page). A click or a tap outside, or Tab out of the list, closes it. Choosing a language emits
 * `select` and closes the list; with `hrefFor` each item is a real link (so it works as a link, with the host's own
 * routing or a plain page load) and `select` is still emitted on click.
 *
 * Props: `languages`, `current`, `hrefFor?`, `buttonLabel?`, `listLabel?`, `placement?`.
 * Slot: `flag` (scoped `{ language }`) replaces the drawn flag. Event: `select(code)`.
 */
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import FlagIcon from "./FlagIcon.vue";
import { flagKeys, type LanguageOption } from "./types";

const props = withDefaults(
  defineProps<{
    languages: LanguageOption[];
    /** The code of the language the page is in now. */
    current: string;
    /** Makes each item a link: gives the address for a language code. */
    hrefFor?: (code: string) => string;
    /** The button's name; `{name}` is replaced by the current language's name. */
    buttonLabel?: string;
    /** The list's name for screen readers. */
    listLabel?: string;
    /** Which side of the button the list lines up with. */
    placement?: "end" | "start";
  }>(),
  { buttonLabel: "Language: {name}. Change language", listLabel: "Languages", placement: "end" },
);
const emit = defineEmits<{ select: [code: string] }>();

const uid = useId();
const listId = `ls-${uid}`;
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const button = ref<HTMLButtonElement | null>(null);
const list = ref<HTMLElement | null>(null);

const currentLanguage = computed(() => props.languages.find((l) => l.code === props.current) ?? props.languages[0]);
const others = computed(() => props.languages.filter((l) => l.code !== currentLanguage.value?.code));
const flagOf = (l: LanguageOption | undefined): string => l?.flag ?? l?.code ?? "";
// WCAG 2.5.3 (Label in Name): a flag without a drawing is shown as a two-letter badge of visible text, so the
// button's name must contain that text. It is put first ("AR Language: ..."), which is the order a voice-control
// user reads it in. A built-in flag is a picture with no text, so the name is the host's label alone. A host that
// fills the `flag` slot with its own text must put that text in `buttonLabel`.
const badgeText = computed(() => {
  const f = flagOf(currentLanguage.value);
  return (flagKeys as readonly string[]).includes(f) ? "" : f.slice(0, 2).toUpperCase();
});
const name = computed(() => {
  const label = props.buttonLabel.replace("{name}", currentLanguage.value?.name ?? "");
  return badgeText.value && !label.toUpperCase().startsWith(badgeText.value) ? `${badgeText.value} ${label}` : label;
});

const items = (): HTMLElement[] => Array.from(list.value?.querySelectorAll<HTMLElement>("a, button") ?? []);

function close(returnFocus: boolean): void {
  if (!open.value) return;
  open.value = false;
  if (returnFocus) void nextTick(() => button.value?.focus());
}
function toggle(): void {
  open.value = !open.value;
}
function choose(code: string): void {
  emit("select", code);
  close(true);
}

// Outside press and Tab-out close the list. Registered only while it is open.
const outside = (e: Event): void => {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
};
// Escape is heard on the document while the list is open: Safari does not focus a button on a click, so after a
// mouse open the keyboard focus is still on the page, not inside the switcher.
const escape = (e: KeyboardEvent): void => {
  if (e.key === "Escape") close(true);
};
function listen(on: boolean): void {
  const fn = on ? "addEventListener" : "removeEventListener";
  document[fn]("pointerdown", outside);
  document[fn]("focusin", outside);
  document[fn]("keydown", escape as EventListener);
}
watch(open, listen);
onBeforeUnmount(() => listen(false));

function onKeydown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement;
  if (target === button.value && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    open.value = true;
    void nextTick(() => {
      const list_ = items();
      (e.key === "ArrowDown" ? list_[0] : list_[list_.length - 1])?.focus();
    });
    return;
  }
  if (open.value && list.value?.contains(target)) {
    const list_ = items();
    const i = list_.indexOf(target);
    const go = (n: number): void => { e.preventDefault(); list_[(n + list_.length) % list_.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list_.length - 1);
  }
}
</script>

<template>
  <div v-if="currentLanguage" ref="root" class="ls" @keydown="onKeydown">
    <button
      ref="button"
      type="button"
      class="ls-button"
      :aria-label="name"
      :aria-expanded="open"
      :aria-controls="listId"
      @click="toggle"
    >
      <slot name="flag" :language="currentLanguage"><FlagIcon :flag="flagOf(currentLanguage)" /></slot>
      <svg class="ls-caret" :class="{ 'ls-caret-open': open }" width="10" height="10" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M5.5 7.5 10 12l4.5-4.5z" />
      </svg>
    </button>

    <ul v-if="open" :id="listId" ref="list" class="ls-list" :class="placement === 'start' ? 'ls-start' : 'ls-end'" :aria-label="listLabel">
      <li v-for="l in others" :key="l.code">
        <a v-if="hrefFor" class="ls-item" :href="hrefFor(l.code)" :lang="l.code" :hreflang="l.code" @click="choose(l.code)">
          <slot name="flag" :language="l"><FlagIcon :flag="flagOf(l)" /></slot>
          <span>{{ l.name }}</span>
        </a>
        <button v-else type="button" class="ls-item" :lang="l.code" @click="choose(l.code)">
          <slot name="flag" :language="l"><FlagIcon :flag="flagOf(l)" /></slot>
          <span>{{ l.name }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral fallbacks.
   Sizes are the Skalden site's former Tailwind classes written out. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.ls, .ls * { box-sizing: border-box; }
.ls { position: relative; display: inline-block; }
.ls-button {
  display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.125rem; border: 0; border-radius: 2px;
  background: transparent; color: var(--site-block-muted, #4b5563); cursor: pointer; font: inherit;
  transition: opacity var(--site-block-motion, 150ms);
}
.ls-button:hover { opacity: 0.8; }
.ls-button:focus-visible, .ls-item:focus-visible { outline: 2px solid var(--site-block-accent, #b45309); outline-offset: 2px; }
.ls-caret { transition: transform var(--site-block-motion, 150ms); }
.ls-caret-open { transform: rotate(180deg); }
.ls-list {
  position: absolute; z-index: var(--site-block-z-popover, 50); margin: 0.5rem 0 0; padding: 0; list-style: none;
  min-width: 8rem; overflow: hidden; border-radius: 0.375rem;
  background: var(--site-block-bg, #ffffff); color: var(--site-block-fg, #1a1a1a);
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 20%, transparent);
  box-shadow: 0 10px 15px -3px color-mix(in srgb, var(--site-block-fg, #1a1a1a) 14%, transparent);
}
.ls-end { right: 0; }
.ls-start { left: 0; }
.ls-item {
  display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.5rem 0.75rem; border: 0;
  background: transparent; color: inherit; font: inherit; font-size: 0.875rem; line-height: 1.25rem; text-align: left;
  text-decoration: none; cursor: pointer; transition: background-color var(--site-block-motion, 150ms);
}
.ls-item:hover { background: color-mix(in srgb, var(--site-block-muted, #4b5563) 10%, transparent); }
@media (prefers-reduced-motion: reduce) { .ls-button, .ls-caret, .ls-item { transition: none; } }
</style>
