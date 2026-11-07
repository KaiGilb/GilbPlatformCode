import { createElement, useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { PictureViewer, type PictureViewerProps } from "./PictureViewer";
import type { LightboxItem } from "./types";

/** What the hook passes on to every viewer it opens (everything but the items, the index and the two events). */
export type UsePictureViewerOptions = Pick<PictureViewerProps, "words" | "showCaption" | "maxZoom" | "resolveSrc">;

/**
 * Opens the viewer from your own list of items. `open(items, index)` shows it; render `viewer` once somewhere
 * in your component (it is null while closed). Closing gives focus back to the element that had it when `open` was called.
 */
export function usePictureViewer(options: UsePictureViewerOptions = {}): {
  open: (items: LightboxItem[], index?: number) => void;
  viewer: ReactElement | null;
} {
  const [state, setState] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const open = useCallback((items: LightboxItem[], index = 0) => {
    if (!items.length) return;
    opener.current = document.activeElement as HTMLElement | null;
    setState({ items, index: index >= 0 && index < items.length ? index : 0 });
  }, []);
  const close = useCallback(() => setState(null), []);
  const setIndex = useCallback((index: number) => setState((s) => (s ? { ...s, index } : s)), []);
  // After the viewer has gone (its own cleanup has run first), focus goes back to where the person was.
  useEffect(() => {
    if (state) { wasOpen.current = true; return; }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const o = opener.current;
    opener.current = null;
    if (o && o.isConnected) o.focus?.({ preventScroll: true });
  }, [state]);
  const viewer = state
    ? createElement(PictureViewer, { ...options, items: state.items, index: state.index, onClose: close, onIndexChange: setIndex })
    : null;
  return { open, viewer };
}
