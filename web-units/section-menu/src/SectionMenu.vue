<script setup lang="ts">
/**
 * A website's section menu: the header button that says where you are, and a large panel that
 * takes the visitor anywhere on the site. The website counterpart of GilbPlatformCode
 * `units/section-menu` (React), with the same behaviour once the page runs its JavaScript:
 *
 *  • Opens at once on pointer enter where the pointer can hover finely, and on click or tap
 *    everywhere. It does NOT close when the pointer leaves: it is too big for that.
 *  • The panel is always in the page, so opening is a class change. While closed it is `inert`.
 *  • Closes with Close, Esc, a click on the dimmed edge, or any link; focus returns to the button.
 *    Focus moves into the panel on open and Tab stays inside it.
 *  • Left: the sections. Resting on one ~120 ms, or focusing it, previews its pages in the next
 *    column. Each opening starts from the section you are on.
 *  • Phone (under 600 px): one column, no hover; the pages shown are those of the section you are on,
 *    or of a section that has no page of its own once it is tapped.
 *  • Reduced motion: no transition.
 *
 * ⚠ BEFORE THE JAVASCRIPT RUNS (or with it off), the menu still works, as plain HTML: it is a `<nav>`
 * landmark whose button is a link to the panel (`#<panel id>`); the panel opens by CSS `:target`, lists
 * every section's pages as plain links, and closes by a link back to the button. Kai-Zen's decision, 2026-10-18:
 * websites must work before hydration and with JavaScript off (search engines, first impressions).
 * The script then takes over (`enhanced`), and a panel opened by the link stays open.
 *
 * Content is data (`menu`); nothing here is a page of any one site. Theme: the `--section-menu-*`
 * CSS variables, which the site maps to its own tokens.
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

/**
 * The sections drawn. A section is never "coming" (Kai-Zen's decision, 2026-10-18); its type forbids it, and
 * one that arrives with `coming` anyway (untyped data, a CMS) is left out entirely, pages and all, so the menu
 * never links an unbuilt destination. In development the console says so.
 */
const sections = computed(() =>
  props.menu.sections.filter((s) => {
    if (!(s as { coming?: unknown }).coming) return true;
    if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
      console.warn(`[section-menu] section "${s.id}" is marked coming and is left out: a section is never coming; mark its pages instead.`);
    }
    return false;
  }),
);
const drawnMenu = computed<WebMenu>(() => ({ ...props.menu, sections: sections.value }));
const currentId = computed(() => currentSectionId(drawnMenu.value, props.currentPath));
const currentSection = computed(() => sections.value.find((s) => s.id === currentId.value));
const listed = computed(() => sections.value.filter((s) => (s.links ?? []).length > 0));
const hasSubPages = computed(() => listed.value.length > 0);

/** False in the server's HTML and until the component is mounted in the browser: the plain-HTML menu. */
const enhanced = ref(false);
const open = ref(false);
const preview = ref<string | undefined>(undefined);
const compact = ref(false);
const triggerEl = ref<HTMLElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const uid = useId();
const panelId = `section-menu-${uid}`;
const triggerId = `section-menu-trigger-${uid}`;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
// When the pointer's enter opened the menu, the click that usually follows must not close it.
let hoverOpenedAt = 0;

/** A section with pages but no page of its own: tapping it shows its pages (it has nowhere to go). */
const hasNoPage = (s: WebMenuSection) => !s.to && !s.href;

const shown = computed<WebMenuSection | undefined>(() => {
  const picked = sections.value.find((s) => s.id === preview.value);
  // On a phone only a tap on a page-less section changes what is shown; hover and focus do not.
  if (compact.value) return picked && hasNoPage(picked) ? picked : currentSection.value;
  return picked ?? currentSection.value;
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
  if (!enhanced.value) return;
  if (e.pointerType === "mouse" && canHoverOpen() && !open.value) {
    hoverOpenedAt = Date.now();
    show();
  }
}

function onTriggerClick(e: MouseEvent) {
  // Before the script runs the button is a link to the panel and the browser opens it by `:target`.
  if (!enhanced.value) return;
  e.preventDefault();
  // The click that follows a hover-open keeps it open; a later click closes it.
  if (open.value && Date.now() - hoverOpenedAt < HOVER_CLICK_GRACE_MS) return;
  if (open.value) close();
  else show();
}

function onCloseClick(e: MouseEvent) {
  if (!enhanced.value) return;
  e.preventDefault();
  close();
}

function choose(link: WebMenuLink) {
  // The link's own default action navigates; the menu closes and focus goes back to the button,
  // as in the app menu (Agent.Tester D4: choosing the page you are on left focus on the body).
  close();
  emit("navigate", link);
}

function onSectionClick(s: WebMenuSection) {
  if (hasNoPage(s)) {
    // Nowhere to go: show its pages (on a phone too, where nothing else previews).
    preview.value = s.id;
    return;
  }
  choose(s);
}

// --- The Tab order, as the app menu's: Close, then every section, each followed (when it is previewed)
// by its pages and places, then the call to action. The DOM order cannot say "pages after the
// previewed section" (they sit in the next column), so the trap computes the order.
function shownList(): HTMLElement | null {
  return Array.from(panelEl.value?.querySelectorAll<HTMLElement>("[data-list-for]") ?? []).find((el) => el.getAttribute("data-list-for") === shown.value?.id) ?? null;
}

function focusables(): HTMLElement[] {
  const p = panelEl.value;
  if (!p) return [];
  const usable = (root: ParentNode | null) =>
    Array.from(root?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]):not([aria-disabled='true'])") ?? []);
  const closeBtn = p.querySelector<HTMLElement>("[data-testid='section-menu-close']");
  const here = usable(shownList());
  const placeLinks = usable(p.querySelector("[data-testid='section-menu-places']"));
  const shownId = p.querySelector<HTMLElement>("[data-previewing='true']")?.getAttribute("data-section");
  const order: HTMLElement[] = closeBtn ? [closeBtn] : [];
  for (const sec of Array.from(p.querySelectorAll<HTMLElement>("[data-section]:not([aria-disabled='true'])"))) {
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
// the previewed pages and Left comes back. Tab alone reaches everything too.
function onSectionKey(e: KeyboardEvent, s: WebMenuSection) {
  const list = sections.value;
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
    shownList()?.querySelector<HTMLElement>("[data-option]:not([aria-disabled='true'])")?.focus();
  }
}

function onOptionKey(e: KeyboardEvent) {
  const el = e.currentTarget as HTMLElement;
  // A coming page or place is a <span> that cannot take focus, so the arrows pass over it, as in the app
  // unit (Agent.Tester round 5, D12).
  const items = Array.from(el.parentElement?.parentElement?.querySelectorAll<HTMLElement>("[data-option]:not([aria-disabled='true'])") ?? []);
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
  if (compact.value || !enhanced.value) return;
  clearHover();
  hoverTimer = setTimeout(() => (preview.value = s.id), HOVER_INTENT_MS);
}

function onSectionFocus(s: WebMenuSection) {
  if (!compact.value && enhanced.value) preview.value = s.id;
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

  // What the visitor did before the script ran is carried over, not lost (Agent.Tester D7):
  const openedByLink = window.location.hash === `#${panelId}`;
  const hadFocus = document.activeElement === triggerEl.value;
  let hovering = false;
  try {
    hovering = !!triggerEl.value?.matches(":hover");
  } catch {
    // A browser (or test DOM) that cannot answer :hover simply does not carry a hover over.
  }
  enhanced.value = true;
  if (openedByLink) {
    // The panel was opened by its link (`:target`): keep it open, now under the script, and drop the
    // fragment so the back button does not reopen it.
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    show();
  } else if (hovering && canHoverOpen()) {
    hoverOpenedAt = Date.now();
    show();
  }
  // The link became a button: keep the keyboard where it was.
  if (hadFocus) void nextTick(() => triggerEl.value?.focus({ preventScroll: true }));
});

onBeforeUnmount(() => {
  clearHover();
  document.removeEventListener("keydown", onKeydown);
  compactQuery?.removeEventListener?.("change", onCompactChange);
});

defineExpose({ show, close });
</script>

<template>
  <nav class="sm-root" :class="{ 'is-enhanced': enhanced }" :aria-label="L.navLabel" data-testid="section-menu">
    <!-- Before the script: a link that opens the panel by :target. After: a button. -->
    <component
      :is="enhanced ? 'button' : 'a'"
      :id="triggerId"
      ref="triggerEl"
      v-bind="enhanced ? { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': open ? 'true' : 'false' } : { href: `#${panelId}` }"
      class="sm-trigger"
      :class="{ 'is-open': open }"
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
    </component>

    <!-- Always in the page (also in the server's HTML). Closed: hidden; after the script, also `inert`. -->
    <div
      :id="panelId"
      ref="panelEl"
      class="sm-panel"
      :class="{ 'is-open': open, 'is-single': !hasSubPages }"
      role="dialog"
      :aria-modal="enhanced ? 'true' : undefined"
      :aria-label="L.goTo"
      :aria-hidden="enhanced ? (open ? 'false' : 'true') : undefined"
      :inert="enhanced && !open ? true : undefined"
      data-testid="section-menu-panel"
      :data-open="open ? 'true' : 'false'"
    >
      <div class="sm-head">
        <span class="sm-kicker">{{ L.goTo }}</span>
        <!-- Before the script: a link back to the button, which ends :target. After: a button. -->
        <component
          :is="enhanced ? 'button' : 'a'"
          v-bind="enhanced ? { type: 'button' } : { href: `#${triggerId}` }"
          class="sm-close"
          data-testid="section-menu-close"
          @click="onCloseClick"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
          {{ L.close }}
        </component>
      </div>

      <div class="sm-body">
        <div class="sm-col sm-sections" @mouseleave="clearHover">
          <h2 class="sm-heading">{{ L.sections }}</h2>
          <div role="group" :aria-label="L.sectionsGroup" data-testid="section-menu-sections" class="sm-list">
            <!-- A section is never "coming" (as in the app unit; Kai-Zen's decision, 2026-10-18): only pages and places may be.
                 One that arrives with `coming` anyway (untyped data) is left out entirely: see `sections`. -->
            <template v-for="s in sections" :key="s.id">
              <component
                :is="hasNoPage(s) ? 'button' : linkTag(s)"
                v-bind="hasNoPage(s) ? { type: 'button' } : linkAttrs(s)"
                class="sm-item sm-section"
                :class="{ 'is-current': s.id === currentId, 'is-preview': previewing && s.id === shown?.id }"
                :data-section="s.id"
                :data-current="s.id === currentId ? 'true' : undefined"
                :data-previewing="s.id === shown?.id ? 'true' : undefined"
                :aria-current="s.id === currentId ? 'page' : undefined"
                @mouseenter="onSectionEnter(s)"
                @focus="onSectionFocus(s)"
                @keydown="onSectionKey($event, s)"
                @click="onSectionClick(s)"
              >
                <span class="sm-section-label">{{ s.label }}</span>
                <span v-if="s.id === currentId" class="sm-here" data-testid="section-menu-here-tag">{{ L.here }}</span>
                <span v-if="s.description" class="sm-desc">{{ s.description }}</span>
              </component>
            </template>
          </div>
        </div>

        <div v-if="hasSubPages" class="sm-col" data-testid="section-menu-here">
          <h2 v-if="shown" class="sm-heading sm-here-heading">
            {{ L.inSection(shown.label) }}
            <span v-if="previewing" class="sm-hint">{{ L.previewHint(shown.label) }}</span>
          </h2>
          <!-- Every section's pages are in the page. After the script only the shown section's list is
               visible; before it (or with it off) all lists show, each under its section's name. -->
          <div
            v-for="list in listed"
            :key="list.id"
            class="sm-group"
            :class="{ 'is-shown': list.id === shown?.id }"
            :data-list-for="list.id"
          >
            <h3 class="sm-heading sm-list-title">{{ list.label }}</h3>
            <ul class="sm-options">
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
          </div>
          <p v-if="shown && !(shown.links ?? []).length && shown.description" class="sm-desc sm-only-desc">{{ shown.description }}</p>
        </div>

        <div v-if="shownPlaces.length" class="sm-col" data-testid="section-menu-places">
          <h2 class="sm-heading">{{ L.alsoUseful }}</h2>
          <ul class="sm-options">
            <li v-for="o in shownPlaces" :key="o.id">
              <span v-if="o.coming" class="sm-item sm-option is-coming" :data-option="o.id" aria-disabled="true">
                <span class="sm-option-label">{{ o.label }} <span class="sm-coming">{{ L.coming }}</span></span>
                <span v-if="o.description" class="sm-desc">{{ o.description }}</span>
              </span>
              <component :is="linkTag(o)" v-else v-bind="linkAttrs(o)" class="sm-item sm-option" :data-option="o.id" @keydown="onOptionKey" @click="choose(o)">
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

    <!-- The dimmed edge, below the header so the header stays readable; a click goes back. Before the
         script it is a link back to the button (shown by :target with the panel), named "Close" so no
         page carries a nameless link (Agent.Tester round 2, D8: the starter's link check flagged it). -->
    <component
      :is="enhanced ? 'div' : 'a'"
      v-bind="enhanced ? {} : { href: `#${triggerId}`, tabindex: '-1', 'aria-label': L.close, title: L.close }"
      class="sm-scrim"
      :class="{ 'is-open': open }"
      aria-hidden="true"
      data-testid="section-menu-scrim"
      @click="close()"
    />
  </nav>
</template>

<style scoped>
/* Theme: every colour, radius and layer is a --section-menu-* variable the site maps to its own
   tokens; the fallbacks are neutral. Widths are the size-class unit's: compact under 600 px, medium
   600-839 px, expanded from 840 px. */
.sm-root { display: inline-flex; align-items: center; }
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
  text-decoration: none;
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
  /* Closed: out of sight, out of the tab order and the accessibility tree (visibility), before the
     script as after it. Opening is instant; closing fades, then hides. */
  visibility: hidden;
  opacity: 0;
  transform: translateY(-6px);
  pointer-events: none;
  transition: opacity 90ms ease, transform 90ms ease, visibility 0s linear 90ms;
}
/* Open: by the script (.is-open), or, before the script, by its link (:target). */
.sm-panel.is-open,
.sm-root:not(.is-enhanced) .sm-panel:target {
  visibility: visible;
  opacity: 1;
  transform: none;
  pointer-events: auto;
  transition: opacity 90ms ease, transform 90ms ease, visibility 0s;
}
.sm-panel.is-open ~ .sm-scrim,
.sm-root:not(.is-enhanced) .sm-panel:target ~ .sm-scrim { opacity: 1; pointer-events: auto; }

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
  text-decoration: none;
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
  color: var(--section-menu-accent-text, color-mix(in srgb, var(--section-menu-accent, #2563eb) 75%, var(--section-menu-fg, #1a1a1a)));
}
.sm-list { display: grid; gap: 0.15rem; }
.sm-options { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.15rem; }

/* Before the script every section's pages show, each under its name; after it, only the shown list. */
.sm-root.is-enhanced .sm-group:not(.is-shown) { display: none; }
.sm-root.is-enhanced .sm-list-title { display: none; }
.sm-root:not(.is-enhanced) .sm-here-heading { display: none; }

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
}
/* Accent text darkened toward the ink, so it clears WCAG AA 4.5:1 on the current section's accent tint
   (Agent.Tester D1: the plain accent gave 4.36:1). A site may set --section-menu-accent-text itself. */
.sm-here { color: var(--section-menu-accent-text, color-mix(in srgb, var(--section-menu-accent, #2563eb) 75%, var(--section-menu-fg, #1a1a1a))); }
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
/* Esc works only with the script. */
.sm-root:not(.is-enhanced) .sm-foot-hint { visibility: hidden; }
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
  .sm-trigger, .sm-chevron, .sm-panel, .sm-panel.is-open { transition: none; }
}
</style>
