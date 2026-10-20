<script setup lang="ts">
/**
 * The full-screen viewer itself: a modal dialog over the page with one picture, its caption, a counter, and
 * buttons for close, previous, next and zoom. The other components of this unit open it; a host does not use it
 * on its own.
 *
 * While it is open: the page behind is inert and does not scroll (body fixed at its scroll position, restored on
 * close), Tab stays inside, Escape closes from anywhere (also after a click on the picture), the arrow keys move
 * through a set, + - 0 zoom, a finger swipes between pictures (left, right) or closes (down), two fingers pinch,
 * a double tap or double click zooms, and a zoomed picture is dragged. Every gesture has a button or a key.
 *
 * Props: `items`, `index`, `words`, `showCaption`, `maxZoom`. Emits `close` and `update:index`.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  DOUBLE_TAP_ZOOM, ZOOM_STEP, clamp, clampPan, isDoubleTap, isTap, pinchScale, readSwipe, stepIndex, zoomAround,
} from "./lightboxCore";
import type { LightboxItem, LightboxWords } from "./types";

const props = defineProps<{
  items: LightboxItem[];
  index: number;
  words: LightboxWords;
  showCaption: boolean;
  maxZoom: number;
}>();
const emit = defineEmits<{ (e: "close"): void; (e: "update:index", v: number): void }>();

const root = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const imgEl = ref<HTMLImageElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);

// The index is held here too, so two quick key presses before the parent re-renders both count.
const cur = ref(props.index);
watch(() => props.index, (v) => { cur.value = v; });
const item = computed(() => props.items[cur.value]!);
const total = computed(() => props.items.length);
const multi = computed(() => total.value > 1);
// ---- loading the picture: a cue while it loads, the page's own picture if the original fails ---------------------
const shownSrc = ref("");
const status = ref<"loading" | "ready" | "failed">("loading");
const usedFallback = ref(false);
function startLoad(): void {
  shownSrc.value = item.value.src;
  status.value = "loading";
  usedFallback.value = false;
  void nextTick(checkCached);
}
/** A picture that finished before Vue's listener was on it (the cache) fires no event; read its state instead. */
function checkCached(): void {
  const i = imgEl.value;
  if (!i || status.value !== "loading" || !i.complete) return;
  if (i.naturalWidth > 0) onLoaded(); else onFailed();
}
function onLoaded(): void { if (status.value === "loading") status.value = "ready"; }
function onFailed(): void {
  const fb = item.value.fallback;
  if (fb && !usedFallback.value && fb !== shownSrc.value) {
    usedFallback.value = true;
    shownSrc.value = fb;
    status.value = "loading";
    void nextTick(checkCached);
  } else {
    status.value = "failed";
  }
}
watch(item, startLoad, { immediate: true });
const captionText = computed(() => (props.showCaption ? item.value.caption : ""));
// The caption repeats the alt text the picture already carries; a screen reader should hear it once.
const captionDuplicatesAlt = computed(() => item.value.caption === item.value.alt);

// ---- zoom and pan -------------------------------------------------------------------------------------------
const scale = ref(1);
const tx = ref(0);
const ty = ref(0);
const dragging = ref(false);
const imgStyle = computed(() => ({ transform: `translate3d(${tx.value}px, ${ty.value}px, 0) scale(${scale.value})` }));
const atMin = computed(() => scale.value <= 1.001);
const atMax = computed(() => scale.value >= props.maxZoom - 0.001);

function sizes() {
  const i = imgEl.value;
  const s = stage.value;
  return { iw: i?.offsetWidth ?? 0, ih: i?.offsetHeight ?? 0, bw: s?.clientWidth ?? 0, bh: s?.clientHeight ?? 0 };
}
function setView(next: number, nx: number, ny: number): void {
  const s = clamp(next, 1, props.maxZoom);
  const { iw, ih, bw, bh } = sizes();
  const c = s === 1 ? { tx: 0, ty: 0 } : clampPan(s, nx, ny, iw, ih, bw, bh);
  scale.value = s;
  tx.value = c.tx;
  ty.value = c.ty;
}
function resetView(): void { setView(1, 0, 0); }
/** Zoom to `next`, keeping the point (px, py), in viewport pixels, where it is; with no point, the centre. */
/** The picture's centre as laid out, before pan and scale (scaling is about the centre, so only the pan moves it). */
function layoutCentre(): { x: number; y: number } {
  const r = imgEl.value?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2 - tx.value, y: r.top + r.height / 2 - ty.value } : { x: 0, y: 0 };
}
function zoomTo(next: number, px?: number, py?: number): void {
  const l = layoutCentre();
  const ox = px === undefined ? 0 : px - l.x;
  const oy = py === undefined ? 0 : py - l.y;
  const z = zoomAround(scale.value, tx.value, ty.value, clamp(next, 1, props.maxZoom), ox, oy);
  setView(z.scale, z.tx, z.ty);
}
const zoomIn = () => zoomTo(scale.value * ZOOM_STEP);
const zoomOut = () => zoomTo(scale.value / ZOOM_STEP);

// ---- moving through the set -----------------------------------------------------------------------------------
function go(dir: -1 | 1): void {
  const next = stepIndex(cur.value, total.value, dir);
  if (next === cur.value) return;
  cur.value = next;
  resetView();
  emit("update:index", next);
}

/** A button that has just turned itself off (the last picture, full zoom) would drop focus to the page; keep it in the dialog. */
async function keepFocus(): Promise<void> {
  await nextTick();
  const a = document.activeElement as HTMLElement | null;
  if (!a || a === document.body || (a as HTMLButtonElement).disabled) closeBtn.value?.focus();
}
const act = (fn: () => void) => () => { fn(); void keepFocus(); };

// ---- keys -----------------------------------------------------------------------------------------------------
function focusables(): HTMLElement[] {
  return [...(root.value?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
}
function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const zoomed = !atMin.value;
  switch (e.key) {
    case "Escape": e.preventDefault(); emit("close"); return;
    case "Tab": {
      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      // Tab is moved by hand, so the trap is the same in every engine (Safari's default skips buttons, and would let focus leave).
      const at = f.indexOf(document.activeElement as HTMLElement);
      const to = at === -1 ? (e.shiftKey ? f.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + f.length) % f.length;
      e.preventDefault();
      f[to]!.focus();
      return;
    }
    case "ArrowLeft": case "ArrowRight": {
      const d = e.key === "ArrowLeft" ? -1 : 1;
      e.preventDefault();
      if (zoomed) setView(scale.value, tx.value - d * 40, ty.value);
      else go(d);
      return;
    }
    case "ArrowUp": case "ArrowDown":
      if (zoomed) { e.preventDefault(); setView(scale.value, tx.value, ty.value + (e.key === "ArrowUp" ? 40 : -40)); }
      return;
    case "+": case "=": e.preventDefault(); zoomIn(); return;
    case "-": case "_": e.preventDefault(); zoomOut(); return;
    case "0": e.preventDefault(); resetView(); return;
  }
}

// ---- pointers: swipe, pinch, drag, double tap, tap on the dark edge ---------------------------------------------
const pointers = new Map<number, { x: number; y: number }>();
let press: { x: number; y: number; t: number; onEdge: boolean; moved: number } | null = null;
let pan0 = { tx: 0, ty: 0, x: 0, y: 0 };
let pinch0: { dist: number; scale: number; tx: number; ty: number; mx: number; my: number; lx: number; ly: number } | null = null;
let lastTap: { t: number; x: number; y: number } | null = null;

const dist = () => {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};
const mid = () => {
  const [a, b] = [...pointers.values()];
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
};

function onPointerDown(e: PointerEvent): void {
  try { stage.value?.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer has no capture */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragging.value = true;
  if (pointers.size === 1) {
    const onEdge = e.target === stage.value || e.target === root.value;
    press = { x: e.clientX, y: e.clientY, t: e.timeStamp, onEdge, moved: 0 };
    pan0 = { tx: tx.value, ty: ty.value, x: e.clientX, y: e.clientY };
  } else if (pointers.size === 2) {
    const m = mid();
    const l = layoutCentre();
    pinch0 = { dist: dist(), scale: scale.value, tx: tx.value, ty: ty.value, mx: m.x, my: m.y, lx: l.x, ly: l.y };
    press = null;
  }
}
function onPointerMove(e: PointerEvent): void {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2 && pinch0) {
    const next = pinchScale(pinch0.scale, pinch0.dist, dist(), props.maxZoom);
    const m = mid();
    const z = zoomAround(pinch0.scale, pinch0.tx, pinch0.ty, next, pinch0.mx - pinch0.lx, pinch0.my - pinch0.ly);
    setView(z.scale, z.tx + (m.x - pinch0.mx), z.ty + (m.y - pinch0.my));
    return;
  }
  if (!press) return;
  const dx = e.clientX - press.x;
  const dy = e.clientY - press.y;
  press.moved = Math.max(press.moved, Math.hypot(dx, dy));
  if (!atMin.value) setView(scale.value, pan0.tx + (e.clientX - pan0.x), pan0.ty + (e.clientY - pan0.y));
  else { tx.value = dx; ty.value = Math.max(0, dy); } // the picture follows the finger; it springs back unless a swipe is read
}
function onPointerUp(e: PointerEvent): void {
  if (!pointers.has(e.pointerId)) return;
  const wasPinch = pointers.size >= 2;
  pointers.delete(e.pointerId);
  try { stage.value?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  if (wasPinch) {
    pinch0 = null;
    if (atMin.value) resetView();
    const left = [...pointers.values()][0];
    if (left) pan0 = { tx: tx.value, ty: ty.value, x: left.x, y: left.y };
    press = null;
    if (!pointers.size) dragging.value = false;
    return;
  }
  dragging.value = false;
  const p = press;
  press = null;
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  const tap = isTap(e.timeStamp - p.t, p.moved);
  if (atMin.value) {
    const swipe = tap ? null : readSwipe(dx, dy, total.value);
    resetView();
    if (swipe === "close") { emit("close"); return; }
    if (swipe) { go(swipe === "next" ? 1 : -1); return; }
  }
  if (!tap) return;
  if (isDoubleTap(lastTap, e.timeStamp, e.clientX, e.clientY)) {
    lastTap = null;
    if (atMin.value) zoomTo(DOUBLE_TAP_ZOOM, e.clientX, e.clientY); else resetView();
    return;
  }
  lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
  // A tap on the dark edge closes; a tap on the picture does nothing (a double tap zooms).
  if (p.onEdge) emit("close");
}
function onPointerCancel(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (!pointers.size) { dragging.value = false; press = null; pinch0 = null; if (atMin.value) resetView(); }
}
function onWheel(e: WheelEvent): void {
  // A trackpad pinch arrives as a wheel with ctrlKey; a plain wheel does nothing (the page behind is locked).
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoomTo(scale.value * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
}

// ---- page lock, inert background, focus ------------------------------------------------------------------------
let opener: HTMLElement | null = null;
let savedBody: Partial<CSSStyleDeclaration> = {};
let scrollY = 0;
const inerted: HTMLElement[] = [];

function lockPage(): void {
  const b = document.body;
  scrollY = window.scrollY;
  const bar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  savedBody = { position: b.style.position, top: b.style.top, left: b.style.left, right: b.style.right, overflow: b.style.overflow, paddingRight: b.style.paddingRight };
  b.style.position = "fixed";
  b.style.top = `-${scrollY}px`;
  b.style.left = "0";
  b.style.right = "0";
  b.style.overflow = "hidden";
  if (bar) b.style.paddingRight = `${bar}px`; // the scrollbar's width, so nothing shifts when it disappears
  for (const c of [...b.children] as HTMLElement[]) {
    if (c === root.value || c.contains(root.value) || c.tagName === "SCRIPT" || c.hasAttribute("inert")) continue;
    c.setAttribute("inert", "");
    inerted.push(c);
  }
}
function unlockPage(): void {
  const b = document.body;
  Object.assign(b.style, savedBody);
  for (const c of inerted) c.removeAttribute("inert");
  inerted.length = 0;
  try { window.scrollTo({ top: scrollY, left: 0, behavior: "instant" as ScrollBehavior }); } catch { /* no layout here */ }
}

onMounted(async () => {
  opener = document.activeElement as HTMLElement | null;
  lockPage();
  document.addEventListener("keydown", onKey, true);
  await nextTick();
  closeBtn.value?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKey, true);
  unlockPage();
  // Back to the picture the visitor was last looking at, if it is still on the page; else to where they came from.
  const shown = props.items[cur.value]?.el;
  const target = shown && shown.isConnected ? shown : opener;
  target?.focus?.({ preventScroll: true });
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="ilb-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="words.dialog"
      tabindex="-1"
      data-lightbox-viewer
    >
      <div
        ref="stage"
        class="ilb-stage"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @wheel="onWheel"
      >
        <figure class="ilb-figure" :aria-busy="status === 'loading' ? 'true' : undefined">
          <img
            :key="shownSrc"
            ref="imgEl"
            class="ilb-img"
            :class="{ 'ilb-anim': !dragging, 'ilb-failed': status === 'failed' }"
            :src="shownSrc"
            @load="onLoaded"
            @error="onFailed"
            :alt="item.alt"
            :style="imgStyle"
            :data-zoom="scale.toFixed(2)"
            draggable="false"
          />
          <p v-if="status === 'loading'" class="ilb-status ilb-loading" role="status">{{ words.loading }}</p>
          <p v-else-if="status === 'failed'" class="ilb-status ilb-failed-note" role="status">{{ words.loadFailed }}</p>
          <figcaption v-if="captionText" class="ilb-caption" :aria-hidden="captionDuplicatesAlt ? 'true' : undefined">
            {{ captionText }}
          </figcaption>
        </figure>
      </div>

      <p v-if="multi" class="ilb-count" aria-live="polite" aria-atomic="true">{{ words.count(cur + 1, total) }}</p>

      <button ref="closeBtn" type="button" class="ilb-btn ilb-close" :aria-label="words.close" @click="emit('close')">
        <span aria-hidden="true">&times;</span>
      </button>
      <button v-if="multi" type="button" class="ilb-btn ilb-prev" :aria-label="words.previous" :disabled="cur === 0" @click="act(() => go(-1))()">
        <span aria-hidden="true">&#8249;</span>
      </button>
      <button v-if="multi" type="button" class="ilb-btn ilb-next" :aria-label="words.next" :disabled="cur === total - 1" @click="act(() => go(1))()">
        <span aria-hidden="true">&#8250;</span>
      </button>
      <div class="ilb-tools">
        <button type="button" class="ilb-btn" :aria-label="words.zoomOut" :disabled="atMin" @click="act(zoomOut)()"><span aria-hidden="true">&minus;</span></button>
        <button type="button" class="ilb-btn ilb-fit" :aria-label="words.zoomReset" :disabled="atMin" @click="act(resetView)()">{{ words.fit }}</button>
        <button type="button" class="ilb-btn" :aria-label="words.zoomIn" :disabled="atMax" @click="act(zoomIn)()"><span aria-hidden="true">+</span></button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Theme: --site-block-overlay (the dark backdrop) and --site-block-on-overlay (its text and buttons), with
   --site-block-accent for the focus ring; neutral fallbacks. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.ilb-backdrop, .ilb-backdrop * { box-sizing: border-box; }
.ilb-backdrop {
  position: fixed; inset: 0; z-index: var(--site-block-z-overlay, 1000);
  background: color-mix(in srgb, var(--site-block-overlay, #000000) 94%, transparent);
  color: var(--site-block-on-overlay, #ffffff);
  overscroll-behavior: contain; -webkit-user-select: none; user-select: none; outline: none;
}
.ilb-stage {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: 4rem 1rem 5.5rem; touch-action: none; overflow: hidden;
}
.ilb-figure { display: flex; flex-direction: column; align-items: center; max-width: 100%; max-height: 100%; margin: 0; min-height: 0; }
.ilb-img {
  display: block; flex: 0 1 auto; min-height: 0; max-width: 100%; max-height: 100%; object-fit: contain;
  transform-origin: center; will-change: transform; -webkit-user-drag: none;
}
.ilb-status {
  margin: 0.5rem 0 0; padding: 0.25rem 0.75rem; text-align: center; font-size: 0.875rem; line-height: 1.5;
  color: var(--site-block-on-overlay, #ffffff);
}
.ilb-loading::before {
  content: ""; display: inline-block; width: 0.9em; height: 0.9em; margin-right: 0.5em; vertical-align: -0.1em;
  border: 2px solid currentColor; border-right-color: transparent; border-radius: 999px;
}
@keyframes ilb-spin { to { transform: rotate(360deg); } }
.ilb-img.ilb-failed { min-width: 12rem; min-height: 6rem; }
.ilb-caption {
  flex: none; max-width: 40rem; margin-top: 0.75rem; text-align: center; font-size: 0.9375rem; line-height: 1.5;
  color: var(--site-block-on-overlay, #ffffff);
}
.ilb-count {
  position: absolute; top: max(env(safe-area-inset-top), 1rem); left: 1rem; margin: 0; min-height: 2.75rem;
  display: flex; align-items: center; font-size: 0.9375rem; font-variant-numeric: tabular-nums;
  color: var(--site-block-on-overlay, #ffffff);
}
.ilb-btn {
  display: inline-flex; align-items: center; justify-content: center; min-width: 2.75rem; height: 2.75rem; padding: 0 0.5rem;
  border: 0; border-radius: var(--site-block-radius, 0.5rem); cursor: pointer; font: inherit; font-size: 1.5rem; line-height: 1;
  color: var(--site-block-on-overlay, #ffffff);
  background: color-mix(in srgb, var(--site-block-on-overlay, #ffffff) 16%, var(--site-block-overlay, #000000));
}
.ilb-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--site-block-on-overlay, #ffffff) 28%, var(--site-block-overlay, #000000)); }
.ilb-btn:disabled { cursor: default; color: color-mix(in srgb, var(--site-block-on-overlay, #ffffff) 55%, var(--site-block-overlay, #000000)); }
.ilb-btn:focus-visible { outline: 2px solid var(--site-block-accent, #f5b942); outline-offset: 2px; }
.ilb-close { position: absolute; top: max(env(safe-area-inset-top), 1rem); right: 1rem; }
.ilb-prev, .ilb-next { position: absolute; top: 50%; transform: translateY(-50%); }
.ilb-prev { left: 0.5rem; }
.ilb-next { right: 0.5rem; }
.ilb-tools {
  position: absolute; bottom: max(env(safe-area-inset-bottom), 1rem); left: 50%; transform: translateX(-50%);
  display: flex; gap: 0.5rem;
}
.ilb-fit { font-size: 1rem; min-width: 3.25rem; }
/* Motion: a fade on open and a glide on zoom, only for visitors who have not asked for less motion. */
@media (prefers-reduced-motion: no-preference) {
  .ilb-loading::before { animation: ilb-spin 0.8s linear infinite; }
  .ilb-backdrop { animation: ilb-fade var(--site-block-motion, 150ms) ease-out; }
  .ilb-img.ilb-anim { transition: transform var(--site-block-motion, 150ms) ease-out; }
}
@keyframes ilb-fade { from { opacity: 0; } to { opacity: 1; } }
</style>
