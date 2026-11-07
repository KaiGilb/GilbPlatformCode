// Test setup: jsdom has no PointerEvent (older versions) and no scrollTo; React Testing Library is cleaned up after each test.
import { afterEach, beforeEach, vi } from "vitest";

const inBrowser = typeof window !== "undefined";

if (inBrowser && typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    width: number;
    height: number;
    pressure: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "touch";
      this.isPrimary = init.isPrimary ?? true;
      this.width = init.width ?? 1;
      this.height = init.height ?? 1;
      this.pressure = init.pressure ?? 0;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}

beforeEach(() => {
  if (inBrowser) window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(async () => {
  if (!inBrowser) return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  vi.restoreAllMocks();
  vi.useRealTimers();
});
