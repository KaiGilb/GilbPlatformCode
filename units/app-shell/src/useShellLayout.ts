// The bounded three-pane layout: widths and collapsed state of the left and right regions.
//
// The host passes the storage key, and may pass defaults and limits, so two apps on one origin
// (two paths of one site) do not share one stored layout.
//
// Persisted to localStorage: this is a per-browser UI preference, not vault data.

import { useCallback, useEffect, useState } from "react";

export interface ShellLayout {
  /** Left region width in px. */
  leftW: number;
  /** Right region width in px. */
  rightW: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

/** Limits and defaults; every field but the key is optional and falls back to the values below. */
export interface ShellLayoutOptions {
  /** localStorage key. Use one per app. */
  storageKey: string;
  defaults?: Partial<ShellLayout>;
  leftMin?: number;
  leftMax?: number;
  rightMin?: number;
  rightMax?: number;
}

/** The default layout: left collapsed at 300 px, right open at 376 px. */
export const SHELL_LAYOUT_DEFAULTS: ShellLayout = { leftW: 300, rightW: 376, leftCollapsed: true, rightCollapsed: false };
export const LEFT_MIN = 180;
export const LEFT_MAX = 440;
export const RIGHT_MIN = 280;
export const RIGHT_MAX = 520;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Limits { leftMin: number; leftMax: number; rightMin: number; rightMax: number }

function limitsOf(o: ShellLayoutOptions): Limits {
  return {
    leftMin: o.leftMin ?? LEFT_MIN,
    leftMax: o.leftMax ?? LEFT_MAX,
    rightMin: o.rightMin ?? RIGHT_MIN,
    rightMax: o.rightMax ?? RIGHT_MAX,
  };
}

/**
 * Reads the stored layout, clamped to the limits; a missing or broken value uses the defaults.
 *
 * @param o the host's options
 * @returns the layout to start from
 */
export function readStoredLayout(o: ShellLayoutOptions): ShellLayout {
  const d = { ...SHELL_LAYOUT_DEFAULTS, ...o.defaults };
  const lim = limitsOf(o);
  try {
    const raw = localStorage.getItem(o.storageKey);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ShellLayout>;
      return {
        leftW: clamp(Number(p.leftW) || d.leftW, lim.leftMin, lim.leftMax),
        rightW: clamp(Number(p.rightW) || d.rightW, lim.rightMin, lim.rightMax),
        // A missing key uses the default, not Boolean(undefined) = false.
        leftCollapsed: typeof p.leftCollapsed === "boolean" ? p.leftCollapsed : d.leftCollapsed,
        rightCollapsed: typeof p.rightCollapsed === "boolean" ? p.rightCollapsed : d.rightCollapsed,
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return d;
}

export interface ShellLayoutApi extends ShellLayout {
  setLeftW: (px: number) => void;
  setRightW: (px: number) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  /** Open the left region; a no-op when it is open. Not a toggle. */
  expandLeft: () => void;
  /** Close the left region; a no-op when it is closed. Not a toggle. */
  collapseLeft: () => void;
  /** Open the right region; a no-op when it is open. Not a toggle. */
  expandRight: () => void;
  /** Close the right region; a no-op when it is closed. Not a toggle. */
  collapseRight: () => void;
}

/**
 * The layout state and its setters, persisted under the host's storage key.
 *
 * @param o the host's options; `storageKey` is required
 */
export function useShellLayout(o: ShellLayoutOptions): ShellLayoutApi {
  const [layout, setLayout] = useState<ShellLayout>(() => readStoredLayout(o));
  const { leftMin, leftMax, rightMin, rightMax } = limitsOf(o);
  const { storageKey } = o;

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      /* ignore persistence failure */
    }
  }, [layout, storageKey]);

  const setLeftW = useCallback((px: number) => setLayout((l) => ({ ...l, leftW: clamp(px, leftMin, leftMax) })), [leftMin, leftMax]);
  const setRightW = useCallback((px: number) => setLayout((l) => ({ ...l, rightW: clamp(px, rightMin, rightMax) })), [rightMin, rightMax]);
  const toggleLeft = useCallback(() => setLayout((l) => ({ ...l, leftCollapsed: !l.leftCollapsed })), []);
  const toggleRight = useCallback(() => setLayout((l) => ({ ...l, rightCollapsed: !l.rightCollapsed })), []);
  const expandLeft = useCallback(() => setLayout((l) => (l.leftCollapsed ? { ...l, leftCollapsed: false } : l)), []);
  const collapseLeft = useCallback(() => setLayout((l) => (l.leftCollapsed ? l : { ...l, leftCollapsed: true })), []);
  const expandRight = useCallback(() => setLayout((l) => (l.rightCollapsed ? { ...l, rightCollapsed: false } : l)), []);
  const collapseRight = useCallback(() => setLayout((l) => (l.rightCollapsed ? l : { ...l, rightCollapsed: true })), []);

  return { ...layout, setLeftW, setRightW, toggleLeft, toggleRight, expandLeft, collapseLeft, expandRight, collapseRight };
}
