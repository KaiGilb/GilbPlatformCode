/**
 * The full-screen viewer itself: a modal dialog over the page with one picture, its caption, a counter, and
 * buttons for close, previous, next, zoom and full screen. A React port of the Vue `LightboxViewer`; the
 * behaviour, the order of the effects, the numbers and the DOM (`ilb-*` classes, roles, `aria-*`, `data-*`)
 * are the source's.
 *
 * While it is open: the page behind is inert and does not scroll (body fixed at its scroll position, restored on
 * close), Tab stays inside, Escape closes from anywhere (also after a click on the picture), the arrow keys move
 * through a set, + - 0 zoom, f toggles full screen, a finger swipes between pictures (left, right) or closes
 * (down), two fingers pinch, a double tap or double click zooms, a zoomed picture is dragged, and a single tap on
 * the picture hides or shows the controls. Every gesture has a button or a key.
 *
 * It is drawn into `document.body` (a portal), as the Vue source teleports to body.
 */
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement,
} from "react";
import { createPortal, flushSync } from "react-dom";
import {
  DOUBLE_TAP_TIME, DOUBLE_TAP_ZOOM, MAX_ZOOM, ZOOM_STEP, clamp, clampPan, isDoubleTap, isTap, pinchScale, readSwipe,
  resolveWords, stepIndex, zoomAround,
} from "./lightboxCore";
import type { LightboxItem, LightboxWords } from "./types";

export interface PictureViewerProps {
  items: LightboxItem[];
  index: number;
  words?: Partial<LightboxWords>;
  showCaption?: boolean;
  maxZoom?: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  /** Answers the file to load for an item (for example a signed address). Without it, `item.src` is loaded. */
  resolveSrc?: (item: LightboxItem) => Promise<string>;
}

/**
 * A value that is drawn (state) and also read inside handlers that may run twice before the next render
 * (a ref kept in step). The Vue source's `ref` is both at once; this is the same.
 */
function useLive<T>(init: T | (() => T)): [{ current: T }, (v: T) => void, T] {
  const [val, setVal] = useState<T>(init);
  const ref = useRef<T>(val);
  const set = useCallback((v: T) => { ref.current = v; setVal(v); }, []);
  return [ref, set, val];
}

type Status = "loading" | "ready" | "failed";
type View = { scale: number; tx: number; ty: number };

export function PictureViewer(props: PictureViewerProps): ReactElement | null {
  const { items, showCaption = true } = props;
  const words = resolveWords(props.words);
  // The latest props, for handlers that were made in an earlier render (the document key listener, timers).
  const P = useRef(props);
  P.current = props;
  const maxZoom = () => P.current.maxZoom ?? MAX_ZOOM;

  const root = useRef<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const imgEl = useRef<HTMLImageElement | null>(null);
  const thumbEl = useRef<HTMLImageElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement | null>(null);

  // The index is held here too, so two quick key presses before the parent re-renders both count.
  const [curRef, setCur, cur] = useLive(props.index);
  useEffect(() => { setCur(props.index); }, [props.index, setCur]);
  const item = items[cur]!;
  const total = items.length;
  const multi = total > 1;
  const curItem = () => P.current.items[curRef.current]!;

  // ---- loading the picture: a cue while it loads, the page's own picture if the original fails ------------------
  const [shownRef, setShownSrc, shownSrc] = useLive<string>(() => (props.resolveSrc ? "" : items[props.index]!.src));
  const [statusRef, setStatus, status] = useLive<Status>("loading");
  const usedFallback = useRef(false);
  const [focusCheck, setFocusCheck] = useState(0);
  /** A picture that finished before React's listener was on it (the cache) fires no event; read its state instead. */
  function checkCached(): void {
    const i = imgEl.current;
    if (!i || statusRef.current !== "loading" || !i.complete) return;
    if (i.naturalWidth > 0) onLoaded(); else onFailed();
  }
  function onLoaded(): void { if (statusRef.current === "loading") setStatus("ready"); }
  function onFailed(): void {
    const fb = curItem().fallback;
    if (fb && !usedFallback.current && fb !== shownRef.current) {
      usedFallback.current = true;
      setShownSrc(fb);
      setStatus("loading");
    } else {
      setStatus("failed");
    }
  }
  // startLoad, run for the current item at once and whenever the current item changes.
  useLayoutEffect(() => {
    let live = true;
    const it = curItem();
    usedFallback.current = false;
    setStatus("loading");
    const resolve = P.current.resolveSrc;
    if (!resolve) {
      setShownSrc(it.src);
    } else {
      setShownSrc("");
      resolve(it).then((url) => { if (live) setShownSrc(url); }, () => { if (live) onFailed(); });
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, item.src, item.fallback, item.fileUri]);
  // The next tick of the source's `nextTick(checkCached)`: after the new file is on the page.
  useEffect(() => { checkCached(); }, [shownSrc, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const thumbShown = status !== "ready" && !!item.thumbSrc;
  const captionText = showCaption ? item.caption : "";
  // The caption repeats the alt text the picture already carries; a screen reader should hear it once.
  const captionDuplicatesAlt = item.caption === item.alt;

  // ---- A2: the neighbours load first ----------------------------------------------------------------------------
  const preloaded = useRef(new Set<string>());
  useEffect(() => {
    if (status !== "ready") return;
    const list = P.current.items;
    const warm = (url: string): void => { const im = new Image(); im.src = url; };
    for (const n of [list[cur - 1], list[cur + 1]]) {
      if (!n) continue;
      const key = `${n.fileUri ?? ""}|${n.src}`;
      if (preloaded.current.has(key)) continue;
      preloaded.current.add(key);
      const resolve = P.current.resolveSrc;
      if (resolve) resolve(n).then(warm, () => { /* a neighbour that cannot be fetched is fetched, or fails, when it is opened */ });
      else warm(n.src);
    }
  }, [status, cur]);

  // ---- zoom and pan -----------------------------------------------------------------------------------------------
  const view = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const [vw, setVw] = useState<View>(view.current);
  const [dragging, setDragging] = useState(false);
  const commit = (scale: number, tx: number, ty: number): void => { view.current = { scale, tx, ty }; setVw(view.current); };
  const atMinNow = (): boolean => view.current.scale <= 1.001;
  const imgStyle: CSSProperties = { transform: `translate3d(${vw.tx}px, ${vw.ty}px, 0) scale(${vw.scale})` };
  const atMin = vw.scale <= 1.001;
  const atMax = vw.scale >= (props.maxZoom ?? MAX_ZOOM) - 0.001;
  /** The element the person is looking at: the thumbnail while it stands in for the picture, else the picture. */
  const pic = (): HTMLImageElement | null => ((!!curItem().thumbSrc && statusRef.current !== "ready" && thumbEl.current) || imgEl.current);

  function sizes() {
    const i = pic();
    const s = stage.current;
    return { iw: i?.offsetWidth ?? 0, ih: i?.offsetHeight ?? 0, bw: s?.clientWidth ?? 0, bh: s?.clientHeight ?? 0 };
  }
  function setView(next: number, nx: number, ny: number): void {
    const s = clamp(next, 1, maxZoom());
    const { iw, ih, bw, bh } = sizes();
    const c = s === 1 ? { tx: 0, ty: 0 } : clampPan(s, nx, ny, iw, ih, bw, bh);
    commit(s, c.tx, c.ty);
  }
  function resetView(): void { setView(1, 0, 0); }
  /** The picture's centre as laid out, before pan and scale (scaling is about the centre, so only the pan moves it). */
  function layoutCentre(): { x: number; y: number } {
    const r = pic()?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2 - view.current.tx, y: r.top + r.height / 2 - view.current.ty } : { x: 0, y: 0 };
  }
  /** Zoom to `next`, keeping the point (px, py), in viewport pixels, where it is; with no point, the centre. */
  function zoomTo(next: number, px?: number, py?: number): void {
    const l = layoutCentre();
    const ox = px === undefined ? 0 : px - l.x;
    const oy = py === undefined ? 0 : py - l.y;
    const v = view.current;
    const z = zoomAround(v.scale, v.tx, v.ty, clamp(next, 1, maxZoom()), ox, oy);
    setView(z.scale, z.tx, z.ty);
  }
  const zoomIn = () => zoomTo(view.current.scale * ZOOM_STEP);
  const zoomOut = () => zoomTo(view.current.scale / ZOOM_STEP);

  // ---- moving through the set -------------------------------------------------------------------------------------
  function go(dir: -1 | 1): void {
    const next = stepIndex(curRef.current, P.current.items.length, dir);
    if (next === curRef.current) return;
    setCur(next);
    resetView();
    P.current.onIndexChange?.(next);
  }

  /** A button that has just turned itself off (the last picture, full zoom) would drop focus to the page; keep it in the dialog. */
  useEffect(() => {
    if (!focusCheck) return;
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body || (a as HTMLButtonElement).disabled) closeBtn.current?.focus();
  }, [focusCheck]);
  const act = (fn: () => void) => () => { fn(); setFocusCheck((n) => n + 1); };

  // ---- full screen (A1) -------------------------------------------------------------------------------------------
  const [isFull, setIsFull] = useState(false);
  const canFull = typeof document !== "undefined" && !!document.fullscreenEnabled;
  function toggleFull(): void {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) void document.exitFullscreen?.()?.catch?.(() => {});
    else void root.current?.requestFullscreen?.()?.catch?.(() => {});
  }

  // ---- A5: a tap on the picture shows or hides the controls --------------------------------------------------------
  const [hiddenRef, setHidden, hidden] = useLive(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- keys -------------------------------------------------------------------------------------------------------
  function focusables(): HTMLElement[] {
    return [...(root.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
  }
  function onKey(e: KeyboardEvent): void {
    // Any key brings the controls back, before the key is read (a hidden button cannot take focus).
    if (hiddenRef.current) flushSync(() => setHidden(false));
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const zoomed = !atMinNow();
    const v = view.current;
    switch (e.key) {
      case "Escape": e.preventDefault(); P.current.onClose(); return;
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
        if (zoomed) setView(v.scale, v.tx - d * 40, v.ty);
        else go(d);
        return;
      }
      case "ArrowUp": case "ArrowDown":
        if (zoomed) { e.preventDefault(); setView(v.scale, v.tx, v.ty + (e.key === "ArrowUp" ? 40 : -40)); }
        return;
      case "+": case "=": e.preventDefault(); zoomIn(); return;
      case "-": case "_": e.preventDefault(); zoomOut(); return;
      case "0": e.preventDefault(); resetView(); return;
      case "f": case "F":
        if (document.fullscreenEnabled) { e.preventDefault(); toggleFull(); }
        return;
    }
  }

  // ---- pointers: swipe, pinch, drag, double tap, tap on the dark edge ---------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const press = useRef<{ x: number; y: number; t: number; onEdge: boolean; moved: number } | null>(null);
  const pan0 = useRef({ tx: 0, ty: 0, x: 0, y: 0 });
  const pinch0 = useRef<{ dist: number; scale: number; tx: number; ty: number; mx: number; my: number; lx: number; ly: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const mid = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
  };

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    try { stage.current?.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer has no capture */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
    if (pointers.current.size === 1) {
      const onEdge = e.target === stage.current || e.target === root.current;
      press.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, onEdge, moved: 0 };
      pan0.current = { tx: view.current.tx, ty: view.current.ty, x: e.clientX, y: e.clientY };
    } else if (pointers.current.size === 2) {
      const m = mid();
      const l = layoutCentre();
      pinch0.current = { dist: dist(), scale: view.current.scale, tx: view.current.tx, ty: view.current.ty, mx: m.x, my: m.y, lx: l.x, ly: l.y };
      press.current = null;
    }
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>): void {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p0 = pinch0.current;
    if (pointers.current.size >= 2 && p0) {
      const next = pinchScale(p0.scale, p0.dist, dist(), maxZoom());
      const m = mid();
      const z = zoomAround(p0.scale, p0.tx, p0.ty, next, p0.mx - p0.lx, p0.my - p0.ly);
      setView(z.scale, z.tx + (m.x - p0.mx), z.ty + (m.y - p0.my));
      return;
    }
    const pr = press.current;
    if (!pr) return;
    const dx = e.clientX - pr.x;
    const dy = e.clientY - pr.y;
    pr.moved = Math.max(pr.moved, Math.hypot(dx, dy));
    if (!atMinNow()) setView(view.current.scale, pan0.current.tx + (e.clientX - pan0.current.x), pan0.current.ty + (e.clientY - pan0.current.y));
    else commit(view.current.scale, dx, Math.max(0, dy)); // the picture follows the finger; it springs back unless a swipe is read
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>): void {
    if (!pointers.current.has(e.pointerId)) return;
    const wasPinch = pointers.current.size >= 2;
    pointers.current.delete(e.pointerId);
    try { stage.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (wasPinch) {
      pinch0.current = null;
      if (atMinNow()) resetView();
      const left = [...pointers.current.values()][0];
      if (left) pan0.current = { tx: view.current.tx, ty: view.current.ty, x: left.x, y: left.y };
      press.current = null;
      if (!pointers.current.size) setDragging(false);
      return;
    }
    setDragging(false);
    const p = press.current;
    press.current = null;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const tap = isTap(e.timeStamp - p.t, p.moved);
    if (atMinNow()) {
      const swipe = tap ? null : readSwipe(dx, dy, P.current.items.length);
      resetView();
      if (swipe === "close") { P.current.onClose(); return; }
      if (swipe) { go(swipe === "next" ? 1 : -1); return; }
    }
    if (!tap) return;
    if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
    if (isDoubleTap(lastTap.current, e.timeStamp, e.clientX, e.clientY)) {
      lastTap.current = null;
      if (atMinNow()) zoomTo(DOUBLE_TAP_ZOOM, e.clientX, e.clientY); else resetView();
      return;
    }
    lastTap.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    // A tap on the dark edge closes.
    if (p.onEdge) { P.current.onClose(); return; }
    // A single tap on the picture shows or hides the controls, once the double-tap window has passed without a second tap.
    tapTimer.current = setTimeout(() => { tapTimer.current = null; setHidden(!hiddenRef.current); }, DOUBLE_TAP_TIME);
  }
  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>): void {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) { setDragging(false); press.current = null; pinch0.current = null; if (atMinNow()) resetView(); }
  }
  function onWheel(e: WheelEvent): void {
    // A trackpad pinch arrives as a wheel with ctrlKey; a plain wheel does nothing (the page behind is locked).
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomTo(view.current.scale * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
  }

  // The listeners made once at mount call the latest handlers.
  const H = useRef({ onKey, onWheel });
  H.current = { onKey, onWheel };

  // ---- page lock, inert background, focus ---------------------------------------------------------------------------
  useEffect(() => {
    const rootEl = root.current!;
    const opener = document.activeElement as HTMLElement | null;
    const b = document.body;
    const scrollY = window.scrollY;
    const bar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const savedBody: Partial<CSSStyleDeclaration> = { position: b.style.position, top: b.style.top, left: b.style.left, right: b.style.right, overflow: b.style.overflow, paddingRight: b.style.paddingRight };
    const inerted: HTMLElement[] = [];
    // lockPage
    b.style.position = "fixed";
    b.style.top = `-${scrollY}px`;
    b.style.left = "0";
    b.style.right = "0";
    b.style.overflow = "hidden";
    if (bar) b.style.paddingRight = `${bar}px`; // the scrollbar's width, so nothing shifts when it disappears
    for (const c of [...b.children] as HTMLElement[]) {
      if (c === rootEl || c.contains(rootEl) || c.tagName === "SCRIPT" || c.hasAttribute("inert")) continue;
      c.setAttribute("inert", "");
      inerted.push(c);
    }
    const onKeyDown = (e: KeyboardEvent): void => H.current.onKey(e);
    const onWheelNative = (e: WheelEvent): void => H.current.onWheel(e);
    const onFullChange = (): void => setIsFull(document.fullscreenElement === rootEl);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("fullscreenchange", onFullChange);
    // Not a React prop: React's wheel listeners are passive, and a trackpad pinch must prevent the page's own zoom.
    const stageEl = stage.current;
    stageEl?.addEventListener("wheel", onWheelNative, { passive: false });
    closeBtn.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("fullscreenchange", onFullChange);
      stageEl?.removeEventListener("wheel", onWheelNative);
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
      // Leaving the viewer while it is full screen leaves full screen.
      if (document.fullscreenElement && document.fullscreenElement === rootEl) void document.exitFullscreen?.()?.catch?.(() => {});
      // unlockPage
      Object.assign(b.style, savedBody);
      for (const c of inerted) c.removeAttribute("inert");
      inerted.length = 0;
      try { window.scrollTo({ top: scrollY, left: 0, behavior: "instant" as ScrollBehavior }); } catch { /* no layout here */ }
      // Back to the picture the visitor was last looking at, if it is still on the page; else to where they came from.
      const shown = P.current.items[curRef.current]?.el;
      const target = shown && shown.isConnected ? shown : opener;
      target?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={root}
      className={hidden ? "ilb-backdrop ilb-chrome-hidden" : "ilb-backdrop"}
      role="dialog"
      aria-modal="true"
      aria-label={words.dialog}
      tabIndex={-1}
      data-lightbox-viewer=""
    >
      <div
        ref={stage}
        className="ilb-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <figure className="ilb-figure" aria-busy={status === "loading" ? "true" : undefined}>
          {thumbShown ? (
            <img
              ref={thumbEl}
              className={`ilb-img ilb-img-thumb${dragging ? "" : " ilb-anim"}`}
              src={item.thumbSrc}
              alt={item.alt}
              style={imgStyle}
              data-zoom={vw.scale.toFixed(2)}
              draggable={false}
            />
          ) : null}
          {shownSrc ? (
            <img
              key={shownSrc}
              ref={imgEl}
              className={`ilb-img${dragging ? "" : " ilb-anim"}${status === "failed" ? " ilb-failed" : ""}${thumbShown ? " ilb-img-pending" : ""}`}
              src={shownSrc}
              onLoad={onLoaded}
              onError={onFailed}
              alt={item.alt}
              aria-hidden={thumbShown ? "true" : undefined}
              style={imgStyle}
              data-zoom={vw.scale.toFixed(2)}
              draggable={false}
            />
          ) : null}
          {status === "loading" && !thumbShown ? (
            <p className="ilb-status ilb-loading" role="status">{words.loading}</p>
          ) : status === "failed" ? (
            <p className="ilb-status ilb-failed-note" role="status">{words.loadFailed}</p>
          ) : null}
          {captionText ? (
            <figcaption className="ilb-caption" aria-hidden={captionDuplicatesAlt ? "true" : undefined}>
              {captionText}
            </figcaption>
          ) : null}
        </figure>
      </div>

      {multi ? <p className="ilb-count" aria-live="polite" aria-atomic="true">{words.count(cur + 1, total)}</p> : null}

      <button ref={closeBtn} type="button" className="ilb-btn ilb-close" aria-label={words.close} onClick={() => props.onClose()}>
        <span aria-hidden="true">&times;</span>
      </button>
      {multi ? (
        <button type="button" className="ilb-btn ilb-prev" aria-label={words.previous} disabled={cur === 0} onClick={act(() => go(-1))}>
          <span aria-hidden="true">&#8249;</span>
        </button>
      ) : null}
      {multi ? (
        <button type="button" className="ilb-btn ilb-next" aria-label={words.next} disabled={cur === total - 1} onClick={act(() => go(1))}>
          <span aria-hidden="true">&#8250;</span>
        </button>
      ) : null}
      <div className="ilb-tools">
        <button type="button" className="ilb-btn" aria-label={words.zoomOut} disabled={atMin} onClick={act(zoomOut)}><span aria-hidden="true">&minus;</span></button>
        <button type="button" className="ilb-btn ilb-fit" aria-label={words.zoomReset} disabled={atMin} onClick={act(resetView)}>{words.fit}</button>
        <button type="button" className="ilb-btn" aria-label={words.zoomIn} disabled={atMax} onClick={act(zoomIn)}><span aria-hidden="true">+</span></button>
        {canFull ? (
          <button type="button" className="ilb-btn ilb-fullscreen" aria-label={isFull ? words.exitFullScreen : words.fullScreen} onClick={act(toggleFull)}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
