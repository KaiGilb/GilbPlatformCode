import { useSyncExternalStore } from "react";

export type SizeClass = "compact" | "medium" | "expanded";

const EXPANDED_MIN = 840;
const MEDIUM_MIN = 600;

/** Compact under 600, medium from 600, expanded from 840. */
export function sizeClassFor(width: number): SizeClass {
  if (width >= EXPANDED_MIN) return "expanded";
  if (width >= MEDIUM_MIN) return "medium";
  return "compact";
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

function getSnapshot(): SizeClass {
  return sizeClassFor(window.innerWidth);
}

function getServerSnapshot(): SizeClass {
  return "expanded";
}

export function useWindowSizeClass(): SizeClass {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
