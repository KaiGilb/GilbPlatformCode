<script setup lang="ts">
/**
 * A website's section menu: the header button that says where you are, and a large panel that
 * takes the visitor anywhere on the site. The website counterpart of GilbPlatformCode
 * `units/section-menu` (React), with the same behaviour:
 *
 *  • Opens at once on pointer enter where the pointer can hover finely, and on click or tap
 *    everywhere. It does NOT close when the pointer leaves: it is too big for that.
 *  • The panel is always in the page (rendered on the server too), so opening is a class change.
 *    While closed it is `inert` and `aria-hidden`.
 *  • Closes with Close, Esc, a click on the dimmed edge, or any link; focus returns to the button.
 *    Focus moves into the panel on open and Tab stays inside it.
 *  • Left: the sections. Resting on one ~120 ms, or focusing it, previews its sub-pages in the next
 *    column. Each opening starts from the section you are on.
 *  • Phone (under 600 px): one column, no hover; the sub-pages shown are those of the section you are on.
 *  • Reduced motion: no transition.
 *
 * Content is data (`menu`: sections, sub-pages, places, a call to action); nothing here is a page of
 * any one site. Theme: the `--section-menu-*` CSS variables, which the site maps to its own tokens.
 *
 * Source: myjackfruit-web components/MegaMenu.vue + SiteHeader.vue (Nuxt 3), brought to the app
 * menu's behaviour (GilbApp src/components/menu/SectionMenu.tsx at 0f0f1b7).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch, type Component } from "vue";
import { currentSectionId, normalisePath, placesFor, type WebMenu, type WebMenuLink, type WebMenuSection } from "./menu";
import { DEFAULT_WEB_LABELS, HOVER_CLICK_GRACE_MS, HOVER_INTENT_MS, type WebMenuLabels } from "./labels";

const props = withDefaults(
  defineProps<{
    /** The site's menu. */
    menu: WebMenu;
    /** The current route's path; it decides "You are here". */
    currentPath: string;
    /** Draws a link to a route of the site, given `to`. Nuxt: `resolveComponent('NuxtLink')`. Default: a plain `<a href>`. */
    linkComponent?: Component | string;
    /** Every word the menu draws. English by default. */
    labels?: Partial<WebMenuLabels>;
  }>(),
  { linkComponent: "a", labels: () => ({}) },
);

const emit = defineEmits<{
  /** The visitor chose a link (the menu has closed; the link itself navigates). */
  (e: "navigate", link: WebMenuLink): void;
  /** The menu opened or closed. */
  (e: "open-change", open: boolean): void;
}>();

const L = computed<WebMenuLabels>(() => ({ ...DEFAULT_WEB_LABELS, ...props.labels }));

const currentId = computed(() => currentSectionId(props.menu, props.currentPath));
const currentSection = computed(() => props.menu.sections.find((s) => s.id === currentId.value));
const hasSubPages = computed(() => props.menu.sections.some((s) => (s.links ?? []).length > 0));

const open = ref(false);
const preview = ref<string | undefined>(undefined);
const compact = ref(false);
const triggerEl = ref<HTMLButtonElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const panelId = `section-menu-${useId()}`;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
// When the pointer's enter opened the menu, the click that usually follows must not close it.
let hoverOpenedAt = 0;

const shown = computed<WebMenuSection | undefined>(() => {
  if (compact.value) return currentSection.value;
  return props.menu.sections.find((s) => s.id === preview.value) ?? currentSection.value;
});
const previewing = computed(() => !!shown.value && shown.value.id !== currentId.value);
const shownPlaces = computed(() => (shown.value ? placesFor(shown.value, props.menu.places) : []));

function clearHover() {
  if (hoverTimer !== null) clearTimeout(hoverTimer);
  hoverTimer = null;
}

function show() {
  // Each opening starts from where you are.
  preview.value = currentId.value;
  open.value = true;
}

function close(restoreFocus = true) {
  clearHover();
  open.value = false;
  if (restoreFocus) triggerEl.value?.focus({ preventScroll: true });
}

function canHoverOpen(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
}

function onTriggerPointerEnter(e: PointerEvent) {
  if (e.pointerType === "mouse" && canHoverOpen() && !open.value) {
    hoverOpenedAt = Date.now();
    show();
  }
}

function onTriggerClick() {
  // The click that follows a hover-open keeps it open; a later click closes it.
  if (open.value && Date.now() - hoverOpenedAt < HOVER_CLICK_GRACE_MS) return;
  if (open.value) close();
  else show();
}

function choose(link: WebMenuLink) {
  // The link's own default action navigates; the menu only closes. Focus is not pulled back to the
  // button, because the page is about to change under it.
  close(false);
  emit("navigate", link);
}

// --- The Tab order, as the app menu's: Close, then every section, each followed (when it is previewed)
// by its sub-pages and places, then the call to action. The DOM order cannot say "sub-pages after the
// previewed section" (they sit in the next column), so the trap computes the order.
function focusables(): HTMLElement[] {
  const p = panelEl.value;
  if (!p) return [];
  const usable = (root: ParentNode | null) =>
    Array.from(root?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]):not([aria-disabled='true'])") ?? []);
  const closeBtn = p.querySelector<HTMLElement>("[data-testid='section-menu-close']");
  const shownList = Array.from(p.querySelectorAll<HTMLElement>("[data-list-for]")).find((el) => el.getAttribute("data-list-for") === shown.value?.id) ?? null;
  const here = usable(shownList);
  const placeLinks = usable(p.querySelector("[data-testid='section-menu-places']"));
  const shownId = p.querySelector<HTMLElement>("[data-previewing='true']")?.getAttribute("data-section");
  const order: HTMLElement[] = closeBtn ? [closeBtn] : [];
  for (const sec of Array.from(p.querySelectorAll<HTMLElement>("[data-section]"))) {
    order.push(sec);
    if (sec.getAttribute("data-section") === shownId) order.push(...here, ...placeLinks);
  }
  const cta = p.querySelector<HTMLElement>("[data-testid='section-menu-cta']");
  if (cta) order.push(cta);
  return order;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    close();
    return;
  }
  if (e.key !== "Tab") return;
  const els = focusables();
  if (els.length === 0) return;
  e.preventDefault();
  const active = document.activeElement as HTMLElement | null;
  const i = active ? els.indexOf(active) : -1;
  if (i === -1) {
    els[0]!.focus();
    return;
  }
  (e.shiftKey ? els[(i - 1 + els.length) % els.length]! : els[(i + 1) % els.length]!).focus();
}

function sectionEl(id: string): HTMLElement | undefined {
  return Array.from(panelEl.value?.querySelectorAll<HTMLElement>("[data-section]") ?? []).find((el) => el.getAttribute("data-section") === id);
}

// Up/Down/Home/End move between sections (focus previews, as the pointer's rest does); Right goes into
// the previewed sub-pages and Left comes back. Tab alone reaches everything too.
function onSectionKey(e: KeyboardEvent, s: WebMenuSection) {
  const list = props.menu.sections;
  const i = list.findIndex((x) => x.id === s.id);
  const to =
    e.key === "ArrowDown" ? list[(i + 1) % list.length]
    : e.key === "ArrowUp" ? list[(i - 1 + list.length) % list.length]
    : e.key === "Home" ? list[0]
    : e.key === "End" ? list[list.length - 1]
    : undefined;
  if (to) {
    e.preventDefault();
    preview.value = to.id;
    sectionEl(to.id)?.focus();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    Array.from(panelEl.value?.querySelectorAll<HTMLElement>("[data-list-for]") ?? [])
      .find((el) => el.getAttribute("data-list-for") === shown.value?.id)
      ?.querySelector<HTMLElement>("[data-option]")
      ?.focus();
  }
}

function onOptionKey(e: KeyboardEvent) {
  const el = e.currentTarget as HTMLElement;
  const items = Array.from(el.parentElement?.parentElement?.querySelectorAll<HTMLElement>("[data-option]") ?? []);
  const i = items.indexOf(el);
  if (e.key === "ArrowLeft" && shown.value) {
    e.preventDefault();
    sectionEl(shown.value.id)?.focus();
  } else if (e.key === "ArrowDown" && i < items.length - 1) {
    e.preventDefault();
    items[i + 1]!.focus();
  } else if (e.key === "ArrowUp" && i > 0) {
    e.preventDefault();
    items[i - 1]!.focus();
  }
}

function onSectionEnter(s: WebMenuSection) {
  if (compact.value) return;
  clearHover();
  hoverTimer = setTimeout(() => (preview.value = s.id), HOVER_INTENT_MS);
}

function onSectionFocus(s: WebMenuSection) {
  if (!compact.value) preview.value = s.id;
}

/** The attributes that make a link go where it should: a route through the host's link component, an address as a plain link. */
function linkAttrs(link: { to?: string; href?: string; newTab?: boolean }) {
  if (link.href) return { href: link.href, ...(link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {}) };
  if (props.linkComponent === "a") return { href: link.to };
  return { to: link.to };
}
function linkTag(link: { to?: string; href?: string }) {
  return link.href ? "a" : props.linkComponent;
}

let compactQuery: MediaQueryList | undefined;
const onCompactChange = () => (compact.value = !!compactQuery?.matches);

watch(open, (isOpen) => {
  emit("open-change", isOpen);
  if (typeof document === "undefined") return;
  if (isOpen) {
    document.addEventListener("keydown", onKeydown);
    // Focus lands on the section you are on, so arrows and Tab start from "You are here".
    void nextTick(() => {
      const here = panelEl.value?.querySelector<HTMLElement>("[data-current='true']");
      (here ?? focusables()[0])?.focus({ preventScroll: true });
    });
  } else {
    document.removeEventListener("keydown", onKeydown);
  }
});

// A route change closes the menu (a link in the page, the back button).
watch(
  () => normalisePath(props.currentPath),
  () => {
    if (open.value) close(false);
  },
);

onMounted(() => {
  // The phone width is the size-class unit's: compact under 600 px.
  compactQuery = window.matchMedia?.("(max-width: 599.98px)");
  onCompactChange();
  compactQuery?.addEventListener?.("change", onCompactChange);
});

onBeforeUnmount(() => {
  clearHover();
  document.removeEventListener("keydown", onKeydown);
  compactQuery?.removeEventListener?.("change", onCompactChange);
});

defineExpose({ show, close });
</script>

<template>
  <button
    ref="triggerEl"
    type="button"
    class="sm-trigger"
    :class="{ 'is-open': open }"
    aria-haspopup="dialog"
    :aria-expanded="open ? 'true' : 'false'"
    :aria-controls="panelId"
    :aria-label="L.trigger(currentSection?.label ?? L.menu)"
    data-testid="section-menu-trigger"
    @pointerenter="onTriggerPointerEnter"
    @click="onTriggerClick"
  >
    <span class="sm-trigger-label" data-testid="section-menu-trigger-label">{{ currentSection?.label ?? L.menu }}</span>
    <svg class="sm-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>

  <!-- The dimmed edge, below the header so the header stays readable; a click goes back. -->
  <div class="sm-scrim" :class="{ 'is-open': open }" aria-hidden="true" data-testid="section-menu-scrim" @click="close()" />

  <!-- Always mounted (also in the server's HTML), so opening is a class change and nothing more. -->
  <div
    :id="panelId"
    ref="panelEl"
    class="sm-panel"
    :class="{ 'is-open': open, 'is-single': !hasSubPages }"
    role="dialog"
    aria-modal="true"
    :aria-label="L.goTo"
    :aria-hidden="open ? 'false' : 'true'"
    :inert="open ? undefined : true"
    data-testid="section-menu-panel"
    :data-open="open ? 'true' : 'false'"
  >
    <div class="sm-head">
      <span class="sm-kicker">{{ L.goTo }}</span>
      <button type="button" class="sm-close" data-testid="section-menu-close" @click="close()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
        {{ L.close }}
      </button>
    </div>

    <div class="sm-body">
      <div class="sm-col sm-sections" @mouseleave="clearHover">
        <h3 class="sm-heading">{{ L.sections }}</h3>
        <div role="group" :aria-label="L.sectionsGroup" data-testid="section-menu-sections" class="sm-list">
          <template v-for="s in menu.sections" :key="s.id">
            <span
              v-if="s.coming"
              class="sm-item sm-section is-coming"
              :data-section="s.id"
              aria-disabled="true"
            >
              <span class="sm-section-label">{{ s.label }}</span>
              <span class="sm-coming">{{ L.coming }}</span>
              <span v-if="s.description" class="sm-desc">{{ s.description }}</span>
            </span>
            <component
              :is="s.to || s.href ? linkTag(s) : 'button'"
              v-else
              v-bind="s.to || s.href ? linkAttrs(s) : { type: 'button' }"
              class="sm-item sm-section"
              :class="{ 'is-current': s.id === currentId, 'is-preview': !compact && previewing && s.id === shown?.id }"
              :data-section="s.id"
              :data-current="s.id === currentId ? 'true' : undefined"
              :data-previewing="s.id === shown?.id ? 'true' : undefined"
              :aria-current="s.id === currentId ? 'page' : undefined"
              @mouseenter="onSectionEnter(s)"
              @focus="onSectionFocus(s)"
              @keydown="onSectionKey($event, s)"
              @click="s.to || s.href ? choose(s) : undefined"
            >
              <span class="sm-section-label">{{ s.label }}</span>
              <span v-if="s.id === currentId" class="sm-here" data-testid="section-menu-here-tag">{{ L.here }}</span>
              <span v-if="s.description" class="sm-desc">{{ s.description }}</span>
            </component>
          </template>
        </div>
      </div>

      <div v-if="hasSubPages" class="sm-col" data-testid="section-menu-here">
        <template v-if="shown">
          <h3 class="sm-heading">
            {{ L.inSection(shown.label) }}
            <span v-if="previewing" class="sm-hint">{{ L.previewHint(shown.label) }}</span>
          </h3>
          <!-- Every section's pages are in the page (so the server's HTML links them all, and a crawler
               finds them); only the shown section's list is visible. -->
          <ul
            v-for="list in menu.sections.filter((x) => (x.links ?? []).length)"
            v-show="list.id === shown.id"
            :key="list.id"
            class="sm-options"
            :data-list-for="list.id"
          >
            <li v-for="o in list.links" :key="o.id">
              <span v-if="o.coming" class="sm-item sm-option is-coming" :data-option="o.id" aria-disabled="true">
                <span class="sm-option-label">{{ o.label }} <span class="sm-coming">{{ L.coming }}</span></span>
                <span v-if="o.description" class="sm-desc">{{ o.description }}</span>
              </span>
              <component
                :is="linkTag(o)"
                v-else
                v-bind="linkAttrs(o)"
                class="sm-item sm-option"
                :data-option="o.id"
                @keydown="onOptionKey"
                @click="choose(o)"
              >
                <span class="sm-option-label">{{ o.label }}<span v-if="o.href && o.newTab" aria-hidden="true"> ↗</span></span>
                <span v-if="o.description" class="sm-desc">{{ o.description }}</span>
              </component>
            </li>
          </ul>
          <p v-if="!(shown.links ?? []).length && shown.description" class="sm-desc sm-only-desc">{{ shown.description }}</p>
        </template>
      </div>

      <div v-if="shownPlaces.length" class="sm-col" data-testid="section-menu-places">
        <h3 class="sm-heading">{{ L.alsoUseful }}</h3>
        <ul class="sm-options">
          <li v-for="o in shownPlaces" :key="o.id">
            <component :is="linkTag(o)" v-bind="linkAttrs(o)" class="sm-item sm-option" :data-option="o.id" @keydown="onOptionKey" @click="choose(o)">
              <span class="sm-option-label">{{ o.label }}<span v-if="o.href && o.newTab" aria-hidden="true"> ↗</span></span>
              <span v-if="o.description" class="sm-desc">{{ o.description }}</span>
            </component>
          </li>
        </ul>
      </div>
    </div>

    <div class="sm-foot">
      <span class="sm-foot-hint">{{ L.hint }}</span>
      <component
        :is="linkTag(menu.cta)"
        v-if="menu.cta"
        v-bind="linkAttrs(menu.cta)"
        class="sm-cta"
        data-testid="section-menu-cta"
        @click="choose({ id: 'cta', ...menu.cta })"
      >{{ menu.cta.label }}</component>
    </div>
  </div>
</template>

<style scoped>
/* Theme: every colour, radius and layer is a --section-menu-* variable the site maps to its own
   tokens; the fallbacks are neutral. Widths are the size-class unit's: compact under 600 px, medium
   600-839 px, expanded from 840 px. */
.sm-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 44px;
  padding: 0 0.6rem 0 0.75rem;
  border: 1px solid var(--section-menu-line, rgb(0 0 0 / 0.12));
  border-radius: var(--section-menu-radius, 10px);
  background: var(--section-menu-surface, #fff);
  color: var(--section-menu-fg, #1a1a1a);
  font: inherit;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
.sm-trigger:hover { border-color: var(--section-menu-accent, #2563eb); }
.sm-trigger.is-open {
  border-color: var(--section-menu-accent, #2563eb);
  background: color-mix(in srgb, var(--section-menu-accent, #2563eb) 12%, var(--section-menu-surface, #fff));
}
.sm-chevron { color: var(--section-menu-muted, #6b7280); transition: transform 0.15s ease; }
.sm-trigger.is-open .sm-chevron { transform: rotate(180deg); }

.sm-scrim {
  position: fixed;
  inset: var(--section-menu-top, 4rem) 0 0 0;
  z-index: var(--section-menu-z-scrim, 100);
  background: color-mix(in srgb, var(--section-menu-fg, #1a1a1a) 38%, transparent);
  opacity: 0;
  pointer-events: none;
}
.sm-scrim.is-open { opacity: 1; pointer-events: auto; }

.sm-panel {
  position: fixed;
  top: calc(var(--section-menu-top, 4rem) + 0.5rem);
  left: 1.5rem;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: var(--section-menu-z-panel, 101);
  display: flex;
  flex-direction: column;
  border-radius: calc(var(--section-menu-radius, 10px) * 2);
  background: var(--section-menu-surface, #fff);
  color: var(--section-menu-fg, #1a1a1a);
  box-shadow: var(--section-menu-shadow, 0 24px 70px rgb(0 0 0 / 0.18), 0 4px 14px rgb(0 0 0 / 0.1));
  opacity: 0;
  transform: translateY(-6px);
  pointer-events: none;
  transition: opacity 90ms ease, transform 90ms ease;
}
.sm-panel.is-open { opacity: 1; transform: none; pointer-events: auto; }

.sm-head { display: flex; align-items: center; padding: 1rem 1.5rem 0.4rem; }
.sm-kicker, .sm-heading {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--section-menu-muted, #6b7280);
}
.sm-close {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 44px;
  padding: 0 1rem;
  border: 0;
  border-radius: 999px;
  background: var(--section-menu-soft, rgb(0 0 0 / 0.05));
  color: var(--section-menu-fg, #1a1a1a);
  font: inherit;
  cursor: pointer;
}

.sm-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 2.25rem;
  padding: 0 2rem 1rem;
  grid-template-columns: minmax(280px, 1.15fr) minmax(0, 1fr) minmax(0, 1fr);
}
.sm-panel.is-single .sm-body { grid-template-columns: minmax(280px, 1fr) minmax(0, 1fr); }
.sm-sections { border-right: 1px solid var(--section-menu-line, rgb(0 0 0 / 0.12)); padding-right: 1.75rem; }
.sm-heading { margin: 0.9rem 0 0.6rem; }
.sm-hint {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
  color: var(--section-menu-accent, #2563eb);
}
.sm-list { display: grid; gap: 0.15rem; }
.sm-options { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.15rem; }

.sm-item {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 0.6rem 0.75rem;
  border: 1px solid transparent;
  border-radius: calc(var(--section-menu-radius, 10px) + 4px);
  background: transparent;
  color: inherit;
  text-align: left;
  text-decoration: none;
  font: inherit;
  cursor: pointer;
  outline: none;
}
.sm-item:hover, .sm-item:focus-visible { background: var(--section-menu-soft, rgb(0 0 0 / 0.05)); }
.sm-item:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--section-menu-accent, #2563eb) 45%, transparent); }
.sm-item.is-current {
  border-color: var(--section-menu-accent, #2563eb);
  background: color-mix(in srgb, var(--section-menu-accent, #2563eb) 12%, transparent);
}
.sm-item.is-preview { border-color: var(--section-menu-line, rgb(0 0 0 / 0.12)); background: var(--section-menu-soft, rgb(0 0 0 / 0.05)); }
.sm-item.is-coming { opacity: 0.55; cursor: default; }
.sm-item.is-coming:hover { background: transparent; }
.sm-section-label { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
.sm-option-label { display: block; font-size: 0.95rem; font-weight: 600; }
.sm-here, .sm-coming {
  margin-left: 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--section-menu-accent, #2563eb);
}
.sm-coming { color: var(--section-menu-muted, #6b7280); }
.sm-desc { display: block; margin-top: 0.15rem; font-size: 0.875rem; color: var(--section-menu-muted, #6b7280); }
.sm-only-desc { padding: 0 0.75rem; }

.sm-foot {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.5rem;
  border-top: 1px solid var(--section-menu-line, rgb(0 0 0 / 0.12));
  font-size: 0.875rem;
  color: var(--section-menu-muted, #6b7280);
}
.sm-cta {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 1.4rem;
  border-radius: var(--section-menu-radius, 10px);
  background: var(--section-menu-accent, #2563eb);
  color: var(--section-menu-on-accent, #fff);
  font-weight: 600;
  text-decoration: none;
}

/* Medium: two columns, the sections spanning both rows. */
@media (max-width: 839.98px) {
  .sm-body, .sm-panel.is-single .sm-body { grid-template-columns: 1fr 1fr; gap: 2rem; }
  .sm-sections { grid-row: span 2; }
}
/* Phone: one column, a sheet nearly the whole screen; the hint is a desktop aid. */
@media (max-width: 599.98px) {
  .sm-trigger-label { max-width: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sm-panel { left: 10px; right: 10px; bottom: 10px; border-radius: 18px; }
  .sm-head { padding: 0.75rem 0.9rem 0.25rem; }
  .sm-body, .sm-panel.is-single .sm-body { grid-template-columns: 1fr; gap: 0.25rem; padding: 0 0.9rem 0.75rem; }
  .sm-sections { border-right: 0; padding-right: 0; grid-row: auto; }
  .sm-section-label { font-size: 1.125rem; }
  .sm-foot { padding: 0.5rem 0.9rem; }
  .sm-foot-hint { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .sm-trigger, .sm-chevron, .sm-panel { transition: none; }
}
</style>
